# 2026-11-14 AI 模块 M16.2：Harness 内核、工程化与供应商管理

> 里程碑：[`docs/ai-refactor/AI_MILESTONES.md`](../ai-refactor/AI_MILESTONES.md) M16.2
> 方案：[`docs/ai-refactor/AI_REFACTOR_PLAN.md`](../ai-refactor/AI_REFACTOR_PLAN.md) §5
> 分支：`dev`（按用户要求未新切分支）

## 概览

| 指标 | 数值 |
|---|---|
| 变更文件 | 183 个：新增 100 / 修改 36 / 删除 47（含本清单） |
| 已跟踪文件行数 | +2324 / −3301（`git diff --shortstat`，不含新增文件） |
| 新增文件行数 | 7208 行（按 `git ls-files --others --exclude-standard` 逐文件统计，含本清单 253 行） |
| 主要目录分布 | `ai-service` 125 个、Java `services/ai` 18 个、Web 21 个、`infra` 10 个、文档/契约/CI 9 个 |

本批采用破坏性升级：删除 Python 旧对话、PDF 与 LangChain/Chroma，不保留过渡期适配；新增 Harness、内部签名、Nacos 生命周期、Docker/CI、独立 Whisper，以及仅 `ADMIN_X` 可用的供应商外部 CRUD 和双端页面。

### 验证结果

| 命令 / 场景 | 实际结果 |
|---|---|
| Docker `pytest` | 37/37 通过，覆盖内核四类确定性测试与五类假模型事件序列 |
| Docker `mvn test` | 30 个 reactor 模块全部 SUCCESS；`services/ai` 45/45 |
| Docker Web 类型/格式 | `pnpm --filter web typecheck` 通过；本批 21 个前端文件 Biome 通过 |
| Docker Web 单测 | 本批定向 57/57、修正后供应商 12/12；全量最后一轮 2036/2040，4 个既有文件单独复跑 58/58，不宣称全量全绿 |
| Docker Compose 测试 | 新增部署用例通过；全量 4/5，旧断言未计入现行 Gateway 回环端口，非本批问题未改 |
| OpenAPI | Docker 内标准 `openapi/generate.sh` 成功；仅 `ai.json` 变化，其余 5 份 baseline 不变 |
| 最小 Agent 容器 E2E | 假快照 + 假 OpenAI SSE 跑通；无签名 401；13 个连续事件、5 tokens、`ANSWERED`，无令牌/Key 泄漏 |
| Nacos / 容器 | Harness 与 Whisper 均注册带版本、停止后注销；在线镜像无 `torch` |
| 管理端真实栈 Playwright | 4/4：桌面/移动管理员 CRUD、普通用户拒绝；直接 API 返回 `A0301`；日志无测试 Key |
| Docker bundle 预算 | 桌面 302.0/310KB、移动 245.5/250KB、编辑器 16.1/250KB，全部通过 |

## ai-service：目标结构与 Harness

