# 提案：协同服务落库的两个内部端点与相关契约调整

> 方案：[`docs/collab-persistence/COLLAB_PERSISTENCE_PLAN.md`](../../../docs/collab-persistence/COLLAB_PERSISTENCE_PLAN.md) §7（M14.2）、§7.5（M14.7）、附录 A、附录 E ②

## 背景

协同模式下改由协同服务（`apps/collab`，Node）把房间内容写回 MySQL，浏览器不再发保存请求。
协同服务在容器网络里直连 note 服务，需要两个只供它调用的内部端点：开房时读取快照，
落库时带基准版本号原子写回。两个端点都绕过笔记权限，因此必须挂 `@InnerAuth`，
协同服务按 `HMAC-SHA256(secret, timestamp)` 签名。

## 契约

### 1. `GET /notes/{noteId}/collab-snapshot`（内部，`@InnerAuth`）

```json
{
  "code": "00000",
  "data": {
    "noteId": 2571,
    "title": "周会纪要",
    "content": "# 周会纪要\n\n……",
    "version": "1790265600000",
    "state": "AQLm…（Base64，从未写回过时为 null）",
    "stateVersion": "1790265590000",
    "epoch": "7d4f0c9e-…（state 为 null 时为 null）"
  }
}
```

- `version` 与 `PATCH /notes/{id}` 的版本号同源（`update_time` 毫秒值）。
- `stateVersion` 与 `version` 不同表示上次写回之后发生过外部写入。
- 笔记不存在或已删除：`A0404`。

### 2. `PUT /notes/{noteId}/collab-snapshot`（内部，`@InnerAuth`）

请求体 `CollabSnapshotSaveDTO`：

| 字段 | 约束 | 说明 |
|---|---|---|
| `title` | 可空，`@Size(max = 80)` | 取自正文顶部 H1；为空表示不修改标题 |
| `content` | `@NotNull` | 正文 Markdown |
| `state` | `@NotBlank`，Base64 | `Y.encodeStateAsUpdate` 全量状态 |
| `epoch` | `@NotBlank`，36 位 | 状态谱系标识 |
| `baseVersion` | `@NotBlank`，数字 | 本次写入所基于的版本号 |
| `operatorId` | 可空 | 房间里最近一次编辑的用户；为空时沿用笔记最后更新者，再退回创建者 |

- 比较与写入在一条 `UPDATE … WHERE id = ? AND update_time = ? AND is_delete = 0 AND status = 0` 里完成，
  影响行数为 0 返回 **`A0409`**。
- 新版本号取 `max(当前时间截断到秒, baseVersion + 1 秒)`，同一秒内连续写回版本号仍严格递增。
- 成功时在同一事务里写 `n_note`（标题、更新时间、更新者）、`n_note_text`（正文）、
  `n_note_collab_state`（Y 状态、谱系、`md_version`），并照常发出 ES 索引与编辑日志两条消息
  （事务提交后发送）。返回现有的 `NoteSaveResultVO`。
- 笔记不存在：`A0404`；`state` 不是合法 Base64：`A0160`。

两个端点都进入 `openapi/specs/note.json`（Tag「笔记协同（内部）」），与 `managerList` 等既有内部端点一致。
网关会剥掉外部请求的 `from-source`，外部经网关调用拿不到内部权限。

### 3. `PATCH /notes/{noteId}` 的两处调整

- **`NoteEditDTO.title` 增加 `@Size(max = 80)`**，控制器参数加 `@Validated`。
  `n_note.title` 是 `varchar(80)`、库为严格模式，超长标题原本会让整次保存（含正文）回滚且无限重试；
  现在直接返回参数错误。前端取标题时同样截断到 80（`@anynote/editor-core/leading-heading`）。
- 保存成功后，事务提交之后向 Redis 频道 **`collab:note-updated:<noteId>`** 发布 `{"actorId": <用户id>, "at": <毫秒>}`，
  在线的协同房间据此立即回读并合并外部写入。发布失败只记日志，不影响本次写入。
  协同服务自己的写回（上面的 `PUT`）不发布。删除笔记同样发布一次，房间据此断开连接（关闭码 4404）。

`editNote` 同时开始记录 `update_by`（此前该列在每次 PATCH 后被写成空），协同写回在
`operatorId` 为空时据此归属操作者。

## 内部调用密钥

`@InnerAuth` 的 HMAC 密钥改为配置项 `anynote.internal.secret`（环境变量 `ANYNOTE_INTERNAL_SECRET`），
由校验切面与 Feign 拦截器共同读取；未配置时回落到原常量并在非 dev profile 下打 WARN。
协同服务配置同名环境变量，两边必须一致；生产 compose 强制要求配置。

## 错误码

无新增。沿用 `A0409`（版本过期）、`A0404`（不存在）、`A0160`（参数错误）、`A0301`（内部签名校验失败）。

## 数据库

新表 `n_note_collab_state`，迁移脚本 `infra/sql/migrations/2026-09-25-note-collab-state.sql`，
建表语句同步到 `infra/sql/anynote.sql`。删除笔记时同步删除对应行。

## 验证

- Java：`NoteCollabServiceImplTest`（比较成功 / 失败、标题为空、同秒写回版本递增、操作者回落、状态表写入、
  两条消息的 userId、笔记不存在、非法 Base64、读取快照三种情况）、`CollabSnapshotSaveDTOTest`、`NoteEditDTOTest`、
  `NoteChangePublisherTest`（提交后发送、通知失败不抛错）、`NoteServiceImplDeleteNoteTest`、
  `NoteServiceImplEditNoteTest`（记录更新者、发布外部写入通知）；common 模块 `InternalSecretPropertiesTest`、
  `InnerAuthAspectTest`、`FeignRequestInterceptorTest`、`HmacUtilsTest`（与协同服务共用的签名测试向量）。
- 真实栈：带签名调用读取端点成功；不带签名返回「没有内部访问权限」；密钥不对返回「内部调用签名验证失败」。
- 门禁：`pnpm openapi:generate` 后只有 `note.json` 变化（新增路径与两个模型、`NoteEditDTO.title` 的长度约束）。
