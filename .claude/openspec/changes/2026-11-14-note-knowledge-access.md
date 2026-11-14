# 提案：note 知识访问层与变更游标

> 方案：[`docs/ai-refactor/KNOWLEDGE_RETRIEVAL_PLAN.md`](../../../docs/ai-refactor/KNOWLEDGE_RETRIEVAL_PLAN.md) §3–§6、[`docs/ai-refactor/AI_MILESTONES.md`](../../../docs/ai-refactor/AI_MILESTONES.md) M16.3

## 背景与范围

note 服务统一提供检索范围、指定用户可读性、权威正文、目录、结构化查询、源文档导出和变更游标。所有端点使用 `ResData` 响应，全部位于 `/internal/v1/knowledge`，不改变网关路由。

本批同时修改 `services/api/anynote-api-note` 与 `services/ai`：AI 保存视频总结后调用 note 登记变更。知识库通知仍由后续 notify 导出端点承接，不在本批实现。

## 1. 实体标识与统一源文档

### 1.1 标识

| 类型 `entityType` | `ref` | 说明 |
|---|---|---|
| `kb` | `kb:<id>` | 知识库 |
| `note` | `note:<id>` | 笔记 |
| `doc` | `doc:<id>` | PDF 资料 |
| `mooc` | `mooc:<id>` | 慕课 |
| `mooc_item` | `mooc_item:<id>` | 慕课章节、视频或文档条目 |
| `transcript` | `mooc_item:<id>` + `subtype=transcript` | 视频字幕 |
| `summary` | `mooc_item:<id>` + `subtype=summary` | 最新一条有效视频总结 |
| `task` | `task:<id>` | 笔记任务 |

`ref` 只含上述六种基础类型前缀；`transcript`、`summary` 由 `subtype` 区分。条目、字幕和总结继承所属慕课的知识库与 ACL。一个视频条目存在多条总结时，只使用 `createTime`、`id` 排序后的最新一条有效记录。

### 1.2 `KnowledgeSourceDocument`

| 字段 | 类型 | 说明 |
|---|---|---|
| `ref` | string | 基础实体标识 |
| `entityType` | string | 上表八种类型 |
| `subtype` | string/null | `transcript` 或 `summary`，其余为 null |
| `entityId` | number | 基础实体 id；字幕、总结使用慕课条目 id |
| `kbId` | number | 所属知识库，未归档为 0 |
| `parentRef` | string/null | 条目上级；字幕、总结的上级为对应 `mooc_item` |
| `title` | string | 当前标题或名称 |
| `format` | string | `markdown`、`pdf`、`srt` 或 `plain` |
| `body` | string/null | 权威正文；PDF 为 null |
| `objectName` | string/null | PDF、视频或字幕对象名 |
| `contentUrl` | string/null | PDF 当前文件地址，供索引 worker 下载 |
| `acl` | object | `{createBy, permissions, dataScope}`；继承实体的权限取所属慕课 |
| `authority` | string | `original`、`transcript` 或 `generated` |
| `contentVersion` | string | 正文 SHA-256；PDF 优先使用文件服务 hash，缺失时使用对象名 SHA-256 |
| `metaVersion` | string | 标识、归属、标题、父级、格式、ACL 与权威性规范化后的 SHA-256 |
| `attributes` | object | 实体专用元数据，如任务时间、条目父级、资料索引状态 |
| `sourceCreatedAt` | string/null | 权威源创建时间 |
| `sourceUpdatedAt` | string/null | 权威源最后更新时间 |

## 2. 权限口径

### 2.1 产品现有详情权限

`KnowledgeAccessService` 接收完整 `LoginUser`，不以请求线程或单独 `userId` 代替身份。

- 笔记保持分支互斥：超管为 7；作者取第 1 位；非成员取第 4 位；库管理员取第 2 位；编辑成员取第 3 位；阅读成员第 3 位非 0 时封顶为 4。
- 资料保持现有规则：匿名只取第 5 位；超管为 7；登录用户在作者位、库管理员位或成员位、其他用户位之间取最大值。
- 慕课详情保持通用规则：作者位、库管理员位或成员位、其他用户位、匿名位及用户关联权限取最大值；阅读成员从库成员位最多获得 4。现有通用入口不读取超管角色，只使用实际成员关系，本批不新增角色特判。
- 知识库按成员角色映射为 7/6/4；任务成员 `MANAGE` 映射为 7，`SUBMIT` 映射为 4；条目、字幕、总结继承慕课详情权限。

现有笔记、资料与慕课详情入口均调用该服务。慕课的 `@RequiresPermissions("n:mooc:*")` 改为 note 内的权限切面，避免 note 经 HTTP 调用自身。此重构不加入 D10 的检索交集规则。

