# Anynote 前端重构里程碑（可执行版）

> 文档版本：v1.4 | 生成日期：2026-05-13 | 最近核对：2026-09-09（权限恢复；单测、生产构建、原始 OpenAPI 生成及独立认证链路验证通过，修复默认登出过滤器截获）
> 关联文档：[REFACTOR_PLAN.md](./REFACTOR_PLAN.md) Phase 5、[FRONTEND_REFACTOR_PLAN.md](./FRONTEND_REFACTOR_PLAN.md)
> 当前状态：Phase 0-4、6、7 已 ✓；**Phase 5 进行中 —— M0 / M1 / M2.0 已完成；M2.1 独立登录/注册/登出 BFF、M2.2 路由保护与 M2.3 页面已实现并通过单测；刷新仍按用户确认暂缓，M2.4 未完成；M3-M8 未启动**。
> 完成度参考：9 个里程碑完成 2 个；按工期估算 14-19 天中约完成 2 天，**Phase 5 约 15%**
> `openapi/specs/*.json` 6 份 baseline 已入库；`packages/api-client/src/` 仍 gitignored，需本地跑一次 `pnpm openapi:generate` 派生
> 主干分支：`dev`；本计划**按里程碑逐个开分支**（`phase/5.0-openapi-validation` … `phase/5.8-polish`，见总览表），不使用单一的 `phase/5-frontend-rewrite`
>
> ✅ **契约漂移已修复（2026-08-08）**：起全栈跑 `pnpm openapi:generate` 后，`openapi/specs/auth.json` 从 4 条路径补齐到 6 条（新增 `/refresh` `/logout`，以及 `RefreshTokenDTO` / `LogoutDTO` 两个 schema）。M2.1 的阻塞随之解除。
>
> ✅ **漂移门禁缺陷已修复（2026-08-08）**：生成时剥离 `servers`、递归排序 key，并在校验通过后才覆盖 baseline；包含 20 个单测，历史验证见 §6。2026-09-07 未重新运行全栈验收。
>
> **分支落点（2026-09-09 核对）**：M2.0 已通过 `3865a2f` 合并到 `dev`；Gateway/Bearer 前置提交和本轮认证实现均位于 `phase/5.2-auth-bff`。本轮五笔代码提交见 §5，未合并到 `dev` 或 `main`，未推送远端。

---

## 0. 规划时的可复用资产盘点（历史快照）

> 本节保留开工前盘点；当前进度以各里程碑状态与本文顶部 2026-09-07 核对为准。

| 项 | 状态 | 位置 / 备注 |
|----|------|------------|
| Monorepo（pnpm + turbo） | ✅ | 根 `package.json` / `pnpm-workspace.yaml` / `turbo.json` |
| Biome lint + format | ✅ | `biome.json`，根脚本 `pnpm check` |
| Springdoc OpenAPI 注解 | ✅（待验证） | 29 个 Controller 已加 `@Tag`，关键加 `@Operation` |
| Gateway OpenAPI 聚合 | ✅（待验证） | `services/gateway/.../application.yml` swagger-ui urls |
| OpenAPI 生成脚本 | ✅（未跑过） | `openapi/generate.sh`，输出 `packages/api-client/src/*.ts` |
| Python FastAPI OpenAPI | ✅ | `ai-service/app.py`，`/v3/api-docs` |
| `@anynote/api-client` 包 | 🟡 | 仅有 `package.json`，无源文件 |
| 旧前端参考 | ✅ | `apps/web-legacy/`（不进 workspace，迁移完成后删除） |
| 后端 Phase 4 收尾 | 🟡 | `anynote-common-security` 兼容层、网关数据源传递依赖、Nacos 公共配置拆分（TASKS.md L124-128） |

**关键判断**：后端 Phase 1 结构性工作完成，但**没有任何一次端到端 OpenAPI → TS 类型的成功生成**。前端如果直接开工 F5+，会立刻撞上"spec 是否真能用"的问题。因此本里程碑的 **M0 是强制门禁**。

---

## 1. 里程碑总览

```
M0 ──▶ M1 ──▶ M2 ──▶ M3 ──┬─▶ M4 ──┐
                            │        ├─▶ M6 ──▶ M7 ──▶ M8
                            └─▶ M5 ──┘
```

| ID | 名称 | 工期 | 前置 | 分支 | OpenAPI 关联 |
|----|------|------|------|------|------------|
| **M0** | OpenAPI 集成验证（门禁） | 1-2 天 | Phase 1-4 已完成 | `phase/5.0-openapi-validation` | ★★★ 核心 |
| **M1** | 前端骨架与工具链 | 0.5 天 | M0 | `phase/5.1-skeleton` | 弱（typed env） |
| **M2** | 认证 BFF + Cookie 安全 | 1.5 天 | M1 | `phase/5.2-auth-bff` | 中（auth 端点） |
| **M3** | API 客户端 + 查询层 + 代理 | 1.5 天 | M0, M2 | `phase/5.3-api-layer` | ★★★ 主入口 |
| **M4** | AppShell + 主题 + 命令面板 | 1 天 | M2 | `phase/5.4-app-shell` | 弱 |
| **M5** | TipTap 编辑器核心 | 3-4 天 | M1（可与 M2-M4 并行） | `phase/5.5-tiptap-core` | 中（文件分片直传） |
| **M6** | 笔记业务页面 | 2-3 天 | M3, M5 | `phase/5.6-notes` | 强（笔记 CRUD） |
| **M7** | AI / PDF / Mooc / Tasks / Wikis | 3-4 天 | M3, M5 | `phase/5.7-features` | 强（AI SSE / chat-pdf） |
| **M8** | 协同 + 桌面 + 收尾 | 2 天 | M6, M7 | `phase/5.8-polish` | 弱 |

**总工期估算**：14-19 工作日（约 3-4 周），与 REFACTOR_PLAN 中 Phase 5 估算 5-7 天的差异来自 TipTap 切换 + 完整业务页面迁移成本。

### 1.1 计划外已完成的工作（不属于任何里程碑）

2026-08-07 / 08-08 在 `phase/5.2a-auth-backend` 上插入了一轮**测试基础设施建设**，共 12 个 commit。这批工作不在 M0-M8 任何里程碑范围内，但已成为后续所有里程碑的**强制前提**（CLAUDE.md 与 README 已把"改动必带单测"写成硬约束），故在此登记，避免下次核对进度时对不上账。

| commit | 内容 |
|---|---|
| `d1a4e46` | 修正本文档 presign 悬空引用 + 同步 Phase 5 状态 |
| `b46ce18` | CLAUDE.md 新增「测试要求（强制）」章节：前后端改动必须附带单测 |
| `7356f6a` | 打通全部 Java 模块的单测能力（surefire + JUnit 5 + Mockito） |
| `1778108` | `apps/web` 接入 vitest + jsdom + RTL，提供 QueryClientProvider 测试工具 |
| `f17b271` | `turbo.json` 加 `test` 任务，根 `pnpm test` 透传 |
| `b33c93f` | 新增 `.github/workflows/test.yml`：每个 PR 跑 Java + 前端单测 |
| `747fde2` | README 用实际命令替换测试基建缺口警告 |
| `937b2d2` | 修复集成测试排除项：改走 `${test.excluded.groups}` 属性，命令行才放得开 |
| `1bd2237` | 补 token / password / HMAC 单测（`TokenUtilTest` / `LoginServiceImplTest` / `PasswordServiceImplTest` / `HmacUtilsTest` / `SecurityUtilsTest` / `StringUtilsTest`） |
| `584277c` | README 修正集成测试命令并说明 `-am` 要求 |
| `939ac33` | README 补充单测架构说明 |
| `7b90761` | 约定 commit message 一律用中文 |

**对后续里程碑的影响**：M2.1 起每个 BFF Route Handler、每个 `use*Query` / `use*Mutation` hook 都必须带单测才算完成（见 CLAUDE.md「测试要求」表）。`1bd2237` 中的 `LoginServiceImplTest` 已覆盖 M2.0 新增的 `refresh` / `logout` 业务分支。

