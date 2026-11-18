# Agent 回答文本解析与渲染变更清单

## 概览

本批实施 Agent 回答的 Markdown 解析、AI 专用渲染、原文保留、专用澄清机制移除及历史引用说明，同步关联方案与里程碑。
共 **49 个文件：新增 9、修改 40、删除 0**；**新增 1514 行、删除 383 行**（含本清单）。目录分布：`ai-service` 21、`apps/web` 14、
`services/ai` 3、文档与契约 11（含 `CLAUDE.md`、OpenSpec 和本清单）。`packages/api-client/src/` 为 gitignore 派生产物，不计入变更文件。

### 验证结果

| 命令 / 操作 | 实际结果 |
|---|---|
| `cd ai-service && ./venv/Scripts/python.exe -m pytest -q` | 仅既有 `test_models.py::test_first_idle_and_total_timeouts[TOTAL]` 一次把 TOTAL 判成 STREAM_IDLE；该用例单独复跑通过，未修改无关模块 |
| Python 共享、回答、上下文、索引读取与 Harness 定向测试 | 全部通过；最后相对链接统计回归及回答相关复验 **40 项通过** |
| `pnpm test` | 5 个非 Web 包共 **565 项通过**；Web **2110 passed、3 failed**，失败均为既有任务日期控件用例，两个失败文件单独复跑 **45/45 passed** |
| `cd services && mvn -o test -pl ai -am` | **BUILD SUCCESS**，包含新增历史引用 DTO 转换测试 |
| `cd services && mvn -o install -pl ai -am -DskipTests` | **BUILD SUCCESS**，真实 AI 镜像使用该产物 |
| `pnpm typecheck` | **6 个任务通过** |
| `pnpm exec biome check`（14 个本批前端文件） | 通过；`git diff --check` 通过 |
| `pnpm openapi:check` | 通过，六份 baseline 无漂移；本批无公开 API 变化 |
| `NEXT_DISABLE_STANDALONE=1 pnpm --filter web build && pnpm --filter web bundle:budget` | 通过：桌面 **304.3/310 KB**、移动端 **246.6/250 KB**、编辑器 **16.9/250 KB** |
| ES 8.7 空高亮标签实测 | `pre_tags=[""]`、`post_tags=[""]` 返回 200，资料原有 `<em>` 保留，临时索引已删除 |
| Docker 全栈 + 临时 Playwright 受控 SSE 验收 | **1/1 通过**：外站图片请求为 0，本站图片加载，无效编号隐藏，外链实际新标签打开；临时 spec 已删除 |
| 51 条既有真实回答离线复算 | **51/51 匹配**，识别编号集合与原引用记录一致 |
| 36 次 StepFun 真实模型重放 | **未执行（0 次）**：首次启动缺 `PYTHONPATH`；修正后模型快照因 `ANYNOTE_AI_CREDENTIAL_KEY` 为空而拒绝，尚未发出模型调用 |

## Python Harness 与知识 Agent

