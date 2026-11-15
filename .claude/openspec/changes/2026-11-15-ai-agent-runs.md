# API 变更提案：M16.6 知识检索 Agent 与运行端点

> 方案：[`docs/ai-refactor/AI_REFACTOR_PLAN.md`](../../../docs/ai-refactor/AI_REFACTOR_PLAN.md) §2.3、§3.1–§3.8、§6.1；[`docs/ai-refactor/KNOWLEDGE_RETRIEVAL_PLAN.md`](../../../docs/ai-refactor/KNOWLEDGE_RETRIEVAL_PLAN.md) §8–§9；[`docs/ai-refactor/AI_MILESTONES.md`](../../../docs/ai-refactor/AI_MILESTONES.md) M16.6
>
> 2026-11-15 用户确认：Gateway 沿用 `/api/<domain>/**`，公开地址为 `/api/ai/v1/agent/runs`；删除 `/chat/completions` 与 `/chat/completions/noConversation`；未找到文案为“未找到相关内容。已查询范围：{范围摘要}”；澄清最多由 Agent 生成一个问题；运行失败复用“服务暂时不可用，请稍后重试”；并发限制复用“当前使用人数较多，请稍后再试”；每日次数超限文案为“今日 AI 问答次数已达上限，请明天再试。”
>
> 续写入口范围确认：本批移除编辑器中的 AI 续写入口，后续单独恢复；不将写作请求发送给知识检索 Agent。

## 背景与范围

M16.5 已实现七个只读知识工具与检索会话基础，但知识检索 Agent 尚未挂入 Harness。`services/ai` 目前仍有旧聊天流，PDF 问答端点仍为占位异常。本提案定义 M16.6 的新 Agent、运行 API、SSE 事件、数据库记录与破坏性替换范围。

Web 按 D14 同批改接新事件协议；M16.7 继续完成范围选择、进度和引用跳转等界面功能。CLI 目前没有创建 AI 运行或调用旧聊天流的代码路径，只保留既有会话读取 API。

## 对外端点

所有路径是 AI 服务内路径。Gateway 保留 `Path=/api/ai/**` 与 `StripPrefix=2`，故 `/v1/agent/runs` 对外为 `/api/ai/v1/agent/runs`，本提案不新增 Gateway 路由。

| 方法 | 服务内路径 | 说明 |
|---|---|---|
| POST | `/v1/agent/runs` | 创建知识检索运行并返回 SSE |
| POST | `/v1/agent/runs/{runId}/cancel` | 取消运行；终态运行返回当前状态 |
| GET | `/v1/agent/runs/{runId}` | 查询运行状态与最终结果，不提供事件续传 |
| POST | `/rag/query/docs/v1` | 以 `doc:{id}` 为唯一检索范围创建知识检索运行并返回 SSE |
| GET | `/chat/conversations/**` | 保留；会话详情中的消息新增引用、运行标识和结果类型 |

PDF 问答请求沿用现有 `DocQueryDTO` 字段：`conversationId?`、`prompt`、`docId`。Java 将 `prompt` 映射为运行请求的 `input`，将 `docId` 映射为 `scope.refs=["doc:{docId}"]`；响应改为与通用运行端点相同的 SSE 事件流。

删除旧端点 `POST /chat/completions` 与 `POST /chat/completions/noConversation`，不保留格式映射或兼容入口。删除旧路由不删除历史会话与消息数据。

## 创建请求

`POST /v1/agent/runs` 请求体：

```json
{
  "conversationId": 42,
  "input": "期末复习涉及哪些章节？",
  "agent": "knowledge-retrieval",
  "scope": {
    "knowledgeBaseIds": [10],
    "refs": []
  },
  "model": "agent_main"
}
```

`conversationId`、`scope`、`model` 可省略；省略 `conversationId` 时创建会话。`scope` 遵循 M16.5 `RunScope`：`knowledgeBaseIds` 与 `refs` 两者均空表示默认范围，非空值只收窄检索范围。PDF 请求将 `docId` 转换为 `scope.refs=["doc:{docId}"]`。

