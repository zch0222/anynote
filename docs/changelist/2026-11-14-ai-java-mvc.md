# 2026-11-14 AI 模块 M16.1：Java 去 WebFlux、服务改名与 P1 凭据基础设施

> 里程碑：[`docs/ai-refactor/AI_MILESTONES.md`](../ai-refactor/AI_MILESTONES.md) M16.1
> 方案：[`docs/ai-refactor/AI_REFACTOR_PLAN.md`](../ai-refactor/AI_REFACTOR_PLAN.md) §4
> 分支：`feat/ai-java-mvc`（自 `dev` 切出，完成后 `--no-ff` 合并 `dev`）

## 概览

| 指标 | 数值 |
|---|---|
| 变更路径 | 164 个（已跟踪文件修改 145 / 删除 93，新增 105） |
| 已跟踪文件行数 | +261 / −4377（`git diff --shortstat`） |
| 新增文件行数 | 约 5019 行（`git ls-files --others` 统计，含 79 个仅包名/路径改名的 `services/ai` 文件） |
| 主要目录分布 | `services/ai` 100、`services/common` 18、`infra` 12、`api-ai` 7、`note` 6、web/CLI 7、docs/OpenAPI 7 |

按拍板执行：D9 改名不保留 `/api/aiNio/**` 别名；PDF 问答过渡期废弃；并发超限文案、Whisper 状态流 30 分钟上限、
P1 凭据按业务库 AES-GCM + 内部快照端点落地。

### 验证结果

| 命令 / 验证 | 结果 |
|---|---|
| `cd services && mvn test` | 31 个 reactor 模块 BUILD SUCCESS；`services/ai` 38 条、`note` 96 条 |
| `pnpm services:build` | BUILD SUCCESS（31 模块） |
| `pnpm typecheck` | 6/6 任务通过。此前 G2 的 3 处报错是本地 `packages/api-client/src` 生成物过期；按 6 份 baseline 重新生成后消失（该目录 gitignored，不入库） |
| `pnpm test` | 两轮均为 2020/2023 通过；每轮 3 条失败集中在 tasks 的日期时间组件（5s 超时 / 找不到「时间」label），单独重跑 45/45 通过，与本次改动无关，记为环境波动 |
| 依赖面 | `mvn dependency:tree -Dincludes=org.springframework:spring-webflux` 与 `io.projectreactor:reactor-netty-http`：ai/note/file/job/manage 均 0 命中 |
| OpenAPI | `openapi/specs/ai.json` 仅预期差异：删 `/rag/test`、`/rag/doc`；新增 3 个 P1 内部端点；`ServerSentEvent*` → 显式事件 schema。其余 5 份 baseline 不变 |
| 真实栈功能（本机 docker） | 12/12：会话列表、聊天 SSE 15 帧、落库 2 条、PDF 废弃文案、Whisper 状态流（初始 + Redis 推送）、P1 写/读/删；越权会话返回 JSON `A0300` |
| 并发（每流 60s / 5 事件/秒 / 300 事件） | 100：100/100（平台线程峰值 167）；500：500/500（169）；1000：998/1000（174）；2000：1999/2000（173）。失败项均为模拟上游连接被重置，无 Java 侧拒绝、无 OOM |
| 保留堆 | 2000 档 15s 时点 `gc.live.data.size` 增量约 182KiB/连接，低于 200KiB 预算 |
| 钉住 | 500 并发 + `-Djdk.tracePinnedThreads=full`：8 条记录均为首次初始化/短读；稳态上游读取与稳态 SSE 写入 0 条 |
| 故障 | 暂停上游后 43.2s 收到 failed 帧、助手消息带失败标记落库、恢复后新请求成功 |

> `pnpm openapi:generate` 在本机 Git Bash 下因 `node` 不在其 PATH 失败（脚本环境问题，CI Linux 不受影响）；
> 本次按脚本等价步骤手动执行 fetch + `normalize-cli.mjs` + `openapi-typescript`，结果与上面的 baseline 一致。

## services/ai（主体）

包 `com.anynote.ai.nio` → `com.anynote.ai` 的机械改名涉及 79 个文件，git 会按内容识别为 rename，逐文件差异见
`git diff --stat`；下表列出行为变化或新增的文件。