---

## M0：OpenAPI 集成验证（强制门禁）

**目标**：用一次端到端跑通证明"后端 spec → 前端类型"链路可用，识别并补齐缺失注解。本里程碑不通过，后续禁止合并到 dev。

**分支**：`phase/5.0-openapi-validation`（从 `dev` 切出）

**状态**：🟢 **M0 已完成并合入 dev（`dfe9360`）；M0.1-M0.4 的历史验收记录如下，M0.5 合并状态见本节末。**

### M0.1 启动完整后端 ✅
- [x] 在 `infra/` 启动中间件：`docker compose --env-file=/dev/null -f docker-compose-middleware.yaml up -d`，确认 MySQL/Redis/Nacos/MinIO/ES/RocketMQ 健康
- [x] 启动核心服务（`docker-compose.yaml` + 新增的 `docker-compose.dev.yaml` override）：`gateway` `auth` `system` `note` `file` `ai-nio` `notify` `manage` `job`，9 个容器均 healthy；详见下文 **运维发现**
- [ ] 启动 `ai-service`（Python）：本里程碑未启动，Phase 5 之后再接（FastAPI 独立 OpenAPI 暴露 `:8000/v3/api-docs`，不入 Gateway 聚合）
- [x] 验证 `http://localhost:8080/{auth,system,note,file,ai,notify}/v3/api-docs` 全部返回正常 spec

**运维发现**（写入修复，长期生效）：
1. **`infra/.env` 是给 IDEA 本地宿主机用的**，含 `MYSQL_HOST=127.0.0.1` `ROCKETMQ_BROKER_ADVERTISE_IP=127.0.0.1` 等。直接 `docker compose up` 时这些值会泄漏到容器，破坏 RocketMQ broker 自我广播 → 多个服务 MQ listener 启动失败。**所有 compose 命令必须加 `--env-file=/dev/null`**，已写入 `infra/docker-compose.dev.yaml` 注释与本工作流 CI。
2. **`infra/docker-compose.dev.yaml`（新增）**：app 容器 `restart: "no"`，避免启动失败被无限重试遮蔽。
3. **Gateway 路由 / 鉴权白名单缺 v3 OpenAPI 路径**：原 `application.yml` swagger-ui 与 `openapi/generate.sh` 都期望 `/{svc}/v3/api-docs`，但 Nacos `anynote-gateway-dev.yml` 只暴露 `/api/{svc}/**` 路由，且 AuthFilter 白名单只包含旧 `/*/v2/api-docs`。已在 Nacos 配置中新增 6 条 `openapi-*` 路由 + v3 白名单 4 条。
4. **`ai-nio` / `notify` 缺 `anynote-common-swagger` 依赖**：两个服务 Controller 已加 `@Tag` / `@Operation`，但 pom.xml 没引 swagger 包，导致 `/v3/api-docs` 返回 `B0001`。已在两个 pom 中新增依赖。
5. **RocketMQ broker readiness 不严谨**：broker healthcheck 仅 TCP probe，broker 与 namesrv 完成 topic 路由同步前 app 启动会 `RemotingSendRequestException`。已在 dev override 里通过 `restart: "no"` 让该问题立刻可见；**待办**：把 broker healthcheck 升级为 `mqadmin clusterList`（M0 之外的运维任务，已记入 docs/refactor/TASKS.md 候选）。

### M0.2 运行生成脚本 ✅
- [x] 执行 `pnpm openapi:generate`：specs/ 6 个 JSON 输出，体积 auth=3.3KB / system=20KB / note=72KB / file=13KB / ai=15KB / notify=2.6KB（notify 偏小但 schema 正确，体积只是因为它只有 2 个 Controller / 5 个端点）
- [x] `packages/api-client/src/{auth,system,note,file,ai,notify}.ts` 全部产出
- [x] 在 `packages/api-client/` 新增 `tsconfig.json` + `typecheck` 脚本，`pnpm tsc --noEmit` 0 错误（strict + noUncheckedIndexedAccess + exactOptionalPropertyTypes 全开）

### M0.3 识别并补齐注解缺口 ✅（strict 范围）
12 个前端必需端点状态：

| 端点（文档目标） | 实际后端路径（gateway 后缀） | 状态 |
|---|---|---|
| POST `/auth/login` | `auth /login` | ✅ 已有注解 |
| POST `/auth/refresh` | **不存在** | ⏸️ 未实现，下推 M2（auth BFF）一起设计 |
| POST `/auth/logout` | **不存在** | ⏸️ 未实现，下推 M2 |
| GET `/system/user/getInfo`（或 `/api/v1/me`） | `system /user/mine` | ✅ 本次补 `@Operation` |
| GET `/note/knowledge-bases` | `note /bases` | ✅ 本次补 `@Operation`（路径保持 `/bases`，由 BFF 在前端侧重命名） |
| GET `/note/notes` | `note /notes` | ✅ 本次补 `@Operation` |
| GET `/note/notes/{id}` | `note /notes/{noteId}` | ✅ 本次补 `@Operation` |
| PATCH `/note/notes/{id}` | `note /notes/{noteId}` | ✅ 本次补 `@Operation` |
| 浏览器直传文件（分片） | `file /ossSliceUploadTasks` + `file /getOssSliceUploadSignatures` | ✅ 已有完整实现，前端复用现有分片直传流程 |
| POST `/file/upload` | `file /` (root POST) | ✅ 本次补 `@Operation` 并明确"内部接口" |
| POST `/ai/v1/chat/completions` | `ai /chat/completions` | ✅ 已有注解 |
| POST `/ai/v1/translate` | `ai /translate` | ✅ 已有注解 |

操作完成情况：
- [x] `services/ai/.../RagController.java:63` `return null` → `throw new BusinessException(...)`
- [x] `services/system/.../SysOrganizationController.java:30` `return null` → `throw new BusinessException(...)`
- [x] 12 个端点的 `@Operation(summary, description)` 补齐（上表对应处）
- [x] 确认浏览器直传复用已有分片上传接口（`ossSliceUploadTasks` + `getOssSliceUploadSignatures`），无需新增 presign 端点
  - 当前仅 MinIO；HuaweiOBS 走原有 `/createHuaweiOBSTemporarySignature`，新接口会抛 `BusinessException` 提示走专用接口
- [x] Springdoc info 块默认值通过 Nacos `application-dev.yml` 全局注入（title / version / license / contact）

**M0 范围之外的发现（broader Phase 4 leftover）**：
扫描全仓 `@PostMapping/@GetMapping/...` 与 `@Operation` 配对得到 **约 150 个端点仍缺 `@Operation`**（主要集中在 `note/MoocController` `note/NoteController`（除 4 个 critical 外）`note/DocController` `system/SysUserController` 等大批历史端点）。**这是 Phase 4 收尾遗留，不在 M0 范围**，应作为独立 backend 工单处理。本里程碑只确保 12 个前端 critical 端点合格。

### M0.4 建立 CI 漂移检测 ✅
- [x] 创建 `.github/workflows/openapi-check.yml`：JDK 21 + pnpm9 + Maven build + docker compose 起全栈 + `pnpm openapi:generate` + `git diff --exit-code openapi/specs/` 检测 baseline 漂移
- [x] `packages/api-client/` 新增 `tsconfig.json` + `pnpm typecheck`，并接入 turbo（根 `pnpm typecheck` 可一键跑全仓）
- [x] 调整 `.gitignore`：`openapi/specs/*.json` **入库**作为 baseline，`packages/api-client/src/` 继续 gitignored（每次从 specs 派生）
- [x] 根 `package.json` 新增 `pnpm openapi:check`（本地一键检查）

### M0.5 验收 ✅
- [x] `pnpm openapi:generate` 干净退出，6 个 service spec 全部产出
- [x] `pnpm --filter @anynote/api-client typecheck` 0 错误
- [x] 12 个关键端点中**已存在的 10 个**在生成的 paths 类型中均可找到，且请求体 / 响应体均有具名 schema（非 unknown）；2 个未实现的 auth refresh/logout 已下推 M2
- [x] PR 合并到 `dev`（merge commit `dfe9360 chore: merge phase/5.0-openapi-validation → dev`）。Tag `v0.5.1-openapi-ready` 暂未打（与 M1 / M2 一起延后到 Phase 5 中段统一发版）

