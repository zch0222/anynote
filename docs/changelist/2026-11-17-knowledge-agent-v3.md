# 知识库 Agent 版本 3 变更清单

## 概览

本批以 `7bb0dac` 为基线，实施知识库 Agent 版本 3、错误分类、回答标注持久化与前端展示，并完成 57 次真实模型重放及真实全栈复验。
共 **43 个文件：新增 4、修改 39、删除 0**；**新增 1246 行、删除 183 行**（含本清单）。目录分布：`ai-service` 17、`apps/web` 8、Java `services` 6、
`infra` 3、`openapi` 1、文档与契约 8（含本清单）。`packages/api-client/src/` 是 gitignore 派生产物，不计入变更文件。

### 验证结果

| 命令 / 操作 | 实际结果 |
|---|---|
| `cd ai-service && ./venv/Scripts/python.exe -m pytest --deselect <两项既有时间敏感用例>` | **402 passed、20 skipped、2 deselected** |
| `cd ai-service && ./venv/Scripts/python.exe -m pytest -q` | 多轮均只有既有 `test_models.py` 超时分类或 `test_indexing_pipeline.py` 时间戳断言抖动；最新一轮仅后者失败，单独复验曾分别通过，未宣称全量全绿 |
| `cd services && mvn -o test -pl ai -am` | **BUILD SUCCESS** |
| `cd services && mvn -o install -pl ai -am -DskipTests` | **BUILD SUCCESS**，真实 AI 镜像使用该产物 |
| `pnpm --filter web test` | 本批用例全部通过；全套 **2079 passed、3 failed**，失败均为既有任务日期控件用例，两个文件单独运行 **45/45 passed** |
| `pnpm --filter web typecheck` | 通过 |
| `pnpm exec biome check`（6 个本批 AI 功能文件及测试） | 通过 |
| `pnpm exec biome check apps/web/src/lib/ai/sse.ts apps/web/src/lib/ai/__tests__/sse.test.ts` | 新用例通过；格式检查仅报 `sse.ts:93` 本批未改的既有括号格式，未顺手修改 |
| `pnpm openapi:check` | 通过，六份 baseline 无漂移 |
| 手动执行 `infra/sql/migrations/2026-11-17-ai-answer-notices.sql` | 本机 `a_chat_message.answer_notices` 已确认为 JSON 列 |
| 重建 `anynote-ai-harness` 与 `anynote-web` | 构建成功，Harness `/healthz` 与 Web `/login` 均返回 200；Web 生产构建通过 |
| 宿主机真实模型版本 2/3 对照与预取消融 | **57 次**完成，原始报告在 `tmp/knowledge-agent-v3/`，结果已写入 M16.8 |
| `tmp/knowledge-agent-v3/full_stack_check.py` | **passed=true**：清单引用、问候零工具、两种 `answerNotices` 及会话详情落库均通过，临时数据已清理 |

## Python Harness 与知识 Agent

| 文件 | 状态 | 作用与原因 |
|---|---|---|
| `ai-service/agents/knowledge_retrieval/agent.yaml` | 修改 | Agent 升到版本 3 并改写目标，覆盖知识库事实、结构统计和非知识库问题 |
| `ai-service/agents/knowledge_retrieval/instructions.md` | 修改 | 按版本 3 重写分派与结束指令，避免通用回答被强制检索或强制终态工具束缚 |
| `ai-service/agents/knowledge_retrieval/agent.py` | 修改 | 将 `agent_finish` 限定到未找到、需澄清和附原文场景，并把正文引用原文改为可选 |
| `ai-service/agents/knowledge_retrieval/response.py` | 修改 | 实现结构化缺口、一次修复后的分级降级、引用移除与三种标注，正文片段改用检索高亮 |
| `ai-service/core/config.py` | 修改 | 增加默认关闭的 `prefetch_enabled` 热更新配置，供首轮预取开关使用 |
| `ai-service/retrieval/session.py` | 修改 | 按开关执行预取并标记原句候选证据，保留范围初始化和会话释放 |
| `ai-service/harness/loop.py` | 修改 | 接受纯文本完成申请、合并修复提示、降级交付并按协议输出标注和分类失败 |
| `ai-service/harness/models.py` | 修改 | 保存回答标注、预算提示和最后一轮提示，支持一次性提示生命周期与失败排查 |
| `ai-service/harness/budget.py` | 修改 | 每轮重算预算提示，并让无进展持续约束只在强制收束期间出现 |
| `ai-service/harness/verify/framework.py` | 修改 | 为 Verify 缺口增加涉及编号和可修复性，供结构化修复提示与 Trace 使用 |
| `ai-service/harness/runtime.py` | 修改 | 取消分支的 `run.finished` 补空 `answerNotices`，保持事件契约一致 |
| `ai-service/harness/context/builder.py` | 修改 | 工具定义只走 `tools` 参数，Manifest 保留哈希与 token 引用层，预算只计一份 |
| `ai-service/tests/test_config.py` | 新增 | 验证预取默认关闭及 Nacos kebab-case 配置解析 |
| `ai-service/tests/test_context.py` | 修改 | 复现工具定义重复与提示累积，锁定系统提示去重和一份预算计数 |
| `ai-service/tests/test_harness_knowledge_agent.py` | 修改 | 覆盖无编号清单、坏原文、纯文本、空输出、收束轮、预取开关和一次性修复提示 |
| `ai-service/tests/test_knowledge_retrieval_agent.py` | 修改 | 覆盖结构化缺口、降级标注、可选原文、高亮片段和固定澄清问题 |
| `ai-service/tests/test_runtime.py` | 修改 | 验证运行管理器默认不预取且完成事件带空标注 |

