# API 变更提案：M17 运行过程展示修复（破坏性升级）

> 依据：[`docs/ai-refactor/AGENT_TRACE_VIEW_CODE_REVIEW.md`](../../../docs/ai-refactor/AGENT_TRACE_VIEW_CODE_REVIEW.md)（2026-11-21 实现评估，B1–B8、M1–M10、L1–L5）
> 覆盖：[`2026-11-18-agent-trace-view.md`](./2026-11-18-agent-trace-view.md) 中与下文冲突的部分。无生产环境，不保留旧字段、旧开关的兼容。
>
> 2026-11-21 用户拍板：D1/D2 开发库数据按推荐清理（执行前计数均为 0，未删除任何行）；D3 Nacos 的过程展示开关全部去掉，
> 只保留一种行为；D4 实现回传方式 `original`；D5 文案按推荐；D6 会话历史只按依赖清单复核；E1 结果条目带 `kbId`；
> E2 运行记录新增三列；E3 新事件与过程视图写成命名 schema；E4 去掉 Java 白名单，靠类型裁剪，Java 原则上不用 `Map<String, Object>`；
> E6 思考截断字数放到供应商表；E7/F1 行与事件统一用 `id`；F5 工具调用次数与首字时间由 Python 上报、前端展示；G1–G3 见下文。

## 开关（Nacos `anynote-ai-harness.yml`）

删除 `reasoning-view-enabled`、`step-note-enabled`、`trace-fulltext-enabled` 与 `process-reasoning-max-chars`：思考流、过程说明、
Trace 全文一直开启。保留调节参数 `reasoning-batch-chars`、`reasoning-batch-interval-ms`、`trace-result-max-chars`，以及不属于 M17 的
`prefetch-enabled`。是否出现思考只取决于逻辑模型的推理格式（默认 `none`）。

## 对外事件（Java 至浏览器）

| 事件 | `data` |
|---|---|
| `reasoning.delta` | `id`、`delta`（同块增量满字数或时间阈值时整段缓冲一次发出，拼接等于该块全文） |
| `reasoning.finished` | `id`、`durationMs`、`status`（`done` / `interrupted`），发出前先发完该块缓冲 |
| `step.note` | `id`、`text` |
| `model.retry` | `id`、`attempt`（只在已输出的思考因重试中断时发出） |
| `tool.started` | `id`、`name`、`summary`、`target` |
| `tool.finished` | `id`、`name`、`status`、`hitCount`（本次调用登记的证据数）、`durationMs`、`errorCategory`、`retryable`、`target`、`result` |
| `run.finished` | 原有字段，新增 `toolCalls`（模型发起的工具调用次数）、`firstOutputMs`（运行开始到首个思考或正文增量） |

- `target`：`{label, resolved}`；对象名称只取自可见集（证据与检索范围内的知识库）。取不到名称时，结束前显示「指定内容」，
  失败结束显示「未找到或无权访问的内容」。`kb_search` / `kb_query` 带知识库时追加「 · 库名1、库名2」（范围外的不显示）；
  `kb_grep` 为「查找串 · 对象名称」；`kb_query` 实体类型用中文名。
- `result`：`{count, items: [{ref, title, kbName, kbId, locator}]}`，`items` 只含本次调用登记的证据，最多 3 项；失败时为空。
- 运行失败或取消时，为未结束的工具调用补发 `status=FAILED` 的 `tool.finished`。
- Java 去掉字段白名单：每种对外事件一个数据类（`Agent*EventVO`、`AgentCitationVO`、`AgentUsageVO`），未登记的类型不转发，
  类上没有的字段（含嵌套对象与 `locator` 内部）自然丢弃；`trace.*` 只落库。数据类注册为 OpenAPI 命名 schema。
- `locator` 登记字段：`row, chunkStart, chunkEnd, sectionPath, pageStart, pageEnd, pageNo, startMs, endMs, startLine, endLine, line,
  offset, heading, startTimeMs, endTimeMs, moocId`。