> ⚠️ 如果 M0.3 发现后端缺口较多（>5 个端点没法用），优先补完再开 M1，不要并行启动前端。

---

## M1：前端骨架与工具链

**目标**：可启动的空壳应用，工具链全绿。

**分支**：`phase/5.1-skeleton`

**状态**：🟢 **2026-05-23 完成 M1.1–M1.5，已合并 dev**（merge commit `c83a083 chore: merge phase/5.1-skeleton → dev`）。

### M1.1 初始化 Next.js 15 ✅
- [x] 删除空 `apps/web/`，重新生成（**实际命令与原计划差异**：`@latest` → `@15` 锁定 v15（避免 Next.js 16 已发布造成大版本漂移）；`--turbo` → `--turbopack`（CLI flag 改名）；加 `--use-pnpm --yes`）：
  ```bash
  cd apps && pnpm create next-app@15 web \
    --typescript --tailwind --app --src-dir \
    --import-alias "@/*" --no-eslint --turbopack --use-pnpm --yes
  ```
- [x] `apps/web` 已在 `pnpm-workspace.yaml` 中纳入（之前已存在），`pnpm install` 顺利联通

**实际产出版本**（2026-05-23 解析）：

| 包 | 版本 | 备注 |
|---|---|---|
| `next` | 15.5.18 | 锁 v15（v16 已 GA 未升） |
| `react` / `react-dom` | 19.1.0 | Next.js 15 默认 |
| `tailwindcss` + `@tailwindcss/postcss` | 4.3.0 | **Tailwind v4**（影响 shadcn 选项） |
| `typescript` | 5.9.3 | |

### M1.2 依赖安装 ✅
```bash
cd apps/web && pnpm add \
  @tanstack/react-query @tanstack/react-query-devtools \
  zustand react-hook-form @hookform/resolvers zod \
  ky openapi-fetch openapi-typescript \
  next-themes jose \
  class-variance-authority clsx tailwind-merge lucide-react \
  @microsoft/fetch-event-source date-fns cmdk

pnpm add -D vitest @vitest/ui @testing-library/react @testing-library/dom @testing-library/jest-dom jsdom
```

**版本提醒（与训练截止时有大版本差异）**：
- `zod ^4.4.3`（v3 → v4 破坏性变更，schema API 调整，错误格式从 `error.flatten()` 改为 `z.flattenError()`，写表单 schema 时注意）
- `zustand ^5.0.13`
- `ky ^2.0.2`
- `lucide-react ^1.16.0`
- `vitest ^4.1.7`

### M1.3 shadcn/ui 初始化与首批组件 ✅
```bash
pnpm dlx shadcn@latest init -d --force
# baseColor 默认 neutral，需手动改 components.json → "slate"，并按 Tailwind v4 slate palette 用 OKLCH 覆盖 src/app/globals.css 的 :root / .dark
pnpm dlx shadcn@latest add button input dialog dropdown-menu \
  sheet sidebar avatar badge card table tabs tooltip skeleton sonner \
  command separator scroll-area --yes
pnpm dlx shadcn@latest add @shadcn/field --yes   # Form 已弃用，改 Field 原语
```

**shadcn 2026 关键变更**（首次遇到，已踩；M5 / M6 沿用时注意）：

| 旧（设计本文档时） | 新（2026） |
|---|---|
| `--style new-york / default` | `--preset base-nova`（CLI `-d` 默认；style 字段值为 `base-nova`） |
| 依赖 `@radix-ui/react-*` 单包 | 改用 `@base-ui/react`（Radix 团队下一代统一库） |
| 注册组件 `form` | **已弃用**，注册表返回空壳。改用 **`field`** 原语（FieldSet / FieldLabel / FieldDescription / FieldError / FieldGroup / Field / FieldTitle / FieldSeparator / FieldContent / FieldLegend），通过 `errors` 属性与 react-hook-form 直接配合 |
| 纯 CLI | 附带 runtime 包 `shadcn`（提供 `shadcn/tailwind.css` 预设）和 `tw-animate-css`（动画扩展） |
| CLI `--base-color slate` flag | 已移除；`-d` 强制写 `neutral`。要 slate 必须**手改 `components.json` + 手贴 OKLCH** |

最终 `apps/web/src/components/ui/` 共 **21 个文件**：`avatar / badge / button / card / command / dialog / dropdown-menu / field / input-group / input / label / scroll-area / separator / sheet / sidebar / skeleton / sonner / table / tabs / textarea / tooltip`（`input-group` / `label` / `textarea` 是 shadcn 自动随依赖补齐）。

### M1.4 TypeScript / Biome / Turbo 配合 ✅
- [x] `apps/web/tsconfig.json` 改为 `extends "@anynote/tsconfig/base.json"`（自动启用 strict + noUncheckedIndexedAccess + exactOptionalPropertyTypes），保留 Next.js 必需的 `jsx: preserve` / `plugins: [{name: next}]` / `paths` / `incremental` / `include`
- [x] `@anynote/tsconfig` 加入 `apps/web` 的 devDeps（`workspace:*`）
- [x] `apps/web/package.json` 增 `lint` / `typecheck` / `test` / `test:watch` 脚本；`turbo.json` 已有任务直接接入（根 `pnpm typecheck` / `pnpm check` / `pnpm build` 透传）
- [x] `apps/web/src/lib/env.ts`：zod schema 分 `serverSchema`（`NODE_ENV` / `BACKEND_URL`）与 `clientSchema`（`NEXT_PUBLIC_APP_URL`），运行时 `isServer` 切换，失败时打印字段级 error 并抛出

**额外踩坑 / 修复（写入文档以备后续踩）**：
1. shadcn 生成的 `sonner.tsx:12` `theme as ToasterProps["theme"]` 在 `exactOptionalPropertyTypes` 下报错（`theme` 残留 `undefined`），已改为 `as NonNullable<ToasterProps["theme"]>`。后续 `shadcn add sonner` 重生时要重新修补。
2. `pnpm check` 默认扫**全仓**，首次跑会误伤 `apps/web-legacy/` 的 243 个文件 + 6 个 `openapi/specs/*.json` baseline（baseline 是 single-line JSON，被 biome 格式化成多行会让 CI `git diff --exit-code` 永远红）。已在 `biome.json` `files.ignore` 追加 4 条：`apps/web-legacy` / `apps/web/.next` / `apps/web/src/components/ui`（vendored 代码，每次 `shadcn add` 会再次触发 5 个 lint error） / `openapi/specs`。

### M1.5 验收 ✅
- [x] `pnpm dev` 启动 **662 ms**（远小于 3s 目标），`HEAD /` 返回 200，首次编译 `/` 1.5s
- [x] `pnpm build` 成功：5/5 静态页生成；`/` 5.43 kB，First Load JS 119 kB，shared 131 kB
- [x] `pnpm check` 20 files / 0 fixes（全绿）
- [x] `pnpm typecheck` turbo 跑 web + api-client 两包均通过
- [x] 合并到 `dev`（`--no-ff` merge commit，与 M0 风格一致）；`phase/5.1-skeleton` 分支保留

---

## M2：认证 BFF + Cookie 安全

**目标**：登录全链路走通；浏览器侧无法读到 token；并发刷新无竞争。

**分支**：拆分为两段执行
- **`phase/5.2a-auth-backend`**：后端补 refresh/logout 端点（不在原计划中，因 M0.3 已识别该缺口）
- **`phase/5.2-auth-bff`**：前端 BFF + middleware + 登录页

**状态**：🟡 进行中（2026-05-23 起）—— **2026-09-08 本轮已完成环境变量改名、登录/注册/登出 BFF、M2.2 路由保护与 M2.3 页面，149 个前端单测通过。刷新、依赖刷新的 me/业务代理及 M2.4 完整验收暂缓。**
`features/auth/` 已实现；`stores/` 尚未实现。本轮不更改原刷新锁方案，也未采纳提前 60 秒刷新的讨论建议。构建及后端单测重跑限制见 §5。

