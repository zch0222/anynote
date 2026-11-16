# Changelist: 工具结果结构化预览（清单类结果不再被截到 500 字）

> 分支：`dev` | 日期：2026-11-17 | 记录：[M16.8](../ai-refactor/AI_MILESTONES.md#清单类工具结果被截到-500-字2026-11-17-修复) | OpenSpec：无（未改任何 HTTP 接口与 Agent 契约）

## 概览

行动面把超过 2000 字的工具结果按字符截成前 500 字，清单类结果因此只剩 2～3 行，排在末尾的 `count` 也被截掉；
上下文预算不足时较早一轮的工具结果还会再按字符截一次。本批改为：工具声明自己的完整展示长度，
超出时保留元数据、整条省略并注明条数。设计说明见[方案「压缩与大结果」](../ai-refactor/AI_REFACTOR_PLAN.md#压缩与大结果)。

按 `git status --porcelain`、`git diff --stat` 与 `git ls-files --others --exclude-standard` 统计，本批共 20 个文件：修改 17、新增 3（含本清单）、删除 0。
已跟踪文件为 `17 files changed, 280 insertions(+), 21 deletions(-)`；新增的 `preview.py` 84 行、`test_action_preview.py` 74 行。改动尚未提交。

目录分布：`ai-service` 16 个、`docs` 4 个。

### 验证结果

| 命令 / 场景 | 实际结果 |
|---|---|
| 6 条复现用例在实现前运行 | 全部失败：模型看到的 JSON 在第 500 字处断开（默认一页 20 行）或切断在行中间（100 行）、通用 JSON 结果在第 50 字处断开、`kb_outline` 默认 50 个节点被截短、`ToolSpec` 不认 `full_result_chars`；上下文收缩用例在旧 `builder.py` 上于第 322 字处断开 |
| 新增预览模块的单测 | 实现前无法导入（模块不存在）；实现后 5 条通过 |
| 受影响的 7 个测试文件 | 72 passed |
| `ai-service` 宿主机全量 `venv/Scripts/python.exe -m pytest` | 2 次：第 1 次 1 failed、384 passed、20 skipped，失败的是 `test_models.py::test_first_idle_and_total_timeouts[TOTAL]`；第 2 次 385 passed、20 skipped |
| 上述超时用例单独运行 5 次 | 4 次通过、1 次失败；与上一批清单记录的偶发失败相同，`models/` 与该测试本批均未改动 |
| 真实 token 计数下的上下文编译（脚本，知识检索 Agent 全部工具定义） | 固定层 4598 token；1～2 条 8000 字左右的清单结果均为 `ORIGINAL`，第 3 条起最早一条为 `TRUNCATED` |
| `git diff --check` | 通过 |
| 真实模型重放、浏览器端到端 | **未做** |

## ai-service：Harness 内核

| 文件 | 状态 | 作用与原因 |
|---|---|---|
| `ai-service/harness/action/preview.py` | 新增 | `structured_preview`：把超长 JSON 对象结果压成预算内的合法 JSON，元数据原样保留、对象列表整条保留前面的条目、`omitted` 记省略条数；对已是预览的结果再收缩时累加省略条数；非 JSON 对象或保留字段被工具占用时交还按字符截取 |
| `ai-service/harness/action/plane.py` | 修改 | `observe` 的阈值改为工具声明值与 `large_result_chars` 取较大值，超出时先做结构化预览、做不了才截前 500 字；原先按字符硬切会丢掉排在末尾的 `count` 并切断行 |
| `ai-service/harness/action/registry.py` | 修改 | 从未被读取的 `result_max_chars` 改为 `full_result_chars`（可空，与运行参数取较大值），让工具按默认一页声明完整展示长度 |
| `ai-service/harness/context/builder.py` | 修改 | 预算不足时收缩较早一轮工具结果改用结构化预览（二分取放得下的最大预览），「完整结果引用」一行单独保留；原先按字符截断同样切断条目 |

## ai-service：知识工具

| 文件 | 状态 | 作用与原因 |
|---|---|---|
| `ai-service/tools/knowledge/common.py` | 修改 | 新增 `RESULT_FULL_CHARS = 10000`，按实测（默认 50 个目录节点约 8000 字）覆盖各工具默认的一页 |
| `ai-service/tools/knowledge/kb_query.py` | 修改 | 声明完整展示长度；默认 20 行约 4400 字，原先只有前 2～3 行可见、`count` 丢失 |
| `ai-service/tools/knowledge/kb_outline.py` | 修改 | 声明完整展示长度；默认一页 50 个节点 |
| `ai-service/tools/knowledge/kb_related.py` | 修改 | 声明完整展示长度；默认一页 20 条 |
| `ai-service/tools/knowledge/kb_list.py` | 修改 | 声明完整展示长度；知识库多时同样会超过 2000 字 |
| `ai-service/tools/knowledge/kb_search.py` | 修改 | 声明完整展示长度；10～20 条结果连同定位信息可能超过 2000 字（未实测），超出时后面命中的 `ref` 与排在末尾的 `notices` 会被截掉 |
| `ai-service/tools/knowledge/kb_grep.py` | 修改 | 声明完整展示长度；命中多时同理。`kb_read` 结果只有定位信息、正文走证据层，未声明 |

## ai-service：测试

| 文件 | 状态 | 作用与原因 |
|---|---|---|
| `ai-service/tests/test_harness_knowledge_agent.py` | 修改 | 复现用例：`kb_query` 默认 20 行在第二轮原样可见且 `count` 在；100 行超出上限时仍是合法 JSON，保留 `count`、只含完整的行并注明省略条数 |
| `ai-service/tests/test_action.py` | 修改 | 复现用例：通用 JSON 结果超长时保留元数据与完整的行、全文仍在工作区；工具声明值与运行参数取较大值 |
| `ai-service/tests/test_knowledge_tools.py` | 修改 | 复现用例：`kb_outline` 默认 50 个节点在观察里原样保留 |
| `ai-service/tests/test_context_tool_exchange.py` | 修改 | 复现用例：上下文预算不足时较早的清单结果整条收缩、保留 `count`，清单标记 `TRUNCATED` |
| `ai-service/tests/test_action_preview.py` | 新增 | 预览函数：多列表各留前缀、在预算内放到不能再放、再收缩时省略条数累加、非结构化与保留字段冲突时交还 |

## docs

| 文件 | 状态 | 作用与原因 |
|---|---|---|
| `docs/ai-refactor/AI_REFACTOR_PLAN.md` | 修改 | 「大结果不进窗口」补上阈值取法、结构化预览与上下文收缩，并写明工作区引用目前没有读取工具 |
| `docs/ai-refactor/KNOWLEDGE_RETRIEVAL_PLAN.md` | 修改 | §6.4 说明返回列表的工具声明 1 万字完整展示长度及超出时的处理 |
| `docs/ai-refactor/AI_MILESTONES.md` | 修改 | M16.8 新增本次修复记录：现象与测量、修复、验证与遗留 |
| `docs/changelist/2026-11-17-tool-result-structured-preview.md` | 新增 | 本清单 |

## 审计要点

1. `harness/action/preview.py` 的判定：只有「元素含对象的列表」会被裁剪，其余字段（含字符串列表 `notices`）原样保留；元数据本身超出预算时返回 `None`，由调用方按字符截取。
2. `ActionPlane._full_result_chars` 取 `max(工具声明, 运行参数)`：在 Nacos 调小 `large-result-chars` 不会让知识工具的默认分页再被截断，调大则对所有工具生效。
3. `ContextBuilder._fit_tool_result` 的二分依赖两个单调性：预览随字符预算增大而条目不减，预算小于元数据时为 `None`；改预览算法时要保住这两点。
4. 每条工具结果的上限从 2000 字变为 1 万字，单轮 token 占用变大；上下文总量仍由 `context_tokens` 与工具交互的一半预算约束，超出时收缩最早一轮。
5. 模型可见的工具结果在超出上限时多出 `omitted`、`omittedHint` 两个字段；工具结果里若自带同名字段，预览会放弃并回到按字符截取。
