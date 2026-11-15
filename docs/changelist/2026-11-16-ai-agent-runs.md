# Changelist: M16.6 知识检索 Agent 与运行端点

> 分支：`dev` | 日期：2026-11-16 | OpenSpec：[`2026-11-15-ai-agent-runs.md`](../../.claude/openspec/changes/2026-11-15-ai-agent-runs.md)

## 概览

按 `git status --porcelain=v1 -uall` 与 `git ls-files --others --exclude-standard` 统计，本批共 81 个文件：修改 41、新增 40（含本清单）、删除 0。已跟踪文件为 `41 files changed, 1217 insertions(+), 469 deletions(-)`；新增文件共 3,287 行（含本清单；按未跟踪文件逐文件计数）。清单编写时 `git diff --stat dev...HEAD` 为空，改动尚未提交；后续按仓库规约分服务提交。

目录分布：`services` 38 个、`ai-service` 19 个、`apps` 17 个、`infra` 2 个、`docs` 2 个、`.claude` 1 个、`openapi` 1 个、仓库根目录 1 个。

### 验证结果

| 命令 / 场景 | 实际结果 |
|---|---|
| 本机 Maven：`mvn -o install -pl ai -am "-Dtest.excluded.groups=integration"` | `services/ai` **79/79** 通过，上游 reactor 模块 `BUILD SUCCESS` |
| 本机 Web：`pnpm --filter web exec vitest run src/features/ai src/lib/ai` | **13 个测试文件、96/96 用例通过**；含旧模型偏好与首帧改名后的成功/失败收尾回归 |
| 本机 Web：`pnpm --filter web typecheck` | `tsc --noEmit` 通过 |
| 本机 Python：`PYTHONPATH=. uv run --python 3.12 --with-requirements requirements/test-linux.lock.txt pytest` | 首次 **356 passed、20 skipped、2 个时序断言失败**；两项单独复跑通过，第二次全量 **358 passed、20 skipped**；未修改相关代码，未用 Docker 挂载运行单测 |
| Web 生产构建与容器 | 使用 `NEXT_PUBLIC_APP_URL=http://anynote-web:3000` 执行 dev Compose 构建成功；仅改运行时环境会被镜像配置守卫拒绝，已按守卫要求重建 |
| Docker 浏览器 E2E：`playwright test --project=chromium e2e/ai-stream.spec.ts` | 初次测试容器缺 Chromium/动态库，补齐后暴露首帧改名收尾问题；修复后最终 **2/2 通过** |
| 本地 Docker 脚本化供应商 + 真实服务栈验收 | 默认范围、单知识库、单资料引用问答，以及未找到、越权隔离、取消上游、浏览器断线恢复全部通过；最终报告 `tmp/m16-6/report.json` 为 `passed=true` |
| 当前源码容器与索引 | Harness 重建后可加载七工具知识检索 Agent；旧 schema 2 索引已重建并切换到 schema 3，验收时水位健康且滞后为 0 |
| OpenAPI baseline | 从运行中的 Gateway 获取并归一化 `ai.json`；存在 `/v1/agent/runs` 创建/查询/取消及 PDF SSE 路径，旧 `/chat/completions*` 路径不存在 |
| MySQL 迁移 | 执行 `2026-11-15-ai-agent-runs.sql` 并确认运行表及会话/消息新增列 |
| 验收环境清理 | 临时供应商已删除，Nacos 映射已恢复，临时模型容器与 Playwright 缓存卷已删除，AI 容器已移除验收用临时主密钥 |
| `git diff --check` | 收尾修改后通过 |

### ai-service