| 文件 | 状态 | 作用与原因 |
|---|---|---|
| `services/ai/pom.xml` | 修改 | artifactId/name 改 `anynote-modules-ai`；去掉 webflux、reactor-test、`anynote-common-ai-fastapi` 依赖 |
| `services/ai/src/main/resources/bootstrap.yml` | 修改 | `spring.application.name` 改 `anynote-ai`，Nacos 加载新 Data ID |
| `services/ai/src/main/java/com/anynote/ai/AnyNoteAIApplication.java` | 改名 | 启动类去 `Nio`；MapperScan 改 `com.anynote.ai.mapper` |
| `controller/ChatController.java` | 重写 | 同步返回值；4 个流式端点返回 `SseEmitter` 并显式声明事件 schema；登录用户/令牌在请求线程取好 |
| `controller/WhisperController.java` | 重写 | `/whisper` 与 `/whisper/status/{taskId}` 改 `SseEmitter`；状态流 30 分钟上限 |
| `controller/RagController.java` | 重写 | 删除 `/rag/test`、`/rag/doc`；保留 `/rag/query/docs/v1` 的「暂未实现」 |
| `controller/LlmStatisticsController.java`、`MoocVideoSummarizeController.java` | 修改 | `Mono` → 同步 `ResData` |
| `service/ChatService.java`、`service/impl/ChatServiceImpl.java` | 重写 | 同步化；短事务开会话/落提问、无事务转发、finally 短事务落库；并发信号量；断线后继续读上游 |
| `service/WhisperService.java`、`service/impl/WhisperServiceImpl.java` | 重写 | 状态流改 `RedisMessageListenerContainer` + 阻塞队列；`/whisper` 改走 Harness `/v1/audio/transcriptions`；任务权限改前置校验 |
| `service/LlmStatisticsService.java`、`service/impl/LlmStatisticsServiceImpl.java` | 修改 | 去 Reactor 返回类型 |
| `harness/HarnessClient.java` | 新增 | `@LoadBalanced RestClient` + JDK `HttpClient`（单例、虚拟线程 executor）读上游 SSE；内部签名头 + 用户令牌；首次事件前重试一次；空闲看门狗与总超时 |
| `harness/HarnessClientException.java` | 新增 | 区分可重试的 I/O 错误与业务/协议错误 |
| `harness/dto/FastApiChatCompletionsDTO.java`、`harness/vo/FastApiChatCompletionsVO.java` | 移动 | 从 `fastapi` 包移入 `harness`，字段不变 |
| `harness/dto/FastApiWhisperTranscriptionDTO.java`、`harness/vo/FastApiWhisperTranscriptionVO.java` | 新增 | Python `/v1/audio/transcriptions` 的请求与 SSE 事件结构（`file_url`、`{id,status,result}`） |
| `run/AiCallContext.java` | 新增 | 登录用户与令牌显式传参，替代 Reactor 上下文 |
| `run/AiRunLimiter.java` | 新增 | 每用户 / 全局 / 数据库三个信号量；数据库名额对齐 Druid `max-active` |
| `run/SseEventSender.java` | 新增 | 断线后跳过发送但不中断上游读取 |
| `run/ChatStreamAccumulator.java` | 新增 | 上游增量累积为落库正文并生成浏览器帧 |
| `model/vo/ChatCompletionsEventVO.java`、`WhisperEventVO.java` | 新增 | 仅用于 OpenAPI 的 SSE 事件 schema 声明 |
| `properties/AiHarnessProperties.java`、`AiRunProperties.java` | 新增 | `anynote.ai.harness` 与 `anynote.ai.run` 配置绑定 |
| `config/RestClientConfig.java` | 新增 | `@LoadBalanced RestClient.Builder` Bean（替换 `WebclientConfig`） |
| `config/RedisListenerConfig.java` | 新增 | Whisper 状态流使用的 `RedisMessageListenerContainer` |
| `config/ThreadPoolConfig.java` | 修改 | `ioExecutor` 改 `VirtualThreadTaskExecutor`；whisper/ffmpeg 保留有界平台线程池 |
| `listener/WhisperListener.java` | 修改 | 去掉未使用的 `WebClient`/Reactor 注入与 import |
| `datascope/**` | 删除 | 删除 `RequiresChatConversationPermissions*`、`RequiresWhisperTaskPermissions*` 切面与注解 |
| `filter/DataScopeFilter.java`、`config/ProxyConfig.java`、`constants/WhisperConstants.java`、`properties/AIFastApiProperties.java` | 删除 | 未注册/空实现/无调用方的死代码 |
| `service/RagService.java`、`service/impl/RagServiceImpl.java`、`model/vo/AIChatVO.java` | 删除 | 随 `/rag/doc` 一起删除的空实现与模型 |
| `src/test/java/com/anynote/ai/**`（10 个测试类） | 新增 | `HarnessClient`（解析/重试/空闲超时）、`ChatStreamAccumulator`、`AiRunLimiter`、`SseEventSender`、`ChatServiceImpl`（登录用户/落库/并发上限/续聊）、`WhisperServiceImpl` 映射、`LogAspect` 跳过流式响应、P1 凭据 18 条 |

