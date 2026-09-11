# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) and Codex (via AGENTS.md → CLAUDE.md) when working with code in this repository.

> 本仓库 **Claude Code 与 Codex 共用此文件**。`AGENTS.md` 仅是指向本文件的指针，避免双份维护。

## 仓库定位

Anynote 是 **polyglot monorepo**，三种语言栈通过 pnpm workspace + Turborepo + Maven multi-module 编排：

- `services/` — Java 21 · Spring Boot 3.3.4 · Spring Cloud 2023.0.3（9 个微服务 + Feign API 模块 + common 共享库 + BOM）
- `apps/web/` — Next.js 15 · React 19（**Phase 5 重写，M0-M8 已实现并验收；M8 于 2026-09-11 完成，发版待定**）
- `apps/web-legacy/` — Next.js 13.5（**旧前端，仍是当前用户访问的版本**，删除条件见下方 Phase 5 表）
- `apps/collab/` — Node · yjs 13 · ws（协同编辑 WebSocket 服务，:1234；M8.1 自建，后端无此端点）
- `apps/desktop/` — Tauri 2 桌面壳（M8.2 骨架；构建需 Rust + MSVC 工具链，尚未编译验证）
- `ai-service/` — Python 3 · FastAPI · LangChain 0.3 · Pydantic v2
- `packages/api-client/` — `pnpm openapi:generate` 产出的 TS 客户端（**不要手改**，`src/` 已 gitignore）
- `infra/` — docker-compose（中间件 + 全栈）+ SQL + nginx
- `openapi/` — spec 聚合与生成脚本

重构决策文档统一在 `docs/refactor/`：`REFACTOR_PLAN.md`（整体重构方案）、`FRONTEND_REFACTOR_PLAN.md`（前端 TipTap 方案）、`FRONTEND_MILESTONES.md`（Phase 5 可执行里程碑）、`TASKS.md`（Phase 进度跟踪）。**改动前先看相关文档，避免与重构方向冲突**。

## 当前重构进度

| Phase | 内容 | 状态 |
|-------|------|------|
| 0 | Monorepo 基础设施 | ✅ v0.1.0 |
| 1 | OpenAPI Contract First（Springdoc + 29 Controller 注解 + Gateway 聚合） | ✅ v0.2.0 — Phase 5 M0 已端到端验证通过，`openapi/specs/*.json` 6 份 baseline 入库；`packages/api-client/src/` 仍 gitignored，本地需跑一次 `pnpm openapi:generate` 派生 |
| 2 | Maven BOM（统一版本） | ✅ v0.3.0 |
| 3 | Spring Boot 3 + JDK 21 升级（javax→jakarta、Security 6、合并 ai+ai-nio） | ✅ v0.4.0 |
| 4 | 服务层重构（统一异常、REST 规范、HMAC 内部鉴权） | ✅ v0.5.0 — 收尾任务见 `docs/refactor/TASKS.md` L124-128 |
| 5 | 前端完全重写（TipTap + BFF + TanStack Query） | 🟡 **代码完成，发版待定** — M0-M7 已于 2026-09-11 全部 `--no-ff` 合并 `dev`。**M8（协同 + 桌面 + E2E/性能 + 收尾）同日完成**：`apps/collab` 自建协同服务 + `/docs` 协同文档库、`apps/desktop` Tauri 骨架与 `/api/auth/exchange` 令牌交换、Playwright 15 条用例、Lighthouse（性能 99-100 / 无障碍 100）、产物预算全绿；全仓前端单测 **586** + 协同服务 **75**。**未做**：桌面构建验证（本机无 Rust/MSVC 工具链）、删除 `apps/web-legacy/`（M7.6 的 5 个后端缺口未解，新前端还不能替代它）、合并 `main` 与打 tag `v0.6.0`。AI 流式与 PDF 上传仍受后端阻塞（见里程碑 M7.6）。详见 `docs/refactor/FRONTEND_MILESTONES.md` M7/M7.6/M8/M8.6/§5 与 `docs/refactor/TASKS.md` Phase 5；E2E 与性能门禁命令见 README「测试」 |
| 6 | Python AI 现代化（Pydantic v2） | ✅ v0.7.0 |
| 7 | OpenSpec 集成 | ✅ v1.0.0 |