| 文件 | 状态 | 作用与原因 |
|---|---|---|
| `ai-service/agents/__init__.py` | 修改 | 将知识检索 Agent 加入注册表，使 Harness 可以按契约加载它 |
| `ai-service/agents/knowledge_retrieval/__init__.py` | 新增 | 声明 Agent 包，供统一注册入口导入 |
| `ai-service/agents/knowledge_retrieval/agent.py` | 新增 | 加载 Agent 契约、指令与上下文策略，供运行时构建知识检索 Agent |
| `ai-service/agents/knowledge_retrieval/agent.yaml` | 新增 | 固定 Agent 名称、版本、模型逻辑名与只读工具集合 |
| `ai-service/agents/knowledge_retrieval/context_policy.yaml` | 新增 | 声明问题、证据和历史上下文的编译策略 |
| `ai-service/agents/knowledge_retrieval/instructions.md` | 新增 | 限定模型依据授权证据回答并采用结构化终态 |
| `ai-service/agents/knowledge_retrieval/response.py` | 新增 | 验证引用与原文、处理空证据和澄清结果，并过滤外链与图片 |
| `ai-service/app.py` | 修改 | 将知识检索 Agent 运行能力接入在线应用生命周期 |
| `ai-service/harness/context/builder.py` | 修改 | 将检索证据和范围摘要编入 Agent 上下文 |
| `ai-service/harness/events.py` | 修改 | 扩展统一运行事件字段并控制首帧前心跳时序 |
| `ai-service/harness/loop.py` | 修改 | 支持 Agent 明确结束、知识引用事件及验证后的回答输出 |
| `ai-service/harness/middleware.py` | 修改 | 为知识检索运行挂载首轮预取与会话上下文处理中间件 |
| `ai-service/harness/models.py` | 修改 | 增加 Agent 结构化终态数据模型，避免从自然语言推断结果类型 |
| `ai-service/harness/runtime.py` | 修改 | 将检索工具和会话中间件注册到运行时 |
| `ai-service/retrieval/session.py` | 修改 | 暴露已授权证据并支持首轮搜索预取和回答后引用校验 |
| `ai-service/tests/test_event_bus.py` | 新增 | 覆盖运行事件顺序和首帧前禁止心跳 |
| `ai-service/tests/test_harness_knowledge_agent.py` | 新增 | 覆盖知识检索 Agent 的工具交互、终态和引用事件 |
| `ai-service/tests/test_knowledge_retrieval_agent.py` | 新增 | 覆盖引用/原文验证、未找到、澄清与输出过滤 |
| `ai-service/tests/test_runtime.py` | 修改 | 验证知识检索 Agent 注册、运行和取消链路 |

### apps/web

| 文件 | 状态 | 作用与原因 |
|---|---|---|
| `apps/web/e2e/ai-stream.spec.ts` | 修改 | 将浏览器关键路径切换到新 Agent SSE 端点并断言运行终态 |
| `apps/web/src/components/editor/__tests__/slash-items.test.ts` | 修改 | 断言编辑器命令列表不再暴露本批移除的续写入口 |
| `apps/web/src/components/editor/core/tiptap-editor.tsx` | 修改 | 从编辑器命令依赖中移除 AI 续写处理器 |
| `apps/web/src/components/editor/extensions/slash-command.ts` | 修改 | 调整 Slash 命令扩展以匹配续写入口移除后的命令列表 |
| `apps/web/src/components/editor/extensions/slash-items.ts` | 修改 | 删除依赖旧 completion API 的 AI 续写菜单项 |
| `apps/web/src/components/editor/presets/full.ts` | 修改 | 从完整编辑器预设移除续写命令扩展依赖 |
| `apps/web/src/components/editor/presets/index.ts` | 修改 | 更新预设导出以反映续写功能移除 |
| `apps/web/src/components/editor/presets/types.ts` | 修改 | 删除编辑器预设中已无调用方的续写回调类型 |
| `apps/web/src/features/ai/__tests__/use-chat-stream.test.tsx` | 修改 | 覆盖新运行事件、引用、错误过滤及首帧改名后的成功与失败收尾，防止正式会话停在思考中 |
| `apps/web/src/features/ai/components/__tests__/chat-panel.test.tsx` | 新增 | 复现并固定聊天页不发送旧厂商模型偏好，避免运行在进入模型前失败 |
| `apps/web/src/features/ai/components/chat-panel.tsx` | 修改 | 省略运行请求的 `model`，由知识检索 Agent 使用已配置的 `agent_main`，消除旧模型名导致的失败 |
| `apps/web/src/features/ai/schemas.ts` | 修改 | 定义新 Agent 运行事件、引用与终态响应校验结构 |
| `apps/web/src/features/ai/use-chat-stream.ts` | 修改 | 适配新 SSE 事件，并同步迁移活跃运行的会话 key 与控制器，保证改名后正文和终态写入当前会话 |
| `apps/web/src/features/notes/components/mobile/note-editor-mobile.tsx` | 修改 | 移除移动编辑器中旧 AI 续写回调 |
| `apps/web/src/features/notes/components/note-editor.tsx` | 修改 | 移除桌面编辑器中旧 AI 续写回调 |
| `apps/web/src/lib/ai/__tests__/sse.test.ts` | 修改 | 覆盖事件信封解析及仅展示已确认的运行错误文案 |
| `apps/web/src/lib/ai/sse.ts` | 修改 | 解析新事件协议、校验 SSE 序号并将未知错误收敛到已确认文案 |