## P1 模型供应商凭据基础设施

| 文件 | 状态 | 作用与原因 |
|---|---|---|
| `infra/sql/migrations/2026-11-14-ai-model-provider.sql` | 新增 | 幂等建表 `a_model_provider`（AES-GCM 密文、版本号、审计列） |
| `infra/sql/anynote.sql` | 修改 | 末尾追加同一段建表 DDL，注明与迁移脚本同步 |
| `properties/ModelCatalogProperties.java` | 新增 | 绑定 Nacos `anynote.ai.models`（映射版本 + 逻辑名映射，不含凭据） |
| `model/po/ModelProviderPO.java` | 新增 | MyBatis-Plus PO，`models` 以 JSON 字符串落库 |
| `model/dto/ModelProviderUpsertDTO.java`、`model/vo/ModelProviderSnapshotVO.java` | 新增 | 内部写入入参与快照返回（含解密后的 apiKey） |
| `mapper/ModelProviderMapper.java`、`resources/mapper/ModelProviderMapper.xml` | 新增 | 全部 SQL 使用显式 `resultMap` 映射 15 列 |
| `security/credential/AesGcmCipher.java` | 新增 | `ANYNOTE_AI_CREDENTIAL_KEY`（Base64 32 字节）AES-256-GCM 加解密；未配置时明确报错且不阻断启动 |
| `service/ModelProviderService.java`、`service/impl/ModelProviderServiceImpl.java` | 新增 | 快照（解密 + 版本合并）、upsert（version+1）、硬删除 |
| `controller/ModelProviderController.java` | 新增 | 三个 `@InnerAuth` 内部端点，网关不路由 |
| `.claude/openspec/changes/2026-11-14-ai-model-provider-config.md` | 新增 | P1 端点与表结构契约提案 |

## 连带 Java 模块

