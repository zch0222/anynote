# API 变更提案：知识库 Agent 版本 3

## 背景

知识检索 Agent 版本 2 会把没有引用编号的正确回答判为失败，并要求每次运行都通过 `agent_finish` 结束。版本 3 按已确认的[变更方案](../../../docs/ai-refactor/KNOWLEDGE_AGENT_V3_PLAN.md)放宽首轮与分级校验，同时保持权限、证据和防伪造约束不变。

## Agent 与运行契约

- Agent 名称保持 `knowledge-retrieval`，版本升级为 `"3"`。
- `HarnessRuntimeSettings` 新增 `prefetch-enabled`，默认 `false`，通过 Nacos 热更新。
- 没有其他工具调用且存在正文时，正文按 `ANSWERED` 申请完成；`agent_finish` 保留给未找到、需澄清及附引用原文的回答。
- 每次运行最多修复一次校验缺口。修复后仍存在的无效引用被移除，缺失来源或非知识库回答照常交付并附回答标注。
- `run.finished.data` 新增 `answerNotices: string[]`，没有标注时为空数组。取值仅限：
  - `UNSOURCED`
  - `NOT_FROM_KNOWLEDGE`
  - `CITATIONS_REMOVED`
- 结果类型仍使用 `ANSWERED`、`NOT_FOUND`、`NEEDS_CLARIFICATION`、`FAILED`、`CANCELLED`。

### `run.finished` 示例

```json
{
  "state": "COMPLETED",
  "outcome": "ANSWERED",
  "answerNotices": ["UNSOURCED"],
  "evidence": ["E1"],
  "unfinished": [],
  "usage": {
    "known": false
  }
}
```

## 失败事件契约

Java 按类别映射用户可见文案，未知类别不得透传 Python 内部信息：

| 类别 | 文案 |
|---|---|
| `BUDGET_*`、`NO_PROGRESS` | 这个问题需要的步骤超出了单次上限，可以缩小范围或拆成几个问题再试 |
| `MODEL_TIMEOUT` | 模型调用超时，请稍后重试 |
| `MODEL_UNAVAILABLE` | 模型服务暂时不可用，请稍后重试 |
| `EMPTY_MODEL_OUTPUT` | 模型没有返回内容，请重试 |
| `KNOWLEDGE_ACCESS_UNAVAILABLE` | 知识库服务暂时不可用，请稍后重试 |
| `INTERNAL`、未知类别 | 服务暂时不可用，请稍后重试 |
| `CANCELLED` | 不显示错误 |

连续两次出现重复或参数非法的 `agent_finish` 时，以 `FAILED / INTERNAL` 结束。

## 消息持久化与响应

- `a_chat_message` 新增 JSON 列 `answer_notices`。
- `ChatMessage` 增加持久化字段 `answerNotices`，`ChatMessageVO` 返回 `List<String> answerNotices`。
- 历史消息及空值按空数组返回。
- Java 消费 `run.finished` 时透传并保存标注，前端在回答下方显示已确认文案。

## 明确不做

- 不实现可选的标题自动补注。
- 不改变「未找到」的既有固定文案与 §6.5 范围外行为。
- 不新增通用回答评分器或无依据陈述率评分逻辑；真实模型重放只记录运行指标与回答原文对照。

## 验证计划

- Python：脚本化模型覆盖纯文本完成、校验修复与降级、回答标注、提示生命周期、预取开关和工具定义去重。
- Java：Mockito 覆盖错误类别映射、未知类别兜底及标注落库和响应转换。
- 前端：组件测试覆盖三种标注、无标注与空引用片段。
- 真实模型：版本 2/3 对比及预取开关消融，记录首字延迟、模型轮数和回答结果。
- 重新生成并提交 AI OpenAPI baseline。
