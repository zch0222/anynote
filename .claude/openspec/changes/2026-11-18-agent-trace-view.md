# API 变更提案：M17 Agent 运行过程展示（思考流、工具行与管理控制台）

> 方案：[`docs/ai-refactor/AGENT_TRACE_VIEW_PLAN.md`](../../../docs/ai-refactor/AGENT_TRACE_VIEW_PLAN.md)
>
> 2026-11-18 用户拍板：T1 落库且读取时按依赖集复核，任一不可读隐藏该次运行全部自由文本；T2 会话历史开跑前复核，
> note 不可用时 fail-closed（历史不进上下文，只保留用户问题）；T3 工具轮模型文字作为过程说明展示；
> T4 Trace 全文与过程视图**永久保留**（移除 30 天清理任务）；T5 管理控制台放设置页新分区「AI 运行」，
> 仅桌面端；T7 固定一种展示策略；T8 新增文案按 2026-11-18 确认清单（见 §文案）。
> 关联拍板：`2026-11-18-model-config-db-only.md`（逻辑模型与供应商配置全部改数据库，管理端可切换）。

## 背景与范围

对话界面现在只有一行进度文字（`tool.started` 的固定说明），模型的思考流被接入层丢弃，Trace 只存元数据。
本提案按 AGENT_TRACE_VIEW_PLAN.md 实施三个视图：对话过程区（用户）、运行轨迹（系统管理员）、
过程视图落库与回放（T1）。涉及 `ai-service`（接入层解析、内部事件、两条投影）、`services/ai`
（白名单转发、落库、读取复核、管理端点）、`apps/web`（过程区、管理控制台）、`infra/sql`。

不变：两段式权限、七个只读工具、证据不可信原则、错误文案白名单、用户令牌与模型 Key 不进日志与 Trace。

## 对外事件（Java 至浏览器）

新增与变更事件（完整字段定义见方案 §5.5；结构进 `openapi/specs/ai.json` 的 named schema）：

| 事件 | 状态 | `data` |
|---|---|---|
| `reasoning.delta` | 新增 | `blockId`、`delta`（同块增量满 64 字或 100ms 合并） |
| `reasoning.finished` | 新增 | `blockId`、`durationMs`、`status`（`done` / `interrupted`） |
| `step.note` | 新增 | `noteId`、`text`（工具轮过程说明，模型输出结束后整段发出） |
| `model.retry` | 新增 | `attempt` |
| `tool.started` | 变更 | 现有 `callId`、`name`、`summary` 不变，新增 `target`：`{ label, resolved }`，可空 |
| `tool.finished` | 变更 | 现有字段不变，新增 `result`：`{ count, items: [{ ref, title, kbName, locator }] }`，`items` 最多 3 项 |
| 其余事件 | 不变 | |

实体名称只从「可见集」取：不在可见集内的显示占位文案；`tool.started` 在 `gate` 前发 `resolved=false`
的「指定内容」，结束后补名称或换「未找到或无权访问的内容」。

Java `handleEvent` 改为按事件类型与字段白名单转发：未登记类型不转发、未登记字段删除（I4）；
`trace.*` 照旧只落库不转发。开关全关时浏览器事件与现状逐字段一致。

## 内部 Trace（Python 至 Java，仅落库）

| 事件 | 补充 |
|---|---|
| `trace.context` | 每层原文以哈希为键写一次 `trace.blob`，同一运行内不重复 |
| `trace.model` | 模型与供应商、尝试次数、首字时间、耗时、结束原因、思考全文、正文草稿（含过程说明与校验前回答）、推理 token |
| `trace.action` | 完整参数、原始结果（按上限截断并标注）、登记的证据编号、错误原文、复核前候选照旧 |
| `trace.verify` | 修复提示原文、修复前后的回答 |
| `trace.dependencies`（新） | 本次运行模型看到过的全部条目，供过程视图回放复核 |

Trace 与过程视图**永久保留**：删除 `AgentRunTraceCleanupTask` 与 `AgentRunEventMapper.deleteBefore`，
表注释同步修改；单条 Trace 事件原始结果截断上限进 Nacos（默认 10000 字），真实体量实测（M17.6）后标定。

## 过程视图（T1）

`a_chat_message` 新增 JSON 列 `process`，结构 `version/durationMs/hidden/items[]/dependencies[]`
（items：`reasoning`（text、durationMs、status）、`tool`（name、target、status、durationMs、result）、
`note`（text）、`retry`）。思考全文按可配置上限截断并标注；`dependencies` 不发给浏览器。

读取复核：会话详情返回消息前，Java 以当前用户令牌调 note `/internal/v1/knowledge/authorize`
（每批 100 条，`RemoteKnowledgeService` 新增 Feign 方法）：全部可读原样返回；任一不可读隐藏
思考、过程说明与模型生成对象文字并置 `hidden=true`，工具结果中不可读条目换占位；
note 不可用时不返回过程视图（回答不受影响）。