### 关键决策（开工前敲定）

1. **Cookie 方案：2 件套 `at` + `rt`**（放弃原计划的 `sid`）
   - 后端 Redis 已按 token 字符串本身做反查，不需要 sid 关联会话
   - 两 cookie 均 `HttpOnly; Secure; SameSite=Strict; Path=/`
   - CSRF 由 `SameSite=Strict` + Origin header 检查防御，不需要 CSRF 专用 cookie
2. **环境变量命名**：与 `.claude/context/frontend.md` 对齐
   - `INTERNAL_API_URL`（server-only，BFF → gateway，docker 内 `http://gateway:8080` 本地 `http://localhost:8080`）
   - `NEXT_PUBLIC_APP_URL`（浏览器源）
   - **不引入 `NEXTAUTH_SECRET`**——不用 next-auth，BFF 透传后端 JWT 不签名
   - M1.4 写的 `BACKEND_URL` 在 M2.1 改名为 `INTERNAL_API_URL`
3. **Refresh 契约**
   - Input：`{ refreshToken: string }`
   - Output：新 `Token`（access + refresh 同时旋转，旧 refresh 立即从 Redis 删除）
   - 旧 accessToken 留待自然过期（实例已存于 Redis；攻击窗口至多到 TTL）
4. **Logout 契约**
   - Input：`{ accessToken?, refreshToken? }`，至少一个非空白（2026-09-08 用户确认允许仅凭 `rt` 登出；原契约强制 `accessToken`）
   - 服务端仅清当前会话 Redis 键（**单会话登出**），不动该用户其他端
   - 仅提供 `rt` 时撤销该 refreshToken；不推断或批量删除未提供的 accessToken
   - 幂等：token 失效/不存在时静默成功
   - 变更提案：[仅凭 refreshToken 登出](../../.claude/openspec/changes/2026-09-08-logout-refresh-token-only.md)；代码、真实 Springdoc baseline 与 BFF 已同步，测试记录见 §5

### M2.0 后端：补 /auth/refresh + /auth/logout 🟢 代码、spec 与合并已完成

**分支**：`phase/5.2a-auth-backend`

- [x] `services/common/anynote-common-security-core/.../TokenUtil.java` 新增 `logout(at, rt)` 方法（per-session Redis 删键，幂等）
  - 现有 `refreshToken(oldRefreshToken)` 已自带 access + refresh 旋转 + 旧 refresh 删除，直接复用
- [x] `services/auth/.../model/dto/RefreshTokenDTO.java`、`LogoutDTO.java`（含 `@Schema` 注解）
- [x] `services/auth/.../service/LoginService.java` 接口加 `refresh(rt) → Token` 与 `logout(at, rt)`
- [x] `services/auth/.../service/impl/LoginServiceImpl.java` 实现两方法（参数校验 + 委托 TokenUtil）
- [x] `services/auth/.../controller/TokenController.java` 暴露 `POST /refresh` 与 `POST /logout`，含 `@Operation` 注解
- [x] `infra/docker/nacos/configs/anynote-gateway-dev.yml` 白名单加 `/api/auth/refresh` 与 `/api/auth/logout`（refresh 入口可能 access 已过期；logout 应允许任意状态）
- [x] `mvn install -pl auth -am -DskipTests` 编译通过
- [x] 提交 commit `52cc74a feat(auth): add /refresh + /logout endpoints (Phase 5 M2.0)`
- [x] 单测覆盖：`LoginServiceImplTest` / `TokenUtilTest`（随 §1.1 的 `1bd2237` 补齐）
- [x] **契约漂移已修（2026-08-08）**：起全栈（`docker compose --env-file=/dev/null -f infra/docker-compose.yaml -f infra/docker-compose.dev.yaml up -d --build`）→ 跑 `pnpm openapi:generate` 重生 `openapi/specs/auth.json` 与 `packages/api-client/src/auth.ts`
  - `auth.json` 4 条路径 → 6 条：新增 `/refresh` `/logout`；`components.schemas` 新增 `RefreshTokenDTO` / `LogoutDTO`（共 +36 个键）
  - 6 份 spec 全部校验通过（可解析 + paths 非空）：ai 16 / auth 6 / file 13 / note 60 / notify 2 / system 23
  - `notify.json` 的 `info` 块（contact / license / description）由空值变为 Nacos `application-dev.yml` 注入的全局值，与其余 5 份收敛一致 —— 属预期修正
  - **M2.1 的阻塞就此解除**
- [x] 2026-09-07 merge `phase/5.2a-auth-backend` → `dev`（`3865a2f`）；本地 `origin/dev` 跟踪引用已同步。后续工作在 `phase/5.2-auth-bff` 推进，新增提交见 M2.1。

### M2.1 BFF 路由

**Gateway 前置改造：已按 2026-09-08 用户确认完成。** 用户要求“补 Bearer，直接去除对 accessToken 的兼容”，因此取消兼容旧头的候选方案，采用外部仅 Bearer 的破坏性变更。契约记录见 [2026-09-08-gateway-bearer-only.md](../../.claude/openspec/changes/2026-09-08-gateway-bearer-only.md)。

- [x] Gateway 私有路由仅从 `Authorization: Bearer <token>` 取 token，缺失/格式非法/重复头/失效 token 返回原有 401 + ResData；不回退到旧头、Cookie 或 query。
- [x] 验证后移除外部 Authorization 和伪造身份头，按既有内部协议注入 `accessToken` / `user_id`。内部字段不属于旧客户端认证兼容入口。
- [x] `SwaggerAutoConfiguration` 声明 HTTP Bearer/JWT，六份 spec 经真实后端 `pnpm openapi:generate` 重生；逐份结构对比确认仅 security scheme 变化，paths 与业务 schema 不变。
- [x] 先复现失败后修复：新增 Gateway 20 个用例 + OpenAPI 1 个用例；相关模块及依赖共 109 个单测通过。`mvn install -DskipTests`、`pnpm check`、`pnpm typecheck` 与直接运行 `pnpm --filter @anynote/api-client typecheck` 通过。
- [x] 本地开发栈 9 个 Java 服务健康；真实 Gateway 的无凭据、仅旧头、无效 Bearer、Basic 加旧头请求均返回 HTTP 401 / `A0350`。

**兼容性影响**：`apps/web-legacy` 仍发旧请求头，切换后的私有调用会失败；本次没有擅自迁移旧前端。Gateway 改造已提交为 `57bf8b3`，OpenAPI 与六份 baseline 已提交为 `216a930`；本次未合并到 `dev` 或 `main`。

> **刷新流程待评估风险（2026-09-08 更正）**：下方原始 BFF 任务及 `Map<rt, Promise<void>>` 要求保持不变，尚未实现。文档仅用 `isExpiringSoon(at)` 示意触发条件，未明确提前刷新阈值、token 缺失/失效时的处理及完整重试流程。
>
> 此前使用 Map/finally 的局部模型，模拟 10 个携带相同旧 Cookie 的请求，其中 9 个晚到刷新逻辑，得出 2 次刷新、9 个失败。该结果只说明此局部算法在指定时序下的风险；不是完整 BFF 的实现或验收结果，也不足以直接决定必须采用哪种修复。
>
> **撤回过早的阻塞结论**：不再将“共享 Promise<Token> + 保留成功结果 5 秒”列为开工前置或当前必须确认的调整。该候选方案未经采纳，尚未修改文档原定实现要求或编写 BFF。应先明确完整刷新流程，再结合具体实现与并发用例评估；若确需偏离已确认方案，再按用户要求停下确认。
>
> 原 spec 缺口已解决；派生的 `packages/api-client/src/` 仍 gitignored，换机器需按仓库流程重新生成。