### 2.2 检索可读性

检索读取必须同时满足列表可见与详情可读：

- 未归档笔记只有作者可读。
- 笔记、资料、慕课的列表规则为：作者可见；有效库成员可见 `dataScope=3`；库管理员另可见 `dataScope=2`。
- 详情权限必须至少为 4。非成员不因其他用户位或匿名位进入检索范围。
- 条目、字幕、总结继承慕课的交集结果。
- 知识库要求 `status=0` 且成员角色为管理、编辑或阅读。
- 任务除有效库成员外，还要求当前用户存在非 `NO` 的任务成员记录。
- 笔记与资料的超管详情权限仍为 7；慕课保持上述实际成员规则。默认范围只含超管自己加入的知识库，显式指定知识库或实体时才扩展到对应范围。

权限矩阵存放于 `services/note/src/test/resources/knowledge/access-matrix.json`，Java 本批读取；M16.5 的 Python 预过滤测试读取同一文件。

## 3. 端点契约

### 3.1 `POST /scope`

需要 `@InnerAuth(isUser = true)`。

请求：

```json
{
  "knowledgeBaseIds": [55],
  "refs": ["note:123"]
}
```

两个字段都可空且都可省略。均为空时是默认范围；非空时为显式范围，只收窄或按 D16 补充超管的指定知识库。实体 ref 用于解析所属知识库，不返回实体正文。

响应 `data`：

```json
{
  "userId": 7,
  "admin": false,
  "defaultScope": false,
  "knowledgeBases": [
    {"kbId": 55, "name": "示例", "role": "EDIT", "permissions": 2, "explicit": true}
  ]
}
```

普通用户的非成员显式范围不加入结果；无效、删除或不可读实体的 ref 不加入结果。结果按 `kbId` 升序去重。未归档实体的显式超管范围使用 `kbId=0`，名称为 null。

### 3.2 `POST /authorize`

需要 `@InnerAuth(isUser = true)`。请求 `items` 必填，1–100 条：

```json
{"items": [{"ref": "note:123"}, {"ref": "mooc_item:9", "subtype": "transcript"}]}
```

响应 `data.items` 与输入同序，重复项保留：

```json
{
  "items": [{
    "ref": "note:123",
    "subtype": null,
    "readable": true,
    "permissionBasis": "AUTHOR",
    "kbId": 55,
    "contentVersion": "sha256...",
    "metaVersion": "sha256..."
  }]
}
```

`permissionBasis` 为 `ADMIN`、`AUTHOR`、`KB_MANAGER`、`MEMBER` 或 `OTHER`。不存在、已删除或不可读统一为 `readable=false`，其余元数据为 null，不抛存在性错误。格式错误的 ref 或 subtype 使整个请求返回参数错误。

### 3.3 `POST /content`

需要 `@InnerAuth(isUser = true)`。请求：

```json
{
  "ref": "note:123",
  "subtype": null,
  "heading": null,
  "startLine": 1,
  "endLine": 80,
  "startTimeMs": null,
  "endTimeMs": null,
  "offset": 0
}
```

- 默认读取全文；`offset` 是选定范围内的从 0 开始字符偏移。
- 笔记与文档类条目支持 `heading` 或行范围，两者互斥。行号从 1 开始且为闭区间。`heading` 精确匹配不含 `#` 的 ATX 标题，返回该标题至下一个同级或更高级标题之前的内容。
- 字幕支持闭区间毫秒时间范围，返回与区间有重叠的 SRT 条目。
- 知识库、慕课、任务、总结只支持全文与 `offset`。
- PDF 不支持该端点；PDF 范围正文由后续索引提供。
- 单次最多返回 20,000 个 Java 字符。响应包含 `content`、`truncated`、`nextOffset`；未截断时 `nextOffset=null`。续读时重复相同范围并传回 `offset=nextOffset`。
- 响应同时带 `ref`、`entityType`、`subtype`、`kbId`、`title`、`format`、`authority`、`contentVersion`、`metaVersion`。
- 不存在与不可读统一返回 `A0404 知识内容不存在或不可读`。

### 3.4 `POST /outline`

需要 `@InnerAuth(isUser = true)`。请求 `{ref, parentId?, pageNum=1, pageSize=50}`，`pageSize` 为 1–100。

- `kb:<id>`：返回该库笔记、资料、慕课和任务，按 `updateTime`、`ref` 排序后分页。
- `mooc:<id>`：按 `parentId` 返回直属条目；未传 `parentId` 时为 0。
- `note:<id>` 或文档类 `mooc_item:<id>`：返回 Markdown ATX 标题大纲。
- 字幕、总结、任务与 PDF 不提供大纲。

