# 问题排查报告：线上对话 ID 369 中 Agent 声称获取笔记内容返回空

- **排查日期**：2026-11-26
- **目标环境**：`app-01`（Anynote 生产实例，部署提交 `dev-efbd1b6`，容器全部 `Up (healthy)`）
- **排查对象**：会话 `a_chat_conversation.id = 369`（用户 `user_id = 314`），目标笔记 `note:2576`（《PaaS角色定制》）
- **使用模型**：逻辑模型 `agent_main` → `stepfun / step-5-preview`（`reasoning_format = reasoning_content`、`reasoning_passthrough = original`、`supports_vision = 1`）
- **运维审计日志**：`y-server` 仓库 `servers/app-01/logs/2026-11/2026-11-26_030343_agy_anynote-id-369-trace.md`

---

## 1. 核心结论

> **直接回答「是不是校验写太死了？」**：**不是。** 后端参数校验、权限门禁、大结果截断、`validate_answer` 与 `VerifierFramework` 均未拦截或改写任何内容。三轮调用 `kb_read(ref="note:2576")` **全部成功读取到了完整的 1749 字笔记正文**，三轮结果校验均一次通过（`passed: true, issues: []`）。

真正导致 Agent 在第 5、6 轮反复声称「`kb_read` 返回正文为空」的根因，是**上下文拼装架构与工具返回形态的结构性错位**，叠加**提示词引用约束的放大效应**：

1. **工具返回与正文分家**：`kb_read` 返回给 `role: "tool"` 消息的 JSON **只含元数据（`evidenceId`、`ref`、`title`、`locator`、`truncated`、`nextOffset`、`notices`），不包含正文文本**；正文 1749 字被单独写入 `evidence` 层。
2. **证据层角色错位 + 时间线倒置**：`ContextBuilder._compile_messages` 将 `evidence` 层渲染为一条 **`role: "user"` 消息**，且**倒插在本轮用户提问（`question`）和模型 `kb_read` 工具调用（`exchange_messages`）之前**。
3. **提示词规则放大误判**：指令与工具描述均未向模型说明「`kb_read` 的正文不在 `tool` 返回里，而在上方的 `证据 E<n>` 区块中」，同时系统指令与历史消息反复强调「本轮只能引用本轮工具结果里的 `evidenceId`」。模型看到 `tool` 消息只有空壳元数据，而前方 `role: "user"` 消息里躺着 `证据 E1` 的完整 Markdown，于是严格按因果与角色推导出：
   - **「我调 `kb_read` 返回了空正文」**；
   - **「上面那段带 `<untrusted-evidence>` 的正文是用户自己贴进来的，不是我的工具结果，不能引用」**。

此外，用户第 5 轮真正想问的「这个笔记截图里面有什么」，涉及两个独立事实：
- **误判部分（缺陷）**：Agent 误以为 `kb_read` 没有读到笔记正文；
- **客观能力边界（正常）**：`note:2576` 正文中确实只嵌了两张图片链接（`/api/proxy/file/objects/305/redirect` 与 `/306/redirect`），当前 `kb_read` 只读文字层、`kb_view_doc` 仅支持 PDF 资料（`entity_type == "doc"` 且 `format == "pdf"`），因此 Agent **确实无法读取笔记内嵌截图的画面内容**。

---

## 2. 线上现场还原（对话 ID 369 全链路证据）

### 2.1 数据库基础事实

- **会话记录**：`a_chat_conversation.id = 369`，`create_by = 314`，`scope = {"refs": [], "knowledgeBaseIds": []}`。
- **目标笔记原文**（`n_note.id = 2576` 关联 `n_note_text.id = 2575`）：
  - 标题：`PaaS角色定制`，所属知识库 `kb:56`（`Test`），更新时间 `2026-09-27 23:02:58`。
  - **实际正文长度**：`CHAR_LENGTH(content) = 1749` 字（Markdown 正文，含两处图片引用 `![image.png](/api/proxy/file/objects/305/redirect)` 与 `![image.png](/api/proxy/file/objects/306/redirect)`，以及角色、接口、代码仓库与 A1–p11 确认项）。
