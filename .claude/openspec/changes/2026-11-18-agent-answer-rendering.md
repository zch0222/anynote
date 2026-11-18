# 契约变更提案：Agent 回答解析、渲染与历史引用

## 背景

知识检索 Agent 原先使用正则删除外链、图片和无效编号，会误伤代码与 Markdown 示例，也不能覆盖全部图片写法。前后端各自识别引用编号，规则不一致。按 [Agent 回答文本处理方案](../../../docs/ai-refactor/AGENT_OUTPUT_TEXT_PLAN.md) 改为解析阶段识别，并由 AI 回答专用渲染预设执行图片约束。

本提案记录 2026-11-18 用户确认的契约，不新增公网 HTTP 端点，不修改数据库表结构。

## 回答原文与引用

- 普通 `ANSWERED` 回答只去掉首尾空白，后端不再删除或替换其中的代码、链接、图片、编号和问号。
- Python 与 Web 使用同源 markdown-it 解析规则和共享 fixture 识别 `[n]`：只识别正文文字中的 1–999，不识别代码、公式、链接、转义及 ASCII 标识符紧邻的编号。
- 后端仍核对编号和可选原文。修复后仍无效时保留原文并返回 `CITATIONS_REMOVED`；前端根据引用列表隐藏无效编号，其余未确认编号保留原文。
- 无证据且未调用工具时跳过引用校验，普通对话中的编号写法不触发修复。
- `trace.verify.attributes.diagnostics` 增加排除候选数、外部链接数、外部图片数及去重主机名，不记录 URL 查询参数或回答正文。

## AI 回答渲染

所有完成态 Agent 回答统一使用 `aiAnswer`，流式期间仍显示纯文本：

- 外部链接保留文字并可点击，`target="_blank"`，`rel="noopener noreferrer nofollow"`；沿用 TipTap 的安全协议校验。
- 图片只放行同源 `/api/proxy/file/objects/{fileId}/redirect`，其中 `fileId` 为正整数。支持相对地址与同 Origin 绝对地址；外站、协议相对、普通同源路径和 `data:` 图片均不生成图片节点。
- 笔记 `readonly` 等其他预设保持不变。

## 终态契约

- `AgentFinishArgs.outcome` 只接受 `ANSWERED`、`NOT_FOUND`，删除 `NEEDS_CLARIFICATION` 和 `clarification_question`。
- 需要澄清时由 Agent 直接写普通回答，不使用专用终态，不截断问题，也不生成默认澄清问题。
- 既有 `NOT_FOUND` 固定说明、无证据但调用工具后的未找到降级，以及 `ANSWERED`、`NOT_FOUND`、`FAILED`、`CANCELLED` 结果类型不变。
- 历史消息中已经持久化的 `NEEDS_CLARIFICATION` 不做数据迁移；新运行不再产生该结果。

## 历史引用

Java 发送的 `HarnessRunRequestDTO.history[]` 增加可选 `citations`，只包含原轮次的编号和标题，不改历史回答原文：

```json
{
  "role": "assistant",
  "content": "旧回答[1]",
  "citations": [{ "index": 1, "title": "旧笔记" }]
}
```

Python `ChatMessage` 接收同一字段。ContextBuilder 附加原轮次有效范围说明，Agent 指令要求本轮只能引用本轮工具结果中的 `evidenceId`。本字段不代替 M17 方案所需的权限复核。

## 明确不做

- 不实现按标题自动补注。
- 不实现结构化 `options` 澄清选项。
- 本批不改变既有“未找到”文案及其触发路径；结构化生成说明只修订后续方案。
- 不实现 `think_tag`、过程视图或 M17 的权限复核，只同步这些方案的文本约束。
- 不修改 `packages/editor-core`、笔记预设、公开 OpenAPI 或 SQL。

## 验证计划

- pytest 与 Vitest 共同读取 `citation-markers.json`，覆盖代码、公式、链接、表格、转义、连写及 ASCII 前缀。
- Python 覆盖回答原文、无工具跳过、校验降级、Trace 统计、结构化摘要标记及历史引用说明。
- Java 覆盖持久化历史引用到 Harness DTO 的转换。
- Web 覆盖外链新标签与安全关系、同源对象图片、外站图片拦截、无效编号隐藏及笔记预设回归。
- 使用 ES 8.7 验证空高亮标签；执行真实栈渲染检查、51 条既有回答离线复算和 36 次已授权真实模型重放。
- 上线顺序保持 Web 先于 Python；Java 历史引用字段与 Python 接收端同批部署。