### services/ai

| 文件 | 状态 | 作用与原因 |
|---|---|---|
| `services/ai/src/main/java/com/anynote/ai/AnyNoteAIApplication.java` | 修改 | 启用运行 Trace 定期清理任务所需的调度配置 |
| `services/ai/src/main/java/com/anynote/ai/controller/AgentRunController.java` | 新增 | 提供创建 SSE 运行、查询运行状态和取消运行端点 |
| `services/ai/src/main/java/com/anynote/ai/controller/ChatController.java` | 修改 | 删除两个旧 completion 入口并将会话消息转换为结构化引用响应 |
| `services/ai/src/main/java/com/anynote/ai/controller/RagController.java` | 修改 | 将单资料 PDF 问答改为知识检索 Agent 运行 SSE |
| `services/ai/src/main/java/com/anynote/ai/harness/HarnessClient.java` | 修改 | 调用 Python Agent 运行与取消内部端点并解析统一事件信封 |
| `services/ai/src/main/java/com/anynote/ai/harness/dto/HarnessRunCancelDTO.java` | 新增 | 定义转发给 Python Harness 的运行取消请求 |
| `services/ai/src/main/java/com/anynote/ai/mapper/AgentRunEventMapper.java` | 新增 | 声明运行 Trace 事件过期清理数据库操作 |
| `services/ai/src/main/java/com/anynote/ai/mapper/AgentRunMapper.java` | 新增 | 声明按用户读取运行记录的持久化操作 |
| `services/ai/src/main/java/com/anynote/ai/mapper/ChatMessageMapper.java` | 修改 | 增加按会话与运行标识读取助手消息的操作 |
| `services/ai/src/main/java/com/anynote/ai/model/dto/AgentRunRequestDTO.java` | 新增 | 校验客户端创建知识检索运行的请求字段 |
| `services/ai/src/main/java/com/anynote/ai/model/dto/AgentRunScopeDTO.java` | 新增 | 描述知识库 ID 与实体引用构成的检索范围 |
| `services/ai/src/main/java/com/anynote/ai/model/dto/HarnessRunRequestDTO.java` | 新增 | 组装包含用户身份、范围和运行标识的内部 Harness 请求 |
| `services/ai/src/main/java/com/anynote/ai/model/po/AgentRunEventPO.java` | 新增 | 映射按运行和序号存储的 Trace 事件记录 |
| `services/ai/src/main/java/com/anynote/ai/model/po/AgentRunPO.java` | 新增 | 映射 Agent 运行状态、结果、用量与时间字段 |
| `services/ai/src/main/java/com/anynote/ai/model/vo/AgentRunCancelVO.java` | 新增 | 返回运行取消受理状态 |
| `services/ai/src/main/java/com/anynote/ai/model/vo/AgentRunEventVO.java` | 新增 | 定义 Python 到浏览器转发的统一事件信封 |
| `services/ai/src/main/java/com/anynote/ai/model/vo/AgentRunStatusVO.java` | 新增 | 返回用户可见的运行状态、回答及结构化引用 |
| `services/ai/src/main/java/com/anynote/ai/model/vo/ChatConversationDetailVO.java` | 新增 | 定义含结构化消息引用的会话详情响应 |
| `services/ai/src/main/java/com/anynote/ai/model/vo/ChatMessageVO.java` | 新增 | 将数据库 JSON 引用解析为 OpenAPI 声明的结构化数组 |
| `services/ai/src/main/java/com/anynote/ai/properties/AiIndexerProperties.java` | 新增 | 配置索引器健康探测服务名与请求参数 |
| `services/ai/src/main/java/com/anynote/ai/run/AgentRunTraceCleanupTask.java` | 新增 | 定期删除保留期限外的 Trace 事件 |
| `services/ai/src/main/java/com/anynote/ai/run/AiRunLimiter.java` | 修改 | 修复并发运行释放名额时计数竞争导致的限额不一致 |
| `services/ai/src/main/java/com/anynote/ai/run/DailyRunLimitService.java` | 新增 | 按用户与本地日期原子计入既有 AI 每日次数限制 |
| `services/ai/src/main/java/com/anynote/ai/run/IndexWatermarkClient.java` | 新增 | 查询索引器健康状态并仅映射批准的水位字段 |
| `services/ai/src/main/java/com/anynote/ai/service/AgentRunService.java` | 新增 | 声明创建、查询、取消 Agent 运行业务接口 |
| `services/ai/src/main/java/com/anynote/ai/service/impl/AgentRunServiceImpl.java` | 新增 | 校验运行权限与配额、转发事件并持久化回答及引用 |
| `services/ai/src/main/resources/mapper/AgentRunEventMapper.xml` | 新增 | 映射 Trace 事件清理 SQL |
| `services/ai/src/main/resources/mapper/AgentRunMapper.xml` | 新增 | 通过显式 `resultMap` 映射运行记录查询结果 |
| `services/ai/src/main/resources/mapper/ChatMessageMapper.xml` | 新增 | 通过显式 `resultMap` 映射会话消息查询结果 |
| `services/ai/src/test/java/com/anynote/ai/harness/HarnessClientTest.java` | 修改 | 覆盖运行事件信封解析与 Harness 取消请求 |
| `services/ai/src/test/java/com/anynote/ai/model/vo/ChatMessageVOTest.java` | 新增 | 验证持久化 JSON 引用转为结构化响应数组 |
| `services/ai/src/test/java/com/anynote/ai/run/AgentRunTraceCleanupTaskTest.java` | 新增 | 验证清理任务按 30 天保留期删除 Trace 事件 |
| `services/ai/src/test/java/com/anynote/ai/run/AiRunLimiterTest.java` | 修改 | 覆盖并发任务释放名额时计数器不会提前移除 |
| `services/ai/src/test/java/com/anynote/ai/run/IndexWatermarkClientTest.java` | 新增 | 验证水位白名单映射及索引器不可达降级结果 |
| `services/ai/src/test/java/com/anynote/ai/service/impl/AgentRunServiceImplTest.java` | 新增 | 覆盖运行落库、配额、权限、取消、断线收尾与引用读取 |