- **运行时配置**（`/opt/anynote-nacos-prod/anynote-ai-harness.yml` 与 `a_retrieval_setting` 默认值）：
  - `large-result-chars = 2000`、`large-result-preview-chars = 500`、`read_max_chars = 2000`（`1749 <= 2000`，**完全不会触发截断**）；
  - `prefetch-enabled = false`、`visual-read-enabled = false`。

### 2.2 全部 6 轮 Run 概览

| Run | `run_id` | 时间 | 用户提问 | 工具调用 | `kb_read` 返回字数 | `trace.verify` | 模型最终表态 |
| :-: | :--- | :--- | :--- | :--- | :-: | :-: | :--- |
| 1 | `a11e1bee-...` | 02:23:34 | `hi` | 无 | - | `passed: true` | 正常问候（`NOT_FROM_KNOWLEDGE`） |
| 2 | `502aecb0-...` | 02:24:28 | `我有哪些知识库` | `kb_list` | - | `passed: true` | 正常列出 `Test (kb:56)` |
| 3 | `6f3ff522-...` | 02:26:07 | `知识库中有什么内容` | `kb_outline(kb:56)` | - | `passed: true` | 正常列出 4 笔记 / 1 慕课 / 1 资料 |
| **4** | `df4b1584-...` | 02:26:37 | `- PaaS角色定制笔记有啥内容` | `kb_outline(note:2576)` → `kb_read(note:2576)` | **1749** (`E2`) | `passed: true, issues: []` | **正常总结全文**（但引用写了 `[1]`，见 §5.3） |
| **5** | `e3726a48-...` | 02:27:05 | `这个笔记截图里面有什么` | `kb_read(note:2576)` | **1749** (`E1`) | `passed: true, issues: []` | **误报「返回的正文是空的」** |
| **6** | `97ae774c-...` | 02:28:18 | `为什么上一轮笔记内容能看到这一轮看不到了？你调用的工具不同吗` | `kb_read(note:2576)` | **1749** (`E1`) | `passed: true, issues: []` | **再次误报「返回空正文」并臆测上一轮走了检索命中** |

### 2.3 Run 4 / Run 5 / Run 6 关键 Trace 摘录

三轮的 `trace.action` 显示，`kb_read(ref="note:2576")` 的执行结果**结构完全一致**（仅 `evidenceId` 分别为 `E2`、`E1`、`E1`）：

```json
{
  "tool": "kb_read",
  "status": "SUCCESS",
  "arguments": { "ref": "note:2576" },
  "diagnostics": { "chars": 1749 },
  "evidenceIds": ["E1"],
  "result": "{\"evidenceId\":\"E1\",\"ref\":\"note:2576\",\"subtype\":null,\"title\":\"PaaS角色定制\",\"locator\":{\"offset\":0},\"truncated\":false,\"nextOffset\":null,\"notices\":[]}"
}
```

而在三轮的 `trace.context`（`manifest` + `blobs`）中，完整的 1749 字正文也**全部完好无损地进入了上下文**（`transform: "ORIGINAL"`，`tokenCount: 1032`，blob 总长 `1798` 字符 = `证据 E1\n<untrusted-evidence>\n` + 1749 字正文 + `\n</untrusted-evidence>`）：

- Run 4 Turn 3：blob `93d14e63...`（`证据 E2\n<untrusted-evidence>\n# PaaS角色定制...p11:可以\n</untrusted-evidence>`，1798 字符）
- Run 5 Turn 2：blob `09d3fb91...`（`证据 E1\n<untrusted-evidence>\n# PaaS角色定制...p11:可以\n</untrusted-evidence>`，1798 字符）
- Run 6 Turn 2：blob `09d3fb91...`（与 Run 5 完全一致，1798 字符）

**决定性证据——模型自己的内部思考（`trace.model.attributes.reasoning`）直接说破了错位现象**：

- **Run 5 Turn 2 思考原文（`seq=96`）**：
  > *"The kb_read returned empty body — no text content? Only metadata. Interesting — **the note content was shown earlier via evidence E1 in the user's message (untrusted-evidence)**. The note contains two images: image.png at /api/proxy/file/objects/305/redirect and /306/redirect. ... Also note that **the earlier evidence I have is from the user's message (untrusted evidence)** — I should be careful. **The kb_read returned empty text, so the note content available to me is only what the user quoted.**"*
  > *"Actually, the instruction says: 来自工具结果的每条事实后写 [n]. **The kb_read returned an empty evidence with no content. So I have no new facts.**"*