| 文件 | 状态 | 作用与原因 |
|---|---|---|
| `ai-service/.python-version` | 新增 | 固定 Python 3.12.14，避免宿主解释器漂移 |
| `ai-service/.gitignore` | 修改 | 忽略 pytest 覆盖率与缓存，不将验证产物混入版本库 |
| `ai-service/app.py` | 重写 | 在线入口仅挂载 Harness/健康路由，集中生命周期与依赖注入，不再打印密钥 |
| `ai-service/agents/__init__.py` | 新增 | 标记版本化 Agent 包 |
| `ai-service/agents/minimal/__init__.py` | 新增 | 标记最小 Agent 包 |
| `ai-service/agents/minimal/agent.py` | 新增 | 从受控文件加载最小 Agent 契约与指令 |
| `ai-service/agents/minimal/agent.yaml` | 新增 | 固定 minimal Agent 名称、版本、逻辑模型与空工具集 |
| `ai-service/agents/minimal/instructions.md` | 新增 | 提供无工具最小 Agent 的可执行指令 |
| `ai-service/api/__init__.py` | 新增 | 标记 FastAPI 路由包 |
| `ai-service/api/errors.py` | 新增 | 将签名、参数和内部异常转换为统一且已确认的错误响应 |
| `ai-service/api/health.py` | 新增 | 提供无需内部签名的 `/healthz` 健康检查 |
| `ai-service/api/runs.py` | 新增 | 提供运行 SSE、取消、心跳及断开后的收尾处理 |
| `ai-service/clients/__init__.py` | 新增 | 标记外部客户端包 |
| `ai-service/clients/model_provider.py` | 新增 | 每次新运行经内部签名读取 Java 模型配置快照，凭据仅入内存 |
| `ai-service/clients/nacos.py` | 新增 | 实现注册、心跳、注销、版本元数据、配置合并与热监听，并将 SDK 文件写入临时目录 |
| `ai-service/core/__init__.py` | 修改 | 更新核心包说明以匹配配置、日志和鉴权职责 |
| `ai-service/core/auth.py` | 新增 | 实现与 Java/协同一致的 HMAC 签名、五分钟窗口和用户令牌校验 |
| `ai-service/core/config.py` | 重写 | 收拢 Settings/get_settings，并用 RuntimeConfigStore 原子替换热配置 |
| `ai-service/core/errors.py` | 新增 | 集中错误码映射及已确认的用户提示常量 |
| `ai-service/core/logger.py` | 重写 | 改为标准输出 JSON 日志，移除只读镜像不可写的本地文件日志 |
| `ai-service/harness/__init__.py` | 新增 | 标记与 FastAPI 无关的内核包 |
| `ai-service/harness/action/__init__.py` | 新增 | 标记行动面包 |
| `ai-service/harness/action/plane.py` | 新增 | 串联参数校验、身份绑定、策略、超时执行、错误分类和观察外置 |
| `ai-service/harness/action/policy.py` | 新增 | 绑定用户/运行/Agent 身份，并只允许契约内的只读工具 |
| `ai-service/harness/action/registry.py` | 新增 | 注册工具 schema、处理器与执行边界，限制运行可见行动面 |
| `ai-service/harness/budget.py` | 新增 | 以中间件检查轮数、工具数、墙钟、上下文预算并检测无进展 |
| `ai-service/harness/context/__init__.py` | 新增 | 标记上下文构建包 |
| `ai-service/harness/context/builder.py` | 新增 | 分层编译模型输入、分配预算、外置大证据并生成 Manifest；复用历史摘要 |
| `ai-service/harness/context/compaction.py` | 新增 | 使用 `fast` 模型压缩较早历史并记录真实用量 |
| `ai-service/harness/context/manifest.py` | 新增 | 定义不含正文的来源、权限、转换和哈希清单 |
| `ai-service/harness/context/policy.py` | 新增 | 固定指令/证据信任边界与不可信内容定界符 |
| `ai-service/harness/events.py` | 新增 | 实现统一事件信封、单调序号、有界队列、心跳和 SSE 编解码 |
| `ai-service/harness/loop.py` | 新增 | 实现 Prepare/Model/Act/Observe/Verify 循环及完成、失败、取消传播 |
| `ai-service/harness/middleware.py` | 新增 | 定义 12 个挂载点和放行、修改、短路、追加决定 |
| `ai-service/harness/models.py` | 新增 | 定义运行、工具、证据、用量、工作区与状态数据模型 |
| `ai-service/harness/runtime.py` | 新增 | 管理进程内运行会话、配置快照、取消、终态清理和关闭 |
| `ai-service/harness/state.py` | 新增 | 以显式迁移表拒绝非法或终态后状态变化 |
| `ai-service/harness/trace/__init__.py` | 新增 | 标记 Trace 包 |
| `ai-service/harness/trace/middleware.py` | 新增 | 以 span 形态记录上下文、模型、行动、状态和验证，不保存正文 |
| `ai-service/harness/verify/__init__.py` | 新增 | 标记验证器包 |
| `ai-service/harness/verify/framework.py` | 新增 | 提供确定性规则接口与问题汇总，具体规则留 M16.6 |
| `ai-service/models/__init__.py` | 新增 | 标记模型接入包 |
| `ai-service/models/base.py` | 新增 | 定义与传输无关的流式模型协议 |
| `ai-service/models/catalog.py` | 新增 | 将逻辑名映射到供应商模型，并校验启停、清单和知识出域标记 |
| `ai-service/models/openai_compatible.py` | 新增 | 实现 OpenAI SSE、工具片段组装、四种超时、无输出重试与用量 |
| `ai-service/models/router.py` | 新增 | 将 Agent 逻辑名路由到协议适配器 |
| `ai-service/models/scripted.py` | 新增 | 提供可延迟、可抛错的脚本化假模型供确定性测试 |
| `ai-service/pytest.ini` | 新增 | 固定 pytest 测试目录和 asyncio 生命周期 |
| `ai-service/requirements/online.in` | 新增 | 声明不含 torch 的在线直接依赖 |
| `ai-service/requirements/indexing.in` | 新增 | 声明索引依赖，包含 ES、pdfplumber 与 pypdf，供 M16.4 使用 |
| `ai-service/requirements/whisper.in` | 新增 | 声明独立 Whisper/torch 依赖及旧包构建前置 |
| `ai-service/requirements/test.in` | 新增 | 将 pytest 测试依赖与运行依赖分离 |
| `ai-service/requirements/online-linux.lock.txt` | 新增·生成物 | `uv pip compile --python-platform x86_64-manylinux_2_28` 产出；在线镜像使用，无专门 diff CI |
| `ai-service/requirements/online-windows.lock.txt` | 新增·生成物 | 同命令以 Windows 平台产出；供本机宿主开发使用 |
| `ai-service/requirements/indexing-linux.lock.txt` | 新增·生成物 | 锁定 Linux 索引传递依赖；无专门 diff CI |
| `ai-service/requirements/indexing-windows.lock.txt` | 新增·生成物 | 锁定 Windows 索引传递依赖；无专门 diff CI |
| `ai-service/requirements/whisper-linux.lock.txt` | 新增·生成物 | 锁定 Whisper/torch 与 setuptools/wheel；镜像安装使用，无专门 diff CI |
| `ai-service/requirements/whisper-windows.lock.txt` | 新增·生成物 | 锁定 Windows Whisper 依赖；无专门 diff CI |
| `ai-service/requirements/test-linux.lock.txt` | 新增·生成物 | 锁定 pytest 环境；Docker/CI 安装使用，无专门 diff CI |
| `ai-service/tests/__init__.py` | 新增 | 标记测试包，支持公共构造器导入 |
| `ai-service/tests/conftest.py` | 新增 | 提供确定性计数器、运行与 Harness 公共构造器 |
| `ai-service/tests/test_action.py` | 新增 | 覆盖参数错误、身份绑定、策略拒绝、超时、分类错误与大结果外置 |
| `ai-service/tests/test_auth_api.py` | 新增 | 覆盖跨语言签名向量、鉴权文案、运行 SSE、参数错误与旧路由删除 |
| `ai-service/tests/test_clients.py` | 新增 | 验证快照请求签名、响应解析和 SecretStr 脱敏 |
| `ai-service/tests/test_context.py` | 新增 | 覆盖历史压缩复用、大证据引用、不可信分层与上下文预算 |
| `ai-service/tests/test_harness_loop.py` | 新增 | 覆盖正常完成、参数修正、工具超时、预算耗尽、无进展与取消事件 |
| `ai-service/tests/test_middleware.py` | 新增 | 固定中间件修改、短路、顺序与统一状态提交 |
| `ai-service/tests/test_models.py` | 新增 | 覆盖模型重试、工具片段输出后禁重放、四种超时、用量和出域 |
| `ai-service/tests/test_nacos.py` | 新增 | 覆盖注册、心跳、热合并、监听移除与注销 |
| `ai-service/tests/test_runtime.py` | 新增 | 覆盖活跃运行取消与重复取消的终态返回 |
| `ai-service/tests/test_state.py` | 新增 | 覆盖正常、取消、非法及终态迁移 |
| `ai-service/tests/test_verifier.py` | 新增 | 验证规则按注册顺序汇总问题 |
| `ai-service/tests/test_whisper.py` | 新增 | 覆盖 SRT 转换、独立健康检查和 Whisper 内部鉴权 |
| `ai-service/whisper/__init__.py` | 新增 | 标记独立 Whisper 包 |
| `ai-service/whisper/api.py` | 新增 | 提供带内部签名和用户令牌的异步转写 SSE 端点 |
| `ai-service/whisper/app.py` | 新增 | 创建独立 FastAPI 生命周期、Nacos 和子进程执行器 |
| `ai-service/whisper/models.py` | 新增 | 定义独立转写请求模型 |
| `ai-service/whisper/service.py` | 新增 | 在子进程下载/转写/清理临时文件，经 Redis 发布状态与心跳 |
| `ai-service/whisper_app.py` | 新增 | 提供独立 uvicorn 启动入口及标准 main 保护 |