| 文件 | 状态 | 作用与原因 |
|---|---|---|
| `ai-service/agents/knowledge_retrieval/citations.py` | 新增 | 用 markdown-it 语法树识别正文引用并统计外部资源，替代无法区分代码、公式和链接边界的正则 |
| `ai-service/agents/knowledge_retrieval/response.py` | 修改 | 普通回答只裁首尾空白，引用只判定不删除，无工具对话跳过校验，检索片段保留资料原有标签 |
| `ai-service/agents/knowledge_retrieval/agent.py` | 修改 | `agent_finish` 删除 `NEEDS_CLARIFICATION` 与 `clarification_question`，只保留已回答和未找到终态 |
| `ai-service/agents/knowledge_retrieval/instructions.md` | 修改 | 需要澄清时直接写普通回答，并要求历史编号不得当作本轮证据引用 |
| `ai-service/agents/knowledge_retrieval/context_policy.yaml` | 修改 | 删除专用澄清问题数量配置，避免保留已失效的机制开关 |
| `ai-service/harness/models.py` | 修改 | 增加历史引用模型、历史摘要布尔字段和消息引用列表，并删除不再产生的澄清结果枚举 |
| `ai-service/harness/context/builder.py` | 修改 | 按结构化摘要字段标记 Manifest，并在历史原文外附加原轮次引用标题和有效范围说明 |
| `ai-service/harness/context/compaction.py` | 修改 | 压缩器生成摘要时显式设置 `summary=true`，不再依赖正文前缀被识别 |
| `ai-service/harness/loop.py` | 修改 | 复用回答解析结果完成校验和 Trace 统计，同时删除专用澄清修复提示 |
| `ai-service/harness/verify/framework.py` | 修改 | 验证报告增加非正文诊断字典，供引用与外部资源统计传递 |
| `ai-service/harness/trace/middleware.py` | 修改 | `trace.verify` 写入排除候选、外部链接、外部图片及主机名统计，不记录查询参数 |
| `ai-service/retrieval/index_reader.py` | 修改 | ES 高亮请求使用空前后标签，避免后续正则误删资料原有的 `<em>` |
| `ai-service/requirements/online.in` | 修改 | 锁定 `markdown-it-py==4.3.0` 与 `linkify-it-py==2.2.0`，提供与前端同源的 Markdown 解析器 |
| `ai-service/requirements/online-linux.lock.txt` | 修改·生成物 | 由锁文件头原有 `uv pip compile --python-platform x86_64-manylinux_2_28` 命令重生成，新增解析依赖链；无专门 diff CI |
| `ai-service/requirements/online-windows.lock.txt` | 修改·生成物 | 由锁文件头原有 `uv pip compile --python-platform x86_64-pc-windows-msvc` 命令重生成，供宿主机测试使用；无专门 diff CI |
| `ai-service/tests/fixtures/citation-markers.json` | 新增 | 以 23 组共享输入固定中文、连写、代码、公式、链接、转义及 ASCII 前缀的引用边界 |
| `ai-service/tests/test_citations.py` | 新增 | 直接消费共享 fixture，并验证外部资源统计、同源相对路径和排除候选计数 |
| `ai-service/tests/test_index_reader.py` | 新增 | 固定全文检索请求不插入高亮标签的请求契约 |
| `ai-service/tests/test_knowledge_retrieval_agent.py` | 修改 | 先复现代码、链接和编号被删改的旧行为，再锁定原文保留、无工具跳过及澄清契约删除 |
| `ai-service/tests/test_harness_knowledge_agent.py` | 修改 | 覆盖普通澄清问题、原文降级、Trace 统计及旧回答与本轮 E1 不同的历史编号场景 |
| `ai-service/tests/test_context.py` | 修改 | 验证摘要只按布尔字段识别，避免用户正文恰好带前缀时被误标 |

## 前端 AI 回答与编辑器预设

| 文件 | 状态 | 作用与原因 |
|---|---|---|
| `apps/web/src/components/editor/extensions/ai-citation.ts` | 新增 | 注册只给 AI 回答使用的引用行内规则与节点，在解析阶段排除代码、公式、链接和非法编号 |
| `apps/web/src/components/editor/presets/ai-answer.ts` | 新增 | 提供 AI 回答只读预设，外链新标签打开，图片仅接受同源文件对象重定向地址 |
| `apps/web/src/components/editor/presets/types.ts` | 修改 | 将 `aiAnswer` 纳入预设联合类型，供注册表和组件安全引用 |
| `apps/web/src/components/editor/presets/index.ts` | 修改 | 注册 `aiAnswer` 工厂，使回答组件使用真实预设而非借用笔记预览 |
| `apps/web/src/components/editor/core/tiptap-editor.tsx` | 修改 | 将 `aiAnswer` 按只读预设处理，避免挂载依赖编辑命令的工具栏和气泡菜单 |
| `apps/web/src/components/editor/presets/readonly.ts` | 修改 | 更新预设说明，明确笔记只读预设不再承担 AI 回答渲染职责 |
| `apps/web/src/lib/ai/citation-editor.ts` | 修改 | 对结构化引用节点建立站内链接或按 `CITATIONS_REMOVED` 删除无效节点，不再正则扫描文字节点 |
| `apps/web/src/features/ai/components/citation-answer.tsx` | 修改 | 有引用和无引用回答统一使用 `aiAnswer`，传入移除标注且空引用时不渲染来源列表 |
| `apps/web/src/features/ai/components/message-item.tsx` | 修改 | 所有完成态助手回答统一进入同一回答组件，流式纯文本行为保持不变 |
| `apps/web/src/components/editor/__tests__/ai-answer.test.ts` | 新增 | 消费共享 fixture，并覆盖外链安全关系、同源图片、外站图片拦截和笔记预设回归 |
| `apps/web/src/components/editor/__tests__/editor.test.tsx` | 修改 | 验证 `aiAnswer` 不渲染工具栏且内容不可编辑 |
| `apps/web/src/lib/ai/__tests__/citation-editor.test.ts` | 修改 | 固定有效引用链接化、无移除标注保留未知编号及有标注隐藏无效编号 |
| `apps/web/src/features/ai/components/__tests__/citation-answer.test.tsx` | 修改 | 验证无引用回答也使用 AI 预设且不出现空来源列表 |
| `apps/web/src/features/ai/components/__tests__/message-item.test.tsx` | 修改 | 将完成态回答预设断言改为 `aiAnswer`，并补路由桩覆盖统一组件路径 |