### services/api/anynote-api-ai

| 文件 | 状态 | 作用与原因 |
|---|---|---|
| `services/api/anynote-api-ai/src/main/java/com/anynote/ai/api/enums/ChatConversationType.java` | 修改 | 增加知识检索 Agent 会话类型 |
| `services/api/anynote-api-ai/src/main/java/com/anynote/ai/api/model/po/ChatConversation.java` | 修改 | 持久化会话检索范围 JSON |
| `services/api/anynote-api-ai/src/main/java/com/anynote/ai/api/model/po/ChatMessage.java` | 修改 | 持久化运行标识、引用 JSON 与结果类型 |

### infra、OpenAPI 与 OpenSpec

| 文件 | 状态 | 作用与原因 |
|---|---|---|
| `infra/sql/anynote.sql` | 修改 | 同步运行记录/Trace 表及会话、消息字段的基线结构 |
| `infra/sql/migrations/2026-11-15-ai-agent-runs.sql` | 新增 | 为已有数据库添加 M16.6 所需字段、表与索引 |
| `openapi/specs/ai.json` | 修改·生成物 | 从 Gateway 文档经 `openapi/normalize-cli.mjs` 更新 AI 契约；OpenAPI diff 检查会核对该 baseline |
| `.claude/openspec/changes/2026-11-15-ai-agent-runs.md` | 新增 | 记录已确认的外部路径、破坏性端点删除、事件、文案和验证契约 |
| `CLAUDE.md` | 修改 | 将 AI 重构进度指针同步到 M16.6 已完成，避免仓库规约停留于旧状态 |
| `docs/ai-refactor/AI_MILESTONES.md` | 修改 | 记录 M16.6 原始失败、两项根因修复及最终真实栈通过结果，并关闭该里程碑 |
| `docs/changelist/2026-11-16-ai-agent-runs.md` | 新增 | 按本批 Git 状态生成逐文件审计索引，供评审核对改动范围 |

## 审计要点

- 核对 `/api/ai/v1/agent/runs` 的 SSE 事件信封、取消/查询权限和旧 completion 路由删除范围。
- 核对 Python 工具执行前后的范围权限、证据引用验证、空证据终态和服务端回答过滤。
- 核对断开浏览器后继续落库、Trace 脱敏及 Trace 仅保存而不向浏览器转发；最终断连运行已恢复完整回答与引用。
- 核对聊天页不再发送旧厂商模型名，以及首帧改名后活跃运行的 key 与控制器同步迁移，避免成功正文丢失或失败终态停留在思考中。
- 核对并发与每日配额的原子计数、用户隔离和定期清理边界。
- 核对 MyBatis 新增 SELECT 均引用 XML `resultMap`，且数据库基线与迁移一致。
- 核对所有用户可见的新错误文案均来自已确认文案；本次续作未新增或修改用户可见提示。
