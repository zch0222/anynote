# Changelist: 知识检索 Agent 结构化引用与终态回答（Agent 版本 2）

> 分支：`dev` | 日期：2026-11-17 | OpenSpec：[`2026-11-17-knowledge-agent-structured-citations.md`](../../.claude/openspec/changes/2026-11-17-knowledge-agent-structured-citations.md) | 记录：[M16.8](../ai-refactor/AI_MILESTONES.md#真实模型首个问题清单类回答被改写成未找到2026-11-17-修复)

## 概览

修复真实模型下「我有哪些知识库」被回答成「未找到相关内容」：清单、目录、关系结果登记为可引用的结构化证据，
结构化行只核对引用编号，`agent_finish` 增加优先的 `answer`，重写指令并升到版本 2。设计取舍见
[知识检索方案 §8、§9](../ai-refactor/KNOWLEDGE_RETRIEVAL_PLAN.md#8-证据与引用)。

按 `git status --porcelain`、`git diff --stat` 与 `git ls-files --others --exclude-standard` 统计，本批共 21 个文件：修改 19、新增 2（含本清单）、删除 0。
已跟踪文件为 `19 files changed, 941 insertions(+), 170 deletions(-)`。改动尚未提交。

目录分布：`ai-service` 16 个、`docs` 4 个、`.claude` 1 个。

### 验证结果

| 命令 / 场景 | 实际结果 |
|---|---|
| 新增与改写的用例在实现前运行 | 20 个失败，原因分别是缺少结构化证据、`agent_finish` 不认 `answer`（`ValidationError`）、终态与工具同轮时 `ValueError`；两条「范围外不登记」守护用例本就通过。后加的两条（缺少终态时只提供 `agent_finish`、`answer` 缺省取正文）也先确认失败再实现 |
| `ai-service` 宿主机全量 `venv/Scripts/python.exe -m pytest` | 最终代码全量 4 次：2 次 **374 passed、20 skipped**；2 次各有 1 个偶发失败，捕获到的一次是 `test_models.py::test_first_idle_and_total_timeouts[FIRST_OUTPUT]` |
| 全量偶发失败 | 各版本全量运行中出现过 `test_models.py::test_first_idle_and_total_timeouts`（超时用例）与 `test_indexing_pipeline.py::test_incremental_store_failure_preserves_cursor_success_time_and_doc_status`（时间戳严格递增断言）偶发失败；单独运行分别 3/3、5/5 通过。改动前代码（`git archive HEAD`）全量 9 次中也有偶发失败，可确认的是 `test_models.py` 的两个超时用例；两者所在模块本次均未改动 |
| 真实模型重放（当前 StepFun 供应商；真实 Harness 与七个工具，note/ES 用单测替身合成数据） | 「我有哪些知识库」3/3；「最近更新了哪些笔记」2/2；正文类问题 4/4；「库一里都有什么」3 次中 1 次已回答（1 次为替身数据缺目录，1 次收束轮仍调用工具被判无进展）。改动前代码对照：0/2、1/2、4/4 |
| `ai-harness` 容器按当前 Compose 组合重建 | `up -d --build --no-deps anynote-ai-harness` 成功，容器 healthy，容器内 Agent 版本为 2 |
| 浏览器端到端 | **未做**：内置浏览器未登录 Anynote，未代用户登录 |
| `git diff --check` | 通过 |

## ai-service：Agent 契约与回答校验

| 文件 | 状态 | 作用与原因 |
|---|---|---|
| `ai-service/agents/knowledge_retrieval/agent.py` | 修改 | `AgentFinishArgs` 增加可选 `answer`（≤8000 字，`a_chat_message.content` 是 TEXT），`quote` 允许为空，各字段补给模型看的说明；终态工具描述同步 |
| `ai-service/agents/knowledge_retrieval/agent.yaml` | 修改 | 版本 1 → 2：回答来源与引用规则变了，运行记录据此区分 |
| `ai-service/agents/knowledge_retrieval/instructions.md` | 修改 | 按问题类型分派七个工具（原先「清单」一律指向 `kb_query`），说明只有带 `evidenceId` 的条目可引用、结构化行片段可留空；结束段保留版本 1 写法（重放中改写它会让正文类问题失败） |
| `ai-service/agents/knowledge_retrieval/response.py` | 修改 | `validate_answer` 只看终态信号；结构化行只核对编号、片段用服务端摘要，正文类证据仍逐字核对 |

## ai-service：Harness 内核

| 文件 | 状态 | 作用与原因 |
|---|---|---|
| `ai-service/harness/loop.py` | 修改 | 回答优先取 `answer`、缺省取同一条回复正文；终态参数不合法或重复时提示重交，与其他工具同轮时先执行工具，不再以内部错误结束；缺少终态时重交轮只提供 `agent_finish` |
| `ai-service/harness/models.py` | 修改 | `EvidenceItem` 增加 `structured` 标记，供验证器和上下文构建区分结构化行 |
| `ai-service/harness/context/builder.py` | 修改 | 结构化行已带 `evidenceId` 出现在工具结果里，不再重复进入证据层，避免两种 JSON 并存和挤占证据预算 |
| `ai-service/retrieval/evidence.py` | 修改 | `register` 透传 `structured` |

## ai-service：知识工具

| 文件 | 状态 | 作用与原因 |
|---|---|---|
| `ai-service/tools/knowledge/common.py` | 修改 | 新增 `register_row`（范围外不登记、定位符带 `row` 以免与正文证据合并）与 `counts_summary`（知识库来源摘要） |
| `ai-service/tools/knowledge/kb_list.py` | 修改 | 每个知识库登记为 `kb:<id>` 证据并在结果里带 `evidenceId`；这是本次「未找到」的直接原因 |
| `ai-service/tools/knowledge/kb_outline.py` | 修改 | 库/慕课目录节点、笔记小节（按行范围）、资料页段登记为证据；慕课条目补 `moocId` 供前端生成链接 |
| `ai-service/tools/knowledge/kb_query.py` | 修改 | 改用 `register_row`，与其他结构化工具共用定位标记，同一实体在不同工具里拿到同一个编号 |
| `ai-service/tools/knowledge/kb_related.py` | 修改 | 六种关系的结果都登记为证据；字幕、总结分别带 `transcript`、`generated` 权威性，前端据此显示徽标 |

## ai-service：测试

| 文件 | 状态 | 作用与原因 |
|---|---|---|
| `ai-service/tests/test_harness_knowledge_agent.py` | 修改 | 复现用例：`kb_list` 作答不再被改写为未找到、`kb_query` 改写引用可通过、结构化行不进证据层、`answer` 优先与正文兜底、终态参数不合法与同轮调用重交、缺少终态时只提供 `agent_finish`；旧用例改为新协议 |
| `ai-service/tests/test_knowledge_retrieval_agent.py` | 修改 | 版本 2 与指令覆盖七个工具；结构化行免逐字核对且片段为服务端摘要；正文类改写片段仍判无效；缺 `answer` 报空回答 |
| `ai-service/tests/test_knowledge_tools.py` | 修改 | 清单、目录（库/慕课/小节/资料页段）、关系结果的证据字段与 `evidenceId`；显式范围外的行不登记 |

## 文档与契约

| 文件 | 状态 | 作用与原因 |
|---|---|---|
| `.claude/openspec/changes/2026-11-17-knowledge-agent-structured-citations.md` | 新增 | 记录 `agent_finish` 参数、结构化证据、验证规则与 `citation` 片段语义的变化；M16.6 运行契约里「验证原文片段」一条因此收窄 |
| `docs/ai-refactor/KNOWLEDGE_RETRIEVAL_PLAN.md` | 修改 | §8.1 结构化行、§8.2 回答来源与验证保证、§9.2 指令要点（版本 2）、§9.3 新增「问知识库本身」例子 |
| `docs/ai-refactor/AI_REFACTOR_PLAN.md` | 修改 | §3.1 `done_when` 与 §3.8 证据验证改为「正文类逐字、结构化行只核对编号」 |
| `docs/ai-refactor/AI_MILESTONES.md` | 修改 | M16.8 下记录现象、根因、修复、重放数据、方案修正与遗留项；页首状态同步 |
| `docs/changelist/2026-11-17-knowledge-agent-structured-citations.md` | 新增 | 本清单 |

## 审计要点

1. **验证规则放宽的边界**（`response.py`）：只有 `structured=True` 的证据免逐字核对，而该标记只由 `register_row` 设置；正文类证据（检索、读取、查找）仍要求片段逐字出现。请确认没有其他路径能把正文证据标成结构化。
2. **范围与权限**（`common.py` 的 `register_row`）：行本身已经过 note 的可读性过滤与超管口径复核；登记前再按本次显式范围过滤，范围外的行只给模型看、不能被引用。
3. **回答来源**（`loop.py`）：`answer` 有内容时优先，否则用同一条回复正文。这与最初「只认 `answer`」的方案不同，依据是重放数据（见 M16.8 记录），需要用户复核。
4. **定位符的 `row` 标记**：用来让结构化行与同一实体的正文证据分开编号；前端 `citationHref` 只读取已知键，`row` 会被忽略。
5. **遗留未改**：收束轮仍调用其他工具时按无进展直接失败；正文类问题约一半需要一次「缺少终态」重交，是否用 `tool_choice` 强制待评估。