Java 在启动运行前认证用户、检查会话所有权、占用并发名额、校验并计入现有 `RAG_MAX_DAY_COUNT` 每日限额、保存用户消息和运行记录。每日限额按用户与本地日期原子计数；达到上限返回已确认的提示文案。

## 事件协议

Python 至 Java 与 Java 至浏览器均使用 SSE。每个事件数据使用统一信封：

```json
{
  "seq": 1,
  "runId": "run-uuid",
  "ts": "2026-11-15T12:00:00Z",
  "type": "run.started",
  "data": {}
}
```

`seq` 在单次运行内从 1 开始递增，并同时作为 SSE `id`。SSE `event` 名称与信封 `type` 一致。

| 事件 | `data` 内容 |
|---|---|
| `run.started` | Agent 名称与版本、`conversationId`、检索范围摘要、索引水位快照 |
| `state` | `previousState`、`state` |
| `tool.started` | `callId`、`name`、用户可读的 `summary` |
| `tool.finished` | `callId`、`name`、`status`、`hitCount`、`durationMs`、`errorCategory`、`retryable` |
| `text.delta` | `delta` |
| `citation` | 1 起始的 `index`、内部 `evidenceId`、来源实体、标题、结构化 `locator`、原文片段及滞后/权威性标志 |
| `usage` | token 用量 |
| `error` | 错误类别、`retryable` 与已确认的用户提示 |
| `run.finished` | `state`、`outcome`、证据 ID、未完成项与用量 |
| `heartbeat` | 空数据，间隔不超过 10 秒 |
| `trace.*` | Trace 数据，仅在 Java 持久化，不转发给浏览器 |

Harness 当前事件字段按 camelCase 序列化。`text.delta.data` 为 `{ "delta": "..." }`；`error.data` 为 `{ "category": "...", "retryable": false, "message": "..." }`；`run.finished.data` 为 `{ "state": "...", "outcome": "...", "evidence": ["E1"], "unfinished": [], "usage": { ... } }`。`citation.data` 为 `{ "index", "evidenceId", "sourceType", "sourceId", "title", "locator", "snippet", "stale", "authority", "kbId", "kbName", "permissionBasis" }`。`run.started.data` 包含 `agent`、`agentVersion`、`model`、`scope`、`scopeSummary`、`conversationId` 与 `indexWatermark`；其中 `scopeSummary` 由 Python Agent 在范围权限确认后生成：默认范围固定为“默认范围”，显式范围由已确认的知识库名称与实体引用组成；Java 补充 `conversationId` 与 `indexWatermark`。Java 不改变其他事件的信封字段或数据。失败事件对浏览器统一使用已确认文案“服务暂时不可用，请稍后重试”，不得透出 Python 的其他异常文案；取消事件不向浏览器暴露未确认的错误文案，`run.finished.outcome` 仍为 `CANCELLED`。

`tool.started.data.summary` 使用已确认的现有工具说明：列出可访问的知识库、查看目录、检索知识库、在原文中查找、阅读原文、查询知识库清单、查找关联内容。不得在摘要中追加未确认的用户提示文案。

结果类型使用 `ANSWERED`、`NOT_FOUND`、`NEEDS_CLARIFICATION`、`FAILED`、`CANCELLED`。引用正文使用 `[1]` 形式；序号 `1` 映射到内部证据 `E1`。引用事件不包含路由 URL，桌面与移动客户端根据实体标识和定位自行生成站内链接。

`run.started.data.indexWatermark` 使用负载均衡服务名 `anynote-ai-indexer` 的 `/healthz`，内容形如 `{ "status": "ok", "watermark": { "processedCursor": "...", "latestCursor": "...", "lagRecords": 0, "lastProcessedAt": "...", "lastSuccessAt": "...", "lastErrorType": null, "chunkerVersion": "...", "embeddingProfileVersion": "..." } }`。水位对象仅允许这些字段，字段值与 Worker `/healthz` 响应一致并映射为 camelCase；Worker 探测失败时使用 `{ "status": "unavailable", "watermark": {} }`，不得阻断运行。Worker 返回不健康状态时保留其 `status` 与白名单水位字段。Trace 事件不含正文、用户令牌或模型 Key。