**当前分支（2026-09-11 核对）**：`dev`。M2-M6 的 `phase/*` 分支已全部 `--no-ff` 合并进来，分支保留未删。`main` 是发布分支，日常合并目标是 `dev`。

**分支落点（2026-09-11 核对）**：M2.0 通过 `3865a2f` 合并 `dev`；M2 / M3 / M4 / M5 于 2026-09-11 按 `phase/5.2-auth-bff` → `phase/5.3-api-layer` → `phase/5.4-app-shell` → `phase/5.5-tiptap-core` 顺序逐个 `--no-ff` 合并 `dev`（`e6384e5` / `05c2598` / `c3c3597` / `7b96e67`），无冲突；合并后 `dev` 的 tree 与 `phase/5.5-tiptap-core` 为同一 OID。M6 自合并后的 `dev` 切出 `phase/5.6-notes`，同日 `--no-ff` 合并回 `dev`（`888c7da`）。详情见里程碑 M2-M6 / §5。

**认证契约（2026-09-08 用户确认并实现）**：Gateway 的外部私有请求仅接受 `Authorization: Bearer <token>`，取消旧 `accessToken` 请求头兼容；内部服务仍使用 Gateway 注入的已验证 `accessToken`。OpenAPI 已改为 HTTP Bearer/JWT，六份 baseline 已重生。旧前端尚未迁移，切换后的私有请求会失败。**刷新方案状态**：2026-09-08 的暂缓记录已由后续 M2 实现与验收更新；2026-09-10 自动刷新与并发刷新已通过真实栈测试。具体触发、重试和失败边界以里程碑 M2.1 为准，不将早期讨论建议当作现行方案。详见 `docs/refactor/FRONTEND_MILESTONES.md` M2.1 与 `.claude/openspec/changes/2026-09-08-gateway-bearer-only.md`。

**M2.1 登出契约补充（2026-09-08 用户确认）**：允许 `{ accessToken?, refreshToken? }`，至少一个非空白；仅 `rt` 时撤销该 refreshToken，不扩大到其他会话。已核对真实 Springdoc 契约并同步 OpenAPI 与 BFF；M2.3 页面与测试也已完成，M2 完整验收于 2026-09-10 通过。详见 `.claude/openspec/changes/2026-09-08-logout-refresh-token-only.md` 和 `docs/refactor/FRONTEND_MILESTONES.md` §5。

## 常用命令

### 开发环境启动（docker compose）

**Git 规约和本节启动步骤的单一来源都在 [`README.md`](./README.md)，本文件只列要点 + 引用**，避免双份维护。具体步骤详见：