## ai-service：破坏性删除

| 文件 | 状态 | 作用与原因 |
|---|---|---|
| `ai-service/constants/__init__.py` | 删除 | 旧常量包随旧链路移除 |
| `ai-service/constants/chat_model_constants.py` | 删除 | 字符串前缀模型分派由逻辑目录替代 |
| `ai-service/constants/chat_prompt_templates.py` | 删除 | 旧提示词常量不再由新 Harness 使用 |
| `ai-service/constants/rag_constants.py` | 删除 | 旧 PDF 内存索引路径随实现删除 |
| `ai-service/constants/redis_channel_constants.py` | 删除 | Redis 频道由独立 Whisper 服务内聚管理 |
| `ai-service/constants/whiser_constants.py` | 删除 | 旧 Whisper 全局路径配置移除 |
| `ai-service/constants/whisper_task_status.py` | 删除 | 空常量文件不再保留 |
| `ai-service/controller/__init__.py` | 删除 | 旧 controller 平铺目录退役 |
| `ai-service/controller/chat_controller.py` | 删除 | 旧 Python 对话端点按破坏性决策直接移除 |
| `ai-service/controller/ffmpeg_controller.py` | 删除 | 空控制器不再保留 |
| `ai-service/controller/rag_controller.py` | 删除 | 旧 PDF 问答端点由后续新运行协议替代 |
| `ai-service/controller/whisper_controller.py` | 删除 | Whisper 路由迁至独立进程 |
| `ai-service/core/executors.py` | 删除 | 模块级进程池改为应用生命周期管理 |
| `ai-service/core/minio.py` | 删除 | 旧 PDF 下载链路的 MinIO 全局配置移除 |
| `ai-service/core/nacos.py` | 删除 | 无注销/监听的旧 Nacos 实现由 clients/nacos.py 替代 |
| `ai-service/core/oss.py` | 删除 | 旧对象存储抽象不再被在线 Harness 使用 |
| `ai-service/core/oss_factory.py` | 删除 | 模块级 OSS_TYPE 分支随旧链路删除 |
| `ai-service/core/redis.py` | 删除 | 硬编码 localhost 的 Redis 连接池移除 |
| `ai-service/core/redis_server.py` | 删除 | 同步轮询及全局 Redis 封装由独立 Whisper 异步客户端替代 |
| `ai-service/dependencies.py` | 删除 | get_settings 收拢回 core/config.py，避免两份配置入口 |
| `ai-service/enums/whisper_task_status.py` | 删除 | 状态值由独立 Whisper 领域模型统一处理 |
| `ai-service/exceptions/__init__.py` | 删除 | 旧异常包由统一 API 错误处理替代 |
| `ai-service/exceptions/business_exception.py` | 删除 | 无响应码的旧异常类型退役 |
| `ai-service/init/__init__.py` | 删除 | 旧启动初始化包移除 |
| `ai-service/init/check_data_path.py` | 删除 | 全局 DATA_PATH 启动写入改为明确临时目录与生命周期 |
| `ai-service/model/__init__.py` | 删除 | 旧平铺模型包退役 |
| `ai-service/model/bo/__init__.py` | 删除 | 旧 BO 导出不再需要 |
| `ai-service/model/bo/chat_message.py` | 删除 | 对话消息由 Harness 的 Pydantic 模型替代 |
| `ai-service/model/dto/__init__.py` | 删除 | 旧 DTO 聚合导出移除 |
| `ai-service/model/dto/audio_transcriptions_dto.py` | 删除 | 转写 DTO 迁至 whisper/models.py |
| `ai-service/model/dto/chat_dto.py` | 删除 | 旧对话请求随端点删除 |
| `ai-service/model/dto/file_download_dto.py` | 删除 | 旧下载返回值不再被新链路使用 |
| `ai-service/model/dto/rag_file_index_dto.py` | 删除 | 旧内存索引请求随实现删除 |
| `ai-service/model/dto/rag_query_dto.py` | 删除 | 旧 PDF 问答请求随端点删除 |
| `ai-service/model/vo/__init__.py` | 删除 | 旧 VO 聚合导出移除 |
| `ai-service/model/vo/chat_vo.py` | 删除 | 旧 OpenAI 外观 VO 由统一事件信封替代 |
| `ai-service/model/vo/res_data.py` | 删除 | dataclass 信封由 FastAPI 的统一异常响应模型替代 |
| `ai-service/requirements-mac.txt` | 删除 | 单一历史锁文件由分进程、分平台锁文件替代 |
| `ai-service/requirements.txt` | 删除 | 不可复现的全量依赖清单由三组运行依赖替代 |
| `ai-service/service/__init__.py` | 删除 | 旧 service 平铺目录退役 |
| `ai-service/service/chat_service.py` | 删除 | LangChain 对话与网页搜索空实现全部移除 |
| `ai-service/service/rag_service.py` | 删除 | 每次重新下载并向量化 PDF 的内存 RAG 实现移除 |
| `ai-service/service/whisper_service.py` | 删除 | 转写逻辑迁至独立 Whisper 服务 |
| `ai-service/utils/__init__.py` | 删除 | 旧工具包不再需要 |
| `ai-service/utils/file_util.py` | 删除 | 旧 requests 下载工具由独立进程内聚实现替代 |
| `ai-service/utils/model_util.py` | 删除 | 按字符串前缀分派模型的方式由逻辑目录替代 |