浏览器断开后 Java 继续消费 Python 上游并完成落库；本期不续传 SSE 事件。用户重新进入会话时通过会话详情读取完整回答和引用。显式取消端点必须取消 Python 运行及当前模型调用。

事件转发与事件落库分开处理：Java 保存 `trace.*` 及不含正文的运行元数据；`text.delta` 与包含原文片段的 `citation` 只用于 SSE 转发和最终消息汇总，不写入 Trace 事件表。最终回答与完整引用仅保存到 `a_chat_message` 的 `content` 与 `citations`。

## 运行查询与响应

取消端点返回 `ResData`，`data` 至少包含 `runId`、`accepted`、`state`。查询端点按当前登录用户隔离，返回 `ResData`，`data` 至少包含 `runId`、`conversationId`、`state`、`outcome`、`answer`、`citations`、`usage`、`startedAt`、`finishedAt`。未知或其他用户的运行沿用现有资源不存在/无权访问错误口径。

`GET /chat/conversations/{id}` 的助手消息包含 `runId`、`citations` 与 `outcome`；引用保存结构化来源与定位，不保存前端路由 URL。

会话详情对外使用 `ChatMessageVO`，其中 `citations` 为结构化数组；数据库实体 `ChatMessage.citations` 仍保存 JSON 文本，仅在响应转换时解析。

## 知识检索 Agent

- Agent 名称 `knowledge-retrieval`、版本 `1`，文件位于 `ai-service/agents/knowledge_retrieval/`，沿用现有 Agent 契约与指令文件组织方式。
- 注册 M16.5 的七个只读 `kb_*` 工具，并在实际运行中挂载 `RetrievalSessionMiddleware`。
- 第一次模型调用前用原始问题执行一次 `kb_search`，将结果加入证据工作区。
- 只依据权限确认后的证据回答；每条知识库事实带 `[n]` 引用。验证器检查引用编号存在、原文片段属于被引用证据、证据仍可读；无效引用按方案移除并最多退回循环一次。
- 对实质歧义的问题最多提出一个 Agent 生成的澄清问题并以 `NEEDS_CLARIFICATION` 结束。两轮检索仍无结果且无须澄清时以 `NOT_FOUND` 结束，固定回答为“未找到相关内容。已查询范围：{范围摘要}”。
- 回答服务端过滤外部链接与图片；保留结构化引用，客户端生成站内链接。
- Agent 终态必须通过机器可读信号传入 Harness，不从问号或自然语言内容推断；该信号不得作为 `text.delta` 发给用户。

## 数据变更

| 表 | 变更 |
|---|---|
| `a_chat_conversation` | 增加知识检索会话类型及 JSON `scope` |
| `a_chat_message` | 增加 `run_id`、JSON `citations`、`outcome` |
| `a_agent_run` | 新增运行记录：运行/会话/用户/Agent 版本/模型/状态/结果/用量/耗时/起止时间 |
| `a_agent_run_event` | 新增有序事件与 Trace 存储：运行标识/序号/类型/JSON 内容/时间；保留 30 天 |

SQL 迁移手动执行并同步 `infra/sql/anynote.sql`。新增 MyBatis SQL 使用 XML `resultMap` 映射。Java 每日定期删除过期 `a_agent_run_event`；运行记录与会话消息不随 Trace 清理删除。

## 验证

- Python Docker 测试覆盖 Agent 加载、首轮预取、引用/原文验证、空证据结果与澄清、输出过滤、运行中间件与索引水位。
- Java JUnit 5 + Mockito 覆盖创建、所有权、每日限额、并发、取消、事件转发/Trace 过滤、断线后继续落库、查询与引用持久化。
- Docker 真实栈以真实用户权限分别执行默认范围、知识库范围、单资料范围问答，检查引用定位、未找到、越权隔离、断线后会话恢复及取消上游调用。
- Docker 内生成并核验 `openapi/specs/ai.json`；检查旧聊天端点已删除且 `trace.*` 不出现在浏览器事件流。
