# Anynote 重构任务进度清单

> 更新时间：2026-09-08（本次核对 Phase 5；其他 Phase 沿用原记录）
> 执行依据：[REFACTOR_PLAN.md](./REFACTOR_PLAN.md)  
> 项目根目录：本仓库根（以下命令均假设在项目根执行）  
> 历史源码位置：`Anynote-Cloud/` · `anynote-next-web-dev/` · `anynote-langchain/`（Phase 0 已迁入 `services/` · `apps/web-legacy/` · `ai-service/`）

---

## 会话中断恢复指引

1. 打开 `docs/refactor/TASKS.md`（本文件）查看当前进度
2. 找到最后一个 `[IN PROGRESS]` 或下一个 `[ ]` 任务
3. 在项目根执行 `git log --oneline -10` 确认 git 状态
4. 在项目根执行 `git branch -a` 确认当前分支
5. 继续未完成的任务

---

## Phase 0：Monorepo 基础设施 `[IN PROGRESS]`

**目标分支**：`phase/0-monorepo-infra`  
**完成后打 Tag**：`v0.1.0`

### 0-Git：仓库初始化
- [x] 在项目根执行 `git init`
- [x] 创建根 `.gitignore`（覆盖 Java/Node/Python/IDE/生成文件）
- [x] 提交 .gitignore 作为首个 commit（`main` 分支）
- [x] 创建并切换到 `dev` 分支
- [x] 创建并切换到 `phase/0-monorepo-infra` 分支

### 0.1：目录结构创建
- [x] 创建 `apps/web/`（暂存旧前端，Phase 5 重写）
- [x] 创建 `packages/api-client/`
- [x] 创建 `packages/ui/`
- [x] 创建 `packages/tsconfig/`
- [x] 创建 `services/bom/`
- [x] 创建 `openapi/specs/`
- [x] 创建 `infra/`

### 0.2：源码复制（不含 .git/target/node_modules）
- [x] `Anynote-Cloud/anynote-gateway` → `services/gateway`
- [x] `Anynote-Cloud/anynote-auth` → `services/auth`
- [x] `Anynote-Cloud/anynote-common` → `services/common`
- [x] `Anynote-Cloud/anynote-api` → `services/api`
- [x] `Anynote-Cloud/anynote-modules/anynote-modules-system` → `services/system`
- [x] `Anynote-Cloud/anynote-modules/anynote-modules-note` → `services/note`
- [x] `Anynote-Cloud/anynote-modules/anynote-modules-file` → `services/file`
- [x] `Anynote-Cloud/anynote-modules/anynote-modules-ai-nio` → `services/ai`（主体）
- [x] `Anynote-Cloud/anynote-modules/anynote-modules-notify` → `services/notify`
- [x] `Anynote-Cloud/anynote-modules/anynote-modules-job` → `services/job`
- [x] `Anynote-Cloud/anynote-modules/anynote-modules-manage` → `services/manage`
- [x] `anynote-langchain` → `ai-service`
- [x] `anynote-next-web-dev` → `apps/web`（legacy，Phase 5 重写）
- [x] Docker Compose + sql → `infra/`
- [x] 根级 `pom.xml`（Anynote-Cloud） → `services/pom.xml`

### 0.3：配置文件创建
- [x] 创建根 `package.json`
- [x] 创建 `pnpm-workspace.yaml`
- [x] 创建 `turbo.json`
- [x] 创建 `packages/tsconfig/base.json`
- [x] 创建 `biome.json`
- [x] 安装 biome：`pnpm add -D -w @biomejs/biome`

### 0.4：首次提交与分支操作
- [x] 提交 Phase 0 所有变更到 `phase/0-monorepo-infra`
- [x] 合并到 `dev`
- [x] 合并到 `main`，打 Tag `v0.1.0`

**验收标准**：
- [ ] `ls apps/ packages/ services/ ai-service/ infra/ openapi/` 全部存在
- [ ] `pnpm install` 成功
- [ ] `git log --oneline` 显示正确提交历史

---

## Phase 1：OpenAPI Contract First `[DONE ✓ 2026-05-02]`