## services/ai：管理员契约与 Whisper 路由

| 文件 | 状态 | 作用与原因 |
|---|---|---|
| `services/ai/src/main/java/com/anynote/ai/controller/ModelProviderAdminController.java` | 新增 | 提供 `/v1/admin/model-providers` 的查询、新增、PUT 整体更新和删除，并强制管理员准入 |
| `services/ai/src/main/java/com/anynote/ai/controller/ModelProviderController.java` | 修改 | 内部只保留带 `@InnerAuth` 的快照读取，删除绕过管理员边界的写接口 |
| `services/ai/src/main/java/com/anynote/ai/harness/HarnessClient.java` | 修改 | Whisper 调用改用独立 Nacos 服务名，其余 Harness 流式行为不变 |
| `services/ai/src/main/java/com/anynote/ai/model/dto/ModelProviderCreateDTO.java` | 新增 | 新增时强制 API Key，校验 URL，并排除 Key 的 toString |
| `services/ai/src/main/java/com/anynote/ai/model/dto/ModelProviderUpdateDTO.java` | 新增 | 定义整体更新及空 Key 保留原凭据语义，避免外部读取旧 Key |
| `services/ai/src/main/java/com/anynote/ai/model/dto/ModelProviderUpsertDTO.java` | 删除 | 内部 upsert 由管理员专用新增/更新契约替代 |
| `services/ai/src/main/java/com/anynote/ai/model/vo/ModelProviderAdminVO.java` | 新增 | 外部仅暴露非敏感配置、版本和审计时间，不含 Key/密文 |
| `services/ai/src/main/java/com/anynote/ai/model/vo/ModelProviderSnapshotVO.java` | 修改 | 内部 Key 对 Gson 日志序列化不可见，Jackson 内部响应仍保留契约 |
| `services/ai/src/main/java/com/anynote/ai/properties/AiWhisperProperties.java` | 新增 | 绑定 `anynote.ai.whisper.service-name`，支持独立进程发现 |
| `services/ai/src/main/java/com/anynote/ai/security/SystemAdminGuard.java` | 新增 | 以现有 `SysUser.isAdminX` 强制 `ADMIN_X` 并返回操作者 ID |
| `services/ai/src/main/java/com/anynote/ai/service/ModelProviderService.java` | 修改 | 服务契约改为快照、列表、详情、新增、整体更新和删除 |
| `services/ai/src/main/java/com/anynote/ai/service/impl/ModelProviderServiceImpl.java` | 修改 | 实现管理员 CRUD、重复/不存在错误、AES-GCM 与空 Key 保留；沿用既有 resultMap SQL |
| `services/ai/src/test/java/com/anynote/ai/controller/ModelProviderAdminControllerTest.java` | 新增 | 覆盖五个管理员端点、操作者传递、无 Key 响应与参数失败 |
| `services/ai/src/test/java/com/anynote/ai/controller/ModelProviderControllerTest.java` | 修改 | 内部快照测试收敛到唯一保留端点 |
| `services/ai/src/test/java/com/anynote/ai/harness/HarnessClientIdleTimeoutTest.java` | 修改 | 注入独立 Whisper 配置，保持空闲超时覆盖 |
| `services/ai/src/test/java/com/anynote/ai/harness/HarnessClientTest.java` | 修改 | 新增 Whisper 独立服务名与签名请求验证 |
| `services/ai/src/test/java/com/anynote/ai/security/SystemAdminGuardTest.java` | 新增 | 覆盖 ADMIN_X 放行、普通角色与缺角色拒绝 |
| `services/ai/src/test/java/com/anynote/ai/service/impl/ModelProviderServiceImplTest.java` | 修改 | 覆盖 CRUD、空/新 Key、操作者、无敏感视图及日志脱敏 |