## 会话历史复核（T2）

`HarnessRunRequestDTO.Message.Citation` 新增 `ref` 与 `subtype` 字段（Java 从落库引用的
`sourceType/sourceId/subtype` 取），Python 在历史压缩**之前**批量复核：引用了不可读条目的历史回答
整条不进上下文，用户消息保留。复核在 `RetrievalSessionMiddleware` 开跑阶段执行；
note 不可用（`KNOWLEDGE_ACCESS_UNAVAILABLE`）时 fail-closed：全部历史不进上下文。

## 管理端点（仅 `ADMIN_X`，复用 `SystemAdminGuard`）

| 方法与路径 | 说明 |
|---|---|
| `GET /v1/admin/agent-runs` | 分页（`pageNum`/`pageSize`），筛选：用户、时间范围、结果、运行标识 |
| `GET /v1/admin/agent-runs/{runId}` | 运行摘要 + 该运行落库的过程视图 |
| `GET /v1/admin/agent-runs/{runId}/events` | 完整 Trace，`seq` 游标分页 |

详情与事件端点每次调用写一条 `a_agent_trace_access`（管理员、运行标识、时间），**永久保留**，
不随任何清理任务删除。非管理员返回 `A0301`。设置页新分区「AI 运行」（`/settings/ai-runs`），
仅桌面端，复用「模型供应商」分区的管理员可见性机制。

## 模型接入层（随 `2026-11-18-model-config-db-only.md` 的 `a_logical_model` 推理配置）

输出片段新增 `reasoning_delta`；按逻辑模型映射的 `reasoning_format`（`none`/`reasoning_content`/
`reasoning`/`think_tag`）解析。`think_tag` 只认本轮回复开头的 `<think>` 到首个 `</think>`，
跨片段用状态机，流结束未闭合整段算思考；未配置推理格式不剥离任何标签。重试时已产出的思考块标记
`interrupted` 并发 `model.retry`；推理与正文首个增量都算首输出。`reasoning_passthrough`
（`none`/`empty`/`original`）控制同轮后续请求回传。`completion_tokens_details.reasoning_tokens`
计入 `usage` 与 Trace。

## 开关（Nacos `anynote-ai-harness.yml`）

| 开关 | 默认 | 作用 |
|---|---|---|
| `reasoning-view-enabled` | 关 | 关闭时不发 `reasoning.*`，Trace 仍记录 |
| `step-note-enabled` | 关 | 关闭时不发 `step.note` |
| `trace-fulltext-enabled` | 关 | 关闭时 Trace 维持现状（不存正文与参数） |
| `reasoning-batch-chars` / `reasoning-batch-interval-ms` | 64 / 100 | 思考增量合并阈值 |
| `process-reasoning-max-chars` | 8000 | 过程视图思考全文截断上限 |

## 文案（2026-11-18 已确认）

整轮控件：`思考中 · {n} 秒` / `已完成，用时 {n} 秒` / `失败` / `已停止`；思考行标题 `思考`；
工具行占位 `指定内容` / `未找到或无权访问的内容`；重试行 `模型连接中断，已重试`；
回放隐藏 `部分内容你已无权访问，思考过程已隐藏`；结果摘要 `命中 {n} 条` / `读取 {n} 字` /
`{n} 个知识库` / `{n} 个节点` / `{n} 行` / `{n} 个关联条目` / `命中 {n} 处`；活动摘要仅三类动词
`检索 {n} 次` / `阅读 {n} 篇` / `查找 {n} 次`；管理控制台分区名 `AI 运行`，列名与检查器标签
（`概要 / 输入 / 输出 / 原始 JSON / 用户看到的内容`、行类型 `模型调用 / 工具名 / 校验`、
时间概览 `首字前 / 生成`）按 2026-11-18 确认清单。

## 数据变更

| 表 | 变更 |
|---|---|
| `a_chat_message` | 新增 JSON `process` |
| `a_agent_trace_access` | 新增：管理员、运行标识、时间；永久保留 |
| `a_agent_run_event` | 表注释去「保留 30 天」；不再清理 |

迁移 `infra/sql/migrations/2026-11-18-agent-trace-view.sql`，手动执行并同步 `infra/sql/anynote.sql`。
新增 SQL 一律 XML `resultMap` 映射。

## 验证

- Python pytest：各推理格式解析（含跨片段 `think_tag` 与未闭合）、重试中断、回传、可见集投影、
  白名单字段、T2 fail-closed、开关全关逐字段一致。
- Java JUnit：白名单转发、过程视图落库与读取复核三分支、管理端点权限与非管理员 `A0301`、
  访问留痕、历史引用 `ref/subtype` 传递。
- 前端 Vitest：`lib/ai/process.ts` 归并纯函数、组件渲染、hydrate 恢复。
- Playwright（桌面 + 移动端）与真实栈验收留待 M17.6（主密钥恢复后），登记为遗留项。