响应 `data` 为 `{ref, nodes, pageNum, pageSize, total, hasMore}`。节点包含 `ref`、`entityType`、`title`、`parentRef`、`locator`、`updateTime`；标题节点的 `locator` 包含 `startLine`、`endLine`。所有节点先经过当前用户可读性确认再计数与分页。

### 3.5 `POST /query`

需要 `@InnerAuth(isUser = true)`。请求：

```json
{
  "entity": "note",
  "queryName": null,
  "kbIds": [55],
  "filters": {
    "titleContains": "复习",
    "createdBy": "me",
    "updatedAfter": "2026-11-01"
  },
  "sort": "updatedAt:desc",
  "limit": 20,
  "withCount": true
}
```

所有八类实体支持通用列表查询；`queryName=MY_TASKS` 是任务专用命名查询，此时 `entity` 必须为 `task`。`limit` 默认 20、范围 1–100，`withCount` 默认 false。`kbIds` 为空使用默认范围，非空为显式范围；查询结果逐条经可读性判定，之后再限制条数和计算 `count`。

通用过滤器：

| 字段 | 类型与约束 | 适用实体 |
|---|---|---|
| `titleContains` | 非空白字符串，最长 100 | 全部 |
| `createdBy` | 仅允许 `me` | 全部；继承实体按慕课创建者 |
| `createdAfter` / `createdBefore` | ISO 日期或带时区日期时间 | 全部 |
| `updatedAfter` / `updatedBefore` | 同上 | 全部 |

`*After` 为大于等于，`*Before` 为小于。日期按服务默认时区当天 00:00 解释；带时区日期时间转换为 `Instant`。非法值返回结构化查询参数错误。

实体专用过滤器：

| 实体 | 字段 |
|---|---|
| `kb` | `type`、`status` |
| `note` | `status`、`dataScope` |
| `doc` | `indexStatus`、`dataScope` |
| `mooc` | `dataScope` |
| `mooc_item` | `moocId`、`parentId`、`moocItemType` |
| `transcript` / `summary` | `moocId` |
| `task` | `status`；`MY_TASKS` 另支持 `submissionStatus`、`deadlineAfter`、`deadlineBefore` |

`submissionStatus` 为 `NOT_SUBMITTED`、`SUBMITTED`、`RETURNED`、`NO_SUBMISSION_REQUIRED`。排序仅接受 `<field>:<asc|desc>`；通用字段为 `updatedAt`、`createdAt`、`title`，任务另允许 `endTime`。缺省 `updatedAt:desc`。同一字段排序后按 `ref` 升序保证稳定。

响应 `data.rows` 每项包含 `ref`、`entityType`、`subtype`、`kbId`、`parentRef`、`title`、`createBy`、`createTime`、`updateTime` 和 `attributes`。`MY_TASKS` 的 `attributes` 包含任务起止时间、提交状态、提交笔记 id、历史版本 id 与提交时间。`count` 仅在 `withCount=true` 时返回。

### 3.6 `GET /changes?afterId=0&limit=200`

只需 `@InnerAuth`。`afterId` 非负，`limit` 为 1–500。按变更表主键升序返回 `id > afterId` 的记录。

响应 `data`：

```json
{
  "changes": [{"id": 10, "entityType": "note", "entityId": 123, "kbId": 55, "operation": "UPDATE", "createTime": "..."}],
  "nextCursor": 10,
  "latestCursor": 10
}
```

`nextCursor` 为本页最后一条 id，空页保持 `afterId`；`latestCursor` 为查询时全表最大 id，空表为 0。操作只使用 `CREATE`、`UPDATE`、`DELETE`。

### 3.7 `POST /export`

只需 `@InnerAuth`。请求 `{entityType, kbId?, afterId=0, limit=100}`，`limit` 为 1–200。每次只导出一种 `entityType`，按基础实体 id 升序遍历；`kbId` 可限制知识库，导出知识库时该参数按知识库自身 id 处理。

响应 `data` 为 `{documents, nextAfterId, hasMore}`。`documents` 使用 §1.2 模型并包含正文或文件获取信息。`nextAfterId` 是本轮最后扫描的基础实体 id，无后续时为 null；无正文的字幕或不存在的总结可以产生空 `documents`，调用方仍须按 `nextAfterId` 前进。`hasMore` 表示本轮是否还有更多基础实体。

### 3.8 `PUT /docs/{id}/index-status`