| 文件 | 状态 | 作用与原因 |
|---|---|---|
| `services/api/anynote-api-ai/pom.xml` | 修改 | 删除 webflux 依赖 |
| `services/api/anynote-api-ai/.../RagService.java` | 删除 | 契约模块里的具体类（含 WebClient/MQ/限流），职责由 AI 服务承接 |
| `services/api/anynote-api-ai/.../AutoConfiguration.imports` | 修改 | 去掉 `RagService` 注册行 |
| `services/api/anynote-api-ai/.../factory/RemoteMoocVideoFallbackFactory.java` | 修改 | 清理未使用 import（行为不变） |
| `services/api/anynote-api-ai/.../RemoteWhisperService.java`、`RemoteLlmStatisticsService.java`、`RemoteMoocVideoSummarizeService.java` | 修改 | Feign 目标从 `AI_NIO_SERVICE` 改 `AI_SERVICE` |
| `services/api/anynote-api-file/.../RemoteFileService.java` | 修改 | 新增 `getObjectUrlByObjectName`（调用 file 既有 `GET /files/public/byObjectName`），供 `/whisper` 取 `file_url` |
| `services/api/anynote-api-file/.../RemoteFileFallbackFactory.java` | 修改 | 为新 Feign 方法补降级返回 |
| `services/common/anynote-common-core/.../ServiceNameConstants.java` | 修改 | 删除 `AI_NIO_SERVICE` |
| `services/common/anynote-common-core/.../ConfigEnum.java` | 修改 | 删除 `AI_SERVER_ADDRESS` |
| `services/common/anynote-common-core/.../ServletUtils.java` | 修改 | 删除只被注释使用的 webFlux 方法块与 Reactor/WebFlux import |
| `services/common/anynote-common-redis/.../ConfigService.java` | 修改 | 删除 `getAIServerAddress()`；保留 `AI_SERVER_API_KEY` getter（M16.9 清理） |
| `services/common/anynote-common-security-servlet/.../FeignRequestInterceptor.java` | 修改 | 内部签名头改为无条件注入；用户身份头仍只在请求线程透传 |
| `services/common/anynote-common-security-servlet/.../LogAspect.java` | 修改 | `SseEmitter`/`ResponseBodyEmitter` 不再做响应体序列化，避免每条流一次 Gson 异常与日志风暴 |
| `services/common/anynote-common-security-servlet/.../FeignRequestInterceptorTest.java`、`LogAspectTest.java` | 修改/新增 | 覆盖无请求线程签名与流式响应日志 |
| `services/common/anynote-common-ai-fastapi/**` | 删除 | 整个模块删除；`services/common/pom.xml`、`services/pom.xml` 声明同步移除 |
| `services/common/anynote-common-datascope/.../aspect/webflux/RequiresPermissionsAspect.java` | 删除 | 仅在非 Servlet 栈生效，当前无服务满足 |
| `services/note/.../DocServiceImpl.java` | 修改 | PDF 问答改为权限校验后抛 `B0001 PDF 问答功能已暂停，后续版本将恢复`；删除 SSE/WebClient/RagService 逻辑与未使用注入 |
| `services/note/.../DocService.java`、`controller/DocController.java` | 修改 | 去掉 `throws IOException` |
| `services/note/.../config/WebClientConfig.java`、`services/note/pom.xml` | 删除/修改 | 删除无用 Bean 与 webflux 依赖 |
| `services/file|job|manage` 的 `WebClientConfig`/`WebclientConfig` | 删除 | 只为已删除的 `RagService` 注入而存在 |
| `services/file/pom.xml` | 修改 | 删除显式 `spring-webflux` 依赖 |
| `services/note/src/test/.../DocServiceImplQueryDocTest.java` | 新增 | 覆盖废弃文案与保留的权限注解 |

## 基础设施与配置

| 文件 | 状态 | 作用与原因 |
|---|---|---|
| `infra/docker-compose.yaml` | 修改 | AI 服务/镜像改名 `anynote-modules-ai`、注册名 `anynote-ai`、端口变量 `AI_PORT`；新增 `ANYNOTE_AI_CREDENTIAL_KEY` 与 `AI_JAVA_OPTS`（默认 2g 堆）；删除两个 `AI_FASTAPI_ADDRESS` 环境变量 |
| `infra/docker-compose.dev.yaml`、`docker-compose.prod.yaml` | 修改 | AI 服务键改名同步 |
| `infra/docker/nacos/configs/anynote-ai-dev.yml` | 重写 | 合并 executor 配置；新增虚拟线程、async 超时、Tomcat accept-count/max-connections、Druid 池、harness/run/models 配置 |
| `infra/docker/nacos/configs/anynote-ai-nio-dev.yml` | 删除 | 改名后不再加载 |
| `infra/docker/nacos/configs/anynote-gateway-dev.yml` | 修改 | 删除 `/api/aiNio/**` 路由；OpenAPI 聚合改指 `anynote-ai` |
| `infra/docker/nacos/configs/application-dev.yml` | 修改 | 删除 `anynote.ai-fastapi.address` |
| `infra/sql/sys_config.sql`、`infra/docker/mysql/init/source/sys_config.sql` | 修改 | 删除 `AI_SERVER_ADDRESS` 种子行（两处保持逐字节一致） |
| `infra/.env.example` | 修改 | 删除 `AI_FASTAPI_ADDRESS`；新增 `ANYNOTE_AI_CREDENTIAL_KEY`、`AI_JAVA_OPTS` |
| `README.md` | 修改 | 环境变量表、AI 端口变量、Python 启动时的 `NACOS_SERVICE_NAME=anynote-ai-harness` 说明 |
| `.claude/context/backend.md` | 修改 | AI 服务 artifactId 更新为 `anynote-modules-ai` |