## Java、数据库与 API 契约

| 文件 | 状态 | 作用与原因 |
|---|---|---|
| `services/ai/src/main/java/com/anynote/ai/service/impl/AgentRunServiceImpl.java` | 修改 | 按错误类别映射已确认文案，并透传、保存 `answerNotices`，未知类别不透出内部信息 |
| `services/api/anynote-api-ai/src/main/java/com/anynote/ai/api/model/po/ChatMessage.java` | 修改 | 增加 JSON 回答标注持久化字段，供助手消息落库 |
| `services/ai/src/main/java/com/anynote/ai/model/vo/ChatMessageVO.java` | 修改 | 将持久化 JSON 标注转为字符串数组，历史空值按空数组返回 |
| `services/ai/src/main/resources/mapper/ChatMessageMapper.xml` | 修改 | 在现有 `resultMap` 与列清单中映射 `answer_notices`，保证历史消息查询返回标注 |
| `services/ai/src/test/java/com/anynote/ai/service/impl/AgentRunServiceImplTest.java` | 修改 | 覆盖八类错误文案、未知兜底和标注落库 |
| `services/ai/src/test/java/com/anynote/ai/model/vo/ChatMessageVOTest.java` | 修改 | 验证消息响应同时转换引用和回答标注 |
| `infra/sql/migrations/2026-11-17-ai-answer-notices.sql` | 新增 | 手动为 `a_chat_message` 增加 JSON 标注列，保存运行降级信息 |
| `infra/sql/anynote.sql` | 修改 | 同步全量建库结构，避免新环境缺少标注列 |
| `openapi/specs/ai.json` | 修改（生成物） | 由 `pnpm openapi:generate` 从真实 Springdoc 生成并提交，CI `openapi-check` 卡 diff，应审查 Java 源头 |

## 前端

| 文件 | 状态 | 作用与原因 |
|---|---|---|
| `apps/web/src/features/ai/schemas.ts` | 修改 | 定义三种回答标注并解析历史消息字段，保证服务端数据进入状态层 |
| `apps/web/src/features/ai/use-chat-stream.ts` | 修改 | 消费完成事件并在历史恢复时保留标注，流式与刷新后的表现一致 |
| `apps/web/src/features/ai/components/message-item.tsx` | 修改 | 在回答和引用列表下方以已确认的小号次要文字逐行显示标注 |
| `apps/web/src/lib/ai/sse.ts` | 修改 | 保留 Java 分类后的五句新错误文案，避免前端重新覆盖成通用错误 |
| `apps/web/src/features/ai/components/__tests__/message-item.test.tsx` | 修改 | 覆盖三种标注、无标注和流式不显示 |
| `apps/web/src/features/ai/components/__tests__/citation-answer.test.tsx` | 修改 | 验证空片段仍展示标题与定位且不产生空引用块 |
| `apps/web/src/features/ai/__tests__/use-chat-stream.test.tsx` | 修改 | 验证完成事件标注与历史 hydration，并补齐新字段夹具 |
| `apps/web/src/lib/ai/__tests__/sse.test.ts` | 修改 | 先复现再验证五句分类错误文案均能透传，未知信息仍使用兜底 |

## 运行配置与文档

| 文件 | 状态 | 作用与原因 |
|---|---|---|
| `infra/docker/nacos/configs/anynote-ai-harness.yml` | 修改 | 显式配置 `prefetch-enabled: false`，使部署默认与代码一致 |
| `.claude/openspec/changes/2026-11-17-knowledge-agent-v3.md` | 新增 | 固定事件、失败、标注、持久化契约及本次确认不做的范围 |
| `docs/ai-refactor/AI_REFACTOR_PLAN.md` | 修改 | 回写 `done_when` 和分级校验表，消除通用知识与零证据规则的矛盾 |
| `docs/ai-refactor/KNOWLEDGE_RETRIEVAL_PLAN.md` | 修改 | 更新引用、未找到、预取、版本 3 指令与示例，使其符合实现 |
| `docs/ai-refactor/KNOWLEDGE_AGENT_V3_PLAN.md` | 修改 | 标记已实施并记录文案、样式、证据上限、自动补注和评测范围决策 |
| `docs/ai-refactor/AI_MILESTONES.md` | 修改 | 记录 57 次真实模型重放、Token 与预取消融、工程验证及质量边界 |
| `docs/ai-refactor/README.md` | 修改 | 更新版本 3 方案入口状态，避免导航仍显示未实施 |
| `CLAUDE.md` | 修改 | 同步上下文导航中的版本 3 实施与重放状态 |
| `docs/changelist/2026-11-17-knowledge-agent-v3.md` | 新增 | 按实际 Git 结果汇总本批文件、验证和审计重点 |

## 审计要点

1. **防伪造底线**：重点看 `response.py` 与 `loop.py`，无效编号或不匹配原文必须先修复、最终移除，不能因降级而保留伪造引用。
2. **终态与提示生命周期**：纯文本完成、收束轮正文、一次性修复提示和持续收束约束共同改变模型轮次，需结合脚本化用例审查。
3. **上下文成本**：工具 JSON 不得回到系统提示，Manifest 引用与预算的一份计数必须同时保留；真实模型首轮下降 3846 token。
4. **错误文案双白名单**：Java 与 `lib/ai/sse.ts` 必须同时接受已确认分类文案，未知上游信息仍统一兜底。
5. **持久化契约**：迁移需手动执行；Mapper `resultMap`、VO、OpenAPI 和前端 hydration 任一层漏掉都会导致刷新后标注消失。
6. **评测边界**：需澄清重放仍有基础设施与无进展失败，个别回答引用支撑不足；本批明确不实现通用评分器或自动补注。