- **Run 6 Turn 2 思考原文（`seq=227`）**：
  > *"结果：`kb_read note:2576` 返回 locator offset 0, truncated false, nextOffset null，**但正文部分是空的？evidence 里没有 content 字段**。这说明 `kb_read` 这个通道对 `note:2576` 返回了空正文（尽管上一轮通过 `kb_search` 拿到了内容）。"*
  > *"等等，**用户提供的"证据 E1"（untrusted-evidence）正是这篇笔记的全文 markdown**，包含 image.png 链接。所以笔记本身是有内容的，但 `kb_read` 返回空。"*
  > *"注意引用：本轮只有 E1（`kb_read note:2576` 返回空正文 + locator）。**用户的 evidence E1 是 untrusted-evidence 里的笔记全文，但它有 evidenceId "E1" 吗？用户消息里写的是"证据 E1 `<untrusted-evidence>`...笔记全文..."。这是用户以 untrusted 身份提供的资料**……**用户提供的这段确实标了"证据 E1"，但它来自用户消息而非我的工具结果。规则："本轮只能引用本轮工具结果里的 evidenceId"。用户的这段不是"工具结果"，所以我不应把它当作可引用证据编号。我引用的只能是 `kb_read` 返回的 E1。**"*

从这两段原始思考可以 100% 实锤：**模型实际上看到了完整 1749 字正文（甚至准确读出了正文里的 `/api/proxy/file/objects/305/redirect` 和 `/306/redirect`），但它把这条倒插的 `role: "user"` 证据消息误认成了「用户自己贴进来的资料」，把缺少 `content` 字段的 `role: "tool"` 响应误判成了「`kb_read` 返回了空正文」。**

---

## 3. 代码级根因分析

### 3.1 根因一：`kb_read` 工具返回值不包含正文，且未声明指向关系