## Web：双端管理页面与测试

| 文件 | 状态 | 作用与原因 |
|---|---|---|
| `apps/web/src/features/model-providers/components/model-provider-settings.tsx` | 新增 | 同一数据模型提供桌面表格、移动卡片、新增/编辑表单与删除确认 |
| `apps/web/src/features/model-providers/components/model-provider-admin-only.tsx` | 新增 | 非管理员直接访问时展示已确认的拒绝文案 |
| `apps/web/src/features/model-providers/permissions.ts` | 新增 | 以 `roleKey=ADMIN_X` 控制双端入口可见性 |
| `apps/web/src/features/model-providers/query-keys.ts` | 新增 | 统一供应商列表缓存与失效边界 |
| `apps/web/src/features/model-providers/schemas.ts` | 新增 | 校验响应、URL、表单和模型列表；编辑不回填 Key |
| `apps/web/src/features/model-providers/use-model-providers.ts` | 新增 | 经生成的 `aiApi` 和 TanStack Query 完成 CRUD，更新空 Key 时省略字段 |
| `apps/web/src/features/model-providers/__tests__/model-provider-settings.test.tsx` | 新增 | 覆盖双端结构、Key 不回填、新增校验和删除确认 |
| `apps/web/src/features/model-providers/__tests__/schemas.test.ts` | 新增 | 覆盖 URL、模型去重、新增 Key 必填和编辑留空 |
| `apps/web/src/features/model-providers/__tests__/use-model-providers.test.tsx` | 新增 | 覆盖列表与增删改请求、路径参数、更新字段省略和缓存 |
| `apps/web/src/features/settings/sections.ts` | 修改 | 注册模型供应商分区并保持统一路由校验 |
| `apps/web/src/features/settings/components/settings-page.tsx` | 修改 | 桌面按管理员身份显示入口和动态加载管理面板 |
| `apps/web/src/features/settings/components/mobile-settings.tsx` | 修改 | 移动端提供同一完整 CRUD 并校验管理员身份 |
| `apps/web/src/features/settings/components/mobile-me.tsx` | 修改 | 仅管理员的移动端“我的”页显示供应商入口 |
| `apps/web/src/features/settings/components/mobile/settings-sections.ts` | 修改 | 移动端分区表与桌面保持一致 |
| `apps/web/src/features/settings/components/__tests__/settings.test.tsx` | 修改 | 覆盖桌面管理员入口和非管理员直接访问 |
| `apps/web/src/features/settings/components/__tests__/mobile-settings.test.tsx` | 修改 | 覆盖移动端供应商准入与组件渲染 |
| `apps/web/src/features/settings/components/__tests__/mobile-me.test.tsx` | 修改 | 覆盖移动端管理员入口及普通用户不可见 |
| `apps/web/src/features/settings/components/__tests__/mobile-settings-sections.test.ts` | 修改 | 更新双端分区一致性测试说明 |
| `apps/web/e2e/model-providers.spec.ts` | 新增 | 真实栈验证桌面 CRUD、无 Key 响应和普通用户 API/UI 拒绝 |
| `apps/web/e2e/mobile-model-providers.spec.ts` | 新增 | 真实栈验证移动端 CRUD 与普通用户拒绝 |
| `apps/web/e2e/support/model-provider.ts` | 新增 | 创建 dev 管理员并登录；用户名以十六进制进入 SQL，避免嵌套 shell 引号破坏 |