> **本轮执行范围（2026-09-08 用户确认）**：暂缓刷新，先完成独立任务。`refresh`、`me`、通用代理均保持未完成；登录、注册、登出、路由保护和 M2.3 页面已实现。接手时前端 125 个测试中 refresh-only 登出失败，修复后全通过；新增页面/mutation 24 个测试，现共 149 个通过。后端工作区已有对应实现与 23:32 的成功报告，本轮从运行中的真实服务生成契约，未把历史报告记作本轮重跑成功。

- [x] 重命名 `apps/web/src/lib/env.ts` 中 `BACKEND_URL` → `INTERNAL_API_URL`（2026-09-08 已核对代码与环境变量单测）
- [x] `src/app/api/auth/login/route.ts`：调用 `/api/auth/login` → 响应中 `Set-Cookie` 两件套（`at` / `rt`）；注册 BFF 同步实现，响应仅含公开资料，Origin、错误及 Cookie 边界均有单测
- [ ] `src/app/api/auth/refresh/route.ts`：进程内 `Map<rt, Promise<void>>` 锁防并发
- [x] `src/app/api/auth/logout/route.ts`：清两件套 + 调后端 `/api/auth/logout`；仅 `rt` 时省略 `accessToken`，无 Cookie 时幂等清理，后端失败仍清 Cookie 并返回错误
- [ ] `src/app/api/auth/me/route.ts`：转发 `/api/system/user/mine`，返回用户资料
- [ ] `src/app/api/proxy/[...path]/route.ts`：所有业务请求经此，自动注入 `Authorization: Bearer ${at}` 并在过期时触发 refresh

### M2.2 中间件路由保护
- [x] `apps/web/src/middleware.ts`：未带 `at` cookie 的私有路由重定向到 `/login`（2026-09-08 代码与单测核对通过）
- [x] `matcher` 排除 `/login` `/register` `/api/auth/**` `/_next` 静态资源；API 自行鉴权，matcher 单测覆盖公开与私有路径

### M2.3 登录 / 注册页
> 2026-09-08 代码与单测完成。页面及 BFF 共用 zod 校验，调用生成契约约束的 openapi-fetch 客户端；`useLoginMutation` / `useRegisterMutation` 不重试写请求。认证路由组提供 QueryClientProvider 与 Toaster，待 M3 的全局 Provider 统一接入。`/dashboard` 页面属于后续里程碑，目前仅验证跳转目标。
- [x] `(auth)/login/page.tsx`：react-hook-form + zod + shadcn Field，提交到 `/api/auth/login`
- [x] `(auth)/register/page.tsx`：调 `/api/auth/register`（后端 register 直接登录返回 LoginDTO）；用户名 6–15 位，密码 8–15 位且包含大小写字母和数字，性别沿用 0 男 / 1 女
- [x] 错误吐司用 sonner；覆盖 HTTP 200 业务失败、HTTP 错误、异常响应及网络失败
- [x] 登录成功 `router.push('/dashboard')`；注册成功同样跳转；测试覆盖提交期间禁用按钮、失败可重试和页面互链

### M2.4 验收
- [ ] 登录后 DevTools → Application → Cookies：只有 `at` / `rt`，HttpOnly 均为 ✓
- [ ] DevTools → Application → LocalStorage / SessionStorage 全空
- [ ] 手动让 `at` 提前过期（缩短 TTL 至 30s 测试），并发触发 10 个请求，只产生 1 次 `/api/auth/refresh` 调用
- [x] 登出响应清除 cookies 两件套；2026-09-09 真实 HTTP 链路验证双 Cookie 与仅 rt 场景，旧凭据撤销结果符合契约（浏览器存储面板尚未直接检查）
- [ ] 合并 `phase/5.2-auth-bff` → `dev`

---

## M3：API 客户端 + 查询层 + 代理

**目标**：业务页面调用 API 全部走类型安全路径；本里程碑产出后续所有页面的基础设施。

**分支**：`phase/5.3-api-layer`

### M3.1 OpenAPI 类型整合
- [ ] 跑 `pnpm openapi:generate` 确认 `packages/api-client/src/` 最新
- [ ] `apps/web/src/types/api.ts` 重导出聚合类型：
  ```ts
  export type { paths as AuthPaths } from '@anynote/api-client/src/auth';
  export type { paths as NotePaths } from '@anynote/api-client/src/note';
  // ...
  ```
- [ ] 把 `packages/api-client/src/` 加入根 `.gitignore`（CI 必跑生成验证）

### M3.2 openapi-fetch 实例
- [ ] `src/lib/api/openapi.ts`：为每个域创建 typed client，`baseUrl: '/api/proxy'`，`credentials: 'include'`
- [ ] `src/lib/api/errors.ts`：统一 `ApiError` 类，含 `code` `message` `traceId`
- [ ] 401 自动经由 BFF 处理（前端无需特别逻辑）

### M3.3 TanStack Query 接入
- [ ] `src/app/providers.tsx`：`QueryClientProvider` + Devtools + ThemeProvider + Toaster + TooltipProvider
- [ ] `QueryClient` 默认配置：`staleTime: 60_000` `retry: 1` `refetchOnWindowFocus: false`
- [ ] `src/features/auth/use-me.ts`：第一个 hook，验证类型链路

### M3.4 Query Keys 工厂
- [ ] 在每个 `features/<domain>/query-keys.ts` 定义层级 key
- [ ] 编写 `features/_keys.test.ts`（vitest）验证 key 稳定性

### M3.5 CI 漂移门禁加固
- [ ] M0.4 的 workflow 增加：失败时打印 spec diff，方便定位
- [ ] 本地 `git pre-push` hook（可选）跑 `pnpm openapi:generate && git diff --exit-code`

### M3.6 验收
- [ ] `useMe()` 在 dashboard 雏形页拉到用户资料并渲染昵称
- [ ] 调用未授权端点，BFF 自动刷新或重定向到登录
- [ ] `pnpm typecheck` 0 错误
- [ ] 合并到 `dev`

---

## M4：AppShell + 主题 + 命令面板

**目标**：主工作区布局可用，所有页面有归宿。

**分支**：`phase/5.4-app-shell`

### M4.1 路由组结构
- [ ] `(workspace)/layout.tsx`：左侧栏 + 顶栏 + 内容区
- [ ] 路由占位：`dashboard` `notes` `docs` `ai/chat` `ai/workflow` `ai/pdf` `mooc` `tasks` `wikis` `settings/[...slug]`，全部用 shadcn `Skeleton` 占位

### M4.2 组件
- [ ] `components/layout/app-sidebar.tsx`：基于 shadcn `Sidebar`，含可折叠分组
- [ ] `components/layout/app-header.tsx`：面包屑 + 用户菜单 + 主题切换 + 命令面板触发
- [ ] `components/layout/command-palette.tsx`：基于 cmdk，注册路由跳转 / 创建笔记 / 切换主题等动作
- [ ] `components/layout/user-menu.tsx`：avatar + 登出 + 设置

### M4.3 主题
- [ ] `next-themes` 接入 `attribute="class" enableSystem`
- [ ] `styles/globals.css` 定义 shadcn token 双套（light / dark）
- [ ] 主题切换无 flash（验证 SSR `<html>` 类注入）

### M4.4 状态
- [ ] `stores/ui-store.ts`：sidebar 开关 + 命令面板状态，persist 仅持久化 sidebar
- [ ] 热键：`Cmd+K` 开命令面板（`use-hotkey` 自定义 hook）

### M4.5 验收
- [ ] 9 个主路由可点击跳转，骨架正确
- [ ] 暗色 / 亮色 / 跟随系统三模式切换无视觉异常
- [ ] `Cmd+K` 命令面板可用
- [ ] 合并到 `dev`

---

## M5：TipTap 编辑器核心（可与 M2-M4 并行）

**目标**：`<TiptapEditor preset="full|minimal|readonly" />` 完整可用，含自定义节点与 Markdown 双向序列化。

**分支**：`phase/5.5-tiptap-core`（从 `dev`，并行期合并 dev 时用 rebase）

