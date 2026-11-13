# 提案：AI 服务改名与流式端点契约调整

> 方案：[`docs/ai-refactor/AI_REFACTOR_PLAN.md`](../../../docs/ai-refactor/AI_REFACTOR_PLAN.md) §4.3、§4.4、§4.6；里程碑 [`docs/ai-refactor/AI_MILESTONES.md`](../../../docs/ai-refactor/AI_MILESTONES.md) M16.1

## 背景

M16.1 把 `services/ai` 从 Reactor 写法改为 Spring MVC + 虚拟线程，并执行 D9 的服务改名。
改名是破坏性切换：用户已确认无生产环境，**不保留 `/api/aiNio/**` 路由别名**，新前端与 CLI 同批切到 `/api/ai`。

同时，流式端点从 `Flux<ServerSentEvent<...>>` 改为 `SseEmitter` 后，Springdoc 无法再从返回类型推断事件结构，
因此每个流式端点显式声明 `text/event-stream` 的响应 schema。

## 服务与路由变更

| 项 | 旧 | 新 |
|---|---|---|
| Maven artifact | `anynote-modules-ai-nio` | `anynote-modules-ai` |
| `spring.application.name` / Nacos 注册名 | `anynote-ai-nio` | `anynote-ai` |
| Java 包 | `com.anynote.ai.nio` | `com.anynote.ai` |
| 网关业务路由 | `/api/aiNio/**` → `lb://anynote-ai-nio` | 删除；`/api/ai/**` → `lb://anynote-ai` |
| OpenAPI 聚合 | `/ai/v3/api-docs` → `lb://anynote-ai-nio` | `/ai/v3/api-docs` → `lb://anynote-ai` |
| Nacos Data ID | `anynote-ai-nio-dev.yml` | `anynote-ai-dev.yml`（原 `anynote-ai-nio-dev.yml` 删除） |
| compose service / 镜像 | `anynote-modules-ai-nio` | `anynote-modules-ai` |
| 端口环境变量 | `AI_NIO_PORT` | `AI_PORT` |
| 服务名常量 | `AI_SERVICE` + `AI_NIO_SERVICE` | 仅 `AI_SERVICE = "anynote-ai"` |

Python 服务的 Nacos 服务名收拢为 Nacos 配置 `anynote.ai.harness.service-name`，M16.1 取值 `anynote-ai-harness`；
Python 进程仍由环境变量 `NACOS_SERVICE_NAME` 决定注册名（M16.2 容器化时固化）。

删除的旧配置入口：`sys_config.AI_SERVER_ADDRESS`、Nacos `anynote.ai-fastapi.address`、compose `AI_FASTAPI_ADDRESS` /
`ANYNOTE_AI_FASTAPI_ADDRESS`。`sys_config.AI_SERVER_API_KEY` 暂保留（M16.9 清理）。

## 端点变化

| 方法 | 路径 | 变化 |
|---|---|---|
| GET | `/rag/test` | 删除（测试端点） |
| POST | `/rag/doc` | 删除（空实现，依赖的 `RagService` 一并删除） |
| POST | `/rag/query/docs/v1` | 保留，仍抛 `B0001 查询文档 RAG v1 暂未实现`，M16.6 实现 |
| POST | `/chat/completions` | 返回 `SseEmitter` |
| POST | `/chat/completions/noConversation` | 返回 `SseEmitter` |
| POST | `/chat/moocVideoSummarize` | 返回 `SseEmitter` |
| POST | `/chat/noteTaskSubmissionAnalyze` | 返回 `SseEmitter` |
| POST | `/whisper` | 返回 `SseEmitter`；上游路径修正为 Python `/v1/audio/transcriptions` |
| GET | `/whisper/status/{taskId}` | 返回 `SseEmitter` |
| 其余 | `/chat/conversations/**`、`/whisper/submit`、`/translate`、`/llmStatistics/**`、`/moocVideoSummarizes/**` | 改为同步返回值 |

`POST /whisper` 的 `file_url` 通过 file 服务的既有公开端点 `GET /files/public/byObjectName` 取得（内部 Feign 调用），
Python 侧模型名取 `turbo`；状态值按 Python 原值透传（`DOWNLOADING/RUNNING/DONE/FAILED`），结果映射到旧 `data` 字段。

## 流式事件 schema（显式声明）

所有流式端点 `event` 名为 `message`（心跳为 `heartbeat`），`id` 为毫秒时间戳。

| 端点 | 事件 `data` 结构 |
|---|---|
| `/chat/completions`、`/chat/completions/noConversation`、`/chat/moocVideoSummarize`、`/chat/noteTaskSubmissionAnalyze` | `ChatCompletionsEventVO`（= `ResData<ChatCompletionsVO>`，字段 `code/msg/data{status,message,conversationId}`） |
| `/whisper` | `WhisperEventVO`（= `ResData<WhisperVO>`，字段 `code/msg/data{status,data{text,srt,txt}}`） |
| `/whisper/status/{taskId}` | `WhisperTaskStatusVOV1`（字段 `taskId`、`whisperTaskStatus`） |

原 baseline 中的 `ServerSentEventResDataChatCompletionsVO`、`ServerSentEventString`、`ServerSentEventWhisperTaskStatusVOV1`
随本次移除；`pnpm openapi:generate` 的差异应仅为上述改名、删除端点与 schema 替换。

## 错误码与文案

- 并发上限（每用户 2 / 全局 500）触发时：HTTP 200，SSE 失败帧 `data.status=failed`、
  `data.message=当前使用人数较多，请稍后再试`。
- 上游超时/断线/重试耗尽：沿用原失败文案 `出现异常请稍后重试`。
- 其余错误码沿用 `ResCode` 既有定义。

## 验证计划

- `mvn test -pl ai`：`HarnessClient`、`ChatStreamAccumulator`、`AiRunLimiter`、`SseEventEmitter`、`ChatServiceImpl`、
  `WhisperServiceImpl` 与 P1 凭据单测。
- 真实栈：聊天/会话列表/Whisper 状态流可用；PDF 问答返回约定的废弃错误（见 note 提案）。
- `pnpm openapi:generate` 输出干净并提交 baseline；逐项核对差异符合本提案。
