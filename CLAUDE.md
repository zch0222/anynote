# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) and Codex (via AGENTS.md → CLAUDE.md) when working with code in this repository.

> 本仓库 **Claude Code 与 Codex 共用此文件**。`AGENTS.md` 仅是指向本文件的指针，避免双份维护。

## 仓库定位

Anynote 是 **polyglot monorepo**，三种语言栈通过 pnpm workspace + Turborepo + Maven multi-module 编排：

- `services/` — Java 21 · Spring Boot 3.3.4 · Spring Cloud 2023.0.3（9 个微服务 + Feign API 模块 + common 共享库 + BOM）
- `apps/web/` — Next.js 15 · React 19（**Phase 5 重写中，当前为空目录骨架**）
- `apps/web-legacy/` — Next.js 13.5（**旧前端，仍是当前用户访问的版本**，Phase 5 验收后才删）
- `ai-service/` — Python 3 · FastAPI · LangChain 0.3 · Pydantic v2
- `packages/api-client/` — `pnpm openapi:generate` 产出的 TS 客户端（**不要手改**，`src/` 已 gitignore）
- `infra/` — docker-compose（中间件 + 全栈）+ SQL + nginx
- `openapi/` — spec 聚合与生成脚本

重构决策文档统一在 `docs/refactor/`：`REFACTOR_PLAN.md`（整体重构方案）、`FRONTEND_REFACTOR_PLAN.md`（前端 TipTap 方案）、`FRONTEND_MILESTONES.md`（Phase 5 可执行里程碑）、`TASKS.md`（Phase 进度跟踪）。**改动前先看相关文档，避免与重构方向冲突**。

## 当前重构进度

| Phase | 内容 | 状态 |
|-------|------|------|
| 0 | Monorepo 基础设施 | ✅ v0.1.0 |
| 1 | OpenAPI Contract First（Springdoc + 29 Controller 注解 + Gateway 聚合） | ✅ v0.2.0 — **但 `pnpm openapi:generate` 从未实际跑成功过；`openapi/specs/` 与 `packages/api-client/src/` 均空** |
| 2 | Maven BOM（统一版本） | ✅ v0.3.0 |
| 3 | Spring Boot 3 + JDK 21 升级（javax→jakarta、Security 6、合并 ai+ai-nio） | ✅ v0.4.0 |
| 4 | 服务层重构（统一异常、REST 规范、HMAC 内部鉴权） | ✅ v0.5.0 — 收尾任务见 `docs/refactor/TASKS.md` L124-128 |
| 5 | 前端完全重写（TipTap + BFF + TanStack Query） | 🔴 **未启动**，`apps/web/` 为空，里程碑见 `docs/refactor/FRONTEND_MILESTONES.md` |
| 6 | Python AI 现代化（Pydantic v2） | ✅ v0.7.0 |
| 7 | OpenSpec 集成 | ✅ v1.0.0 |

**当前分支**：`fix/minio-exception`（与 `dev` 有少量未合并改动）。`main` 是发布分支，日常合并目标是 `dev`。

## 常用命令

### 启动顺序（本地全栈）

```bash
# 1. 启动中间件（MySQL/Redis/Nacos/ES/MinIO/RocketMQ/Logstash/XXL-Job）
docker compose -f infra/docker-compose-middleware.yaml up -d

# 2. 构建并启动 Java 后端（任选其一）
cd services && mvn clean install -DskipTests
docker compose -f infra/docker-compose.yaml up -d   # 容器化
# 或 IDE 中分别启动 gateway/auth/system/note/file/ai/notify 主类

# 3. 启动 Python AI 服务
cd ai-service && pip install -r requirements.txt && \
  uvicorn app:app --reload --host 0.0.0.0 --port 8000

# 4. 启动前端（目前是 legacy）
cd apps/web-legacy && npm install && npm run dev
```

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
pnpm services:build      # = cd services && mvn clean install -DskipTests
pnpm check               # Biome lint + format
pnpm format              # Biome format only
```

> `apps/web` 启动命令（`pnpm --filter web dev` 等）要在 Phase 5 M1 完成后才有效，现阶段不可用。

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
- `apps/web/` 是新前端目标位置，**新功能开发去这里**（如已开始 Phase 5）
- 两者不共用 workspace（`pnpm-workspace.yaml` 显式排除 legacy）

## 上下文文档导航

需要更细节时按主题查：

- `.claude/context/backend.md` — 服务端口表、模块依赖、包结构、ResCode 速查
- `.claude/context/frontend.md` — 前端目录、Query Key 工厂、BFF 认证流程
- `.claude/context/api-contracts.md` — API 契约详细规范
- `openapi/WORKFLOW.md` — API-First 开发步骤
- `.claude/openspec/README.md` — OpenSpec 使用说明
- `.claude/openspec/changes/` — API 变更提案归档
- `CONTRIBUTING.md` — 代码规范要点
- `docs/refactor/REFACTOR_PLAN.md` / `FRONTEND_REFACTOR_PLAN.md` / `FRONTEND_MILESTONES.md` — 重构决策与执行计划
- `docs/refactor/TASKS.md` — Phase 级进度与未完成项
- `docs/backend-security-inventory.md` — 后端安全配置清单

## 提交与分支

- 分支模型：`main`（保护）← `dev` ← `phase/N-*` / `fix/*` / `feat/*`
- 不直接推 `main`，phase 合并到 `dev` 验收后再合 `main` 打 Tag（`v0.X.0`）
- Commit 格式 Conventional Commits：`feat(note): ...` / `fix(gateway): ...` / `refactor(ai): ...` / `chore(bom): ...`
- scope 取模块名（`gateway` / `auth` / `system` / `note` / `file` / `ai` / `notify` / `web` / `web-legacy` / `api-client` / `ai-service` / `bom` / `infra` / `openapi`）
- 跨语言改动**不要混进同一个 commit**（一次只改一个 service 或一个 package）
- **不要写 `Co-Authored-By` / `Co-authored-by` 等 trailer**（包括 AI 助手署名）。本项目所有提交保持单作者，不论是否由 Claude Code / Codex 协助生成。

## 禁止清单（速查）

- ❌ 手改 `packages/api-client/src/` 下任何生成文件
- ❌ Controller 用旧的 Springfox 注解（`@Api` / `@ApiOperation` / `@ApiModelProperty`）
- ❌ Feign `FallbackFactory` 中抛异常（应 `return ResData.error(...)`）
- ❌ `return null` 占位未实现端点（应 `throw new NotImplementedException(...)`）
- ❌ 在 `application.yml` 改运行时配置（应改 Nacos）
- ❌ 新前端用 Milkdown / Wangeditor / Vditor / Muya（统一 TipTap）
- ❌ 前端手写 fetch / axios 直调后端（必须走 `@anynote/api-client` + BFF 代理）
- ❌ 前端把 token 写到 `document.cookie` / localStorage / sessionStorage（必须 httpOnly Cookie）
- ❌ 跨语言混合 commit（Java 改动和前端改动分开提）
- ❌ 直接 push `main` 或 force push
- ❌ 在 commit message 中写 `Co-Authored-By:` trailer（包括 AI 助手署名）