### M5.1 依赖
```bash
cd apps/web && pnpm add \
  @tiptap/react @tiptap/pm @tiptap/core @tiptap/starter-kit \
  @tiptap/extension-link @tiptap/extension-image \
  @tiptap/extension-task-list @tiptap/extension-task-item \
  @tiptap/extension-table @tiptap/extension-table-row \
  @tiptap/extension-table-cell @tiptap/extension-table-header \
  @tiptap/extension-text-align @tiptap/extension-underline \
  @tiptap/extension-highlight @tiptap/extension-typography \
  @tiptap/extension-placeholder @tiptap/extension-character-count \
  @tiptap/extension-mention @tiptap/extension-mathematics \
  @tiptap/extension-bubble-menu @tiptap/extension-floating-menu \
  @tiptap/suggestion tiptap-markdown \
  shiki rehype @shikijs/transformers katex
```

### M5.2 目录与预设
- [ ] `components/editor/core/TiptapEditor.tsx`（主组件，`immediatelyRender:false`）
- [ ] `components/editor/core/Toolbar.tsx`
- [ ] `components/editor/core/BubbleMenuPortal.tsx`
- [ ] `components/editor/presets/{full,minimal,readonly}.ts`
- [ ] `components/editor/extensions/`：`anynote-callout` `anynote-image`（含上传）`anynote-wikilink` `anynote-ai-block` `code-block-shiki` `slash-command`
- [ ] `components/editor/serializer/`：注册自定义节点的 markdown 序列化/反序列化
- [ ] `styles/tiptap.css`：基于 `@tailwindcss/typography` 的 `.prose` 风格 + 暗色覆盖 + 节点专属样式

### M5.3 图片上传集成

> ⚠️ **不存在 `/files/presign` 端点**。M0 期间曾新增（`a305f5a`）又整体 revert（`cafee8c`）；浏览器直传统一复用 file 服务既有的分片直传流程（M0.3 表格已确认）。下列路径为 Gateway 路由前缀 `/api/file/**`，前端实际经 BFF 代理走 `/api/proxy/file/*`。

- [ ] `lib/editor/upload.ts`：走 file 服务分片直传五步
  1. `POST /api/file/ossSliceUploadTasks` 建任务 → 返回 `uploadId` / `chunkSize` / `totalChunk` / `finishedChunks`（`hash` 命中即秒传，`finishedChunks` 支持断点续传）
  2. `POST /api/file/getOssSliceUploadSignatures` 按 `chunkIndexList` 换分片签名（`OSSSignature.type` = `MIN_IO` / `HUAWEI_OBS`）
  3. 浏览器按签名直接 PUT 各分片到 OSS
  4. `POST /api/file/markOssSliceUploadSignatures` 标记已完成分片
  5. `POST /api/file/composeOssSliceUploadObject` 合并 → 返回 `fileId` / `objectName` / `hash`；再用 `GET /api/file/public/byObjectName` 换可访问 URL（`ObjectURL.url` + `expireTime`，**非永久公开 URL，注意过期处理**）
- [ ] `AnynoteImage` 扩展接 `uploadFn`，支持工具栏插入 / 粘贴 / 拖拽 三种入口
- [ ] 分片大小由后端返回的 `chunkSize` 决定，前端不再自定单文件上限；进度可选用 `GET /api/file/progress/{uploadId}`，任务详情用 `GET /api/file/ossSliceUploadTask/{uploadId}`

### M5.4 代码高亮（Shiki）
- [ ] `lib/editor/shiki.ts`：`createHighlighterCoreSync` 单例，懒加载语言
- [ ] `code-block-shiki` 扩展：在 NodeView 中调用单例
- [ ] 服务端 RSC 用同一份 shiki 实例预渲染只读代码块

### M5.5 数学公式
- [ ] KaTeX 自托管字体放 `public/fonts/katex/`，`<link rel="preload">` 关键字重
- [ ] `Mathematics` 扩展行内 `$...$` + 块 `$$...$$`

### M5.6 Slash 菜单 + Bubble 菜单
- [ ] `slash-command` 扩展基于 `@tiptap/suggestion`
- [ ] 命令清单：H1/H2/H3、Bullet/Ordered/Task List、Quote、Code、Table、Image、Callout、Math、Divider、**AI 续写**（占位，M7 接入）
- [ ] BubbleMenu：选区出现时显示加粗 / 斜体 / 链接 / 颜色 / AI 改写（占位）

### M5.7 Markdown 双向序列化测试
- [ ] `components/editor/__tests__/roundtrip.test.ts`：每个自定义节点 round-trip（markdown → editor → markdown 等价）
- [ ] 用 `apps/web-legacy/` 中 5 篇真实笔记作为 fixture

### M5.8 演示页
- [ ] `app/(workspace)/_playground/editor/page.tsx`（仅 dev 环境暴露）：三个预设并排展示，手动切换内容
- [ ] 提交后用户可手动验收编辑体验

### M5.9 验收
- [ ] 三预设全部可用，编辑器整包 `dynamic(() => ..., { ssr: false })` 懒加载
- [ ] Markdown round-trip 测试全过
- [ ] 复制粘贴富文本（从 Notion / Google Docs）能正确清洗
- [ ] 图片粘贴上传 → 渲染 → 序列化为 `![](url)`
- [ ] Bundle 报告：编辑器 chunk gzipped ≤ 250KB
- [ ] 合并到 `dev`

---

## M6：笔记业务页面

**目标**：替代 `apps/web-legacy/` 的笔记核心流程。

**分支**：`phase/5.6-notes`

### M6.1 数据 hooks
- [ ] `features/notes/use-knowledge-bases.ts`
- [ ] `features/notes/use-notes.ts`（分页）
- [ ] `features/notes/use-note.ts`
- [ ] `features/notes/use-save-note.ts`（debounce 1.5s + 乐观更新 + 失败回滚）
- [ ] `features/notes/use-create-note.ts` / `use-delete-note.ts`

### M6.2 页面
- [ ] `(workspace)/notes/page.tsx`：知识库列表（卡片）
- [ ] `(workspace)/notes/[baseId]/page.tsx`：当前知识库树 + 列表
- [ ] `(workspace)/notes/[baseId]/[noteId]/page.tsx`：双栏（左目录、右 TipTap 编辑器）
- [ ] `components/note/note-tree.tsx`：基于 `@dnd-kit` 拖拽排序

### M6.3 自动保存与冲突提示
- [ ] 在线 / 离线检测：`navigator.onLine` + 失败重试
- [ ] 后端 ETag / 版本号冲突 → 弹窗 diff（M8 完善 UI，本期只展示文字差异）

### M6.4 验收
- [ ] 创建 / 编辑 / 删除 / 移动笔记全部正常
- [ ] 离开页面前未保存内容自动 flush
- [ ] 与 legacy 前端在同一笔记上对比，无格式损失
- [ ] 合并到 `dev`

---

## M7：AI / PDF / Mooc / Tasks / Wikis

**目标**：覆盖剩余业务页面。

**分支**：`phase/5.7-features`

### M7.1 AI 聊天（SSE）
- [ ] `features/ai/use-chat-stream.ts`：用 `@microsoft/fetch-event-source` 接 `/api/proxy/ai/v1/chat/completions`
- [ ] `(workspace)/ai/chat/page.tsx`：左侧会话列表 + 右侧消息流
- [ ] 消息渲染：用户消息用纯文本，AI 输出用 `<TiptapEditor preset="readonly" />` 渲染 Markdown（含代码 / 公式 / 表格）
- [ ] Slash 菜单中的 "AI 续写" 接入此流

### M7.2 AI 工作流（ReactFlow）
- [ ] `(workspace)/ai/workflow/page.tsx`
- [ ] 节点 / 边的 schema 用 zod 校验
- [ ] 保留对接后端工作流执行端点

### M7.3 Chat PDF
- [ ] `(workspace)/ai/pdf/page.tsx`：react-pdf 左 + 聊天面板右
- [ ] 拖拽上传 PDF → 触发后端解析 → 启动会话