**目标分支**：`phase/1-openapi-contract` | **Tag**：`v0.2.0`

- [x] 1.1 后端替换 Springfox → Springdoc（anynote-common-swagger/pom.xml）
- [x] 1.2 全部 29 个 Controller 加 @Tag；TokenController/ChatController 加 @Operation；@ApiModelProperty → @Schema
- [x] 1.3 Gateway application.yml 添加 springdoc swagger-ui 聚合配置（6 服务）
- [x] 1.4 Python FastAPI app.py 添加 openapi_url/title；controller/*.py 加 tags/summary
- [x] 1.5 openapi/generate.sh 已存在并验证

---

## Phase 2：Maven BOM 重构 `[DONE ✓ 2026-05-02]`

**目标分支**：`phase/2-maven-bom` | **Tag**：`v0.3.0`

- [x] 2.1 创建 services/bom/pom.xml（Spring Boot 3.3.4, Cloud 2023.0.3, Java 21, springdoc 等）
- [x] 2.2 修复 services/file 循环依赖（删除 anynote-api-ai/anynote-api-note，TODO Phase 4 解耦）
- [x] 2.3 services/pom.xml 版本号更新，modules 更新为新目录结构
- [x] 2.4 anynote-common-swagger 替换 springfox → springdoc（版本由 BOM 管理）

---

## Phase 3：Spring Boot 3 升级 `[DONE ✓ 2026-05-02]`

**前置条件**：Phase 2 完成  
**目标分支**：`phase/3-spring-boot3` | **Tag**：`v0.4.0`

- [x] 3.1 JDK 升级（maven-compiler-plugin release=21）
- [x] 3.2 javax → jakarta 命名空间批量替换（276处，179文件）
- [x] 3.3 Spring Security 6 配置迁移（gateway WebFlux + common MVC）
- [x] 3.4 MyBatis Plus 3.5.7 — 无弃用 EntityWrapper API
- [x] 3.5 Springfox 完全移除；SwaggerAutoConfiguration 重写为 Springdoc OpenAPI bean
- [x] 3.6 合并 ai + ai-nio → services/ai（TranslateController/Service/Plugin/Factory）

---

## Phase 4：服务层重构 `[DONE ✓ 2026-05-02]`

**前置条件**：Phase 3 完成  
**目标分支**：`phase/4-service-refactor` | **Tag**：`v0.5.0`

- [x] 4.1 统一异常处理：修复 SpringWebfluxGlobalExceptionHandler 错误 import；NoteController/VideoController return null → throw；全部 FallbackFactory throw → return ResData.error()
- [x] 4.2 统一 REST 规范：/user/manageList→/user/list；banUser/unBanUser→{userId}/ban/{userId}/unban（路径参数化）；更新 RemoteUserService Feign + ManageController
- [x] 4.3 HMAC 签名：HmacUtils + SecurityConstants 常量；FeignRequestInterceptor 添加签名头；InnerAuthAspect 验证 HMAC；ContextWebFilter 存储请求头到 Reactor 上下文；InnerAuthWebfluxAspect @Around + Mono.deferContextual 重写

### 后续待办：安全模块兼容层清理

- [ ] 移除兼容模块 `anynote-common-security`：MVC 服务改为直接依赖 `anynote-common-security-servlet`，Reactive 服务改为直接依赖 `anynote-common-security-reactive`，共享/API 模块仅依赖 `anynote-common-security-core`。
- [ ] 清理 `gateway` 数据源自动配置触发链：拆除 `anynote-common-redis -> anynote-api-system -> mybatis-plus` 的传递依赖，避免网关通过共享配置和 JDBC classpath 误创建 DataSource。
- [ ] 拆分 Nacos 公共配置中的数据库配置：将 `application-dev.yml` 里的 `spring.datasource` / MyBatis Plus 配置迁移到仅数据库服务导入的独立配置，避免 `gateway` 等无数据库模块导入公共配置时触发 JDBC/Druid 绑定。

---

## Phase 5：前端完全重写 `[IN PROGRESS]`

**前置条件**：Phase 1 完成  
**目标分支**：按里程碑拆分 `phase/5.0-openapi-validation` ... `phase/5.8-polish`（详见 [`FRONTEND_MILESTONES.md`](./FRONTEND_MILESTONES.md)）  
**完成后打 Tag**：`v0.6.0`

- [x] **M0** OpenAPI 集成验证（门禁） ✓ 2026-05-13 合并 dev（`dfe9360`）
- [x] **M1** 前端骨架与工具链 ✓ 2026-05-23 合并 dev（`c83a083`）：5.1 + 5.2 完成
  - [x] 5.1 初始化 Next.js 15 项目（apps/web/ 替换，next 15.5.18 + React 19.1 + Tailwind v4，锁 v15 未升 v16）
  - [x] 5.2 安装依赖（TanStack Query 5.100, Zustand 5, RHF 7.76, Zod 4.4, shadcn 4.8 / 21 组件 / Field 替代废弃的 Form / 切到 @base-ui/react）
- [ ] **M2** 认证 BFF + Cookie 安全（5.3 BFF + httpOnly Cookie）🟡 进行中
  - [x] M2.0 后端补 `/auth/refresh` + `/auth/logout`：代码已落地（`52cc74a`），单测已补（`LoginServiceImplTest` / `TokenUtilTest`）
  - [x] M2.0 收尾：2026-08-08 补齐 auth spec baseline 并修复生成脚本；2026-09-07 合并 `phase/5.2a-auth-backend` → `dev`（`3865a2f`），本地 `origin/dev` 跟踪引用已指向该提交。
  - [x] M2.1 前置契约修复（2026-09-08 用户确认；Gateway `57bf8b3` / OpenAPI `216a930`）：Gateway 仅接受 Bearer，取消旧请求头兼容；OpenAPI HTTP Bearer/JWT 与六份 baseline 已更新。新增 21 个单测，相关模块共 109 个单测通过；真实 Gateway 无凭据、旧头、无效 Bearer 均返回 401。
  - [ ] M2.1-M2.4 前端 BFF / middleware / 登录页：**尚无实现**。刷新触发、重试及异常处理细节尚未明确；此前局部锁模型仅记为待评估风险，已撤回将 5 秒缓存调整列为开工前置的结论。原方案保持不变，详见 `FRONTEND_MILESTONES.md` M2.1。
- [ ] **M3** API 客户端 + 查询层 + 代理（5.4 TanStack Query 数据层）
- [ ] **M4** AppShell + 主题 + 命令面板
- [ ] **M5** TipTap 编辑器核心（5.5 编辑器集成 — **统一 TipTap**，废弃 Milkdown / Wangeditor / Vditor / Muya）
- [ ] **M6** 笔记业务页面
- [ ] **M7** AI / PDF / Mooc / Tasks / Wikis
- [ ] **M8** 协同 + 桌面 + 收尾

---

## Phase 6：Python AI 服务现代化 `[DONE ✓ 2026-05-02]`

**前置条件**：Phase 0 完成  
**目标分支**：`phase/6-python-ai` | **Tag**：`v0.7.0`

- [x] 6.1 Pydantic v2 迁移：Optional[X] → X | None；audio_transcriptions_dto.py 已迁移
- [x] 6.2 FastAPI 端点：chat/rag/whisper controller 加 tags/summary/responses；app.py 加 openapi_url
- [x] 6.3 dependencies.py 新建 get_settings() lru_cache；core/config.py 改为 Settings(BaseSettings)

---

## Phase 7：OpenSpec 集成 `[DONE ✓ 2026-05-02]`

**前置条件**：Phase 1 完成  
**目标分支**：`phase/7-openspec` | **Tag**：`v1.0.0`

- [x] 7.1 初始化 .claude/openspec/ 目录结构（README.md + changes/.gitkeep）
- [x] 7.2 创建 openapi/WORKFLOW.md（API-First 开发流程说明）
- [x] 7.3 创建 .claude/context/backend.md、frontend.md、api-contracts.md
- [x] 7.4 创建 AGENTS.md（Codex/OpenAI 格式，简体中文）