## 前端与 CLI

| 文件 | 状态 | 作用与原因 |
|---|---|---|
| `apps/web/src/lib/api/openapi.ts` | 修改 | `aiApi` 域前缀改 `ai`；注释说明旧 `aiNio` 已删除 |
| `apps/web/src/lib/ai/sse.ts` | 修改 | SSE 基址 `/api/proxy/ai` |
| `apps/web/e2e/ai-stream.spec.ts`、`loading-system.spec.ts`、`scripts/ui-capture.mjs` | 修改 | 域名前缀同步；未跑 Playwright（M16.7 统一跑） |
| `apps/cli/src/core/api.ts`、`src/__tests__/api.test.ts` | 修改 | CLI 域映射 `ai: "ai"` 与断言同步 |

## 契约与文档

| 文件 | 状态 | 作用与原因 |
|---|---|---|
| `openapi/specs/ai.json` | 修改 | 重新生成的 baseline：删 2 个端点、增 3 个 P1 内部端点、SSE schema 显式化 |
| `.claude/openspec/changes/2026-11-14-ai-service-rename-and-sse.md` | 新增 | D9 改名、路由、SSE 事件 schema 与错误文案提案 |
| `.claude/openspec/changes/2026-11-14-note-pdf-qa-deprecation.md` | 新增 | note PDF 问答废弃文案与端点保留提案 |
| `docs/ai-refactor/AI_MILESTONES.md` | 修改 | M16.1 任务勾选 + 验收记录 |
| `docs/ai-refactor/README.md` | 修改 | 状态与下一步更新 |
| `docs/refactor/FRONTEND_MILESTONES.md` | 修改 | M7.6 第 1 条关闭回写 |
| `CLAUDE.md` | 修改 | 上下文导航中的 M16 进度更新 |

## 审计要点

1. **流式转发的生命周期**：`ChatServiceImpl` 在请求线程完成权限/会话/短事务，`SseEmitter` 创建后交给虚拟线程；
   转发期间不持有数据库连接，`finally` 中落库并释放信号量。断线后只停止写浏览器，仍把上游读完再落库。
2. **HarnessClient 的并发与超时**：单例 `HttpClient`（虚拟线程 executor）避免平台线程随连接增长；30s 空闲看门狗
   负责在 `JdkClientHttpRequestFactory.setReadTimeout` 无法中断流式 body 读取时结束流；首次事件前只重试一次。
3. **P1 安全边界**：主密钥只走 `ANYNOTE_AI_CREDENTIAL_KEY`，不写日志/Nacos；密文 `Base64(iv‖ciphertext‖tag)`；
   三个端点全部 `@InnerAuth` 且网关无路由；快照包含解密后的 apiKey，只能经内部签名调用。
4. **Feign 签名行为变化**：所有 Feign 调用现在无条件带内部签名头（含 MQ/异步线程）；被调端 `@InnerAuth` 的
   校验口径因此不再依赖调用方是否在请求线程，需重点关注消息监听与异步上报路径。
5. **SSE 与错误响应**：流式端点去掉了 `produces`，避免业务异常时无法写 JSON（越权会话现在返回 `A0300` JSON）；
   `LogAspect` 不再序列化 `SseEmitter`，否则每条流一次 Gson 异常（2000 并发一轮约 40 万行日志）。
6. **破坏性改名**：`/api/aiNio/**` 不保留别名，`apps/web-legacy` 的 AI 调用会 404（D9 已确认不适配旧前端）；
   Nacos 旧 Data ID 从仓库删除，但历史 dump `infra/sql/anynote_config.sql` 未改（已拍板）。
7. **环境前置**：本地 dev 库需先执行既有迁移 `2026-09-16-sys-permission-rule-user-associated.sql`，否则所有权限规则
   查询报 `Unknown column 'is_user_associated'`；本次验证环境已执行，不涉及代码改动。