在 [`ai-service/tools/knowledge/kb_read.py`](../../../ai-service/tools/knowledge/kb_read.py#L52-L88) 中：

```python
item = session.evidence.register(
    item_key=auth.item_key,
    entity_type=args.subtype or args.ref.split(":", 1)[0],
    text=text,                 # ← 1749 字正文只写进 EvidenceItem（structured 默认 False）
    ...
)
payload = {                    # ← 写入 ToolOutput.content（即 role="tool" 消息）的 JSON 不含正文
    "evidenceId": item.evidence_id,
    "ref": args.ref,
    "subtype": args.subtype,
    "title": title,
    "locator": locator,
    "truncated": next_offset is not None,
    "nextOffset": next_offset,
    "notices": notices,
}
return ToolOutput(content=dumps(payload), evidence=[item], diagnostics={"chars": len(text)})
```

- `role: "tool"` 消息只收到元数据字典，既没有 `content`/`text` 字段，也没有类似 `bodyInEvidence: true` 的指向提示；
- 工具描述 [`kb_read.py:26-30`](../../../ai-service/tools/knowledge/kb_read.py#L26-L30) 只写了「读取一个实体的一段原文并作为证据返回」，未说明正文会脱离 tool 结果、放到独立证据区块里。

### 3.2 根因二：`ContextBuilder` 将工具产生的证据以 `role: "user"` 倒插在本轮提问与工具调用之前

在 [`ai-service/harness/context/builder.py`](../../../ai-service/harness/context/builder.py#L121-L170) 与 [`_compile_messages`](../../../ai-service/harness/context/builder.py#L486-L500) 中：

```python
# builder.py:121-124
# 结构化行（清单、目录、关系）已带 evidenceId 出现在工具结果里，不再以证据层重复发送
evidence_layers = [
    self._evidence_layer(run, item) for item in run.workspace.evidence if not item.structured
]
...
# builder.py:151-152
messages = self._compile_messages(high, selected_history, selected_evidence)
messages.extend(exchange_messages)

# builder.py:486-500
@staticmethod
def _compile_messages(high, history, evidence):
    question = high[-1]
    instructions = "\n\n".join(item.content for item in high[:-1] if item.content)
    messages = [{"role": "system", "content": instructions}]
    messages.extend({"role": "user", "content": item.content} for item in history)
    if evidence:
        messages.append(
            {"role": "user", "content": "\n\n".join(item.content for item in evidence)}
        )
    messages.append({"role": "user", "content": question.content})
    return messages
```

以 Run 5 Turn 2 为例，实际发给 `step-5-preview` 的 OpenAI `messages` 序列如下：

```text
[0]  role: "system"    → 平台规则 + instructions.md + runtime JSON
[1]  role: "user"      → "user: hi"
[2]  role: "user"      → "assistant: 你好！..."
...
[8]  role: "user"      → "assistant: **PaaS角色定制**（note:2576）是一份需求与方案确认记录... \n这条回答里的编号只对当时有效... 本轮只能引用本轮工具结果的 evidenceId。"
[9]  role: "user"      → "证据 E1\n<untrusted-evidence>\n# PaaS角色定制\n\n![image.png]... (1749字全文)\n</untrusted-evidence>"   <── 倒插在提问之前，且 role="user"！
[10] role: "user"      → "这个笔记截图里面有什么"                                                                                  <── 当前用户提问
[11] role: "assistant" → reasoning_content + tool_calls: [kb_read({"ref": "note:2576"})]
[12] role: "tool"      → "<untrusted-evidence>\n{\"evidenceId\":\"E1\",\"ref\":\"note:2576\",...,\"locator\":{\"offset\":0},\"truncated\":false,\"nextOffset\":null,\"notices\":[]}\n</untrusted-evidence>"
```

这段消息序列同时制造了**三重违背模型先验的问题**：

1. **角色错位**：`[9]` 是 `role: "user"`，无任何「系统工具 `kb_read` 注入的证据正文」标识，且紧挨在一连串历史 `role: "user"` 消息之后，模型自然将其归属为「用户发来的消息」。
2. **因果倒置**：`[9]` 出现在本轮提问 `[10]` 和工具调用 `[11]` **之前**。模型看到的是「用户先发了一段 `证据 E1`，然后提问，然后我调了 `kb_read`，然后 `kb_read` 返回了一段没有正文的 JSON」。相比之下，同一个文件里的 PDF 图像通道 [`builder.py:154-170`](../../../ai-service/harness/context/builder.py#L154-L170) 反而把视觉消息追加在了 `exchange_messages` **之后**，并带了明确说明「以下是 `kb_view_doc` 返回的不可信资料页面」。
3. **规则冲突（提示词放大器）**：[`instructions.md:16-18`](../../../ai-service/agents/knowledge_retrieval/instructions.md#L16-L18) 要求「来自工具结果的每条事实后写 `[n]`……本轮只能引用本轮工具结果里的 `evidenceId`」，历史消息模板 [`builder.py:296-297`](../../../ai-service/harness/context/builder.py#L296-L297) 又逐条重复强调这一限制。当模型把 `[9]` 错判成用户输入后，便主动自我审查、拒绝承认 `[9]` 属于本轮工具结果。

> **历史成因注记**：之所以存在独立的 `evidence_layers` 且插在 `question` 之前，是因为 Agent v1/v2 曾默认开启「首轮预取（`prefetch`）」——预取不经过 `tool_call`，只能在提问前通过独立证据消息注入。M16 后期（Agent v3）关闭了默认预取，但工具产出的非结构化证据仍沿用了同一条倒插路径。

### 3.3 为什么 Run 4 成功了，而 Run 5 / Run 6 失败了？

对比三轮 trace 可以清晰看出触发条件差异：

| 维度 | Run 4（成功总结正文） | Run 5（开始误报为空） | Run 6（强化误报为空） |
| :--- | :--- | :--- | :--- |
| 用户诉求 | 泛问「笔记有啥内容」 | 追问「截图里面有什么」 | 追问「为什么上一轮能看这一轮看不到」 |
| Turn 2/3 思考深度 | `reasoning: ""`（未展开深度元推理，直接消费上下文里的 `证据 E2` 正文） | 深度推理 6.9s（844 completion tokens），逐项审计工具返回值里有没有图片/OCR 字段，立刻发现 `tool` JSON 缺少正文 | 深度推理 20.4s（1978 completion tokens），叠加历史中 Run 5 已声称「正文为空」的上下文锚定效应，再次核对 `tool` JSON 后完全确信「`kb_read` 返回空、前方 `证据 E1` 是用户贴的」 |
| `reasoning_passthrough` | Turn 2 本身无思考 | `original` 回传 Turn 1 长思考，延续高审慎模式 | `original` 回传 Turn 1 16.9s 长思考，延续高审慎模式 |

换言之：**Run 4 并不是走了别的通道（Run 4 同样只调了 `kb_outline` + `kb_read`，根本没调过 `kb_search`），只是模型在 Run 4 没去纠结 `证据 E2` 的消息来源，碰巧「蒙对了」；一旦进入高审慎推理状态去检查 `kb_read` 返回字段（Run 5/6），结构性错位立刻暴露。**

---

## 4. 逐层排除：是否「校验写太死」？

对整条链路上的 5 层校验/约束逐一核对，结论如下：

| 层级 | 代码位置 | 本次线上实测结果 | 是否为根因 |
| :--- | :--- | :--- | :---: |
| **1. 工具入参校验** | [`ActionPlane.execute`](../../../ai-service/harness/action/plane.py#L71-L76)、[`KbReadArgs`](../../../ai-service/tools/knowledge/args.py#L84-L115) | Run 4/5/6 入参均为 `{"ref": "note:2576"}`，全部校验通过，无 `INVALID_ARGUMENTS` | ❌ 否 |
| **2. 权限与范围门禁** | `session.gate` / `services/note` | 全部放行，`permissionBasis = "AUTHOR"`，完整返回 1749 字 | ❌ 否 |
| **3. 观察与证据层长度截断** | [`ActionPlane.observe`](../../../ai-service/harness/action/plane.py#L132-L138)、[`_evidence_layer`](../../../ai-service/harness/context/builder.py#L314-L317) | 正文 1749 字 ≤ `large_result_chars`（2000）且 ≤ `read_max_chars`（2000），`transform = "ORIGINAL"`，零截断 | ❌ 否 |
| **4. 回答与引用验证器** | [`validate_answer`](../../../ai-service/agents/knowledge_retrieval/response.py#L41-L146)、[`VerifierFramework`](../../../ai-service/harness/verify/framework.py#L43-L61)、[`scan_answer`](../../../ai-service/agents/knowledge_retrieval/citations.py#L199-L229) | 6 轮全部 `passed: true, issues: []`，零次触发修复重试、降级或 `NOT_FOUND` 改写 | ❌ 否 |
| **5. 提示词引用纪律** | [`instructions.md:16-18`](../../../ai-service/agents/knowledge_retrieval/instructions.md#L16-L18)、[`PLATFORM_RULES`](../../../ai-service/harness/context/policy.py#L6-L9) | 并非代码校验拦截，但「只能引用本轮工具结果里的 `evidenceId`」在上下文角色错位时**放大了模型的自我否定** | ⚠️ 间接放大器 |

---

## 5. 影响面与顺带发现

### 5.1 同类工具影响面排查（全部 8 个 `kb_*` 工具）

| 工具 | 正文/数据所在位置 | `ToolSpec.full_result_chars` | 是否受同一错位影响 |
| :--- | :--- | :-: | :---: |
| **`kb_read`**（[`kb_read.py:70-88`](../../../ai-service/tools/knowledge/kb_read.py#L70-L88)） | `tool` 仅元数据，**正文在倒插的 `role="user"` 证据层** | **未声明**（默认 2000） | **高危（本次复现）** |
| **`kb_grep`**（[`kb_grep.py:77-93`](../../../ai-service/tools/knowledge/kb_grep.py#L77-L93)） | `tool` 仅元数据，**命中行文本在倒插的 `role="user"` 证据层**（但工具描述宣称「返回命中行、行号和前后几行」） | `10000` | **高危（同机制）** |
| **`kb_search`**（[`search.py:340-353`](../../../ai-service/retrieval/search.py#L340-L353)） | `tool` 仅元数据，**命中片段在倒插的 `role="user"` 证据层**（仅工具描述多了一句「正文在证据里」） | `10000` | **中高危（同机制）** |
| `kb_list` / `kb_outline` / `kb_query` / `kb_related` | `structured=True`，数据直接在 `role="tool"` JSON 内，不进证据层 | `10000` | 无 |
| `kb_view_doc`（[`kb_view_doc.py:309-336`](../../../ai-service/tools/knowledge/kb_view_doc.py#L309-L336)） | 同版本 `textParts` 在 `tool` JSON 内，原页图像追加在 `exchange_messages` 之后且有明确说明 | `10000` | 低（仅文本证据仍进前置证据层，存在重复） |

### 5.2 附带架构与线上巡检发现

1. **破坏供应商侧 Prompt Cache**：每次工具返回新证据时，`_compile_messages` 都会在 `history` 与 `question` 之间插入/改写证据消息，导致同一 Run 内第 2、3 轮模型调用的 messages 前缀在提问之前就发生变化，无法复用第 1 轮已缓存的前缀（系统提示 + 工具定义 + 历史）。
2. **历史消息统一使用 `role: "user"` 编码**：[`builder.py:290, 494`](../../../ai-service/harness/context/builder.py#L494) 把历史中 `assistant` 的回复也包成 `{"role": "user", "content": "assistant: ..."}`，再紧接一条 `role: "user"` 的证据消息和一条 `role: "user"` 的当前提问，形成连续多条 `user` 消息，进一步弱化了角色边界。
3. **Run 4 隐藏的引用编号偏移**：Run 4 中 `kb_outline` 登记了 `E1`（目录行，`structured=True`），`kb_read` 登记了 `E2`（1749 字正文）。模型根据 `E2` 总结全文却全部标注 `[1]`；因 `E1` 存在且 `structured=True` 不检原文，[`validate_answer`](../../../ai-service/agents/knowledge_retrieval/response.py#L78-L90) 予以放行，导致消息 `id=1670` 的落库引用指向了目录行（`locator: {"row": true, "startLine": 1, "endLine": 97}`）而非正文证据 `E2`。
4. **线上 PDF 视觉读取开关配置不一致**：`app-01` 上 `a_logical_model.agent_main.supports_vision = 1`，但 `/opt/anynote-nacos-prod/anynote-ai-harness.yml` 中 `visual-read-enabled: false`。对话 369 中模型两次告诉用户「如果是《兰德报告.pdf》的页面，告诉我页码我可以取原图核对」，但按当前配置一旦调用 `kb_view_doc` 就会因 [`kb_view_doc.py:67-68`](../../../ai-service/tools/knowledge/kb_view_doc.py#L67-L68) 返回「页面图像读取未开启」。

---

## 6. 修复方案建议

### 方案 A（推荐，根治）：正文直接随 `role: "tool"` 返回，取消工具证据倒插

**核心依据**：[`ContextBuilder._exchange_messages`](../../../ai-service/harness/context/builder.py#L410-L418) 对所有 `role: "tool"` 消息**已经统一包裹 `<untrusted-evidence>...</untrusted-evidence>` 定界符并标记 `trust_level = "UNTRUSTED_CONTENT"`**。因此把工具读到的正文直接放回对应的 `tool` 响应里，**不会削弱提示词注入防护边界**，反而能一次性解决角色错位、因果倒置、正文重复与 Prompt Cache 失效四个问题。

**具体改动要点**：

1. **工具返回正文内联**：
   - `kb_read`（[`kb_read.py:70-88`](../../../ai-service/tools/knowledge/kb_read.py#L70-L88)）：在 `payload` 增加 `"content": piece`；同时为 `ToolSpec` 补齐 `full_result_chars=RESULT_FULL_CHARS`（或 `max(RESULT_FULL_CHARS, read_max_chars + 1000)`），避免 1800–2000 字正文加上 JSON 元数据超过默认 `large_result_chars=2000` 后被 `ActionPlane.observe` 误截成 500 字。
   - `kb_grep`（[`kb_grep.py:77-80`](../../../ai-service/tools/knowledge/kb_grep.py#L77-L80)）：在 `results` 每条命中对象中增加 `"content": hit.text`。
   - `kb_search`（[`retrieval/search.py:340-353`](../../../ai-service/retrieval/search.py#L340-L353)）：在 `results` 每条命中对象中增加 `"content": text`（需结合 `neighbor_max_chars` 与 `RESULT_FULL_CHARS` 核对单次上限，避免过早触发 `structured_preview` 省略靠后结果）。
2. **`structured_preview` 适配单文档对象**（[`harness/action/preview.py:58-63`](../../../ai-service/harness/action/preview.py#L58-L63)）：
   - 当前 `structured_preview` 在 JSON 对象不含对象列表时直接返回 `None`，会退化为 `content[:500]` 破坏 JSON 结构。若 `kb_read` 内联了 `content` 字段，当预算不足需要收缩较早轮次的 `kb_read` 结果时，应支持按字数收缩 `content` 字段并保留 `evidenceId`/`ref`/`locator`/`truncated` 等元数据，保持合法 JSON。
3. **`ContextBuilder` 证据层收敛**（[`builder.py:121-152, 486-500`](../../../ai-service/harness/context/builder.py#L121-L152)）：
   - `run.workspace.evidence` 继续完整登记 `EvidenceItem`（用于引用核验 `validate_answer`、`citation` 事件和 `process` 投影）；
   - 工具调用产出的证据不再经 `evidence_layers` 倒插到 `question` 之前；`evidence_layers` 仅保留给无对应 `tool_call` 的**首轮预取（prefetch）**证据，并加上明确来源前缀（如「以下为系统按原句预取的不可信候选资料，非用户输入」）。
4. **同步调整指令与工具描述**：
   - 更新 `kb_search` 描述（去掉「正文在证据里」的分离表述），保持 `kb_read`/`kb_grep`/`kb_search` 与实际返回结构一致。

### 方案 B（备选，最小过渡改动）：保留分离证据层，修正位置与标识

若短期内不希望调整工具 JSON 契约，可作为过渡措施：
1. 在 `kb_read`/`kb_grep`/`kb_search` 的 tool JSON 中增加明确提示字段（例如告知正文见对应证据编号），并在 `instructions.md` 中明示「`kb_read`/`kb_search`/`kb_grep` 的正文内容由系统按 `evidenceId` 附在证据区块中，属于本轮工具结果」；
2. 将工具产生的证据消息移到对应 `exchange_messages` 之后（与 `visual_attachments` 的顺时序一致），并在前缀标明 `[系统工具 kb_read 返回的不可信证据 E1，并非用户输入]`。

> 该方案能缓解误判，但仍存在多出额外 `user` 消息、破坏 Prompt Cache 与证据/工具割裂的复杂度，长期仍建议采用 **方案 A**。

### 附带优化项（可分批处理）

- **历史消息按真实 `role` 编入**（`user` / `assistant` 交替而非全部 `role: "user"`），减少上下文角色混淆；
- **对齐线上 PDF 视觉配置**：确认 `app-01` 是否需要开启 `visual-read-enabled: true`；若保持关闭，建议在运行时关闭开关时一并从可用工具集与提示词中隐藏 `kb_view_doc` 承诺，避免误导用户。

---

## 7. 验证建议（后续修复验收）

1. **单测回归（先写复现用例）**：
   - `test_knowledge_tools.py`：断言 `kb_read` / `kb_grep` / `kb_search` 的 `ToolOutput.content` JSON 中包含完整正文，且 `kb_read` 返回 2000 字正文时经 `ActionPlane.observe` 不被 500 字截断；
   - `test_context_tool_exchange.py`：断言工具调用产生的证据不再倒插为 `question` 之前的 `role: "user"` 消息，且 `role: "tool"` 仍完整包裹 `<untrusted-evidence>` 定界符、同一 Run 多轮调用前缀稳定；
   - `test_preview.py`：覆盖预算紧张时收缩历史 `kb_read` JSON 结果仍保留合法 JSON 与元数据。
2. **真实模型重放**：
   - 使用 `stepfun / step-5-preview`（开启 `reasoning_passthrough = original`）完整重放对话 369 的第 4 → 第 5 → 第 6 轮提问，验证：
     - Run 5 准确说明「已读到笔记正文，其中仅包含两张内嵌图片链接且无法识别图片画面」，不再声称「正文为空」或「正文是用户贴出来的」；
     - Run 4 引用准确落在正文证据上，Run 6 不再出现通道臆测。
