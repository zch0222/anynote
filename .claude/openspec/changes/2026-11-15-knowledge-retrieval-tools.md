# 提案：M16.5 检索通道与工具

> 方案：[`docs/ai-refactor/KNOWLEDGE_RETRIEVAL_PLAN.md`](../../../docs/ai-refactor/KNOWLEDGE_RETRIEVAL_PLAN.md) §4、§6–§8、[`docs/ai-refactor/AI_MILESTONES.md`](../../../docs/ai-refactor/AI_MILESTONES.md) M16.5
>
> 2026-11-15 用户确认：作者条款不受库成员关系限制；超管在默认范围内按普通成员预过滤，显式范围才按超管口径；知识库通知本期不参与检索；任务成员写入索引；片段不再重叠；`kn_item` 补大纲与摘要、PDF 补标题识别；上下文编入工具交互；`kb_list` 计数由 note 新端点提供；检索参数存数据库并经模型快照下发，管理入口本期只提供接口（设置页面后续补）。

## 1. `services/note`

### 1.1 任务成员进入源文档 ACL

`KnowledgeSourceDocumentVO.Acl` 新增 `taskMemberIds`（`List<Long>`）。仅 `entityType=task` 填写：`n_user_note_task` 中该任务 `permissions` 为 `1`（管理）或 `2`（提交）的用户 id，升序去重；其他实体为 `null`。

`metaVersion` 的规范化串追加 `taskMemberIds`，因此只改任务成员时索引侧只更新元数据，不重算向量。

### 1.2 任务成员变化登记变更

| 写路径 | 登记 |
|---|---|
| 新建任务后异步为库成员插入任务成员 | 全部插入完成后登记一条 `task UPDATE` |
| 新用户加入知识库并为库内任务补成员 | 每个任务登记一条 `task UPDATE` |

知识库成员关系本身仍不登记（检索范围每次运行实时获取）。

### 1.3 `POST /internal/v1/knowledge/stats`

`@InnerAuth(isUser = true)`。请求：

```json
{"knowledgeBaseIds": [55]}
```

字段可空可省略，语义与 `/scope` 相同：为空是默认范围，非空是显式范围。

响应 `data`：

```json
{
  "knowledgeBases": [
    {
      "kbId": 55,
      "name": "示例",
      "role": "EDIT",
      "counts": {"note": 3, "doc": 1, "mooc": 0, "task": 2},
      "latestUpdateTime": "2026-11-15T08:00:00.000+00:00"
    }
  ]
}
```

- 知识库集合与顺序与同参数的 `/scope` 一致。
- 只统计知识库的四类直属内容（笔记、资料、慕课、任务），与 `/outline kb:<id>` 一致。
- 只计当前用户检索可读的条目，口径与 `/query` 相同：默认范围下超管按普通用户判定。
- `latestUpdateTime` 为计入条目中最晚的 `sourceUpdatedAt`，没有条目时为 `null`。
- 错误沿用 2026-11-14 提案 §5：知识库标识不合法返回 `A0160 知识实体参数不合法`。

## 2. `services/ai`：检索参数

### 2.1 表 `a_retrieval_setting`

单行表（`id=1`），每个参数一列，带 `version`（每次更新 +1）。迁移脚本 `infra/sql/migrations/2026-11-15-ai-retrieval-setting.sql`，同步 `infra/sql/anynote.sql`。无记录时按默认值返回。

| 字段（JSON） | 默认 | 范围 | 说明 |
|---|---|---|---|
| `rrfK` | 60 | 1–1000 | 倒数排名融合常数 |
| `channelCandidates` | 50 | 10–200 | 每个召回通道的候选数 |
| `keywordLexicalWeight` / `keywordSemanticWeight` | 1.5 / 0.5 | 0–5 | 关键词型查询的全文、语义权重 |
| `questionLexicalWeight` / `questionSemanticWeight` | 1.0 / 1.2 | 0–5 | 完整问句的全文、语义权重 |
| `defaultLexicalWeight` / `defaultSemanticWeight` | 1.0 / 1.0 | 0–5 | 其余查询的全文、语义权重 |
| `itemWeight` | 0.8 | 0–5 | 条目级通道权重 |
| `authorityOriginal` / `authorityTranscript` / `authorityGenerated` | 1.0 / 0.9 / 0.7 | 0–5 | 权威性系数 |
| `maxChunksPerEntity` | 3 | 1–10 | 每个实体最多保留的片段数 |
| `searchDefaultLimit` / `searchMaxLimit` | 10 / 20 | 1–50，且默认 ≤ 上限 | `kb_search` 返回条数 |
| `neighborWindow` | 1 | 0–3 | 相邻片段扩展的前后片数 |
| `neighborMaxChars` | 6000 | 0–20000 | 相邻扩展后的总字数上限 |
| `readMaxChars` | 2000 | 500–20000 | `kb_read` 单次返回字数 |
| `grepMaxHits` | 50 | 1–200 | `kb_grep` 最多命中数 |
| `grepContextDefault` / `grepContextMax` | 2 / 5 | 0–5 / 0–10，且默认 ≤ 最大 | `kb_grep` 上下文行数 |
| `grepKbCandidates` | 20 | 1–50 | 库范围 `kb_grep` 的候选实体数 |
| `shortKeywordChars` | 4 | 1–20 | 判定关键词型查询的短词长度 |
| `rerankEnabled` | false | — | 是否启用重排（本期无重排实现，打开时跳过） |

