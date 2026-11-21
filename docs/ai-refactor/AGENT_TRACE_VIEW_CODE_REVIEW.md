# Agent 运行过程展示（M17）实现评估与修复方案

> 评估日期：2026-11-21
> 评估对象：M17.0–M17.4 的 9 个提交（`76fd2b4`、`f53d53f`、`f527cdb`、`79a04c9`、`97e5a9e`、`cb3f09d`、`ce92cfa`、`ec3d944`、`6aab2bd`），+5028 / −182
> 对照方案：[AGENT_TRACE_VIEW_PLAN.md](./AGENT_TRACE_VIEW_PLAN.md)、[OpenSpec 提案](../../.claude/openspec/changes/2026-11-18-agent-trace-view.md)
> 评估方式：逐个提交静态阅读；复跑改动涉及的单测；用临时脚本驱动真实代码复现问题。脚本不入库，复现步骤写在各问题下，修复时改写成回归用例
> 本文记录评估结论、修复方案与验收标准，评估时没有修改任何代码。**2026-11-21 已按本文实施修复**，结果见 [第 0 节](#0-修复记录2026-11-21)；
> 修复按用户拍板做了破坏性升级，与本文原方案不同的地方在第 0 节逐条说明，契约以 [OpenSpec 2026-11-21](../../.claude/openspec/changes/2026-11-21-agent-trace-view-repair.md) 为准。
> 同批的逻辑模型配置去 Nacos 化（`48d08a4`、`bdbb3da`）只核对了推理字段的传递，不在评估范围内

## 0. 修复记录（2026-11-21）

**拍板结论**（D1–D6 及实施中追加的问题）：D1、D2 按推荐清理开发库（执行前计数均为 0，未删除任何行）；**D3 改为去掉 Nacos 的过程展示开关**
（思考流、过程说明、Trace 全文一直开启，不新增 `tool-detail-enabled`），破坏性升级、不考虑旧版本兼容；D4 实现 `original`；D5 文案按推荐；
**D6 改为只按依赖清单复核**（不再按引用）；另定：工具结果条目带 `kbId`（结果条目可点击需要）、运行记录新增供应商 / 工具调用次数 / 首字时间三列、
**去掉 Java 白名单改由类型裁剪**（Java 原则上不用 `Map<String, Object>`，已写入 `CLAUDE.md`）、思考截断字数放到供应商表、行与事件统一用 `id`、
工具调用次数与首字时间在对话界面展示。

| 编号 | 结果 | 说明 |
|---|---|---|
| B1 | 已修复 | 过程投影挂在本次运行的 `RunContext.process_view`，`loop.py` 不再有 `self._view`；并发用例覆盖思考、过程说明、重试、依赖清单与 Trace 思考 |
| B2 | 已修复 | `ManifestEntry.content` 不参与序列化，`blobs` 从清单对象取原文并按运行去重；因 D3 无开关，验收改为「清单条目不含原文、`blobs` 每哈希一次」 |
| B3 | 已修复 | 每块缓冲整段发出，结束、重试中断、工具开始、过程说明与运行收尾前都先发完；按修复方案，首个增量不再单独立即发出 |
| B4 | 已修复 | 观察带本次调用的 `evidence_ids`，删除 `_owned_by`；依赖清单取收尾时工作区全部证据；修正把缺陷当预期的旧断言 |
| B5 | 已修复 | `body_emitted` / `reasoning_emitted` 两个标志，三种格式 × 三种断流位置的矩阵用例 |
| B6 | 已修复 | 两份 DTO 改为 `@NotEmpty` + `@Size` + `List<@NotBlank String>`；键格式错误或实体不存在只判这一条不可读 |
| B7 | 已修复 | 行统一 `{type, id}`；新增 Java 共享样例 `agent-process-view.json` 与 `.hidden.json`，前端按相对路径回放 |
| B8 | 已修复 | 管理端用 Jackson `readTree` 输出 JSON 节点，纳秒时间戳不丢精度；新增 Service 单测与真实 Jackson 序列化用例 |
| M1 | 已修复 | 复核返回强类型 `AgentProcessViewVO`，三条路径都只含契约字段 |
| M2 | 已修复 | 整段会话依赖去重后每 100 条批量复核 |
| M3 | 已修复（口径随 D3 调整） | 恢复 `summary`、`hitCount`、`retryable`；无开关后不再有「开关全关逐字段一致」，改为断言工具事件契约字段集合 |
| M4 | 已修复 | 失败且未解析的按引用读取显示「未找到或无权访问的内容」；前端工具行显示耗时与「失败」，去掉空分隔符 |
| M5 | 已修复 | 该轮思考记到 `ToolExchange`，上下文构建器挂到 assistant 工具调用消息，适配器按回传方式转换；补完原先没有断言的回传用例 |
| M6 | 已修复 | 首字时间、尝试次数、错误原文、修复提示、本轮用量；截断上限改为放在**供应商表**（`process_reasoning_max_chars`，管理端可配），删除 Python 配置 |
| M7 | 已修复 | 检索范围内的知识库登记进可见集；`kb:` 引用、`kb_search` / `kb_query` 知识库名、`kb_grep` 对象名、`kb_query` 实体中文名 |
| M8 | 已修复 | 断流记为失败、中止记为已停止；结果条目链接（桌面 / 移动）；思考增量按动画帧合并；礼貌播报且计时不播报；减少动态效果时不播放动画；移动端运行中只显示整轮控件和最新一行。**Playwright 用例 2026-11-21 通过**（桌面/移动 2/2，六项通过标准全绿），执行说明见 [AGENT_TRACE_VIEW_E2E.md](./AGENT_TRACE_VIEW_E2E.md)；「用时」口径已统一（`run.finished` 下发服务端 `durationMs`） |
| M9 | 已修复（方式随拍板调整） | 事件数据类与过程视图写成命名 schema 并重新生成 baseline；白名单删除，嵌套字段由类型裁剪 |
| M10 | 已修复（口径随 D6 调整） | 历史只按依赖清单复核，没有过程视图的旧消息不再复核（破坏性升级） |
| L1 | 已处理 | OpenSpec 原「已通过」表述已订正并指向修复提案 |
| L2 | 已修复 | 评估列出的 ruff 告警已清；`think_tag` 整段回答只有 `<` 时原样输出 |
| L3 | 已确认 | 「…（截断）」按 D5 确认保留 |
| L4 | 已修复 | 投影收尾时补发失败的 `tool.finished`，Java 收尾时把仍为 `running` 的工具行标为失败 |
| L5 | 已修复 | 列表每页最多 100 条，补齐供应商、工具调用次数、首字时间 |

**门禁与真实栈**：8.1 各项门禁、8.2 回归用例与 8.3 三项真实栈核对已完成，记录见
[changelist](../changelist/2026-11-21-agent-trace-view-repair.md) 与 [AI_MILESTONES.md](./AI_MILESTONES.md) M17 节。
8.4（需要主密钥与真实推理模型）未做，仍属 M17.6。第 8.5 节的开关前置条件随 D3 失效；
在 8.4 完成前仍不给任何逻辑模型配置推理格式。

## 1. 结论

**结构符合方案，实现有阻断级缺陷。**

- **符合方案的部分**：Python 产出两条投影，Java 按白名单转发、落库并在读取时复核，前端用纯函数归并事件。开关默认全关。
  管理员准入、访问留痕、T2 历史复核和 `think_tag` 解析都已落地，三个技术栈各有单测。
- **问题**：有 **8 处阻断级缺陷**（[5.1 汇总](#51-汇总)）。
  - 当前默认配置（开关全关、未配置推理格式）下已经生效的有 5 处：B2、B4、B6、B7、B8；B1 的依赖清单部分也已生效。
  - B1 在打开思考流后，会把一个用户的思考推给另一个用户，直接违反方案的核心约束。
  - B6 和 B7 叠加，T1 回放在真实栈上基本不可用。
- **测试为什么没发现**：
  - 多数用例只测单个工具调用、单个运行，只断言字段存在。
  - 跨栈数据都用手写样例或 mock 隔开了：Java 落库 JSON 到前端回放、DTO 到 note 校验、Gson 对象到 Jackson 输出。
  - 没有并发运行的用例。
  - 还有一条用例把缺陷当成了预期（[B4](#b4工具结果归属判定恒为真)）。
- **记录与实际不符**：OpenSpec「验证」一节和里程碑记录写的「已通过」，有几项与代码不符：
  - 开关全关时浏览器事件逐字段一致（[M3](#m3开关全关时对外事件并非逐字段一致)）；
  - 全文开关关闭时 Trace 与现状一致（[B2](#b2全文开关关闭时仍写入每层上下文原文)）；
  - `dependencies` 不发给浏览器（[M1](#m1回放复核把内部字段发给浏览器)）；
  - Trace 已补首字时间与尝试次数（[M6](#m6trace-声称补齐的字段为空或错位)）。

**在修复完成并通过[第 8 节](#8-总体验收标准)的门禁之前：不打开[方案 §5.9](./AGENT_TRACE_VIEW_PLAN.md#59-开关与上线顺序)的任何开关，
不给任何逻辑模型配置推理格式，M17.5 与 M17.6 不开工。**

## 2. 评估范围

| 提交 | 内容 |
|---|---|
| `76fd2b4` | OpenSpec 提案：事件契约、T1–T8 拍板结论、已确认文案 |
| `f53d53f` | SQL 迁移：`a_chat_message.process`、`a_agent_trace_access`，事件表改为永久保留 |
| `f527cdb` | Python 逻辑模型映射增加推理格式与回传方式 |
| `79a04c9` | 模型接入层：解析推理输出、`think_tag` 状态机、重试中断、回传 |
| `97e5a9e` | 过程投影 `harness/view`、思考流接入循环、Nacos 开关 |
| `cb3f09d` | Trace 全文投影与依赖清单 |
| `ce92cfa` | 会话历史开跑前按当前权限复核（T2） |
| `ec3d944` | Java 白名单转发、过程视图落库与读取复核、管理端点、note 批量可读性端点 |
| `6aab2bd` | 前端过程区与回放；Python 结果计数口径 |

## 3. 验证情况

**已复跑**（本机，均为改动涉及的测试）：

| 范围 | 命令 | 结果 |
|---|---|---|
| Python | `ai-service` 下 `pytest` 跑 `test_harness_loop.py`、`test_trace_fulltext.py`、`test_models.py`、`test_retrieval_session.py` | 49 个通过；既有的 `test_first_idle_and_total_timeouts[TOTAL]` 在其中一次运行里抖动失败，单独复跑通过 |
| Java | `mvn -o -q test -pl ai -Dtest='ProcessViewRecheckTest,AgentRunEventWhitelistTest,AgentRunAdminControllerTest,AgentRunServiceImplTest' -Dsurefire.failIfNoSpecifiedTests=false` | 5 + 3 + 4 + 18 个通过 |
| 前端 | `apps/web` 下 `pnpm vitest run src/features/ai src/lib/ai` | 23 个文件、140 个通过 |

**脚本复现**（驱动真实代码，不改仓库）：

| 问题 | 做法 | 结果 |
|---|---|---|
| B1 | 一个 `Harness` 实例，两个重叠的运行 | 用户 A 的思考增量全部出现在用户 B 的事件流里，A 一条没收到；A 的 `trace.dependencies` 为空 |
| B2 | 默认 `HarnessRuntimeSettings` 跑一次 | `trace.context` 清单 5 层全部带 `content` 原文 |
| B3 | 50 个 2 字的思考增量，默认阈值 | 模型产出 100 字，浏览器收到 4 字 |
| B4 | 三次检索：命中笔记一、命中笔记二、无命中 | 第二次列出两条，第三次显示「命中 2 条」 |
| B5 | 模拟传输：思考 → 正文 → 断流 → 重试 | 拼出的正文是「正文前半段完整回答」 |
| B6 | Hibernate Validator 8.0.1 单独校验 DTO | `UnexpectedTypeException: HV000030` |
| B7 | 用编译好的 `AgentRunProcessView` 累积工具事件后序列化 | 工具行只有 `blockId`，没有 `callId` |
| B8 | Jackson 2.17.2 序列化 Gson `JsonObject` | `JsonMappingException …JsonObject["asFloat"]` |

**没有做**：全量单测、真实栈端到端、真实模型重放（主密钥仍缺失）、M17.0 的逐模型核对。

## 4. 做得好的地方

1. **`think_tag` 状态机边界考虑周全。** 只认开头的标签；跨片段的半个标签会先扣住再判定；流结束仍未闭合时整段算思考；未配置格式时不剥离。这几种情况都有用例。
2. **默认收紧。**
   - Java 白名单丢弃未登记的事件类型，`trace.*` 只落库。
   - note 不可用时，读取复核宁可不返回过程视图，T2 只保留用户消息。
   - 开关全部默认关闭。
3. **管理端准入与留痕到位。** 三个端点都经过 `SystemAdminGuard`，详情与事件每次调用都写访问记录；SQL 用 `#{}` 参数化。
4. **持久化同步完整。** 迁移脚本、全量建表语句、`resultMap` 一起改了；包体预算没超（桌面 304.3 / 310 KB）。
5. **流程记录齐全。** OpenSpec、里程碑、changelist 都写了；既有的测试抖动如实登记。

## 5. 问题清单

### 5.1 汇总

| 编号 | 严重程度 | 问题 | 位置 | 默认配置下 |
|---|---|---|---|---|
| B1 | **阻断** | 共享 `Harness` 实例上保存每次运行的过程记录，并发运行互相串流 | [loop.py:108](../../ai-service/harness/loop.py#L108)、[:359](../../ai-service/harness/loop.py#L359)、[:574](../../ai-service/harness/loop.py#L574) | 依赖清单已串；开思考流后串文本 |
| B2 | **阻断** | 全文开关关闭时仍写入每层上下文原文 | [builder.py:408](../../ai-service/harness/context/builder.py#L408)、[trace/middleware.py:87](../../ai-service/harness/trace/middleware.py#L87) | 已生效 |
| B3 | **阻断** | 思考增量的合并实际是丢弃 | [view/middleware.py:101](../../ai-service/harness/view/middleware.py#L101) | 开思考流后 |
| B4 | **阻断** | 工具结果归属判定恒为真 | [view/middleware.py:241](../../ai-service/harness/view/middleware.py#L241) | 已生效 |
| B5 | **阻断** | 思考后已输出正文仍会重试，正文重复 | [openai_compatible.py:292](../../ai-service/models/openai_compatible.py#L292) | 配置推理格式后 |
| B6 | **阻断** | note 批量可读性端点每次校验失败，回放全部不显示 | [KnowledgeAuthorizeBatchDTO.java:24](../../services/note/src/main/java/com/anynote/note/model/dto/KnowledgeAuthorizeBatchDTO.java#L24) | 已生效 |
| B7 | **阻断** | 落库工具行的字段名与前端不一致，刷新后工具行丢失 | [AgentRunProcessView.java:218](../../services/ai/src/main/java/com/anynote/ai/run/AgentRunProcessView.java#L218)、[use-chat-stream.ts:575](../../apps/web/src/features/ai/use-chat-stream.ts#L575) | 已生效 |
| B8 | **阻断** | 管理端完整 Trace 接口无法序列化 | [AgentRunAdminServiceImpl.java:127](../../services/ai/src/main/java/com/anynote/ai/service/impl/AgentRunAdminServiceImpl.java#L127) | 已生效 |
| M1 | 中 | 回放复核把内部字段发给浏览器 | [ProcessViewRecheck.java:75](../../services/ai/src/main/java/com/anynote/ai/run/ProcessViewRecheck.java#L75) | 已生效 |
| M2 | 中 | 会话详情逐条消息调用复核（N+1） | [ChatController.java:104](../../services/ai/src/main/java/com/anynote/ai/controller/ChatController.java#L104) | 已生效 |
| M3 | 中 | 开关全关时对外事件并非逐字段一致 | [view/middleware.py:204](../../ai-service/harness/view/middleware.py#L204)、[AgentRunEventWhitelist.java:60](../../services/ai/src/main/java/com/anynote/ai/run/AgentRunEventWhitelist.java#L60) | 已生效 |
| M4 | 中 | 工具行的占位、失败与耗时展示不符合方案 | [view/middleware.py:265](../../ai-service/harness/view/middleware.py#L265)、[process-area.tsx:206](../../apps/web/src/features/ai/components/process/process-area.tsx#L206) | 已生效 |
| M5 | 中 | 回传方式 `original` 不起作用 | [openai_compatible.py:181](../../ai-service/models/openai_compatible.py#L181) | 配置后 |
| M6 | 中 | Trace 声称补齐的字段为空或错位 | [view/events.py:90](../../ai-service/harness/view/events.py#L90)、[trace/middleware.py:73](../../ai-service/harness/trace/middleware.py#L73) | 开全文后 |
| M7 | 中 | 工具行对象名称多数解析不出 | [view/middleware.py:251](../../ai-service/harness/view/middleware.py#L251) | 已生效 |
| M8 | 中 | 前端交互缺项；断流时显示「已完成，用时 0 秒」 | [process-area.tsx:43](../../apps/web/src/features/ai/components/process/process-area.tsx#L43)、[use-chat-stream.ts:396](../../apps/web/src/features/ai/use-chat-stream.ts#L396) | 已生效 |
| M9 | 中 | OpenAPI 没有事件命名 schema；白名单不裁剪嵌套字段 | [AgentRunEventWhitelist.java:39](../../services/ai/src/main/java/com/anynote/ai/run/AgentRunEventWhitelist.java#L39) | — |
| M10 | 中 | T2 只按历史引用复核 | [AgentRunServiceImpl.java:678](../../services/ai/src/main/java/com/anynote/ai/service/impl/AgentRunServiceImpl.java#L678) | 已生效 |
| L1 | 低 | 文档状态与实现不一致 | 方案文档头、README、`CLAUDE.md` | **本文提交时已同步** |
| L2 | 低 | 代码整洁问题 | 见 [L2](#l2代码整洁问题) | — |
| L3 | 低 | 「…（截断）」不在已确认文案里 | [AgentRunProcessView.java:122](../../services/ai/src/main/java/com/anynote/ai/run/AgentRunProcessView.java#L122) | 开思考流后 |
| L4 | 低 | 工具执行中途失败时，工具行永远停在「进行中」 | [loop.py:487](../../ai-service/harness/loop.py#L487) | 已生效 |
| L5 | 低 | 管理端列表的每页条数无上限，字段不够 M17.5 使用 | [AgentRunAdminServiceImpl.java:82](../../services/ai/src/main/java/com/anynote/ai/service/impl/AgentRunAdminServiceImpl.java#L82) | — |

按仓库约定，每一项修复都**先写复现该问题的失败用例，再改代码**。下文「验收标准」里的回归用例在当前代码上必须失败。

### 5.2 阻断级

#### B1：共享 Harness 实例上保存每次运行的过程记录

**位置**：

- [runtime.py:71](../../ai-service/harness/runtime.py#L71)：`RunManager` 整个进程只构造一个 `Harness`，所有运行共用。
- [loop.py:108](../../ai-service/harness/loop.py#L108)：`run()` 把本次运行的 `RunViewMiddleware`（持有本次运行的事件总线）写到实例字段 `self._view`。
- [loop.py:359](../../ai-service/harness/loop.py#L359)（`_call_model`）和 [loop.py:574](../../ai-service/harness/loop.py#L574)（`_finish`）从实例字段读回。

**原因**：运行 A 进入下一次模型调用或收尾之前，只要运行 B 已经开始，`self._view` 就已经被换成 B 的投影。
此后 A 的思考增量、过程说明、重试行都从 B 的事件总线发出，A 的依赖清单也取自 B。

**复现**：一个 `Harness`、两个运行：A 先调一个耗时 50 ms 的工具再输出思考；B 晚 20 ms 开始，每 30 ms 输出一段思考。

```text
用户 A 收到的思考：(无)
用户 B 收到的思考：<B…第0段><A用户的私密思考第0段><A…第1段><A…第2段><B…第1段>…
A 的 trace.dependencies：[]   （应为 ["note:111"]）
```

**影响**：

- **思考流或过程说明开启后**：一个用户的思考和过程说明会推到另一个用户的浏览器，并随对方的消息永久落库。
  思考是基于用户 A 有权访问的文档产生的，B 无权看到。被串到的运行，Trace 里的思考全文也是错的。
- **默认配置下**：每次运行的 `trace.dependencies` 取自最近开始的那次运行，过程视图落库的依赖清单是错的。
  后果是读取复核可能该隐藏的不隐藏（I5 失效），也可能误隐藏。

**修复方案**：

- `Harness` 上不保留任何每次运行的可变状态。把 `RunViewMiddleware` 实例放到本次运行的 `RunContext` 上，例如 `context.process_view`；
  或者作为参数显式传给 `_call_model`、`_finish`。
- 删除 `_act` 里 `if self._view is None` 的旧分支：`run()` 里投影总是存在，这两段已经是死代码。
- 顺带检查 `RunManager` 里只构造一次的其他对象：`RetrievalSessionMiddleware` 按 `run_id` 取会话，没有问题；
  `BudgetMiddleware`、`NoProgressMiddleware`、`TraceMiddleware` 都在每次运行时新建。

**验收标准**：

- 新增并发用例：一个 `Harness`、两个按上面时序重叠的运行，思考流和过程说明开关都打开，用例要求：
  - 每个事件总线上的 `reasoning.delta`、`reasoning.finished`、`step.note`、`model.retry` 只属于本运行；
  - 每个运行的 `trace.dependencies` 等于本运行登记的证据（A 为 `["note:111"]`，B 为空）；
  - 打开全文开关时，`trace.model.reasoning` 只有本运行的思考。
- `ai-service/harness/loop.py` 里不再出现 `self._view`。

#### B2：全文开关关闭时仍写入每层上下文原文

**位置**：

- [builder.py:408](../../ai-service/harness/context/builder.py#L408)：每个清单条目都填了 `content`。
- [trace/middleware.py:87-90](../../ai-service/harness/trace/middleware.py#L87)：`model_dump` 会带出 `content`，只有全文开关打开时才把它移进按哈希去重的 `blobs`；开关关闭时直接返回。

**影响**：

- 默认配置下，每次模型调用都把全部上下文层的原文写进 `a_agent_run_event`：平台规则、Agent 契约、工具定义、用户问题、会话历史、证据与工具结果。
- 这条路径没有去重，每轮重复写一遍。
- T4 已改为永久保留，等于默认就把知识库原文永久存进事件表，与方案 §5.9「Trace 全文默认关：关闭时 Trace 维持现状」相反。
- 现有用例 `test_trace_fulltext_off_keeps_legacy_fields` 只断言了没有 `blobs`，没有检查清单条目。

**修复方案**：

- `ManifestEntry.content` 改为 `Field(default=None, exclude=True)`。这样任何 `model_dump`，包括 Trace 和日志，都不会带出原文。
- 全文开关打开时，`TraceMiddleware` 直接从 `context.payload.manifest.entries` 的对象上取 `content` 生成 `blobs`。
- 开发库里已经写入的原文按 [D2](#6-待拍板) 处理。

**验收标准**：

- 补强 `test_trace_fulltext_off_keeps_legacy_fields`：开关关闭时，`trace.context` 的属性只有 `manifest`；每个清单条目的键集合与 M17 之前一致，不含 `content`。
- 新增用例：全文开关打开、连续多轮调用时，同一哈希在整次运行的 `blobs` 里只出现一次，清单条目都不含 `content`。
- `ManifestEntry(...).model_dump()` 不含 `content`。

#### B3：思考增量的合并实际是丢弃

**位置**：[view/middleware.py:101-125](../../ai-service/harness/view/middleware.py#L101) 的 `note_reasoning`，以及 [:127](../../ai-service/harness/view/middleware.py#L127) 的 `finish_reasoning_block`。

**原因**：
- 代码只累加字数，到了 64 字或 100 ms 的阈值，只发出当前这一小段增量。之前累积的增量从来没有发出。
- 块结束时也不补发剩余部分。

**复现**：50 个 2 字的思考增量（共 100 字），默认阈值下浏览器只收到 4 字，即 `"00"` 和 `"32"` 两段。

**影响**：
- 用户看到的思考大部分缺失。
- Java 用转发出去的增量拼过程视图，所以落库内容和刷新回放也是残缺的。
- 管理控制台里「用户看到的内容」同样残缺，无法用它核对投影。

**修复方案**：

- 每个思考块维护一个待发缓冲。增量先追加进缓冲；缓冲达到字数阈值，或距上次发出超过时间阈值时，把**整个缓冲**作为一条 `reasoning.delta` 发出并清空。
- 以下时机先把缓冲发完：`reasoning.finished`（含 `interrupted`）之前、本轮 `tool.started` 之前、`step.note` 之前、运行失败或取消之前。
- 不变量：同一块所有 `reasoning.delta.delta` 按顺序拼接，等于该块的思考全文。

**验收标准**：

- 新增用例：固定一组增量（多数 1–3 字，夹几段超过阈值的长增量），冻结时钟。断言：
  - 每个块的发出内容拼接后等于全文；
  - 每个块的事件条数不超过 ⌈块字数 ÷ 字数阈值⌉ + 1。
- 新增用例：重试中断时，`reasoning.finished(status=interrupted)` 之前已发出该块的全部已产出文本。
- 现有 `test_reasoning_events_emitted_when_view_enabled` 改为断言拼接内容等于「先想一下再想一下」。

#### B4：工具结果归属判定恒为真

**位置**：
- [view/middleware.py:72-75](../../ai-service/harness/view/middleware.py#L72)：把整个工作区的证据逐条判定归属。
- [view/middleware.py:241](../../ai-service/harness/view/middleware.py#L241)：`_owned_by` 对任何带编号的证据都返回 `True`。

**影响**：
- 每次工具调用都把整个工作区的证据算成自己的：
  - `tool.finished.result` 的条目和 `kb_search` 的「命中 {n} 条」都按全部证据计；
  - `trace.action.evidenceIds` 也是全部证据。
- 实测第三次检索零命中，却显示「命中 2 条」，并列出前两次检索的标题。
- 现有用例 [test_harness_loop.py:432](../../ai-service/tests/test_harness_loop.py#L432) 断言一个没有返回证据的 `kb_search` 计数为 1，把缺陷写成了预期。

条目都来自可见集，所以不会泄露无权内容；但这是用户每次提问都能看到的错误信息。

**修复方案**：

- 在 `ActionPlane.observe`（[plane.py:117](../../ai-service/harness/action/plane.py#L117)）给 `Observation` 增加 `evidence_ids`，取自本次 `ActionResult.evidence`。
  像 `action_key` 一样设 `exclude=True`，不改变模型看到的内容。
- 投影按 `evidence_ids` 从工作区取本次调用的证据，删除 `_owned_by`。
- 依赖清单改为在收尾时取工作区的全部证据。这样也覆盖了不经工具调用写入的预取证据。

**验收标准**：

- 新增用例：三次顺序检索，加一轮两个并行调用、各自返回不同证据。断言：
  - 每条 `tool.finished.result.items` 只含本次调用的证据；
  - 零命中的调用 `count` 为 0、`items` 为空；
  - `trace.action.evidenceIds` 按调用各自正确。
- 修正 [test_harness_loop.py:432](../../ai-service/tests/test_harness_loop.py#L432) 的断言为 0。

#### B5：思考后已输出正文仍会重试，正文重复

**位置**：
- [openai_compatible.py:292-310](../../ai-service/models/openai_compatible.py#L292)：`reasoning_only` 只在首个输出时设置，之后来了正文或工具片段也不清除。
- [openai_compatible.py:173](../../ai-service/models/openai_compatible.py#L173)：重试判断依赖这个标志。

**复现**：`reasoning_content` 格式下，依次输出思考「思考」、正文「正文前半段」，然后断流，第二次请求输出「完整回答」。
结果：发了 2 次请求、1 个中断片段，拼出的正文是「正文前半段完整回答」。

**影响**：
- 原有不变量「正文或工具片段已产出时禁止重放」（`test_output_failure_is_never_replayed`）只在不解析推理时成立。
- 本功能要启用的 `reasoning_content`、`reasoning` 两种格式下，回答中途断流会得到重复、拼接错乱的正文：
  - 结构化模式下，错乱的文本成为最终回答；
  - 非结构化模式下，浏览器里出现重复文字。
- `think_tag` 恰好相反：原始正文一到就把标志置成「已有正文」，思考阶段断流永远不重试。

**修复方案**：

- 用两个明确的标志替换 `produced` 与 `reasoning_only`：
  - `body_emitted`：产出一段正文增量，或收到任何工具调用片段时置位；
  - `reasoning_emitted`：产出一段思考增量时置位。
- 重试规则：
  - 能否重试：可重试错误且 `body_emitted` 为假；
  - 重试前，只有 `reasoning_emitted` 为真时才发中断片段。
- `think_tag` 下，被状态机当作思考的原始正文和尚未判定的前缀都不算正文，只有状态机吐出正文时才置 `body_emitted`。
- 首输出计时不变：思考、正文、工具片段都算首输出。

**验收标准**：

- 新增参数化用例，覆盖 `reasoning_content`、`reasoning`、`think_tag` 三种格式：
  - 只有思考就断流：重试一次，发一个中断片段，最终正文只来自第二次请求；
  - 思考后出现正文再断流：不重试，抛 `ModelServiceError`，只发 1 次请求；
  - 思考后出现工具片段再断流：不重试。
- `test_output_failure_is_never_replayed`、`test_partial_tool_output_failure_is_never_replayed`、`test_reasoning_interrupt_emitted_before_retry` 仍然通过。

#### B6：note 批量可读性端点每次校验失败

**位置**：
- note 与 api 两份 `KnowledgeAuthorizeBatchDTO`，见 [note 侧:24](../../services/note/src/main/java/com/anynote/note/model/dto/KnowledgeAuthorizeBatchDTO.java#L24) 和 [api 侧:26](../../services/api/anynote-api-note/src/main/java/com/anynote/note/api/model/dto/KnowledgeAuthorizeBatchDTO.java#L26)。
- 端点 [KnowledgeController.java:133](../../services/note/src/main/java/com/anynote/note/controller/KnowledgeController.java#L133) 带 `@Valid @RequestBody`。

**原因**：`@NotBlank` 只能用于字符串，标在 `List<String>` 上，Hibernate Validator 校验时抛 `UnexpectedTypeException (HV000030)`。

**影响**：
- 每次批量可读性请求都报错，`ProcessViewRecheck` 拿不到 `00000`，按设计返回 `null`。
- 所有依赖清单非空的过程视图，在会话详情里都不返回。
- note 侧没有 `authorizeCombined` 和这个端点的测试；`ProcessViewRecheckTest` mock 了 Feign，所以没发现。

另一个问题：`authorizeCombined`（[KnowledgeAccessServiceImpl.java:107](../../services/note/src/main/java/com/anynote/note/service/impl/KnowledgeAccessServiceImpl.java#L107)）逐条解析键，任何一条格式不对，整批都会失败。

**修复方案**：

- 两份 DTO 改为与 `KnowledgeAuthorizeDTO` 一致的写法：
  - 列表上用 `@NotEmpty(message = INVALID_ENTITY)` 和 `@Size(max = 100, message = TOO_MANY)`；
  - 元素写成 `List<@NotBlank String>`。
  - api 侧去掉 `List<String>` 上的 `@Valid`。
- `authorizeCombined` 中，某条键解析失败或实体不存在时，只把这一条判为不可读，不让整批失败。复核据此返回隐藏视图，仍然安全。

**验收标准**：

- 新增控制器用例：使用真实的校验器（`MockMvcBuilders.standaloneSetup(...).setValidator(new LocalValidatorFactoryBean())`）。
  - 合法请求返回 `00000`；
  - 空列表返回 `A0160`；
  - 101 条返回 `A0160`。
  - 合法请求这一条在当前代码上失败。
- 新增 `authorizeCombined` 单测，分别覆盖：
  - 可读笔记，他人私有笔记，`mooc_item:5#transcript`，`kb:3`；
  - 已删除实体、格式错误的键，两者都判为不可读而不是整批失败。
- 真实栈核对见 [8.3](#83-真实栈核对不需要主密钥)。

#### B7：落库工具行的字段名与前端不一致

**位置**：
- Java [AgentRunProcessView.java:218](../../services/ai/src/main/java/com/anynote/ai/run/AgentRunProcessView.java#L218) 把工具调用标识存进 `blockId`，`Item` 没有 `callId` 字段。
- 前端 [use-chat-stream.ts:575](../../apps/web/src/features/ai/use-chat-stream.ts#L575) 恢复工具行时要求 `callId` 是字符串。

**复现**：用编译好的类累积一组工具事件后序列化，得到：

```json
{"type":"tool","blockId":"c1","durationMs":820,"status":"SUCCESS","name":"kb_search","target":{...},"result":{...}}
```

前端用例的落库样例是手写的 `callId`，所以通过。

**影响**：
- 刷新后所有工具行都被丢弃。
- 开关全关时过程区只有工具行，刷新后整块消失。
- 与 B6 叠加，T1 回放在真实栈上基本不可用。

**修复方案**：

- Java 的 `Item` 增加 `callId` 字段，工具行写 `callId`；`blockId` 只用于思考行。
- 开发库已有的过程视图按 [D1](#6-待拍板) 处理。
- 建立跨栈共享样例，沿用引用标记共享用例的做法（`ai-service/tests/fixtures/citation-markers.json` 由 Python 和前端共用）：
  1. Java 新增 `services/ai/src/test/resources/fixtures/agent-process-view.json`。
     测试用固定事件序列累积（两段思考加结束、带对象和结果及定位的工具开始与结束、过程说明、重试），再加依赖清单，
     断言序列化结果与样例在 JSON 结构上相等。
  2. 同目录再放一份 `agent-process-view.hidden.json`，内容是 `ProcessViewRecheck` 对上述样例生成的隐藏视图。
  3. 前端用例按相对路径读这两份样例做回放，断言四类行都恢复，工具行的 `callId`、`name`、`status`、`durationMs`、`target`、`result` 齐全。

**验收标准**：

- Java 与前端两条样例用例通过，样例文件入库。
- 任意一端改字段名，至少一条用例失败。
- 真实栈核对见 [8.3](#83-真实栈核对不需要主密钥)。

#### B8：管理端完整 Trace 接口无法序列化

**位置**：
- [AgentRunAdminServiceImpl.java:127](../../services/ai/src/main/java/com/anynote/ai/service/impl/AgentRunAdminServiceImpl.java#L127) 把 `JsonParser.parseString` 得到的 Gson `JsonElement` 放进 `AgentRunAdminEventVO.content`（`Object`）。
- `services/ai` 的接口用 Jackson 输出，仓库里没有配置 Gson 转换器。

**复现**：Jackson 2.17.2 序列化 Gson `JsonObject`，抛 `JsonMappingException (…JsonObject["asFloat"])`。

**影响**：
- 任何有事件的运行，`GET /v1/admin/agent-runs/{runId}/events` 都会失败，M17.5 的轨迹视图无从展示。
- 失败前已经写了一条访问记录，留痕会显示管理员看过，实际并没有看到内容。
- 控制器用例返回的事件没有 `content`；`AgentRunAdminServiceImpl` 没有任何单测。

**修复方案**：

- 注入 Spring 的 `ObjectMapper`，用 `readTree` 解析出 `JsonNode`，Jackson 能原生输出。不要转成 Gson 的 `Map`：
  - Trace 里的 `endTimeUnixNano` 约为 1.8×10¹⁸，超出 double 的精确范围；
  - 转成 `Map` 会变成浮点数，丢失精度。
- 解析失败时原样返回字符串。

另外，纳秒时间戳超出 JS 的安全整数范围，M17.5 前端展示时要按字符串或毫秒处理。

**验收标准**：

- 新增 `AgentRunAdminServiceImpl` 单测，覆盖以下行为：
  - 列表：筛选条件下传、分页；
  - 详情：过程视图解析、写访问记录；
  - 事件：`limit` 限定在 1–500、游标、写访问记录、`content` 为 JSON 节点；
  - 运行不存在：抛业务异常，不写访问记录。
- 新增序列化用例：MockMvc 使用真实的 Jackson 转换器，服务返回带 JSON 对象 `content` 的事件，响应为 200 且能按路径取到 `content` 内的字段。
  在当前代码上失败。
- 真实栈核对见 [8.3](#83-真实栈核对不需要主密钥)。

### 5.3 中等问题

#### M1：回放复核把内部字段发给浏览器

**问题**：
- [ProcessViewRecheck.java:75](../../services/ai/src/main/java/com/anynote/ai/run/ProcessViewRecheck.java#L75) 和 [:97](../../services/ai/src/main/java/com/anynote/ai/run/ProcessViewRecheck.java#L97) 在依赖为空或全部可读时，原样返回落库对象。
  `dependencies`、`reasoningChars`，以及工具行上的 `blockId` 都会发到浏览器。
- 只有隐藏路径删掉了 `dependencies`。这违反方案 §5.6「`dependencies` 不发给浏览器」。

**修复方案**：三条路径都按契约字段重新组装返回对象：
- 顶层：`version`、`durationMs`、`hidden`、`hiddenNotice`、`items`；
- 每类行只带契约字段。

**验收标准**：单测覆盖依赖为空、全部可读、部分不可读三条路径，返回里都没有 `dependencies` 和 `reasoningChars`，行字段与 B7 的共享样例一致。

#### M2：会话详情逐条消息调用复核

**问题**：
- [ChatController.java:104](../../services/ai/src/main/java/com/anynote/ai/controller/ChatController.java#L104) 对每条有过程视图的消息各调用一次 note。
- note 侧又逐条查实体。长会话打开一次就有几十次顺序调用。

**修复方案**：先收集整段会话所有消息的依赖并去重，每 100 条批量复核一次，再按消息分别判定。

**验收标准**：单测中 3 条消息共享部分依赖时，Feign 调用次数等于 ⌈去重后条数 ÷ 100⌉，判定结果与逐条复核一致。

#### M3：开关全关时对外事件并非逐字段一致

**问题**：投影接管工具事件后（[view/middleware.py:204-229](../../ai-service/harness/view/middleware.py#L204)），字段发生了变化：

- `tool.started` 不再带 `summary`（方案 §5.5 写明「`summary` 不变」）。
- `tool.finished` 不再带 `hitCount`、`retryable`。Java 白名单（[AgentRunEventWhitelist.java:60](../../services/ai/src/main/java/com/anynote/ai/run/AgentRunEventWhitelist.java#L60)）本身也没登记 `hitCount`，预取路径发的 `hitCount` 同样会被删掉。
- `target`、`result` 不受任何开关控制。
- `trace.action` 在开关关闭时也多了 `evidenceIds`。

前端只用 `name`（已检索，`summary`、`hitCount` 没有消费方），所以不是功能回退。
问题在于契约和验收声明与实际不符：方案 §5.9、§7 都把「开关全关时浏览器事件逐字段一致」列为验收项。

**修复方案**：
- 恢复 `summary`（取已确认的工具说明）、`hitCount`（本次调用的证据数，依赖 B4）、`retryable`，白名单补登记 `hitCount`。
- `target`、`result` 是否加开关见 [D3](#6-待拍板)。

**验收标准**：新增用例，开关全关时，脚本化运行经 Java 白名单后：
- `tool.started` 的键集合为 `{callId, name, summary}`；
- `tool.finished` 的键集合为 `{callId, name, status, hitCount, durationMs, errorCategory, retryable}`；
- 没有 `reasoning.*`、`step.note`、`model.retry` 事件。

采纳 D3 的备选方案时，按修订后的口径断言。

#### M4：工具行的占位、失败与耗时展示

**问题**：

- 方案 §5.4 和 §7 场景 3 要求：按引用读取失败后，工具行对象换成「未找到或无权访问的内容」。
  实际上 Python 始终发「指定内容」（[view/middleware.py:265](../../ai-service/harness/view/middleware.py#L265)），前端只在结果条目缺标题时用到这句文案。
- 失败的工具行没有任何失败标识，看起来和成功但没有摘要的行一样。
- 工具行不显示耗时；摘要后面挂着一个空的「·」（[process-area.tsx:206](../../apps/web/src/features/ai/components/process/process-area.tsx#L206)）。

**修复方案**：
- Python 投影在 `tool.finished` 中，对状态为失败且对象未解析的按引用读取，把对象换成「未找到或无权访问的内容」。这样落库、回放、管理端看到的都一致。
- 前端：
  - 工具行显示耗时；
  - 失败行加失败标识，文案按 [D5](#6-待拍板) 确认；
  - 去掉空的「·」。

**验收标准**：
- Python 用例：对不可读引用调 `kb_read`，`tool.finished.target` 为 `{label: "未找到或无权访问的内容", resolved: false}`。
- 前端组件用例覆盖：成功行的摘要与耗时、失败行的失败标识、无结果条目时不出现分隔符。

#### M5：回传方式 `original` 不起作用

**问题**：
- `_apply_passthrough`（[openai_compatible.py:181](../../ai-service/models/openai_compatible.py#L181)）的注释说 Harness 会把当轮思考挂在 assistant 工具调用消息上。
- 实际上全仓没有代码这样做，`original` 与 `none` 效果相同。管理端已经提供这个选项（`bdbb3da`）。
- M17.0 要求的「逐个核对启用模型的推理格式与回传要求」也没做，因为主密钥缺失。

**修复方案**：见 [D4](#6-待拍板)。若实现：
- `_act` 记录本轮思考全文到 `ToolExchange`；
- 上下文构建器生成 assistant 工具调用消息时带上 `reasoning_content`；
- 由适配器按配置转换或清除。

**验收标准**：
- 单测：配置 `original` 时，第二次模型请求的 assistant 工具调用消息带上第一轮思考，字段名随推理格式映射；配置 `none` 时不带；配置 `empty` 时为空字符串。
- M17.0 为每个启用的逻辑模型留下格式与回传记录。

#### M6：Trace 声称补齐的字段为空或错位

**问题**（`cb3f09d` 的提交说明称已补齐）：

- 首字时间 `first_output`（[view/events.py:90](../../ai-service/harness/view/events.py#L90)）从未赋值，`firstOutputMs` 永远不出现。
- 尝试次数 `attempts`（[:92](../../ai-service/harness/view/events.py#L92)）从未递增，恒为 1。
- 错误原文 `error_message`（[:75](../../ai-service/harness/view/events.py#L75)）从未赋值。
- `trace.verify.repairHint` 取的是 `run.hints[-1]`（[trace/middleware.py:73](../../ai-service/harness/trace/middleware.py#L73)）。
  但循环在 `AFTER_VERIFY` 之后才追加本轮的修复提示（[loop.py:254-259](../../ai-service/harness/loop.py#L254)），记下的是上一条提示。
- 本轮用量缺 `reasoningTokens` 时，用整次运行的累计值顶替（[trace/middleware.py:127-130](../../ai-service/harness/trace/middleware.py#L127)）。
- Nacos 的 `process-reasoning-max-chars`（[config.py:44](../../ai-service/core/config.py#L44)）没有任何代码读取。
  Java 写死了 8000（[AgentRunServiceImpl.java:84](../../services/ai/src/main/java/com/anynote/ai/service/impl/AgentRunServiceImpl.java#L84)）。

**修复方案**：
- 首字时间：在 `_call_model` 收到首个思考或正文增量时记录。
- 尝试次数：适配器每次重试前发一个带尝试序号的片段（只有已输出思考时才同时标记中断），循环据此递增。
- 错误原文：在工具失败时从行动结果取，只进 Trace。
- 修复提示：先生成，放进 `AFTER_VERIFY` 的载荷，再追加到提示列表。
- 用量：只用本轮值。
- 截断上限：放到 Java 的配置类里，删除 Python 那份没人读的配置。

**验收标准**：全文开关打开时：
- 有输出的模型轮带 `firstOutputMs`；
- 重试一次后 `attempts` 为 2；
- 失败工具带 `errorMessage`；
- `repairHint` 等于该轮实际追加的修复提示；
- 每轮 `reasoningTokens` 不是累计值。

Java 截断上限可配置，并有单测。

#### M7：工具行对象名称多数解析不出

**问题**（`_target_label`，[view/middleware.py:251](../../ai-service/harness/view/middleware.py#L251)）：

- 可见集只从证据登记，没有收录 `/scope` 返回的知识库。
  `kb_outline` 的 `kb:3` 这类引用，永远解析不出名称，只显示「指定内容」。
- `kb_query` 直接显示英文枚举 `note`、`task`。
- `kb_search` 没有显示范围内的知识库名称。

都不泄露，但与方案 §5.4 的各工具用户视图不符。

**修复方案**：
- 开跑时把 `/scope` 返回的知识库及名称登记进可见集。
- `kb:{id}` 引用按知识库名解析。
- 实体类型映射成中文名，文案按 [D5](#6-待拍板) 确认。
- `kb_search` 带 `kb_ids` 时追加知识库名称。

**验收标准**：每个工具一条用例：
- 可见集里有的名称能解析；
- 不在可见集里的知识库标识显示占位，不出现名称。

#### M8：前端交互缺项

**问题**：

- 方案 §5.7 要求的几项交互没有实现：
  - 结果条目可以点击，链接沿用引用卡片的桌面与移动端路由；
  - 思考增量按动画帧合并后再写入 store；
  - 状态变化礼貌播报、计时不播报；
  - 用户设置减少动态效果时，不播放动画；
  - 移动端运行中只显示整轮控件和最新一行。
- 断流（没收到 `run.finished`）或本地中止时，消息没有 `outcome`（[use-chat-stream.ts:396](../../apps/web/src/features/ai/use-chat-stream.ts#L396)）。
  过程区据此判为正常结束（[process-area.tsx:43](../../apps/web/src/features/ai/components/process/process-area.tsx#L43)），显示「已完成，用时 0 秒」并自动收起。
  方案要求失败、取消时保持展开，并显示「失败」或「已停止」。

**修复方案**：
- 流结束时按情况给消息写明状态：未收到终态事件且不是用户中止的，记为失败；用户中止的，记为已停止。
- 其余几项按方案 §5.7 逐项实现。

**验收标准**：
- 组件或状态层用例覆盖：
  - 断流：整轮控件显示「失败」且保持展开；
  - 中止：显示「已停止」；
  - 结果条目的桌面与移动端链接；
  - 减少动态效果时不带动画类；
  - 有播报区且计时不播报。
- M17.4 计划中的 Playwright 桌面与移动端用例补齐：用脚本化供应商输出思考增量。
- `bundle:budget` 通过。

#### M9：OpenAPI 与白名单的嵌套字段

**问题**：
- 方案 §5.5 要求新事件写成命名 schema 进 `openapi/specs/ai.json`，没有做。
  `AgentRunEventVO.data` 与 `ChatMessageVO.process` 都是无结构的 `object`；旧事件同样没有命名 schema，属于既有欠账。
- Java 白名单（[AgentRunEventWhitelist.java:39](../../services/ai/src/main/java/com/anynote/ai/run/AgentRunEventWhitelist.java#L39)）只裁剪顶层字段。
  `target`、`result` 和 `items[].locator` 内部的字段不受控制，与 I4「未登记字段删掉」不完全一致。

**修复方案**：
- 新事件与过程视图写成命名 schema，重新生成 baseline。
- 白名单对 `target`（`label`、`resolved`）和 `result`（`count`、`items[].ref/title/kbName/locator`）逐层裁剪。

**验收标准**：
- `pnpm openapi:check` 通过，`ai.json` 中有新事件和过程视图的 schema。
- 白名单单测：嵌套对象里的未登记字段被删除。

#### M10：T2 只按历史引用复核

**问题**：
- Java 只把带编号和 `sourceId` 的引用交给 Python（[AgentRunServiceImpl.java:678](../../services/ai/src/main/java/com/anynote/ai/service/impl/AgentRunServiceImpl.java#L678)）。
- 回答用到了证据、但引用被删掉或没写引用时（`CITATIONS_REMOVED` 等降级），这条历史回答复核不到，照样进入上下文。
- M17.3 已经把每条回答的 `dependencies` 落库，可以覆盖这个缺口，但要先修好 B1，依赖清单才可信。

**修复方案**：见 [D6](#6-待拍板)。若采纳：
- 历史消息带上落库的依赖清单，Python 把依赖清单与引用合并后复核；
- 没有过程视图的旧消息仍按引用复核。

**验收标准**：
- Python 用例：一条没有引用、但依赖清单含不可读笔记的历史回答，不进入上下文；用户消息保留。
- Java 用例：依赖清单随历史正确下发。

### 5.4 低优先级

#### L1：文档状态与实现不一致

方案文档头、`docs/ai-refactor/README.md` 和 `CLAUDE.md` 导航仍写「草案，T1–T8 待拍板，未开工」；方案 §9 的 T4 推荐 30 天，拍板结果是永久保留。
**本文提交时已同步**这三处的状态描述，并指向本文；[AI_MILESTONES.md](./AI_MILESTONES.md) 的 M17 节也补了一段评估说明。

仍待处理：
- OpenSpec 中与代码不符的「已通过」表述，在对应修复完成时一并改正。
- 方案 §2.1「存储」一行链接的 `AgentRunTraceCleanupTask.java` 已随 T4 删除，链接失效。方案正文保持原貌，下次修订方案时改为文字说明。

#### L2：代码整洁问题

- [session.py:353](../../ai-service/retrieval/session.py#L353) 用了未导入的 `ChatMessage`。局部变量注解运行时不求值，所以不报错，但 lint 会报。
- [loop.py:34](../../ai-service/harness/loop.py#L34) 导入了未使用的私有函数 `_target_label`。
- `RETRY_EVENT_ATTEMPT_LABEL = {1: 1, 2: 2}`（[view/middleware.py:18](../../ai-service/harness/view/middleware.py#L18)）是空映射；`RunViewMiddlewareShared` 只是转发，可以去掉。
- `_split_open_tail` 的注释说尾部待定时返回 `None`，实际从不返回 `None`（[openai_compatible.py:111](../../ai-service/models/openai_compatible.py#L111)）。
- `_ThinkTagState.finish` 在判定阶段结束时会丢掉扣住的前缀（[openai_compatible.py:101](../../ai-service/models/openai_compatible.py#L101)）。整段回答只是 `<think>` 的严格前缀（例如单个 `<`）时，这段文字会丢失。

**验收标准**：修复后 `ruff check` 不报上述问题；补一条「整段回答只有 `<`」的用例。

#### L3：「…（截断）」不在已确认文案里

思考全文超过上限时，Java 追加「…（截断）」（[AgentRunProcessView.java:122](../../services/ai/src/main/java/com/anynote/ai/run/AgentRunProcessView.java#L122)），这句不在 2026-11-18 的确认清单里。按 [D5](#6-待拍板) 确认或替换。

#### L4：工具执行中途失败时，工具行停在「进行中」

工具执行中抛 `FatalActionError`（例如 note 不可用）时，`asyncio.gather` 直接抛出（[loop.py:487](../../ai-service/harness/loop.py#L487)），`AFTER_ACT` 不执行。
已经发出的 `tool.started` 没有对应的 `tool.finished`：界面上的工具行一直闪动，落库状态也停在 `running`。

**修复方案**：运行失败或取消时，投影为未结束的工具调用补发失败的 `tool.finished`。Java 收尾时也把仍为 `running` 的工具行标为失败，作为兜底。

**验收标准**：用例中工具抛 `FatalActionError` 后，每个 `tool.started` 都有对应的 `tool.finished(status=FAILED)`，落库视图里没有 `running`。

#### L5：管理端列表

- `listRuns` 的 `pageSize` 没有上限（[AgentRunAdminServiceImpl.java:82](../../services/ai/src/main/java/com/anynote/ai/service/impl/AgentRunAdminServiceImpl.java#L82)）。
- 列表字段缺工具调用次数、供应商、首字时间，不够方案 §5.8 的列表使用。

随 M17.5 一起处理：每页上限 100，并补齐字段。

## 6. 待拍板

| # | 问题 | 推荐 | 备选 | 影响 |
|---|---|---|---|---|
| D1 | 修复前写入开发库的过程视图（工具行只有 `blockId`）怎么处理 | 清空开发库的 `a_chat_message.process`：这些数据受 B1、B4 影响，本身就不可信；前端不加兼容代码 | 前端回放对工具行兼容读取 `blockId`，M17.6 前删掉 | B7 |
| D2 | 开发库里已写入原文的 `trace.context` 怎么处理 | 删除 `cb3f09d` 之后（2026-11-19 01:16 起）写入的 `trace.context` 行；无生产环境 | 保留，仅开发数据，但与「默认不存全文」不符 | B2 |
| D3 | 「开关全关时浏览器事件逐字段一致」怎么达成 | 恢复 `summary`、`hitCount`、`retryable`；新增开关 `tool-detail-enabled`（默认关）控制 `target`、`result` | 修订验收口径：开关全关时只新增 `target`、`result` 两个字段 | M3 |
| D4 | 回传方式 `original` | 实现（见 M5），管理端已提供这个选项 | 实现前在配置校验里拒绝 `original`，管理端下拉暂时去掉这一项 | M5 |
| D5 | 新增用户可见文案 | 逐条确认：工具行耗时「{n} 秒」；工具行失败「失败」；`kb_query` 实体类型「知识库 / 笔记 / 资料 / 慕课 / 慕课条目 / 字幕 / 视频总结 / 任务」；截断标注「…（截断）」 | — | M4、M7、L3 |
| D6 | T2 是否改用过程视图的依赖清单复核历史 | 改：依赖清单与引用合并复核，没有过程视图的旧消息仍按引用 | 维持只按引用 | M10 |

## 7. 修复批次与顺序

按仓库约定，每批里每一项都先写失败用例再改代码；不同语言、不同服务分开提交。

| 批次 | 内容 | 涉及 | 前置 |
|---|---|---|---|
| R1 安全与数据 | B1、B2；按 D2 清理开发数据 | `ai-service` | — |
| R2 用户视图正确性 | B3、B4、B5、M3、M6 | `ai-service`、`services/ai`（白名单） | R1；D3 |
| R3 回放链路 | B6、B7、M1、M2、M10、L4；按 D1 清理开发数据 | `services/note`、`services/api`、`services/ai`、`apps/web` | R1（依赖清单正确后复核才有意义）；D1、D6 |
| R4 管理端 | B8、管理端 Service 单测、L5 | `services/ai` | 无；是 M17.5 的前置 |
| R5 补齐 | M4、M5、M7、M8、M9、L2、L3 | 全栈 | R2、R3；D4、D5 |

R4 与 R1–R3 互不依赖，可以并行。全部批次完成后，按[第 8 节](#8-总体验收标准)验收，再进入 M17.5、M17.6。

## 8. 总体验收标准

### 8.1 每批的门禁

| 范围 | 命令 | 要求 |
|---|---|---|
| Python | `cd ai-service && PYTHONPATH=. venv/Scripts/python.exe -m pytest -p no:warnings` | 全部通过。已登记的两条时间敏感用例（`test_models.py::test_first_idle_and_total_timeouts[TOTAL]`、`test_indexing_pipeline.py::test_incremental_store_failure_preserves_cursor_success_time_and_doc_status`）如果抖动，须单独复跑通过，并在记录里写明 |
| Java | `cd services && mvn -o test -pl ai,note -am` | 全部通过 |
| 前端 | `cd apps/web && pnpm vitest run src/features/ai src/lib/ai src/components/editor`；`npx tsc --noEmit -p tsconfig.json`；对改动文件跑 `pnpm exec biome check` | 全部通过 |
| 包体 | `pnpm --filter web bundle:budget` | 桌面 ≤ 310 KB、`/m/*` ≤ 250 KB |
| 契约 | `pnpm openapi:check` | 通过；`ai.json`、`note.json` baseline 同步提交 |

### 8.2 必须新增的回归用例

下列用例在当前代码上必须失败，修复后通过：

| # | 用例 | 栈 | 对应 |
|---|---|---|---|
| 1 | 两个运行共用一个 `Harness`，事件与依赖清单互不串流 | Python | B1 |
| 2 | 全文开关关闭时，`trace.context` 结构与 M17 之前一致 | Python | B2 |
| 3 | 思考增量拼接无损，事件条数有上限 | Python | B3 |
| 4 | 工具结果按调用归属，零命中为 0 | Python | B4 |
| 5 | 推理格式 × 断流位置的重试矩阵 | Python | B5 |
| 6 | note 批量可读性端点经真实校验器 | Java | B6 |
| 7 | 过程视图共享样例：Java 产出、前端回放（含隐藏视图） | Java + 前端 | B7、M1 |
| 8 | 管理端事件经真实 Jackson 转换器输出 | Java | B8 |
| 9 | 开关全关时浏览器事件的字段集合 | Python + Java | M3 |

### 8.3 真实栈核对（不需要主密钥）

R3、R4 完成后，在 dev 全栈上核对，结果写进 [AI_MILESTONES.md](./AI_MILESTONES.md) 的 M17 节：

1. **批量可读性端点**：经 `services/ai` 发起复核，提交一条可读、一条不可读的键，返回 `00000`，`readable` 只含可读那条。
2. **管理端事件**：用系统管理员身份读取开发库里已有运行的事件，返回 `00000`，`content` 是 JSON 对象。
   用普通用户请求三个管理端点，返回 `A0301`。
3. **回放**：
   - 把 B7 的共享样例写进一个测试会话的助手消息 `process`，桌面与 `/m` 刷新后都能看到工具行和思考行。
   - 把测试账号移出依赖所在的知识库后再刷新：显示「部分内容你已无权访问，思考过程已隐藏」，思考与过程说明不再出现；不可读的结果条目不出现。

### 8.4 真实栈核对（需要主密钥，即 M17.6）

1. 方案 §7 的全部权限场景，单测与真实栈各跑一遍。
2. **并发**：思考流打开，两个账号同时提问，各自只看到自己的思考；两条落库过程视图和依赖清单各自正确。
3. **断流**：用会中途断开的供应商替身，或者手动断网，确认没有重复正文；思考阶段断开时出现一行「模型连接中断，已重试」。
4. **体量**：打开 `trace-fulltext-enabled`，跑一组固定问题，记录单次运行的事件条数与字节数，据此定单条上限、截断与压缩。
5. **M17.0 逐模型核对**：每个启用的逻辑模型记录推理格式与回传要求。

### 8.5 开关打开前置条件

| 开关或配置 | 打开前必须完成 |
|---|---|
| 任一逻辑模型的推理格式不为 `none` | B5；M5 与 D4；该模型的 M17.0 核对 |
| `reasoning-view-enabled` | R1、R2、R3；M8 的断流状态；8.4 第 2、3 项 |
| `step-note-enabled` | R1、R3 |
| `trace-fulltext-enabled` | B2、M6；8.4 第 4 项；R4 与 M17.5（能在控制台查看） |
| `tool-detail-enabled`（D3 采纳推荐方案时新增） | B4、M4、M7 |

## 9. 附：评估中核对过、没有发现问题的点

- **`think_tag` 用例完整**：跨片段的开启与闭合标签、未闭合、正文中间的标签、未配置格式时不剥离，都有用例且通过。
- **note 能解析所有依赖键**：Python 的引用格式（[args.py:11](../../ai-service/tools/knowledge/args.py#L11) 的 `REF_PATTERN`）只有 `kb`、`note`、`doc`、`mooc`、`mooc_item`、`task`、`notice` 七类，
  另有 `mooc_item` 的 `#transcript` / `#summary` 附属类型，note 的 `KnowledgeEntityType` 都能解析。其中 `notice` 在 note 侧一律不可读，
  按引用读取时 `gate` 也直接按不存在处理；它若出现在依赖清单里，只会导致多隐藏，不会泄露。
- **复核以当前用户身份执行**：复核在会话详情的请求线程里调用 note，`FeignRequestInterceptor` 会转发当前用户的身份头。
- **T2 的时机与兜底**：复核在 `BEFORE_RUN` 执行，早于历史压缩；note 不可用时丢弃全部助手历史、保留用户消息，与拍板一致，有用例。
- **去掉 `summary` 与 `hitCount` 没有造成功能回退**：前端旧的进度文案只读 `name`；全仓前端与 CLI 都没有读 `hitCount`。
- **管理端 SQL**：列表筛选全部用 `#{}` 参数化，运行标识按前缀匹配。