### M7.4 Mooc / Tasks / Wikis / Settings
- [ ] Mooc：保留视频播放（DPlayer 懒加载）；课程卡片
- [ ] Tasks：`@tanstack/react-table` + shadcn `Table`
- [ ] Wikis：树 + `<TiptapEditor preset="readonly" />`
- [ ] Settings：嵌套路由 `account` / `appearance` / `ai` / `integrations`

### M7.5 验收
- [ ] 所有页面无 console error / warning
- [ ] AI 流式：首字延迟可接受（取决后端）；中途切页不丢消息
- [ ] PDF 上传 50MB 文件进度条平滑
- [ ] 合并到 `dev`

---

## M8：协同 + 桌面 + 收尾

**目标**：可发布质量，旧前端可删。

**分支**：`phase/5.8-polish`

### M8.1 协同编辑（可选）
- [ ] `@tiptap/extension-collaboration` + `yjs` + `y-websocket`
- [ ] 仅 `/docs/[id]` 启用
- [ ] 后端协同 WS 端点确认或后置

### M8.2 桌面端
- [ ] `apps/desktop`（或保留 `apps/web/src-tauri`）：Tauri 2 配置
- [ ] 桌面登录走"令牌交换"端点（避免 httpOnly Cookie 跨进程问题）
- [ ] 验证 dev 与 release 两种构建

### M8.3 E2E + 性能预算
- [ ] Playwright：登录 / 创建笔记 / 编辑保存 / AI 流式 / PDF 上传 / 暗色切换 6 条关键路径
- [ ] Lighthouse：Performance ≥ 90，Accessibility ≥ 95
- [ ] Bundle 报告：初始 JS gzipped ≤ 300KB，编辑器 chunk ≤ 250KB
- [ ] Sentry（可选）接入并验证错误上报

### M8.4 清理
- [ ] 删除 `apps/web-legacy/`（确认 1 周稳定后）
- [ ] 删除 `node_modules/.cache` 等遗留
- [ ] 更新 `README.md` 与 `CONTRIBUTING.md` 启动流程
- [ ] 更新 `.claude/context/frontend.md`

### M8.5 验收 / 发版
- [ ] 合并到 `dev` → `main`
- [ ] 打 Tag `v0.6.0`（对应 REFACTOR_PLAN.md 表）
- [ ] TASKS.md Phase 5 标记 `[DONE]`

---

## 2. 后端 OpenAPI 在每个里程碑的"配合点"

| 里程碑 | 后端动作 | 触发条件 |
|--------|--------|---------|
| M0 | 补齐前端必需的 12 个端点 `@Operation` / `@Schema`（结论：**不新增 presign 端点**，浏览器直传复用既有分片上传流程） | 强制 |
| M3 | CI workflow 接入；后端 PR 改动 Controller 时跑 spec 生成 + diff | 持续 |
| M5 | 无需新增端点（复用 `ossSliceUploadTasks` 分片直传链路）；MinIO bucket CORS 需放通前端域名，确保浏览器可直接 PUT 分片 | 强制 |
| M6 | 笔记 CRUD 必须返回完整字段（标题 / 内容 / updatedAt / version），用于乐观更新 | 强制 |
| M7 | AI SSE 端点在 OpenAPI 标注 `produces: text/event-stream` + 错误码 schema | 建议 |
| M7 | 工作流 / PDF 端点契约稳定 | 建议 |
| M8 | 若启用协同：协同 WS endpoint 文档化（OpenAPI 3.1 支持 ws） | 可选 |

每次后端动 Controller 都会触发 CI 漂移检查 → 前端类型自动重新生成 → 类型不匹配立即在 PR 阶段失败。前后端不再"半年后才发现不一致"。

---

## 3. 并行 / 阻塞关系图

```
M0 (门禁) ───┬──▶ M1 ──▶ M2 ──▶ M3 ─┐
             │                          ├──▶ M6
             └──▶ M5 (可并行) ─────────┤
                                       ├──▶ M7
                              M4 ──────┘         └─▶ M8
```

- **M5 可与 M2-M4 并行**：编辑器组件不依赖认证或 AppShell
- **M6/M7 必须等 M3 + M5**：业务页面需要 API 类型 + 编辑器
- **M0 是硬门禁**：未完成不准开 M3

---

## 4. 风险与应对（执行期）

| 风险 | 触发标志 | 应对 |
|------|---------|------|
| M0 发现后端注解缺口超 10 个 | M0.3 清点 > 10 | 暂停前端，先把 backend 注解工单清完；不要边补边写前端 |
| TipTap Markdown round-trip 失败 | M5.7 测试用例失败 > 20% | 切换策略：服务端存 ProseMirror JSON + Markdown 双字段，新建笔记用 JSON，老笔记保持 Markdown 兼容 |
| Shiki 首屏过慢 | M5.9 bundle 报告 chunk > 400KB | 改用 `bundled` themes 子集（仅 github-light/dark），动态加载语言 |
| CI 漂移检查频繁误报 | M3 后 PR 频繁失败 | 把 generate.sh 改为接受 `--no-fetch` 模式，CI 用 docker compose 启动 dryrun |
| 桌面端 httpOnly Cookie 失效 | M8.2 Tauri 登录失败 | 桌面专用 `/api/auth/exchange` 端点：换长 token 写 localStorage（仅桌面环境） |

---

## 5. 当前执行位置（2026-09-09 核对）

M2.0 已于 2026-09-07 合并 `dev`（`3865a2f`）。当前分支 `phase/5.2-auth-bff` 已完成用户确认的 Gateway 仅 Bearer 前置改造，以及 OpenAPI 安全方案、测试和六份 baseline 更新；代码提交分别为 `57bf8b3` 和 `216a930`。

**当前执行位置**：独立认证 BFF、M2.2 与 M2.3 已实现并测试。刷新、me、业务代理与 M2.4 浏览器完整验收未完成；用户之前确认的刷新暂缓要求继续有效。M3-M8 未启动，原工期口径未重估。

**2026-09-08 本轮验证**：
- 前端 Vitest：7 个测试文件、149 个用例全部通过；含本轮新增 24 个页面/mutation 用例，以及先失败后修复的 refresh-only 登出用例。
- web 与 api-client 的 `tsc --noEmit` 均通过；OpenAPI 工具的 20 个 Vitest 用例通过；Biome 对 apps/web、openapi、packages 及根配置共 49 个文件检查通过；`git diff --check` 通过。
- `pnpm openapi:generate` 在当前沙箱的 Git Bash `mkdir` 权限处失败，因此使用 PowerShell 从相同六个真实 Gateway URL 拉取，依次运行仓库 `normalize-cli.mjs` 与已安装的 openapi-typescript。未手改生成文件；六份类型均重生，baseline 仅 auth 的 LogoutDTO 与 logout 描述发生预期变化。
- `pnpm check` 全仓扫描会扫到既有 `.pnpm-store` 中超过 1 MiB 的缓存索引，故源码检查使用上述明确目录范围；未为此改动格式化规范。
- 生产构建未通过：现有 `next/font/google` 的 Geist / Geist Mono 下载因联网失败而阻断；没有改动字体方案。
- 后端本轮未重跑成功：本机 Maven 离线缓存缺依赖；WSL 环境检查及 Maven 联网申请被自动审批服务的 HTTP 503 故障拒绝。已有 auth 的 45 个成功用例报告时间为 23:32，仅作为接手前历史证据。

**2026-09-09 首次验证与提交尝试（历史，权限后续已恢复）**：用户要求完成当前工作区验证并提交。本轮重新运行前端 149 个单测、OpenAPI 工具 20 个单测、web/api-client 类型检查及 49 个源码/配置文件的 Biome 检查，均通过；`git diff --check` 通过。从六个真实 Gateway OpenAPI URL 拉取后经仓库归一化逻辑验证，与工作区 baseline 的 SHA-256 均一致。

WSL 环境检查、联网生产构建申请均再次被自动审批服务 HTTP 503 拒绝，后端单测及构建未完成重跑。`git add` 因 `.git/index.lock` 写权限不足失败，随后提权申请也被同一审批服务故障拒绝；没有文件进入暂存区，没有新增提交，HEAD 仍为 `77916e7`。