## 过程视图（`a_chat_message.process`）

- 行统一为 `{type, id, …}`：思考 `text/status/durationMs`，工具 `name/status/durationMs/target/result`，说明 `text`，重试只有 `type/id`。
- 顶层 `version/durationMs/toolCalls/firstOutputMs/items/dependencies`；`dependencies` 只用于服务端复核。
- 思考全文超过逻辑模型所绑定供应商的 `process_reasoning_max_chars` 时截断并追加「…（截断）」；运行结束时仍为 `running` 的工具行标为 `FAILED`。
- 会话详情返回 `AgentProcessViewVO`（命名 schema）：只含契约字段（顶层 `version/durationMs/hidden/hiddenNotice/toolCalls/firstOutputMs/items`），
  整段会话的依赖去重后每 100 条批量复核一次。`ChatMessageVO.citations` 改为 `AgentCitationVO` 数组。
- 跨栈共享样例：`services/ai/src/test/resources/fixtures/agent-process-view.json` 与 `.hidden.json`，Java 产出、前端回放共用。

## 会话历史复核（T2）

`HarnessRunRequestDTO.Message` 新增 `dependencies`（历史回答所在运行的依赖清单），删除 `Citation.ref/subtype`；Python 只按依赖清单复核，
依赖有不可读条目的历史回答整条不进上下文，note 不可用时全部历史回答不进上下文。

## Trace

- `ManifestEntry.content` 不参与序列化；每层原文按哈希写入 `blobs`，同一运行只写一次。
- `trace.model`：本轮用量（不再用累计值顶替）、模型与供应商、尝试次数、首字时间、思考全文、草稿。
- `trace.action`：完整参数、原始结果（超出上限截断）、本次调用的 `evidenceIds`、失败时的 `errorMessage`。
- `trace.verify`：`repairHint` 等于该轮实际追加给下一轮模型的修复提示。
- 依赖清单取收尾时工作区的全部证据。

## 模型接入层

重试判断改为两个标志：产出正文增量或工具调用片段即禁止重放；每次重试前发一个带尝试序号的片段，已输出思考时同时标记中断。
`think_tag` 下只有状态机吐出的正文才算正文；整段回答只是开启标签前缀（如单个 `<`）时原样作为正文。
上下文构建器把该轮思考挂在 assistant 工具调用消息的 `reasoning_content` 上，由适配器按回传方式原样回传（字段名随推理格式）、置空或清除。

## 管理端

- `a_model_provider` 新增 `process_reasoning_max_chars`（int，默认 8000，500..200000），供应商新增与更新必填。
- `a_agent_run` 新增 `provider`、`tool_calls`、`first_output_ms`；管理端列表每页最多 100 条并返回这三项。
- 事件接口的 `content` 用 Jackson 解析为 JSON 节点，解析失败时原样返回字符串。

## 文案（2026-11-21 确认）

工具行耗时「{n} 秒」（一位小数，与摘要用「 · 」连接）；失败标识「失败」；`kb_query` 实体类型「知识库 / 笔记 / 资料 / 慕课 / 慕课条目 / 字幕 / 视频总结 / 任务」；
思考截断「…（截断）」；整轮完成行「已完成，用时 {n} 秒 · 首字 {n} 秒 · 工具调用 {n} 次 · 活动摘要」；播报区运行中播报「思考中」、
结束时与整轮控件相同；供应商表单标签「思考截断字数」、说明「刷新后回放的思考过程超过该字数时截断」、校验报错
「思考截断字数必须为 500 到 200000 之间的整数」。

## 数据变更

迁移 `infra/sql/migrations/2026-11-21-agent-trace-view-repair.sql`（手动执行），已同步 `infra/sql/anynote.sql`。

## 验证

逐项结果见 [`docs/changelist/2026-11-21-agent-trace-view-repair.md`](../../../docs/changelist/2026-11-21-agent-trace-view-repair.md)
与 [`AI_MILESTONES.md`](../../../docs/ai-refactor/AI_MILESTONES.md) M17 节。