## infra 与 CI

| 文件 | 状态 | 作用与原因 |
|---|---|---|
| `infra/Dockerfile.ai-service` | 新增 | 提供在线、测试、索引依赖和独立 Whisper 目标；在线不含 torch，Whisper 包含 ffmpeg 与构建前置 |
| `infra/Dockerfile.ai-service.dockerignore` | 新增 | 覆盖根排除规则，仅带入 AI 源码并排除凭据、日志、缓存和本地数据 |
| `infra/docker-compose.yaml` | 修改 | 新增只读 Harness 与可选 Whisper 服务、临时目录、健康检查、端口和内部密钥 |
| `infra/docker-compose.dev.yaml` | 修改 | 两个 Python 服务启动失败时均不自动重启，便于排查 |
| `infra/docker-compose.prod.yaml` | 修改 | prod 不发布 Python 端口，强制内部密钥、namespace、profile 与 Redis 密码 |
| `infra/.env.example` | 修改 | 登记 Harness/Whisper 调试端口，同时注明 prod 不发布 |
| `infra/docker/nacos/configs/anynote-ai-harness.yml` | 新增 | 提供预算、四类超时、历史/大结果和重试的热更新默认值 |
| `infra/docker/nacos/configs/anynote-ai-whisper.yml` | 新增 | 为 Whisper 提供独立空配置 Data ID，避免复用 Harness 配置 |
| `infra/docker/nacos/configs/anynote-ai-dev.yml` | 修改 | 新增 Java 侧独立 Whisper 服务名映射 |
| `infra/tests/test_compose.py` | 修改 | 验证只读镜像、Whisper profile、独立服务名及 prod 端口边界 |
| `.github/workflows/test.yml` | 新增 Python job | 在 Python 3.12.14 容器中使用锁文件安装并运行 pytest |