## Java 历史引用

| 文件 | 状态 | 作用与原因 |
|---|---|---|
| `services/ai/src/main/java/com/anynote/ai/model/dto/HarnessRunRequestDTO.java` | 修改 | Harness 历史消息增加编号与标题列表，让 Python 无需从历史正文猜测旧引用含义 |
| `services/ai/src/main/java/com/anynote/ai/service/impl/AgentRunServiceImpl.java` | 修改 | 将持久化 JSON 引用安全转换为 Harness 历史引用，过滤非法编号并容忍历史脏 JSON |
| `services/ai/src/test/java/com/anynote/ai/service/impl/AgentRunServiceImplTest.java` | 修改 | 验证旧回答的引用编号和标题随新问题请求发送到 Harness |

## 契约与文档

| 文件 | 状态 | 作用与原因 |
|---|---|---|
| `.claude/openspec/changes/2026-11-18-agent-answer-rendering.md` | 新增 | 固定原文、引用、外链、图片、澄清、历史字段和部署顺序契约，并注明无公开 API 或数据库变化 |
| `docs/ai-refactor/AGENT_OUTPUT_TEXT_PLAN.md` | 修改 | 回写 S1–S8 实际拍板、当前实现、验证结果及真实模型重放停止点 |
| `docs/ai-refactor/AI_REFACTOR_PLAN.md` | 修改 | 更新 Agent 契约、输出约束、分级校验、历史摘要与安全边界，移除现行文档中的文本过滤设计 |
| `docs/ai-refactor/KNOWLEDGE_RETRIEVAL_PLAN.md` | 修改 | 同步解析引用、原文保留、历史编号、普通澄清回答和前端呈现规则 |
| `docs/ai-refactor/KNOWLEDGE_AGENT_V3_PLAN.md` | 修改 | 保留历史实施记录，同时注明 2026-11-18 的澄清删除、渲染和自动补注放弃等后续修订 |
| `docs/ai-refactor/AGENT_TRACE_VIEW_PLAN.md` | 修改 | 仅向未开工方案并入 `think_tag`、原文预览和 `aiAnswer` 约束，不提前实现 M17 功能 |
| `docs/ai-refactor/KNOWLEDGE_AGENT_V3_CODE_REVIEW.md` | 修改 | 保留原评估内容并登记代码下标高优先级问题已修复，其余问题不顺手处理 |
| `docs/ai-refactor/AI_MILESTONES.md` | 修改 | 记录实现、实际验证数据、51 条离线复算及 36 次真实重放因主密钥未配置而未执行 |
| `docs/ai-refactor/README.md` | 修改 | 更新 AI 文档导航中的方案、评估后续和验收状态 |
| `CLAUDE.md` | 修改 | 同步统一上下文导航，避免仍显示草案未开工或代码下标问题未修复 |
| `docs/changelist/2026-11-18-agent-answer-rendering.md` | 新增 | 按实际 Git 结果汇总本批逐文件改动、验证与审计重点 |

## 审计要点

1. **图片安全边界**：重点审查 `ai-answer.ts` 的 Origin 与精确路径校验，以及所有完成态回答是否统一使用 `aiAnswer`；外站图片不得发请求，笔记预设不得被收窄。
2. **两端解析一致性**：`citations.py` 与 `ai-citation.ts` 必须共同通过共享 JSON，尤其检查链接静默探测、`linkLevel`、连写编号和 ASCII 标识符前缀。
3. **原文与无效编号**：后端可返回 `CITATIONS_REMOVED`，但普通回答原文仍含无效编号；只有前端事务隐藏对应结构化节点，不能恢复成正则删原文。
4. **澄清与未找到边界**：专用澄清终态、默认问题和修复提示应完全消失；普通提问不截断，既有 `NOT_FOUND` 固定文案与无证据降级仍保留。
5. **历史编号不等于权限复核**：Java 只传 `index/title`，解决原轮次含义不明；M17 T2 所需来源权限复核仍未实现，文档不得将其记为完成。
6. **验收未完成项**：36 次真实模型重放执行数为 0，必须恢复旧凭据对应主密钥后补跑；全量 Python/Web 的既有抖动虽单独复跑通过，也不能写成全量一次全绿。
