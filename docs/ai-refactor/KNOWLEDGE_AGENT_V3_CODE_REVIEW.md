# 知识库 Agent 版本 3 代码实现评估

> 评估日期：2026-11-17
> 评估对象：`7bb0dac..5d47300`（6 个提交，43 个文件，+1246 / −183）
> 对照方案：[KNOWLEDGE_AGENT_V3_PLAN.md](./KNOWLEDGE_AGENT_V3_PLAN.md)
> 评估方式：逐个提交静态阅读、复跑改动涉及的单测、用脚本调用 `validate_answer` 复现问题
> 本文只记录评估结论，**没有修改任何代码**。第 5 节的问题都还没有修复

## 1. 结论

整体质量**良好**。

- **贴合方案**：方案 §4.4–§4.8 的每一条规则都有对应的实现和测试。
- **守住底线**：伪造引用一定会被拦住。编号不存在，或者附的原文对不上证据，交付前都会删掉。
- **范围克制**：§6.5、§6.7 和自动补注都按拍板结果没有做。

主要问题有一个：版本 3 放开了"通用知识直接回答"，引用编号的识别规则会误伤代码里的下标（[问题 1](#问题-1代码下标被当成引用编号删掉)）。另外有 3 个中等问题和 8 个低优先级问题，属于健壮性和可维护性上的欠账，详见[第 5 节](#5-问题清单)。

## 2. 评估范围

| 提交 | 内容 |
|---|---|
| `4cd5b07` | Python Harness 与知识检索 Agent（18 个文件） |
| `2b60e8e` | Java 保存回答标注、失败类别映射文案；SQL 迁移；OpenAPI |
| `82ee019` | 前端展示回答标注 |
| `34d872d` | 修正：工具定义计入一次上下文预算 |
| `f1a6692` | 修正：前端保留按类别给出的错误文案 |
| `5d47300` | 文档：实施记录与 57 次真实模型重放 |

## 3. 验证情况

**已复跑**（本机，均为改动涉及的测试）：

| 范围 | 命令 | 结果 |
|---|---|---|
| Python | `ai-service` 下 `pytest` 跑 5 个改动过的测试文件 | 48 个通过 |
| Java | `mvn -o -q test -pl ai -am -Dtest='AgentRunServiceImplTest,ChatMessageVOTest' -Dsurefire.failIfNoSpecifiedTests=false` | 16 + 1 个通过 |
| 前端 | `apps/web` 下 `npx vitest run src/features/ai src/lib/ai` | 21 个文件、121 个通过 |

**脚本复现**：问题 1 用直接调用 `validate_answer` 的脚本复现，见该问题的「复现」一节。

**没有做**：全量单测、真实模型重放、真实栈端到端联调。

## 4. 做得好的地方

1. **提示的生命周期改得干净。** 三类提示的处理方式如下，每一点都有测试锁住：
   - 预算提醒每轮重新计算，不再累加；
   - 收束约束只在 `force_finish` 期间出现；
   - 一次性提示用过一轮就清掉。

   运行失败时，`unfinished` 取的是最后一轮实际发给模型的提示。
2. **工具定义只发一份。** 上下文清单里留了引用层，记下哈希和 token 数，预算只计一次。真实重放实测每轮少了 3846 token。
3. **校验缺口结构化。** `ValidationGap` 带 `code`、`indices`，修复提示能具体指出哪个编号有问题；Trace 里也能看到。
4. **Java 侧用白名单映射错误文案。** 未知类别统一兜底为"服务暂时不可用"。参数化测试覆盖了 8 个类别，包括未知类别。
5. **持久化改得完整。** `ChatMessageVO` 解析标注时能容忍历史脏数据。`resultMap`、列清单、全量建表语句和迁移脚本都同步改了。
6. **前端细节到位。** 流式输出期间不显示标注，刷新后能从历史消息恢复。
7. **流程规范。**
   - 三种语言分开提交；
   - 方案、OpenSpec 提案、changelist 同步更新；
   - 真实模型重放了 57 次，既有的测试抖动如实写进了记录。

## 5. 问题清单

### 5.1 汇总

| 编号 | 严重程度 | 问题 | 位置 |
|---|---|---|---|
| 1 | **高** | 代码下标被当成引用编号删掉，或者伪装成引用 | [response.py:14](../../ai-service/agents/knowledge_retrieval/response.py#L14) |
| 2 | 中 | 历史消息里出现一个未知标注，整段会话就打不开 | [schemas.ts:80](../../apps/web/src/features/ai/schemas.ts#L80) |
| 3 | 中 | 知识库 Agent 的校验语义写死在通用 Harness 循环里 | [loop.py:219](../../ai-service/harness/loop.py#L219)、[loop.py:380](../../ai-service/harness/loop.py#L380) |
| 4 | 中 | 用户可见的错误文案要在多处逐字保持一致 | [AgentRunServiceImpl.java:66](../../services/ai/src/main/java/com/anynote/ai/service/impl/AgentRunServiceImpl.java#L66)、[sse.ts:17](../../apps/web/src/lib/ai/sse.ts#L17) |
| 5 | 低 | 格式重交机会按整次运行计数，而不是按连续次数 | [loop.py:172](../../ai-service/harness/loop.py#L172) |
| 6 | 低 | 纯文本超长时提示词说的是 `agent_finish` 参数不合法 | [loop.py:352](../../ai-service/harness/loop.py#L352) |
| 7 | 低 | 预取标签模型看不到 | [session.py:343](../../ai-service/retrieval/session.py#L343) |
| 8 | 低 | `ContextBuilder.build()` 在修改运行状态 | [builder.py:101](../../ai-service/harness/context/builder.py#L101) |
| 9 | 低 | 结果为空的权威回答会被改写成"未找到" | [response.py:173](../../ai-service/agents/knowledge_retrieval/response.py#L173) |
| 10 | 低 | 部署顺序依赖：迁移脚本没执行时，消息查询全部报错 | [ChatMessageMapper.xml:28](../../services/ai/src/main/resources/mapper/ChatMessageMapper.xml#L28) |
| 11 | 低 | 测试默认值和生产不一致 | [test_harness_knowledge_agent.py:113](../../ai-service/tests/test_harness_knowledge_agent.py#L113) |
| 12 | 低 | 修复提示和来源片段的细节问题 | [loop.py:396](../../ai-service/harness/loop.py#L396)、[response.py:151](../../ai-service/agents/knowledge_retrieval/response.py#L151) |

建议的处理顺序：先修问题 1，问题 2 顺手修掉，两个问题都直接影响用户。问题 3、4 可以在下次动 Harness 或错误处理时一起做。低优先级问题按需处理，问题 10 要在部署时注意。

### 问题 1：代码下标被当成引用编号删掉

**严重程度**：高（已复现）

**位置**：[response.py:14](../../ai-service/agents/knowledge_retrieval/response.py#L14) 的 `CITATION_PATTERN`，以及 [response.py:140-171](../../ai-service/agents/knowledge_retrieval/response.py#L140) 的引用核对循环。

**原因**：引用编号的正则是 `(?<!\\)\[(\d+)\]`，只排除了前面带反斜杠的情况。代码块和行内代码里的 `lst[0]`、`m[1][2]` 都会被匹配成引用编号。

**复现**：用一个不调工具、不带证据的通用知识回答直接调用 `validate_answer`：

```python
answer = "取第一个元素用 `lst[0]`，二维用 `m[1][2]`。"
sig = AgentFinishArgs(outcome="ANSWERED", answer=answer)
validate_answer(sig, [], None, tool_calls=0, repair_exhausted=False)
# issues: [('INVALID_CITATION', [0, 1, 2])]
validate_answer(sig, [], None, tool_calls=0, repair_exhausted=True)
# answer:  '取第一个元素用 `lst`，二维用 `m`。'
# notices: ['NOT_FROM_KNOWLEDGE', 'CITATIONS_REMOVED']
```

**影响**：

1. **多跑一轮修复，提示还会误导模型。** 修复提示会写「[0] 不存在：本次运行没有证据 E0，请删除或改成正确的编号」，模型照做就会把正确的代码删坏。
2. **交付的代码被改坏。** 修复次数用完后，下标会被直接删掉：`lst[0]` 变成 `lst`。同时还会加上「部分无法核对的引用已移除」的标注，可这个回答本来就没有引用。
3. **有证据时会生成假引用。** 如果本次运行登记过 E1，`arr[1]` 会被当成对 E1 的有效引用：结构化证据不核对原文，非结构化证据在不附原文时也直接放行。结果有两个：
   - 用户看到一条和这句话无关的来源；
   - 一个其实没标来源的回答，会因为"已有引用"而躲过 `MISSING_CITATION` 检查。

版本 2 也用这个正则，但当时通用知识问题会被改写成"未找到"，或者直接失败，走不到这里。版本 3 正式开放了通用知识直接回答，编程类问题首当其冲，暴露面明显变大。

**建议**：

- 识别引用编号前，先跳过围栏代码块和行内代码；
- 收紧正则：编号前面紧跟标识符字符或 `]` 时不算引用，例如 `(?<![\w\]\\])\[(\d+)\]`；
- 没有证据、也没调过工具时，整个跳过引用识别。这时不可能存在合法引用。
- 按仓库约定，先补一条失败的复现用例，覆盖行内代码、代码块、`m[1][2]` 和"有证据时的 `arr[1]`"这几种情况，再改代码。

### 问题 2：历史消息里出现一个未知标注，整段会话就打不开

**严重程度**：中

**位置**：

- [schemas.ts:80](../../apps/web/src/features/ai/schemas.ts#L80)：`answerNotices: z.array(answerNoticeSchema)`，其中 `answerNoticeSchema` 是三个值的严格枚举；
- [use-conversations.ts:57](../../apps/web/src/features/ai/use-conversations.ts#L57)：会话详情用 `conversationDetailSchema.parse` 解析，失败会直接抛错；
- [use-chat-stream.ts:210](../../apps/web/src/features/ai/use-chat-stream.ts#L210)：流式路径用 `safeParse`，只要有一个值不认识，整个列表就丢掉；
- [AgentRunServiceImpl.java:479](../../services/ai/src/main/java/com/anynote/ai/service/impl/AgentRunServiceImpl.java#L479)：Java 用 `readStringList` 原样转存，任何字符串都放行；OpenAPI 里这个字段也只是 `string[]`，没有枚举。

**影响**：只要库里有一条消息带了前端不认识的标注，整段会话的详情就会解析失败，用户打不开这个会话。这种情况不需要人为写入脏数据：Python 先上线了新的标注种类，或者前端回滚到旧版本，都会触发。

同一份数据，三条路径的容错程度不一样：

| 路径 | 遇到未知值时 |
|---|---|
| 历史接口 | 整段会话解析失败 |
| 流式 | 整个标注列表丢掉 |
| 同一消息上的 `citations` 字段 | 容错解析 |

**建议**：

- 两条路径都按 `string[]` 解析，再过滤出已知的值。未知值静默忽略，必要时记一条日志；
- 可选：Java 侧也按白名单过滤；或者给 OpenAPI 的字段加上枚举，让契约检查能发现新增的值。

### 问题 3：知识库 Agent 的校验语义写死在通用 Harness 循环里

**严重程度**：中（可维护性和正确性风险）

**位置**：

1. [loop.py:380-412](../../ai-service/harness/loop.py#L380) 的 `_repair_hint` 是通用循环里的静态方法，却直接识别 `INVALID_CITATION`、`MISSING_CITATION`、`MISSING_CLARIFICATION_QUESTION` 这些知识库专用的缺口代码，并负责生成面向模型的中文提示。
2. [loop.py:219](../../ai-service/harness/loop.py#L219)：只要还没修复过，就进入修复轮；修复过一次之后，不管还有什么缺口都直接交付。合并进来的缺口里也包括通用 `VerifierFramework` 报出的问题（`base_report.issues`），它们会被一起放过。
3. [framework.py:19](../../ai-service/harness/verify/framework.py#L19) 新增的 `repairable` 字段永远是 `True`。循环只在 [loop.py:212](../../ai-service/harness/loop.py#L212) 原样传递它，从来不拿它做判断。
4. "编号不存在"和"附的原文对不上"这个区分算了两遍，措辞还不一样：
   - [response.py:160-164](../../ai-service/agents/knowledge_retrieval/response.py#L160) 写进 `detail`，给 Trace 看；
   - [loop.py:386-394](../../ai-service/harness/loop.py#L386) 根据 `evidence_by_id` 重新判断一次，写进修复提示。

**影响**：

- 现在知识检索 Agent 是唯一的终态 Agent，所以行为正确。
- 如果以后加一条"必须拦下、不能降级交付"的校验规则，修复一次后它会被静默绕过。
- `repairable` 字段看起来能控制这个行为，实际上不起作用，容易误导后来的人。
- 再加一个 Agent 的话，它的缺口代码和提示文案也只能继续往通用循环里塞。

**建议**：

- 让缺口自己带上面向模型的修复说明，例如给 `ValidationGap` 加一个字段，`_repair_hint` 只负责拼接。或者把提示生成移到 Agent 侧，作为一个回调。
- 循环在修复耗尽后检查 `repairable`：
  - 对 `repairable=False` 的缺口，或者通用校验器报出的缺口，仍按失败处理；
  - 只有 Agent 明确声明"可降级"的缺口才交付并加标注。
- "编号不存在"与"原文对不上"只判定一次，比如拆成两个缺口代码，两处共用。

### 问题 4：用户可见的错误文案要在多处逐字保持一致

**严重程度**：中（可维护性）

**位置**：

- Java：[AgentRunServiceImpl.java:66-80](../../services/ai/src/main/java/com/anynote/ai/service/impl/AgentRunServiceImpl.java#L66) 的文案常量，以及 [AgentRunServiceImpl.java:673](../../services/ai/src/main/java/com/anynote/ai/service/impl/AgentRunServiceImpl.java#L673) 按类别映射的 `userErrorMessage`；
- 前端：[sse.ts:17](../../apps/web/src/lib/ai/sse.ts#L17) 的 `AI_RUN_ERROR_MESSAGES` 白名单，不在白名单里的文案一律显示成"服务暂时不可用"；
- Python：`ai-service/core/errors.py` 和 `harness/loop.py` 里还有一套自己的文案，例如 `BUDGET_EXHAUSTED_MESSAGE = "本次运行已达到处理上限"`。它和 Java 给用户的文案不一样，而且 Java 已经按类别重写了文案，Python 这一份不会再显示给用户。

**影响**：

- Java 和前端两份文案必须逐字一致。改一边忘了另一边，用户看到的就会退化成"服务暂时不可用"。这已经发生过一次：`2b60e8e` 漏了前端白名单，靠 `f1a6692` 补上。
- Python 那份不再生效的文案，会让后来的人误以为改它就能改用户看到的内容。

**建议**：

- 前端改成按错误类别映射文案。这需要错误事件带上 `category`。
- 或者直接信任 Java 已经过滤过的文案，前端只做长度和字符上的兜底。
- 至少加一个契约测试：把 Java 的文案常量和前端白名单对齐，并在 Python 侧注明哪些文案只用于日志。

### 问题 5：格式重交机会按整次运行计数

**严重程度**：低

**位置**：[loop.py:93](../../ai-service/harness/loop.py#L93)、[loop.py:172](../../ai-service/harness/loop.py#L172)。`signal_attempts` 和 `previous_finish_problem` 在运行开始时初始化，之后从不重置。

**影响**：整次运行只有一次"没有正文、没有工具调用"或"`agent_finish` 参数不合法"的重交机会。即使两次空输出之间隔着若干正常的工具调用轮，第二次也会直接失败。方案写的是"重交后仍为空才失败"，指的是连续两次。

**建议**：在一轮正常产出工具调用或正文之后，把计数清零。

### 问题 6：纯文本超长时提示词说的是 `agent_finish` 参数不合法

**严重程度**：低

**位置**：[loop.py:352-358](../../ai-service/harness/loop.py#L352)。纯文本回答会被包装成 `AgentFinishArgs(outcome="ANSWERED", answer=text)`；超过 `ANSWER_MAX_CHARS = 8000`（[agent.py:15](../../ai-service/agents/knowledge_retrieval/agent.py#L15)）时，返回的是 `INVALID_FINISH_HINT`。

**影响**：

- 模型根本没调 `agent_finish`，却收到「agent_finish 参数不合法」，不知道该怎么改。
- 第二次再超长就按 `INTERNAL` 失败，用户看到的是"服务暂时不可用"。
- 版本 3 里纯文本是主要的作答方式，这条路径比以前容易碰到。

**建议**：纯文本超长单独给一条提示，例如"回答过长，请精简到 8000 字以内"；失败类别也单独设一个，或者至少不要归为 `INTERNAL`。

### 问题 7：预取标签模型看不到

**严重程度**：低

**位置**：[session.py:343](../../ai-service/retrieval/session.py#L343) 给预取证据写入了 `selected_reason="按原句预先检索的候选"`，但上下文构建器的证据层只渲染证据编号和正文，不包含 `selected_reason`。

**影响**：方案希望模型知道这些候选是按原句预先检索的，不一定相关。实际上这个标签只出现在上下文清单和 Trace 里。预取默认关闭，目前影响不大；打开预取后，这条设计意图就不成立。

**建议**：在证据层渲染时带上来源说明；或者在方案里注明这个标签只供审计。

### 问题 8：`ContextBuilder.build()` 在修改运行状态

**严重程度**：低

**位置**：[builder.py:101-106](../../ai-service/harness/context/builder.py#L101)。`build()` 里会写 `run.last_hints`，并执行 `run.hints.clear()`。

**影响**：现在每轮只调用一次 `build()`，所以行为正确。但"构建上下文"这个名字看不出有副作用。以后如果在同一轮里重新构建一次（比如超预算后压缩重建），一次性提示会在第二次构建时丢失。

**建议**：把"消费一次性提示"挪到循环里每轮的固定位置；或者把方法改名、加注释，明确它会消费提示。

### 问题 9：结果为空的权威回答会被改写成"未找到"

**严重程度**：低（与方案一致，记录在案）

**位置**：[response.py:173](../../ai-service/agents/knowledge_retrieval/response.py#L173)。`kb_list`、`kb_query` 只在有结果行时登记证据，结果为空时不登记。

**影响**："你还没有知识库""这个知识库里没有笔记"这类基于工具结果的确定回答，会因为"调过工具但没有证据"被改写成「未找到相关内容」。这符合方案表格的规定，但这类问题恰好是促成版本 3 的清单类问题，用户体验上有落差。

**建议**：可以考虑让清单类工具在结果为空时登记一条"空结果"结构化证据，让模型能引用它。这需要先在方案里拍板。

### 问题 10：部署顺序依赖

**严重程度**：低（部署注意事项）

**位置**：[ChatMessageMapper.xml:28](../../services/ai/src/main/resources/mapper/ChatMessageMapper.xml#L28) 的列清单已经包含 `answer_notices`。

**影响**：仓库没有自动迁移。如果先部署 Java、后执行 `infra/sql/migrations/2026-11-17-ai-answer-notices.sql`，在这段时间里所有查询消息的接口都会因为列不存在而报错。

**建议**：发布说明里写明"先执行迁移，再部署 `services/ai`"；如果已经有统一的发布检查清单，加到清单里。

### 问题 11：测试默认值和生产不一致

**严重程度**：低

**位置**：[test_harness_knowledge_agent.py:113](../../ai-service/tests/test_harness_knowledge_agent.py#L113)。测试辅助函数 `_execute` 默认传 `HarnessRuntimeSettings(prefetch_enabled=True)`，而生产默认关闭预取。

**影响**：大部分测试跑的都是"预取打开"的路径，生产默认路径主要靠少数几条专门的用例覆盖。另外，第一个提交里有一条测试把"工具 token 完全没计入预算"当成正确结果来断言，后来在 `34d872d` 修正。这说明测试曾经锁住过错误行为。

**建议**：辅助函数默认值改成和生产一致，需要预取的用例显式打开。

### 问题 12：修复提示和来源片段的细节问题

**严重程度**：低

1. [loop.py:396-405](../../ai-service/harness/loop.py#L396)：`MISSING_CITATION` 的修复提示里，来源类型直接显示内部代码，比如 `kb`、`note`；证据也只按登记顺序列前 10 条，不一定是和回答最相关的那几条。
2. [response.py:151](../../ai-service/agents/knowledge_retrieval/response.py#L151)：
   - 非结构化证据的来源片段总是取检索高亮。即使模型附了已核对通过的原文，展示给用户的也不是这段原文。
   - `item.content or None if item.structured else ...` 依赖运算符优先级，读起来容易误解，建议加括号。

## 6. 附：评估中核对过、没有发现问题的点

- Python 抛出的失败类别 `MODEL_UNAVAILABLE`（`models/catalog.py`）、`MODEL_TIMEOUT`（`models/openai_compatible.py`）、`KNOWLEDGE_ACCESS_UNAVAILABLE`（`retrieval/session.py`），和 Java 的映射一一对得上。
- 检索高亮标签：ES 使用默认的 `<em>`，`HIGHLIGHT_TAG_PATTERN` 去除的就是这个标签，两边一致。
- 取消路径和 Java 合成的失败 `run.finished` 事件，都带了空的 `answerNotices`，前端不会因为缺字段出错。
- `AgentFinishArgs` 保持 `extra="forbid"`，版本 3 只改了字段说明，没有放宽校验。