## 契约与文档

| 文件 | 状态 | 作用与原因 |
|---|---|---|
| `.claude/openspec/changes/2026-11-14-ai-model-provider-admin.md` | 新增 | 在实现前固定管理员 CRUD、凭据边界、双端页面与验证契约 |
| `openapi/specs/ai.json` | 修改·生成物 | 标准 `openapi/generate.sh` 产出；新增 5 个管理员端点并移除内部写端点，`openapi-check` 会卡 baseline diff |
| `docs/ai-refactor/AI_MILESTONES.md` | 修改 | 勾选 M16.2 任务并记录实际验收、非本批问题和限制 |
| `docs/ai-refactor/AI_REFACTOR_PLAN.md` | 修改 | 取消过渡期方案、调整 indexer 时点并登记管理员运行期 CRUD |
| `docs/ai-refactor/README.md` | 修改 | 收紧破坏性升级口径并更新 M16.2 完成状态 |
| `README.md` | 修改 | 更新 Python 版本、双进程启动、锁文件、测试和文档入口 |
| `CLAUDE.md` | 修改 | 更新当前 AI 技术栈、端口、Harness 边界与里程碑导航 |
| `docs/changelist/2026-11-14-ai-harness-kernel.md` | 新增 | 按实际 Git 结果提供本批逐文件审计清单与验证证据 |

## 审计要点

1. **配置与写入权限**：外部写操作只有 `/v1/admin/model-providers` 并强制 `ADMIN_X`；内部写端点已删除，Python 仅在每次新运行读取快照，已开始运行不受 CRUD 影响。
2. **凭据边界**：外部 VO 不含 Key；新增/更新 DTO 排除 toString；内部快照 Key 对 Gson 日志不可见。真实 E2E 同时检查了响应与 AI 容器日志。
3. **模型重试**：文本或工具参数片段一旦到达都禁止重试；四种超时独立，总预算跨重试共享，避免重复运行与无限延长。
4. **内核与传输分离**：`harness/` 不依赖 FastAPI；状态、预算、行动面、上下文和验证均有确定性测试，SSE 只是事件的一种承载。
5. **只读容器与 Nacos**：Nacos SDK 的日志、快照和 failover 目录均指向临时可写目录；正常关闭必须注销实例，prod 不发布 Python 端口。
6. **验证口径**：Web 全量和 Compose 全量仍有非本批波动/旧断言，单独复跑与新增用例结果已如实列出；Whisper 未做真实音频转写，真实模型容量留 M16.8。