**2026-09-09 权限恢复后的最终验证**：
- `mvn package -pl auth -am` 成功；相关模块共 **136 个单测**通过（common-core 55、security-core 35、security-servlet 1、auth 45）。
- 前端 **149 个单测**、OpenAPI 工具 **20 个单测**通过；web/api-client 类型检查、源码 lint 与差异检查通过。
- `pnpm --filter web build` 成功，10/10 页面生成；`/login` 与 `/register` 的 First Load JS 均为 242 kB（Next 构建报告口径）。生产服务启动成功。
- 仓库原始 `pnpm openapi:generate` 已成功执行，六份契约与类型生成完成，不再依赖 PowerShell 替代流程。
- 浏览器验证了空表单字段错误、页面互链、真实账号注册、错误密码 toast、正确登录与 `/dashboard` 跳转。Dashboard 尚未实现，跳转后的 404 属于后续 M3/M4 工作，不能算 Dashboard 验收通过。当前浏览器工具未提供存储面板检查能力，HttpOnly 等属性由真实响应与单测验证，不宣称已完成 DevTools 存储检查。
- 新增独立命令 `pnpm --filter web test:integration:auth`，**8 个真实 HTTP 集成测试全部通过**：私有页面重定向、注册与 Cookie 属性、错误密码/重复注册、Origin 防护、仅 Bearer、双 Cookie 登出、仅 rt 登出、无 Cookie 幂等登出。验证旧 refresh 返回 HTTP 401 / A0311；rt-only 不额外撤销未提供的 access。默认单测和 CI 不连接真实后端，运行说明见 README「测试」。

**端到端发现并修复的实现缺陷**：共享 servlet `SecurityConfig` 未关闭 Spring Security 默认 LogoutFilter，导致 `/logout` 被截获为 HTTP 302，Location 指向容器 `/login?logout`，业务 Controller 不执行。新增只装配 MVC/安全过滤链的 `SecurityConfigTest`，先复现 200→302 失败，再通过 `.logout(AbstractHttpConfigurer::disable)` 让请求进入既有业务撤销逻辑。认证契约及刷新方案均未改变。

**本地运行状态**：Docker Hub 鉴权请求超时，镜像重建未成功；经用户批准将已测试 JAR 复制到本地 `anynote-anynote-auth-1` 后重启，真实登出已返回 200。缓存镜像仍是旧版本，重新创建容器前应重建镜像以保留修复。测试账号保留；成功测试自动撤销会话，浏览器和早期失败测试的三个临时账号会话也已定向清理。

**本轮代码已按模块提交**：

| 提交 | 内容 |
|---|---|
| `1a4d217` | security-core TokenUtil 的单会话撤销边界测试 |
| `ac6c107` | auth 的可选登出凭据契约及 DTO/Service 单测 |
| `2348f7f` | security-servlet 默认 LogoutFilter 修复及过滤链回归测试 |
| `e6cc598` | auth OpenAPI baseline 同步 |
| `bcfb053` | web 认证 BFF、登录/注册页、单测及独立真实认证测试 |

文档与验收记录另行同步提交。未合并 dev/main，未推送远端。刷新仍按用户此前确认暂缓，me/业务代理及 M2.4 完整验收尚未完成；如实现必须偏离方案，仍须先说明并确认。

---

## 6. 漂移门禁缺陷：`servers[0].url` 是容器运行时 IP ✅ 已修复（2026-08-08）

**2026-08-08 发现并修复**。M0.4 建立的 CI 漂移门禁此前**从未真正可用**，原因不在 API 本身。

### 现象

springdoc 会按请求上下文把服务地址写进 spec 的 `servers[0].url`，在 docker 里这就是**容器运行时 IP**。对比本次重生与旧 baseline：

| spec | 旧 baseline | 本次重生 |
|---|---|---|
| `auth.json` | `http://172.19.0.11:8083` | `http://172.19.0.16:8083` |
| `system.json` | `http://172.19.0.14:8091` | `http://172.19.0.15:8091` |
| `note.json` | `http://172.19.0.16:18091` | `http://172.19.0.20:18091` |
| `file.json` | `http://172.19.0.18:8095` | `http://172.19.0.11:8095` |
| `ai.json` | `http://172.19.0.19:9065` | `http://172.19.0.14:9065` |

Docker 每次起栈按启动顺序重新分配这些 IP，**没有任何稳定性保证**。

### 后果

`.github/workflows/openapi-check.yml` 的判定是裸 diff，无归一化：

```yaml
- name: Diff specs against baseline
  run: |
    if ! git diff --exit-code openapi/specs/; then
```

所以**每次 CI 运行都会因 IP 变动而红**，与 Controller 是否真的改动无关。门禁一旦"总是红"，就等于没有门禁——这正是 §4 风险表里"CI 漂移检查频繁误报"那一行，只是根因当时没定位到。

### 采用的修复：生成时剥离 `servers`

`openapi/generate.sh` 在写盘前删掉 `.servers`。类型生成不需要它（实测生成的 6 份 TS 里 `servers` 出现 **0 次**，`openapi-typescript` 只产出 `paths` / `webhooks` / `components` / `$defs` / `operations`），前端按 M3.2 用 `baseUrl: '/api/proxy'`，运行时也不读它。

> 备选方案（未采用）：把 `servers[0].url` 归一化成固定值；或在 Nacos 里显式配置 springdoc `servers`（要动 6 份配置，且 IDEA 混合场景地址不同）。

### 顺带修掉的第二个 bug：`>` 重定向截断 baseline

原写法 `curl -sf "$URL" > "$SPECS_DIR/$svc.json"` 里，**shell 会在 exec curl 之前就以 `O_TRUNC` 打开目标文件**，所以服务没起来时原 baseline 当场被清空。更隐蔽的是：本仓库业务错误也是 HTTP 200（靠 `ResData.code` 区分），`curl -f` 只拦非 2xx，**拦不住网关返回 `{"code":"B0001"}` 却被当成 spec 写进 baseline** —— M0.1 运维发现第 4 条（`ai-nio` / `notify` 缺 `anynote-common-swagger` 依赖导致 `/v3/api-docs` 返回 `B0001`）正是这个场景。

由于 baseline 是单行 JSON，72KB 的 `note.json` 塌成一行错误对象后，`git diff --stat` 显示 `2 +-`，与一次无害改动**完全无法区分**。

现在改为：先落 `mktemp` → 结构校验通过才覆盖 baseline → 任一服务失败则脚本非零退出（不再"假装成功"）。

### 落地内容

| 文件 | 作用 |
|---|---|
| `openapi/normalize-spec.mjs` | 纯函数：剥离 `servers`、校验是否 OpenAPI 文档、识别 ResData 错误体、递归排序 key |
| `openapi/normalize-cli.mjs` | 薄 CLI，失败时不触碰输出文件 |
| `openapi/__tests__/normalize-spec.test.mjs` | 20 个单测 |
| `openapi/package.json` | `openapi/` 成为 workspace 包 `@anynote/openapi-tools`，接入 `pnpm test` |
| `openapi/generate.sh` | fetch 循环重写 |

`sortKeysDeep` 递归排序对象 key（数组顺序是语义的一部分，保持不动），消除 springdoc 可能的 key 顺序抖动。因为 baseline 是单行 JSON，排序在 git 眼里不增加任何 diff 噪声。

### 验证

- **换 IP 端到端验证**：`docker compose down`（保留数据卷）+ `up -d` 后 9 个容器有 8 个 IP 变化（auth `.16→.17`、file `.11→.16`、system `.15→.13`、notify `.17→.20` 等），重生的 6 份 spec 与重启前**逐字节一致**（md5 全等）
- 20 个单测通过，含"同一 spec 换容器 IP 后输出相同"这条直接针对根因的用例
- `pnpm check` / `pnpm typecheck` / `pnpm test` 全绿

> 本次一次性重写了全部 6 份 baseline（剥离 `servers` + key 排序），该 commit diff 较大但只有一次；此后 baseline 才真正稳定，门禁开始有意义。
