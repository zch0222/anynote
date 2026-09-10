# API 变更：笔记保存返回完整结果与乐观并发版本

## 背景与授权

`FRONTEND_MILESTONES.md` §2 把 M6 的后端配合点定为**强制**：「笔记 CRUD 必须返回完整字段（标题 / 内容 / updatedAt / version），用于乐观更新」。

现状缺口：

- `PATCH /notes/{noteId}` 返回 `ResData<String>`（固定 `"success"`），前端保存后拿不到服务端权威的 `updateTime`，无法把乐观更新落到「已保存」状态，只能额外发一次 `GET /notes/{noteId}` 回读。
- 全链路没有任何版本标识，M6.3 要求的「后端版本号冲突 → 前端提示 diff」无从实现：两个标签页同时编辑同一篇笔记时，后写入者会静默覆盖先写入者。

`n_note` 表没有 `version` 列，且本仓库 SQL 为手工执行（无 Flyway/Liquibase）。为避免为此引入库表迁移，本变更**不新增列**，直接把已有的 `n_note.update_time` 作为乐观并发令牌。

## 已确认契约

| 方法 | Gateway 路径 | 变更 |
|------|--------------|------|
| PATCH | `/api/note/notes/{noteId}` | 响应从 `ResData<String>` 改为 `ResData<NoteSaveResultVO>`；请求体 `NoteEditDTO` 新增可选 `version` |

请求体（`version` 可选，省略即表示放弃冲突检测、按「后写入者胜出」处理）：

```json
{ "title": "笔记标题", "content": "# 正文", "version": "1757520000000" }
```

成功响应：

```json
{
  "code": "00000",
  "msg": "操作成功",
  "data": {
    "id": 42,
    "title": "笔记标题",
    "content": "# 正文",
    "updateTime": "2026-09-11T10:00:00.000+00:00",
    "version": "1757584800000"
  }
}
```

冲突响应（HTTP 200，靠 `code` 区分，与仓库既有 `ResData` 约定一致）：

```json
{ "code": "A0409", "msg": "笔记已被其他会话更新，请刷新后重试", "data": null }
```

- `version` 是 `updateTime` 的毫秒时间戳字符串。选它而非自增列的原因：无需改表，且服务端本来就在每次 `editNote` 写入新的 `update_time`。
- **精度取舍**：`n_note.update_time` 是 MySQL `datetime`（秒级）。因此同一秒内的连续保存版本号相同，冲突检测在这种极窄窗口内会放行而不是误报。前端自动保存的 debounce 是 1.5s，实际落入同一秒的概率极低；这个方向的误差（漏报而非误报）不会打断正在编辑的用户。
- 只有客户端显式传 `version` 且与库中当前值不一致时才拒绝。`version` 为空 / 空白按旧行为处理，保证 legacy 前端与内部调用不被这次变更打断。
- 冲突检测在事务内、`updateNote` 之前完成，冲突时不产生任何写入、不发 RocketMQ 消息（既不重建索引也不生成编辑日志）。
- 新增 `ResCode.RESOURCE_VERSION_CONFLICT("A0409")`：属于 `A04xx` 用户请求参数族，语义为「用户提交的版本已过期」。纯新增枚举常量，不改动既有码值。
- `GET /notes/{noteId}` 契约不变：`Note` 已含 `title` / `content` / `updateTime`，前端由 `updateTime` 派生同一个 `version` 令牌。

## 验证计划

先补失败用例再改实现：

- `NoteServiceImplEditNoteTest`（纯 Mockito 单测，不连库）：版本匹配放行、版本过期抛 `A0409` 且零写入零消息、`version` 缺省沿用旧行为、返回体带回服务端权威 `title` / `content` / `updateTime` / `version`。
- 前端 `use-save-note` 单测：冲突码 `A0409` 触发冲突态而非普通错误提示。

Controller / DTO / VO 的 Springdoc 注解同步更新，跑 `pnpm openapi:generate` 从真实 Springdoc 重生六份 baseline，再跑前端类型检查与单测。实际结果在实现后回填。

## 2026-09-11 实现与核验结果

实现按本提案落地，验证结果如下：

**后端（`phase/5.6-notes`）**

- `NoteServiceImplEditNoteTest`（10 用例，纯 Mockito）：版本匹配放行、版本过期抛 `A0409` 且零写入零消息、`version` 缺省沿用旧行为、返回体带回服务端权威 `title` / `content` / `updateTime` / `version`；另覆盖移动目标知识库的编辑权限校验（无权限抛 `A0301`）。
- `NoteVersionUtilTest`（6 用例）：`toVersion` 空值/正常值、`isStale` 空白放行/不一致拒绝。
- `mvn test -pl note -am` 全绿（common-core 55、security 37、note 16，BUILD SUCCESS）。
- 额外发现并修复：`n_note.update_time` 为秒级 `datetime`，写库前先截断到整秒，否则毫秒尾数会让紧接着的下一次保存被误判冲突。

**契约 baseline**

- Docker 全栈（18 容器 healthy）→ `pnpm openapi:generate`：仅 `openapi/specs/note.json` 一行变更，结构 diff 为 `NoteSaveResultVO` / `ResDataNoteSaveResultVO` 新增、`NoteEditDTO` 增加 `knowledgeBaseId` / `version`、PATCH 200 响应 `$ref` 由 `ResDataString` 换为 `ResDataNoteSaveResultVO`、三条 `@Operation` 描述补充；其余 5 份 spec 零漂移，无任何键删除。

**前端（同分支）**

- `use-save-note` 单测 13 用例：debounce 合并、乐观更新与失败回滚、`A0409` 触发冲突态（回读服务端内容）、冲突未解决时挂起不重试、`keepLocal` 用服务端版本号重发、`useServer` 放弃本地、离线挂起/恢复补发、卸载 keepalive flush、失败 5s 自动重试。
- 笔记域新增 75 个前端单测（hooks / schemas / diff / query-keys / 组件 / 创建页），全仓 359 个单测通过；`pnpm typecheck` 与 `pnpm check` 通过。
- 浏览器端到端（真实 Docker 栈 + 生产构建）：两个标签页编辑同一笔记，后写入者携带过期版本被后端 `A0409` 拒绝，前端弹出行级 diff（本地 `-` / 服务端 `+`），`keepLocal` 用服务端最新版本号覆盖保存成功。