只需 `@InnerAuth`。请求 `{status}`，取既有 `DocIndexStatus` 的 0–3。只更新 `n_doc.index_status`，不生成知识变更记录，避免索引回写形成循环。资料不存在返回 `A0404 知识内容不存在或不可读`。

### 3.9 `POST /mooc-items/{moocItemId}/summary-changes`

只需 `@InnerAuth`，无请求体。note 根据条目所属慕课解析知识库，插入 `entityType=summary`、`operation=UPDATE` 的记录并返回 `ResData<Long>` 变更 id。条目不存在或已删除返回 `A0404 知识内容不存在或不可读`。

AI 在本地事务中先插入总结，再调用该端点；调用失败使 AI 本地总结插入回滚，外层沿用现有日志处理。note 已提交而 AI 回滚时可能多一条变更，后续导出当前源状态即可处理。

## 4. 变更记录与写路径

新表 `n_knowledge_change`：

| 列 | 类型 | 说明 |
|---|---|---|
| `id` | bigint unsigned 自增主键 | 游标 |
| `entity_type` | varchar(32) | 八种实体类型 |
| `entity_id` | bigint unsigned | 基础实体 id |
| `knowledge_base_id` | bigint unsigned，默认 0 | 所属知识库 |
| `operation` | varchar(16) | CREATE / UPDATE / DELETE |
| `create_time` | datetime，默认 CURRENT_TIMESTAMP | 记录时间 |

索引：`PRIMARY KEY(id)`、`idx_kb_id_id(knowledge_base_id,id)`、`idx_entity(entity_type,entity_id)`。迁移脚本为 `infra/sql/migrations/2026-11-14-note-knowledge-change.sql`，并同步 `infra/sql/anynote.sql`。

同一业务事务内登记：

- 笔记：新建、公开保存、协同写回、删除、任务提交与退回的权限变化。
- 资料：两处创建、删除、手动重新索引。
- 慕课：新建、更新、删除。
- 条目：批量/单个新建、更新、批量删除；每个被删除条目各一行。
- 字幕：Whisper 回写。
- 任务：实际存在的新建、更新、提交和退回状态变化。当前没有任务删除端点，本批不新增任务删除功能。
- 知识库：新建、更新、删除。
- 视频总结：AI 保存后调用 §3.9。

知识库删除由 worker 按 `kbId` 清理下属索引；慕课删除由 worker 按父慕课清理下属索引。成员关系变化不写变更记录。资料索引状态与资料英文名翻译不改变检索正文，不产生变更记录。

`DocMessageListener` 删除不存在的 RAG 索引调用；手动重新索引经既有 RAG 消息进入监听器后只登记资料 `UPDATE`。新建资料直接登记 `CREATE`，不再发送旧 RAG 建立索引消息；资料英文名翻译消息保持不变。

## 5. 错误契约

| 场景 | code | msg |
|---|---|---|
| 实体标识、类型或 subtype 不合法 | `A0160` | `知识实体参数不合法` |
| 实体不存在或当前用户不可读 | `A0404` | `知识内容不存在或不可读` |
| 正文范围、offset 或时间范围不合法 | `A0160` | `正文读取范围不合法` |
| 命名查询、过滤器或排序不合法 | `A0160` | `结构化查询参数不合法` |
| 授权、导出、变更、目录或查询数量超限 | `A0160` | `单次请求数量超出限制` |
| 资料索引状态不为 0–3 | `A0160` | `资料索引状态不合法` |
| 字幕读取失败 | 内部文件服务错误 | `读取字幕失败` |
| 视频总结读取失败 | 内部 AI 服务错误 | `读取视频总结失败` |
| 导出资料的文件信息读取失败 | 内部文件服务错误 | `获取文件信息失败` |

缺内部签名、签名错误、缺用户令牌使用 `InnerAuthAspect` 既有响应，不新增文案。

## 6. 验证

- JUnit 5 + Mockito：权限矩阵、详情行为兼容、批量授权顺序、D10/D16、各实体导出、正文范围与续读、目录过滤、全实体查询白名单与计数、变更分页、索引状态及 Controller 契约。
- Docker dev MySQL：执行幂等迁移；覆盖每类实际写路径的游标记录和事务回滚无残留。
- Docker 真实 HTTP：无内部签名拒绝；带签名但缺用户令牌时，五个用户端点拒绝；签名和用户令牌齐全可读取。
- 标准 `openapi/generate.sh` 在 Docker 内执行，仅提交预期 `note.json` 及连带 AI 契约差异。
- 本批新增或手写的 MyBatis SELECT 均使用显式 `resultMap`；MyBatis-Plus 通用 Wrapper 查询不新增 XML SQL。
