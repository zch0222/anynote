# Anynote 重构任务进度清单

> 更新时间：2026-05-02  
> 执行依据：REFACTOR_PLAN.md  
> 项目根目录：`/Users/zch/code/anynote/anynote`  
> 源码位置：`/Users/zch/code/anynote/{Anynote-Cloud, anynote-next-web-dev, anynote-langchain}`

---

## 会话中断恢复指引

1. 打开 `/Users/zch/code/anynote/anynote/TASKS.md` 查看当前进度
2. 找到最后一个 `[IN PROGRESS]` 或下一个 `[ ]` 任务
3. 执行 `git -C /Users/zch/code/anynote/anynote log --oneline -10` 确认 git 状态
4. 执行 `git -C /Users/zch/code/anynote/anynote branch -a` 确认当前分支
5. 继续未完成的任务

---

## Phase 0：Monorepo 基础设施 `[IN PROGRESS]`

**目标分支**：`phase/0-monorepo-infra`  
**完成后打 Tag**：`v0.1.0`

### 0-Git：仓库初始化
- [x] 在 `/Users/zch/code/anynote/anynote` 执行 `git init`
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

**目标分支**：`phase/3-spring-boot3` | **Tag**：`v0.4.0`

- [x] 3.1 JDK 升级（maven-compiler-plugin release=21）
- [x] 3.2 javax → jakarta 命名空间批量替换（276处，179文件）
- [x] 3.3 Spring Security 6 配置迁移（gateway WebFlux + common MVC）
- [x] 3.4 MyBatis Plus 3.5.7 — 无弃用 EntityWrapper API
- [x] 3.5 Springfox 完全移除；SwaggerAutoConfiguration 重写为 Springdoc OpenAPI bean
- [x] 3.6 合并 ai + ai-nio → services/ai（TranslateController/Service/Plugin/Factory）

---

## Phase 4：服务层重构 `[DONE ✓ 2026-05-02]`

**目标分支**：`phase/4-service-refactor` | **Tag**：`v0.5.0`

- [x] 4.1 统一异常处理：修复 SpringWebfluxGlobalExceptionHandler 错误 import；NoteController/VideoController return null → throw；全部 FallbackFactory throw → return ResData.error()
- [x] 4.2 统一 REST 规范：/user/manageList→/user/list；banUser/unBanUser→{userId}/ban/{userId}/unban（路径参数化）；更新 RemoteUserService Feign + ManageController
- [x] 4.3 HMAC 签名：HmacUtils + SecurityConstants 常量；FeignRequestInterceptor 添加签名头；InnerAuthAspect 验证 HMAC；ContextWebFilter 存储请求头到 Reactor 上下文；InnerAuthWebfluxAspect @Around + Mono.deferContextual 重写

---

## Phase 5：前端完全重写 `[ ]`

**前置条件**：Phase 1 完成  
**目标分支**：`phase/5-frontend-rewrite`  
**完成后打 Tag**：`v0.6.0`

- [ ] 5.1 初始化 Next.js 15 项目（apps/web/ 替换）
- [ ] 5.2 安装依赖（TanStack Query, Zustand, shadcn/ui 等）
- [ ] 5.3 认证安全重构（BFF + httpOnly Cookie）
- [ ] 5.4 TanStack Query 数据层（替换 Redux + SWR）
- [ ] 5.5 编辑器集成（Milkdown 迁移，删除 Wangeditor）

---

## Phase 6：Python AI 服务现代化 `[ ]`

**前置条件**：Phase 0 完成  
**目标分支**：`phase/6-python-ai`  
**完成后打 Tag**：`v0.7.0`

- [x] 6.1 Pydantic v2 迁移：Optional[X] → X | None；audio_transcriptions_dto.py 已迁移
- [x] 6.2 FastAPI 端点：chat/rag/whisper controller 加 tags/summary/responses；app.py 加 openapi_url
- [x] 6.3 dependencies.py 新建 get_settings() lru_cache；core/config.py 改为 Settings(BaseSettings)

---

## Phase 7：OpenSpec 集成 `[DONE ✓ 2026-05-02]`

**前置条件**：Phase 1 完成  
**目标分支**：`phase/7-openspec`  
**完成后打 Tag**：`v1.0.0`

- [x] 7.1 初始化 .claude/openspec/ 目录结构（README.md + changes/.gitkeep）
- [x] 7.2 创建 openapi/WORKFLOW.md（API-First 开发流程说明）
- [x] 7.3 创建 .claude/context/backend.md、frontend.md、api-contracts.md
- [x] 7.4 创建 AGENTS.md（Codex/OpenAI 格式，简体中文）