- 三种启动场景（A=Dev Docker / B=IDEA 混合 / C=生产部署）→ [`README.md` 的「启动指南」节](./README.md#启动指南)
- 环境变量文件（`.env` / `.env.idea` / `.env.example` / `.env.idea.example`）的分工 → [「环境变量文件总览」](./README.md#环境变量文件总览必读)
- 生产部署密码必改清单 / Nginx 反代 / 备份建议 → [「场景 C：生产部署」](./README.md#场景-c生产部署)

要点速查（强制约束，**违反这些会踩坑**）：

- **dev 场景 `docker compose` 命令必须加 `--env-file=/dev/null`**。原因：`infra/.env.idea`（IDEA 在宿主机跑 Java 时用）含 `127.0.0.1` 类 host 覆盖；若被 compose 自动加载，`ROCKETMQ_BROKER_ADVERTISE_IP=127.0.0.1` 会让 broker 广播错误地址，容器内 app 连不上 broker。
- **prod 必须显式 `--env-file infra/.env -f infra/docker-compose.yaml -f infra/docker-compose.prod.yaml`**，不带 dev override。生产关闭 Java/中间件宿主机端口，使用 `restart: unless-stopped`，只给容器外 Nginx 发布 web:3000 / collab:1234。
- **dev 全栈推荐命令**：

  ```bash
  docker compose --env-file=/dev/null \
    -f infra/docker-compose.yaml \
    -f infra/docker-compose.dev.yaml \
    up -d --build
  ```

  `docker-compose.dev.yaml`：app 容器 `restart: "no"`，启动失败立即 `Exited`，方便日志排查；中间件保留原 restart 策略。
- **前端容器化**：`infra/Dockerfile.web` 从入库 OpenAPI baseline 派生类型并构建 Next standalone；不挂载宿主机 `.next`，容器内不含 Nginx。`NEXT_PUBLIC_*` 是构建参数，域名变化要重建；运行时只注入服务端密钥。`docker-compose.web-dev.yaml` 提供前端 HMR；IDEA 中间件模式叠加 `docker-compose.middleware-idea.yaml`，宿主机前端读取 `apps/web/.env.local`。完整步骤仍以 README 为准。
- **新前端外部路由**：`/api/*` 和页面必须经 Next BFF，再由 Docker 内网调用 Gateway；外部 Nginx `/collab/*` 单独转协同容器，不能沿用旧模板把 `/api/` 直连 Gateway。架构图见 [`docs/deployment-network.md`](docs/deployment-network.md)。
- **OpenAPI / TS 客户端**：后端 Controller 改完跑 `pnpm openapi:generate`，必须把 `openapi/specs/*.json` 一并提交（baseline 入库）；CI `openapi-check.yml` 会对 baseline diff 阻断漂移。`packages/api-client/src/` 仍 gitignored，从 specs 派生。

### 单服务 / 单模块

```bash
# Java 单服务（含依赖）
cd services && mvn clean install -pl note -am -DskipTests

# Java 单模块测试
cd services && mvn test -pl note
# Java 单测试类
cd services/note && mvn test -Dtest=NoteServiceTest

# 仓库根脚本
pnpm openapi:generate    # 从 Gateway 拉 spec → 生成 TS 客户端（需后端运行）
pnpm openapi:check       # 生成 + 与 baseline diff（与 CI 同行为）
pnpm typecheck           # turbo typecheck（含 @anynote/api-client）
pnpm services:build      # = cd services && mvn clean install -DskipTests
pnpm check               # Biome lint + format
pnpm format              # Biome format only
```

### 端到端与性能门禁（需生产构建 + 真实后端栈）

```bash
pnpm --filter web test:e2e          # Playwright 6 条关键路径 + 协同双端同步
pnpm --filter web bundle:budget     # 首屏 JS ≤ 300KB、编辑器 ≤ 250KB（gzip）
pnpm --filter web lighthouse:budget # Performance ≥ 90、Accessibility ≥ 95
```

三者都**不进**默认 `pnpm test` 与 CI（与 `test:integration:auth` 同类）。注意事项、
门槛与踩坑见 [`README.md` 的「端到端与性能门禁」](./README.md#端到端与性能门禁m83)。

## 后端服务一览

| 服务目录          | 端口   | 职责                                  |
|-------------------|--------|---------------------------------------|
| `services/gateway`  | 8080   | API 网关：路由、JWT 验证、CORS、XSS 过滤 |
| `services/auth`     | 8083   | 认证：登录、注册、Token 签发           |
| `services/system`   | 8091   | 用户、角色、权限、租户管理             |
| `services/note`     | 18091  | 笔记、知识库、文档、MOOC、视频         |
| `services/file`     | 8095   | 文件上传/下载（Huawei OBS / MinIO）   |
| `services/ai`       | 9065   | AI 对话（SSE）、RAG、Whisper、翻译     |
| `services/notify`   | 9066   | 消息通知、站内信                       |
| `services/job`      | 8093   | XXL-Job 任务执行                       |
| `services/manage`   | 18092  | 管理后台业务逻辑                       |
| `ai-service/`       | 8000   | Python FastAPI（独立栈）              |
| `apps/collab/`      | 1234   | 协同编辑 WebSocket（Node，非 Spring；健康检查是 `/healthz` 不是 actuator） |

更详细的服务依赖、ResCode 表见 `.claude/context/backend.md`。

## 代码规范

### Java 后端

- **包结构**：`com.anynote.<module>.{controller, service, service/impl, mapper, model/{po, dto, vo}, config}`
- **响应**：统一 `ResData<T>` 包装，`code="00000"` 成功；业务错误抛 `BusinessException`，全局处理器统一转 `ResData`（**禁止 `return null` 未实现端点**，应 `throw new NotImplementedException(...)`）
- **Feign 接口**：定义在 `services/api/` 下，每个服务一个 artifact；`FallbackFactory` 一律 `return ResData.error(ResCode.INNER_*_SERVICE_ERROR)`，**不要抛异常**（会破坏熔断器）
- **内部鉴权**：内部端点必须加 `@InnerAuth`（servlet 用 `InnerAuthAspect`，Reactive 用 `InnerAuthWebfluxAspect` + `ContextWebFilter`）
- **OpenAPI 注解**：Controller 类 `@Tag(name="...")`；方法 `@Operation(summary="...", description="...")`；DTO 字段 `@Schema(description="...")`。**已全仓迁移 Springdoc，不要用旧的 `@Api` / `@ApiOperation` / `@ApiModelProperty`**

### 前端（apps/web，目标态）

- **数据获取**：TanStack Query，命名 `use<X>Query` / `use<X>Mutation` / `use<X>Infinite`
- **API 调用**：仅使用 `@anynote/api-client` 重导出的 typed client（基于 `openapi-fetch`），**禁止手写 fetch / axios 直调后端**
- **状态管理**：服务端状态走 TanStack Query；客户端 UI 状态走 Zustand（仅 sidebar、theme、commandPalette 等非敏感）
- **样式**：Tailwind CSS only，不写内联 style（动态值用 CSS 变量）
- **组件**：RSC 优先；需交互的组件才加 `'use client'`；shadcn/ui 原子组件不重复封装
- **认证**：token 仅存 httpOnly Cookie，通过 Next Route Handler（BFF）转发；前端 JS 永远拿不到 token
- **编辑器**：新前端**统一 TipTap**，废弃 Milkdown / Wangeditor / Vditor / Muya（详见 `docs/refactor/FRONTEND_REFACTOR_PLAN.md` 第六章）

### Python AI 服务

- **配置**：`core/config.py` 的 `Settings(BaseSettings)` 读环境变量；通过 `get_settings()` 的 `@lru_cache` 单例注入
- **类型**：Pydantic v2，用 `X | None` 而非 `Optional[X]`；DTO `model_config = ConfigDict(...)`、`@field_validator`、`.model_dump()` / `.model_validate()`
- **路由注解**：每个端点写 `tags`、`summary`、`responses`，确保 `/v3/api-docs` 输出可被前端类型生成消费
- **依赖注入**：用 FastAPI `Depends(...)`，不要在模块顶层用全局单例

## 测试要求（强制）

**前后端任何代码改动完成后都必须附带单元测试，没有测试的改动不算完成，不允许提交。**

### 覆盖范围

| 必须写单测 | 可豁免 |
|---|---|
| Service / ServiceImpl 的业务逻辑（分支、边界、异常路径） | 纯 DTO / VO / PO（无逻辑的 getter/setter） |
| 工具类、校验器、序列化 / 反序列化 | MyBatis Mapper 接口（无自定义 SQL 逻辑时） |
| 前端 hooks（`use*Query` / `use*Mutation` / 自定义 hook） | 生成代码（`packages/api-client/src/`、`components/ui/` 的 shadcn 原件） |
| 前端纯函数（`lib/**`、序列化、格式化） | 纯展示型 RSC（无状态无分支） |
| BFF Route Handler（cookie 设置、鉴权转发、refresh 并发） | 配置文件、常量表 |
| Python service 层与 Pydantic 校验逻辑 | |
| 构建期脚本里的判定逻辑（`apps/web/scripts/lib/**` 的预算与门槛） | 脚本里读盘 / 起浏览器的 IO 外壳 |
| 协同服务的协议、握手准入、持久化与房间生命周期（`apps/collab/src/**`） | |

**Bug 修复必须先写复现该 bug 的失败用例，再改代码**——否则无法证明修好了。

### 各栈约定

**Java**：JUnit 5 + Mockito。放 `services/<svc>/src/test/java/com/anynote/<module>/`，命名 `<被测类>Test`。

- **默认写纯单测**：`@ExtendWith(MockitoExtension.class)` + `@Mock` 打桩依赖，不连数据库 / Nacos / Redis
- `@SpringBootTest` 只在确实要验证 Spring 装配时用。它需要完整中间件才能跑，**不能作为默认选择**（现存的 `PermissionServiceTest` / `FileServiceTest` 就是这种，本地起不了中间件时跑不动）
- Feign 调用一律 mock；不要在单测里打真实服务

**前端**：Vitest + Testing Library。测试与被测文件同目录放 `__tests__/`，或同名 `*.test.ts(x)`。

- hooks 用 `@testing-library/react` 的 `renderHook`，外面套 `QueryClientProvider`（每个用例新建 `QueryClient`，`retry: false`）
- 网络层打桩到 `openapi-fetch` 客户端，不要 mock 全局 `fetch`
- Route Handler 直接调用导出的 `POST` / `GET` 函数并断言 `Set-Cookie`，不起真实 server
- 组件交互用 `fireEvent`（仓库未引入 `@testing-library/user-event`）

**协同服务（`apps/collab`）**：Vitest（node 环境）。纯逻辑（协议、房间名、准入、持久化）
直接测函数；`server.test.ts` 用端口 0 起真实实例并用真实 `ws` 客户端连——
不外接任何中间件，因此可以留在默认单测流程里。

**Python**：pytest。放 `ai-service/tests/`，命名 `test_<模块>.py`；依赖用 FastAPI `dependency_overrides` 替换，不打真实 LLM。

### 单测 / 集成测试的划分（强制）

**新写 `@SpringBootTest` 必须同时加 `@Tag("integration")`**，否则会混进默认单测流程，在没有中间件的 CI 上必然失败。父 pom 的 surefire 默认排除该 tag。

> 该排除项走 `${test.excluded.groups}` 属性而非在 `<configuration>` 里写死：插件配置的字面值优先级高于 `-D` 用户属性，写死的话命令行永远放不开。

### 运行与 CI

**测试栈、目录约定、运行命令、CI 配置的单一来源是 [`README.md` 的「测试」节](./README.md#测试)**，本节只保留约束，不重复命令。

> 注意 `pnpm services:build` 仍是 `-DskipTests`（它只负责产物构建，测试由 `.github/workflows/test.yml` 单独把关）。

## REST API 命名规范

- 路径用名词，不用动词：`POST /user/{id}/ban` 而非 `POST /banUser`
- 列表用 `/list`，子资源动作用 `/{id}/<action>`
- 分页参数固定为 `pageNum`（从 1 起）+ `pageSize`
- 路径前缀正在统一为 `/api/v1/*`（Phase 4 已部分完成，新端点必须遵守）

## 关键架构约束

### OpenAPI Contract-First 是 API 变更唯一路径

后端 Controller 改动**必须**：
1. 写/更新 `@Tag` / `@Operation` / `@Schema` / `@Parameter` 注解
2. 改完跑 `pnpm openapi:generate` 验证 spec 输出干净
3. 前端类型仅从 `packages/api-client/src/` 引用，禁止手写 fetch / axios 直调

工作流：在 `.claude/openspec/changes/` 写 `YYYY-MM-DD-<描述>.md` 变更提案 → 后端实现 → 跑生成脚本 → 前端基于新类型实现。详见 `openapi/WORKFLOW.md` 与 `.claude/openspec/`。

### 服务间调用：HMAC 签名 + `@InnerAuth`（非显然）

内部 Feign 调用由 `FeignRequestInterceptor` 自动注入 `from-source: inner` + `X-Internal-Timestamp` + `X-Internal-Sign: HMAC-SHA256(secret, timestamp)`。被调端用 `@InnerAuth` 注解（AOP）校验。**新增内部端点必须加 `@InnerAuth`**，否则可被外部直接访问。Reactive 服务用 `InnerAuthWebfluxAspect` + `ContextWebFilter`（Reactor 上下文桥接）。

### 配置中心是 Nacos，不是 application.yml

`services/*/src/main/resources/bootstrap.yml` 只含 Nacos 连接信息；运行时配置（数据库连接、Redis、第三方密钥、JWT secret 等）全在 Nacos。**改 application.yml 通常没用**，要去 Nacos UI（`http://localhost:8848/nacos`）改对应 Data ID。常用 Data ID 在 `infra/docker/nacos/configs/`。

### Gateway 数据源传递依赖陷阱（已知坑）

`anynote-common-redis` 经 `anynote-api-system` 间接引入 MyBatis Plus / JDBC，导致 Gateway 启动时尝试创建 DataSource。当前 workaround 是 Gateway 显式 `@SpringBootApplication(exclude = {DataSourceAutoConfiguration.class, ...})`。**改动 common-redis 或 api-system 依赖前看 `docs/refactor/TASKS.md` L124-128 三条收尾任务**。

### 响应格式统一为 `ResData<T>`

```json
{ "code": "00000", "msg": "操作成功", "data": { ... } }
```

业务错误也是 HTTP 200，靠 `code` 区分。常用：`A0160` 参数错误 / `A0301` 未授权 / `A0350` 缺少 accessToken / `B0001` 业务 / `B0400` 内部服务错误。完整 ResCode 见 `.claude/context/backend.md`。

### 数据库迁移

SQL 文件在 `infra/sql/`，**手动执行**（无 Flyway / Liquibase 自动化）。MyBatis Plus 自动填充 `createTime` / `updateTime`，业务代码不要手动赋值这两个字段。

### Phase 5 重写期间的双前端约定

- `apps/web-legacy/` 是用户当前实际访问的前端，**修复线上 bug 在这里改**
- `apps/web/` 是新前端目标位置，**新功能开发去这里**
- 两者不共用 workspace（`pnpm-workspace.yaml` 显式排除 legacy）

**M8.4 复核结论：`apps/web-legacy/` 暂不删除。** 里程碑原文的删除条件是「确认 1 周稳定后」，
而当前新前端还有 M7.6 记录的 5 个后端缺口未解（AI 流式全链路、PDF 上传转存、资料保存
`@InnerAuth`、mooc 权限规则、图片分片直传），尚不能替代 legacy 承担线上流量。
**删除前置条件**（全部满足才动手）：

1. M7.6 的后端缺口全部关闭，新前端在这些路径上端到端可用
2. 新前端接管线上流量并稳定运行 1 周
3. `pnpm --filter web test:e2e` 6 条关键路径在生产环境全绿

## 上下文文档导航

需要更细节时按主题查：

- `.claude/context/backend.md` — 服务端口表、模块依赖、包结构、ResCode 速查
- `.claude/context/frontend.md` — 前端目录、Query Key 工厂、BFF 认证流程、协同编辑与两条派生凭据
- `docs/deployment-network.md` — 前端 Compose、外部 Nginx、生产与本地网络架构（启动步骤见 README）
- `.claude/context/api-contracts.md` — API 契约详细规范，含 Gateway 外部仅 Bearer 与内部身份头边界
- `openapi/WORKFLOW.md` — API-First 开发步骤
- `.claude/openspec/README.md` — OpenSpec 使用说明
- `.claude/openspec/changes/` — API 变更提案归档
- `CONTRIBUTING.md` — 代码规范要点
- `apps/desktop/README.md` — 桌面壳的令牌交换流程、构建前置条件与未验证项
- `docs/refactor/REFACTOR_PLAN.md` / `FRONTEND_REFACTOR_PLAN.md` / `FRONTEND_MILESTONES.md` — 重构决策与执行计划
- `docs/refactor/TASKS.md` — Phase 级进度与未完成项
- `docs/backend-security-inventory.md` — 后端安全配置清单

## 文档维护约定

CLAUDE.md 不是事实源，而是 **指针 + 约束集合**。具体规范分散在 `README.md`、`docs/refactor/*`、`.claude/context/*` 等文件，本文件通过链接 / 路径引用它们。

**修改或删除任何文档前的强制流程**：

1. 在本仓库根全文搜索目标文件名是否被 `CLAUDE.md` 引用（`grep -n '<filename>' CLAUDE.md`），尤其检查"上下文文档导航"、"提交与分支"、"关键架构约束"、"开发环境启动" 几节。
2. 若有引用：**必须同步修改 CLAUDE.md** 的对应位置（更新路径、改写概要、或移除指针）。**不允许出现 CLAUDE.md 指向已不存在 / 已重命名 / 已重写内容的悬空引用**。
3. 跨文件重命名（如 `infra/.env` → `infra/.env.idea`）同样属于"修改文档"语义：先 `grep -rn 'old-path' CLAUDE.md README.md docs/ .claude/`，把所有相关引用一起改完再提交。
4. 删除文档前确认它**没有**被 `CLAUDE.md` 引用；若有引用，先在 CLAUDE.md 里删掉对应行 / 用新文件替换，再提交"docs: remove ..."。

该约定与"Git 提交粒度"不冲突——文档同步改动属于同一逻辑单元，**可以与触发它的代码 / 文档改动放在同一个 commit**（CLAUDE.md 改动 + 被引用文件改动 = 一个原子 commit），但跨语言 / 跨服务的代码部分仍要单独拆分。

## 提交与分支

**Git 规约的单一来源是 [`README.md` 的「Git 工作流」节](./README.md#git-工作流)**。提交前请遵守该节定义的：

- 分支模型（`main` ← `dev` ← `phase/*` / `feat/*` / `fix/*` / `docs/*` / `chore/*`）
- Conventional Commits 格式 + type/scope 取值
- **Commit message 一律用中文**撰写描述与 body（`type` / `scope` 保持英文，技术名词保留原文）
- 提交粒度（一次只动一个 service / package，跨语言不混）
- Commit message 约定（**禁止 `Co-Authored-By` trailer**，包含 AI 助手署名）
- 版本 Tag 策略（`v0.X.0` 对应 Phase 完成点）
- 禁止操作清单（不直接 push `main`、不 force push、不提交生成文件 等）

## 禁止清单（代码与架构）

> Git 操作禁忌见 [`README.md` Git 工作流 → 禁止操作清单](./README.md#git-工作流)。

- ❌ 手改 `packages/api-client/src/` 下任何生成文件
- ❌ Controller 用旧的 Springfox 注解（`@Api` / `@ApiOperation` / `@ApiModelProperty`）
- ❌ Feign `FallbackFactory` 中抛异常（应 `return ResData.error(...)`）
- ❌ `return null` 占位未实现端点（应 `throw new NotImplementedException(...)`）
- ❌ 在 `application.yml` 改运行时配置（应改 Nacos）
- ❌ 新前端用 Milkdown / Wangeditor / Vditor / Muya（统一 TipTap）
- ❌ 前端手写 fetch / axios 直调后端（必须走 `@anynote/api-client` + BFF 代理）
- ❌ 前端把 token 写到 `document.cookie` / localStorage / sessionStorage（必须 httpOnly Cookie）。**唯一例外**：`apps/web/src/lib/desktop/bridge.ts` 的桌面壳场景，由里程碑 M8.2 授权，且写入前校验确实处在 Tauri 壳中
- ❌ 在纯 Web 部署里配置 `DESKTOP_EXCHANGE_KEY`（那是把真实 Token 交给 JS 的开关，不配即关闭）
- ❌ 静态引入重依赖（编辑器整包、yjs / y-websocket、pdfjs、ReactFlow）——一律 `dynamic(..., { ssr: false })`，改完跑 `pnpm --filter web bundle:budget` 确认没顶出首屏 300KB 预算
- ❌ 新增 / 修改 Service、工具类、前端 hook、BFF Route Handler 后不写单元测试就提交（见[「测试要求」](#测试要求强制)）
- ❌ 只为凑覆盖率写"调一次断言不报错"的空测试；断言必须覆盖实际业务分支与异常路径
- ❌ 修 bug 时不先写复现用例直接改代码
- ❌ 用英文写 commit message 的描述与 body（`type` / `scope` 除外，见[「提交与分支」](#提交与分支)）