`/authorize` 每批 100 条是 note 端的硬上限，保留为 Python 代码常量，不入表。

### 2.2 管理接口（仅 `ADMIN_X`）

- `GET /v1/admin/retrieval-settings`：返回 §2.1 全部字段及 `version`、`updateTime`。
- `PUT /v1/admin/retrieval-settings`：整体更新，全部字段必填。越界或默认值大于上限时返回 `A0160 检索参数超出允许范围`。

管理页面本期不做，记入里程碑待补项。

### 2.3 下发

`GET /internal/v1/model-providers/snapshot` 的响应新增 `retrieval`（§2.1 全部字段 + `version`）。检索参数版本与 `a_logical_model` 一样计入快照 `version` 的数值部分（`providersVersion + logicalVersion + retrievalVersion`），格式仍为 `数值:mappingVersion`。Python 在每次运行开始时取一次快照，运行中的循环沿用开始时的值。

## 3. `ai-service`（进程内，不新增 HTTP 端点）

- 七个只读工具 `kb_list`、`kb_outline`、`kb_search`、`kb_grep`、`kb_read`、`kb_query`、`kb_related`，经 `register_knowledge_tools` 注册；知识检索 Agent 的接入在 M16.6。
- 两段式权限：预过滤由 `/scope` 结果生成；进入模型前经 `/authorize` 每批 100 条确认。通知（`notice`）本期不参与检索。
- 按引用读取的工具（`kb_read`、单实体 `kb_grep`、`kb_outline`、`kb_related`）先经 `/authorize`，再校验是否落在运行的显式范围内；超管在默认范围内运行时，`/authorize` 会按超管放行，因此另用预过滤（普通成员口径）在索引上复核，索引不可用时这类调用返回「检索通道不可用」。
- note 内部端点在授权或读取时出现网络失败、鉴权失败或服务错误，按「权限无法确认」处理：运行直接失败，错误类别 `KNOWLEDGE_ACCESS_UNAVAILABLE`，文案沿用「服务暂时不可用，请稍后重试」。
- `RunRequest.scope` 定为 `{knowledgeBaseIds?, refs?}`，两者都空为默认范围；工具参数只能在此基础上继续收窄。
- 索引 schema 升到 2：`kn_item` 新增 `outline`、`summary`、`task_member_ids`，`kn_chunk` 新增 `task_member_ids`；`kn_meta.active` 记录 `schema_version`，与代码不一致时拒绝写入并提示 `rebuild`。
- 片段切分不再重叠，`indexer.chunk-overlap-chars` 配置项删除；新增 `indexer.summary-body-chars`（默认 200）。
- 在线进程新增 `elasticsearch[async]==8.7.0` 依赖。

## 4. 验证

- JUnit 5 + Mockito：任务成员 ACL 与 `metaVersion`、两处变更登记、统计端点的范围与计数、检索参数默认值/校验/版本、快照合并、管理接口准入。
- pytest：预过滤读取共享权限矩阵、融合排序、查询特征分析、证据去重、七个工具成功与失败路径、PDF 标题识别、上下文工具交互编译。
- Docker 真实栈：执行迁移；索引 `rebuild`；以真实用户令牌调用七个工具；关闭嵌入与停掉 Elasticsearch 的降级；检索层评测。
- 标准 `openapi/generate.sh` 在 Docker 内执行，仅提交预期的 `note.json`、`ai.json` 差异。
