# Anynote 前端重构里程碑（可执行版）

> 文档版本：v1.8 | 生成日期：2026-05-13 | 最近核对：2026-09-11（M2-M6 已全部 `--no-ff` 合并 `dev`；M7 已完成实现与验收）
> 关联文档：[REFACTOR_PLAN.md](./REFACTOR_PLAN.md) Phase 5、[FRONTEND_REFACTOR_PLAN.md](./FRONTEND_REFACTOR_PLAN.md)
> 当前状态：Phase 0-4、6、7 已 ✓；**Phase 5 进行中 —— M0-M6 已完成并合并 `dev`；M7 已完成实现、单测与浏览器验收（见 M7 / M7.5 / M7.6），AI 成功流式路径受后端缺陷阻塞；待合并 `dev`；M8 未启动**。
> 完成度参考：9 个里程碑完成 8 个；按工期估算 14-19 天中约完成 14 天，**Phase 5 约 85%**
> M5 遗留一项未通过：图片分片直传第 1 步被后端 `@InnerAuth` 拦截（见 M5.10），M7.6 又确认 PDF 上传的 Feign 转存同族失败——**上传/解析链路的后端配合点仍未达成**，继续挂起
> `openapi/specs/*.json` 6 份 baseline 已入库；`packages/api-client/src/` 仍 gitignored，需本地跑一次 `pnpm openapi:generate` 派生
> 主干分支：`dev`；本计划**按里程碑逐个开分支**（`phase/5.0-openapi-validation` … `phase/5.8-polish`，见总览表），不使用单一的 `phase/5-frontend-rewrite`
>
> ✅ **契约漂移已修复（2026-08-08）**：起全栈跑 `pnpm openapi:generate` 后，`openapi/specs/auth.json` 从 4 条路径补齐到 6 条（新增 `/refresh` `/logout`，以及 `RefreshTokenDTO` / `LogoutDTO` 两个 schema）。M2.1 的阻塞随之解除。
>
> ✅ **漂移门禁缺陷已修复（2026-08-08）**：生成时剥离 `servers`、递归排序 key，并在校验通过后才覆盖 baseline；包含 20 个单测，历史验证见 §6。2026-09-07 未重新运行全栈验收。
>
> **分支落点（2026-09-11 核对）**：M2.0 已通过 `3865a2f` 合并到 `dev`；Gateway/Bearer 前置提交和本轮认证实现均位于 `phase/5.2-auth-bff`，五笔代码提交见 §5。M2-M5 四条叠分支已于 2026-09-11 全部合并 `dev`（`e6384e5` / `05c2598` / `c3c3597` / `7b96e67`），分支保留；`main` 未动。`phase/5.2-auth-bff` 已推送 `origin`（本地比远程领先 3 个提交）。M6 自合并后的 `dev` 切出 `phase/5.6-notes`，同日 `--no-ff` 合并回 `dev`（`888c7da`），执行情况见 M6 / M6.5。

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

**状态**：🟡 进行中（2026-05-23 起）—— **2026-09-10 本轮完成 refresh / me / 通用代理三个 BFF 路由及共享单飞刷新模块；174 个前端单测与 14 个真实链路集成测试全部通过（含 10 并发仅 1 次刷新）。M2.4 浏览器端验收亦通过，仅剩合并 `dev`。**
`features/auth/` 已实现；`stores/` 尚未实现。本轮按原确认方案实现（进程内单飞 Map 锁），未采纳"保留成功结果 5 秒"或提前 60 秒刷新的讨论建议。构建及后端单测重跑限制见 §5。

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

**兼容性影响**：`apps/web-legacy` 仍发旧请求头，切换后的私有调用会失败；本次没有擅自迁移旧前端。Gateway 改造已提交为 `57bf8b3`，OpenAPI 与六份 baseline 已提交为 `216a930`；该轮当时未合并，已随 M2 于 2026-09-11 合并 `dev`（`e6384e5`），`main` 仍未动。

> **刷新流程待评估风险（2026-09-08 更正）**：下方原始 BFF 任务及 `Map<rt, Promise<void>>` 要求保持不变，尚未实现。文档仅用 `isExpiringSoon(at)` 示意触发条件，未明确提前刷新阈值、token 缺失/失效时的处理及完整重试流程。
>
> 此前使用 Map/finally 的局部模型，模拟 10 个携带相同旧 Cookie 的请求，其中 9 个晚到刷新逻辑，得出 2 次刷新、9 个失败。该结果只说明此局部算法在指定时序下的风险；不是完整 BFF 的实现或验收结果，也不足以直接决定必须采用哪种修复。
>
> **撤回过早的阻塞结论**：不再将“共享 Promise<Token> + 保留成功结果 5 秒”列为开工前置或当前必须确认的调整。该候选方案未经采纳，尚未修改文档原定实现要求或编写 BFF。应先明确完整刷新流程，再结合具体实现与并发用例评估；若确需偏离已确认方案，再按用户要求停下确认。
>
> **2026-09-10 已按原方案落地并完成并发评估**：单飞锁挂在进程级 `globalThis`（dev HMR / 分路由打包下仍进程唯一），成功或失败都在 `finally` 立即释放。真实 Docker 栈 + 生产构建下，10 个仅携带 rt 的并发代理请求全部成功且 10 个响应携带**同一对**旋转凭据（`Set-Cookie` 唯一），旧 rt 复用返回 401/A0311——即只发生了一次后端刷新。5 秒结果保留与提前刷新均未引入。
>
> 原 spec 缺口已解决；派生的 `packages/api-client/src/` 仍 gitignored，换机器需按仓库流程重新生成。

> **本轮执行范围（2026-09-08 用户确认）**：暂缓刷新，先完成独立任务。`refresh`、`me`、通用代理均保持未完成；登录、注册、登出、路由保护和 M2.3 页面已实现。接手时前端 125 个测试中 refresh-only 登出失败，修复后全通过；新增页面/mutation 24 个测试，现共 149 个通过。后端工作区已有对应实现与 23:32 的成功报告，本轮从运行中的真实服务生成契约，未把历史报告记作本轮重跑成功。
>
> **2026-09-10 用户确认继续执行后续计划**：refresh / me / 通用代理已实现，暂缓解除。

- [x] 重命名 `apps/web/src/lib/env.ts` 中 `BACKEND_URL` → `INTERNAL_API_URL`（2026-09-08 已核对代码与环境变量单测）
- [x] `src/app/api/auth/login/route.ts`：调用 `/api/auth/login` → 响应中 `Set-Cookie` 两件套（`at` / `rt`）；注册 BFF 同步实现，响应仅含公开资料，Origin、错误及 Cookie 边界均有单测
- [x] `src/app/api/auth/logout/route.ts`：清两件套 + 调后端 `/api/auth/logout`；仅 `rt` 时省略 `accessToken`，无 Cookie 时幂等清理，后端失败仍清 Cookie 并返回错误
- [x] `src/app/api/auth/refresh/route.ts`：进程内 `Map<rt, Promise>` 单飞锁防并发（锁挂 `globalThis`，成败均在 `finally` 释放；401 清 Cookie 回登录页，5xx 保留 Cookie 待重试；2026-09-10）
- [x] `src/app/api/auth/me/route.ts`：转发 `/api/system/user/mine`，返回用户资料（白名单滤除 password/审计字段，`role` 按生成契约 `roleKey`/`roleName` 对齐；at 缺失或 401 时自动刷新并重试一次；2026-09-10）
- [x] `src/app/api/proxy/[...path]/route.ts`：所有业务请求经此，自动注入 `Authorization: Bearer ${at}` 并在过期时触发 refresh（GET/HEAD 放行缺失 Origin，写方法校验 Origin；401 单飞刷新后重放一次，请求体缓冲以支持重放；流式响应透传兼容 M7 SSE；剥除 cookie/authorization/x-forwarded-* 请求头与 content-encoding/set-cookie 响应头；路径段校验防穿越；2026-09-10）

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
- [x] 登录后 DevTools → Application → Cookies：只有 `at` / `rt`，HttpOnly 均为 ✓（2026-09-10 ZCode 浏览器工具核验：GUI 注册/登录跳转 `/dashboard` 后 `document.cookie` **完全为空**——JS 读不到 `at`/`rt`，即 HttpOnly 对浏览器生效；同页 `fetch /api/auth/me` 返回 200 与资料，证明 Cookie 存在且自动携带；`Set-Cookie` 仅 `at`/`rt` 两枚及 HttpOnly/Secure/SameSite=Strict/Path=/ 属性已由集成测试在真实响应上断言）
- [x] DevTools → Application → LocalStorage / SessionStorage 全空（2026-09-10 浏览器核验：注册后与登录后两个时点 `localStorage`/`sessionStorage` 均为空对象，键数为 0）
- [x] 手动让 `at` 提前过期（缩短 TTL 至 30s 测试），并发触发 10 个请求，只产生 1 次 `/api/auth/refresh` 调用（2026-09-10 以等价且更严格的方式验证：`at` 过期后浏览器会直接删除该 Cookie，故用 10 个**仅携带 rt** 的并发代理请求模拟——10 个全部成功、10 个响应携带同一对旋转凭据、旧 rt 复用 401/A0311，即仅一次后端刷新；真实 Docker 栈 + `next start` 生产构建）
- [x] 登出响应清除 cookies 两件套；2026-09-09 真实 HTTP 链路验证双 Cookie 与仅 rt 场景，旧凭据撤销结果符合契约；2026-09-10 浏览器内复核：登出 200 后 `me` 401/A0311、访问 `/dashboard` 被中间件重定向 `/login`、`document.cookie` 仍为空；GUI 错误密码出现"用户身份校验失败"吐司且停留登录页，正确密码跳转 `/dashboard`
- [x] 合并 `phase/5.2-auth-bff` → `dev`（2026-09-11 `--no-ff` merge commit `e6384e5`）

---

## M3：API 客户端 + 查询层 + 代理

**目标**：业务页面调用 API 全部走类型安全路径；本里程碑产出后续所有页面的基础设施。

**分支**：`phase/5.3-api-layer`（2026-09-10 从 `phase/5.2-auth-bff` 切出——M2 按用户指示暂不合并，M3 依赖其代理路由，故在其上叠分支）

**状态**：🟢 代码与验证完成（2026-09-10），仅剩合并 `dev`

### M3.1 OpenAPI 类型整合
- [x] 跑 `pnpm openapi:generate` 确认 `packages/api-client/src/` 最新（真实 Gateway 拉取 6 份 spec，baseline 零漂移）
- [x] `apps/web/src/types/api.ts` 重导出聚合类型（6 个域的 `paths` / `components` 全部聚合）
- [x] 把 `packages/api-client/src/` 加入根 `.gitignore`（M0.4 已完成，本次核对仍然生效）

### M3.2 openapi-fetch 实例
- [x] `src/lib/api/openapi.ts`：为每个域创建 typed client，`credentials: 'same-origin'`（与登录 mutation 现有约定一致）。**与原计划的差异**：`baseUrl` 用分域前缀 `/api/proxy/<svc>` 而非统一的 `/api/proxy`——各服务 spec 的路径相互冲突（如 note 与 system 都有根级路径），统一前缀会让类型与真实路由对不上
- [x] `src/lib/api/errors.ts`：统一 `ApiError` 类（`status` / `code` / `traceId`，traceId 透传网关 `x-trace-id` 响应头如存在）+ `unwrapEnvelope` 信封拆包助手
- [x] 401 自动经由 BFF 处理（前端无需特别逻辑；dashboard 页对"BFF 刷新后仍 401"的场景兜底 `router.replace('/login')`）

### M3.3 TanStack Query 接入
- [x] `src/app/providers.tsx`：`QueryClientProvider` + Devtools（仅 dev）+ ThemeProvider（next-themes，`attribute="class" enableSystem`）+ Toaster + TooltipProvider；根布局接入并 `suppressHydrationWarning`；(auth) 路由组改为复用全局 Provider，原 `AuthProvider` 删除
- [x] `QueryClient` 默认配置：`staleTime: 60_000` `retry: 1` `refetchOnWindowFocus: false`
- [x] `src/features/auth/use-me.ts`：第一个 hook，验证类型链路（me 为 BFF 自有端点，走 `unwrapEnvelope` + zod 白名单；4 个单测覆盖成功/401/格式异常/数据异常）

### M3.4 Query Keys 工厂
- [x] 在每个 `features/<domain>/query-keys.ts` 定义层级 key（auth 域先行：`["auth"]` / `["auth","me"]`；其余域随各自 feature 落地时补充）
- [x] 编写 `features/_keys.test.ts`（vitest）验证 key 稳定性（含前缀关系断言）

### M3.5 CI 漂移门禁加固
- [x] M0.4 的 workflow 增加：失败时打印 spec diff，方便定位（baseline 单行 JSON 裸 diff 不可读，两侧经 `jq` 展开后 `diff -u`，每文件截断 300 行）
- [ ] 本地 `git pre-push` hook（可选）——未做：需要引入 husky/lefthook 等钩子管理，收益有限，留待后续统一处理

### M3.6 验收
- [x] `useMe()` 在 dashboard 雏形页拉到用户资料并渲染昵称（浏览器实测登录后 `/dashboard` 显示"欢迎回来，浏览器验收"；组件级 3 个单测覆盖昵称渲染/401 回退/非 401 错误停留）
- [x] 调用未授权端点，BFF 自动刷新或重定向到登录（M2 集成测试覆盖自动刷新；浏览器实测登出后访问 `/dashboard` 被拦回 `/login`；401 兜底由组件单测覆盖）
- [x] `pnpm typecheck` 0 错误（web 与 api-client 均通过；Biome 47 文件无问题；`pnpm build` 10 路由成功；单测 182 个全绿）
- [x] 合并到 `dev`（2026-09-11 `--no-ff` merge commit `05c2598`）

---

## M4：AppShell + 主题 + 命令面板

**目标**：主工作区布局可用，所有页面有归宿。

**分支**：`phase/5.4-app-shell`（2026-09-10 从 `phase/5.3-api-layer` 叠出，延续 M2 / M3 暂不合并的安排）

**状态**：🟢 实现与验收通过（2026-09-10）；2026-09-11 已 `--no-ff` 合并 `dev`（`c3c3597`）。

### M4.1 路由组结构
- [x] `(workspace)/layout.tsx`：左侧栏 + 顶栏 + 内容区；公共 `WorkspaceSession` 处理加载、失败重试与 BFF 返回 401 后跳转登录
- [x] 路由占位：`dashboard` `notes` `docs` `ai/chat` `ai/workflow` `ai/pdf` `mooc` `tasks` `wikis` `settings/[...slug]`，全部用 shadcn `Skeleton` 占位；dashboard 保留用户昵称欢迎语
- [x] `/` 重定向 `/dashboard`；`/settings` 重定向 `/settings/profile`；`/notes/new` 提供新建入口占位，实际编辑和保存随 M5 / M6 接入

### M4.2 组件
- [x] `components/layout/app-sidebar.tsx`：基于 shadcn `Sidebar`，含可折叠分组、当前路由高亮、图标折叠态和移动抽屉（跳转后自动关闭）
- [x] `components/layout/app-header.tsx`：面包屑 + 用户菜单 + 主题切换 + 命令面板触发
- [x] `components/layout/command-palette.tsx`：基于 cmdk，注册路由跳转 / 创建笔记入口 / 三种主题动作；搜索、方向键、Enter、Esc、无结果提示与自动聚焦可用
- [x] `components/layout/user-menu.tsx`：avatar + 登出 + 设置；登出调用同源 BFF，成功后取消查询并清空 QueryClient，失败提示可重试

### M4.3 主题
- [x] 复用 M3 全局 `next-themes`（`attribute="class" enableSystem disableTransitionOnChange`）
- [x] 复用已有 `src/app/globals.css` light / dark token；不另建 `styles/globals.css`
- [x] 主题切换与刷新时未观察到闪白或水合警告；浏览器核验 `<html>` 为 `light` / `dark`，页面包含 next-themes 首屏主题脚本。跟随系统与当前 `prefers-color-scheme: dark` 一致；未修改操作系统偏好来模拟实时切换

### M4.4 状态
- [x] `stores/ui-store.ts`：sidebar 开关 + 命令面板状态，persist 仅持久化 sidebar；显式挂载后恢复、读写白名单与非法值回退，命令面板状态不落盘。移除 shadcn Sidebar 原件的额外 `sidebar_state` Cookie 写入；主题偏好仍由 next-themes 独立保存
- [x] 热键：`Cmd+K` / `Ctrl+K` 切换命令面板（`use-hotkey` 自定义 hook）；过滤输入法组合、长按与额外修饰键，卸载后清理监听

### M4.5 验收
- [x] 9 个主导航路由 + 设置（共 10 个入口）在 Codex In-app Browser 逐一点击验证，页面标题和骨架正确；创建笔记命令到 `/notes/new`
- [x] 暗色 / 亮色 / 跟随系统三模式切换、刷新恢复正常；桌面 1440×900 与移动 375×812 / 默认 425px 检查通过，无横向溢出
- [x] `Cmd+K` / `Ctrl+K`、搜索 PDF 后 Enter 跳转、Esc 关闭、主题动作、新建入口均通过浏览器实测；侧栏折叠后刷新仍为 collapsed
- [x] 210 个前端单测（本次新增 28 个）、TypeScript、Biome、生产构建通过；现有 Docker 后端 + 新 `next start` 生产前端的 14 个认证 / 代理集成用例通过
- [x] 修正 `web lint` 的工作目录：先回仓库根再执行 Biome，使根配置里的 `apps/web/src/components/ui` 排除规则生效；避免误检查 vendored shadcn 原件
- [x] 浏览器真实注册 → dashboard 昵称 → 导航 → 用户菜单设置 → 登出 → `/notes` 被重定向 `/login`；本次浏览器控制台无 error / warn。临时账号 `m4ui09101441` 保留，已通过登出撤销该浏览器会话
- [x] 合并到 `dev`（2026-09-11 `--no-ff` merge commit `c3c3597`）

---

## M5：TipTap 编辑器核心（可与 M2-M4 并行）

**目标**：`<TiptapEditor preset="full|minimal|readonly" />` 完整可用，含自定义节点与 Markdown 双向序列化。

**分支**：`phase/5.5-tiptap-core`（计划从 `dev`；实际因 M2-M4 未合并，自 `phase/5.4-app-shell` 叠出，与 M3 / M4 的叠分支方式一致）

**状态**：🟢 **2026-09-10 完成 M5.1–M5.9 实现与浏览器验收**；仅"图片粘贴上传"因后端 `@InnerAuth` 未通过（M5.10）。2026-09-11 已 `--no-ff` 合并 `dev`（`7b96e67`），该项作为遗留问题带入 M6。

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

**实际解析版本（2026-09-10）**：TipTap 全部 **3.31.3**、`tiptap-markdown` 0.9.0、`shiki` / `@shikijs/*` 4.4.3、
`katex` 0.18.7。与原命令的差异：

- **新增**：`@tiptap/extension-code-block`（自定义 Shiki NodeView 需继承它）、`@tailwindcss/typography`（`.prose`）、`prosemirror-markdown`（`MarkdownSerializerState` 类型）、`@shikijs/core` / `@shikijs/langs` / `@shikijs/themes`（按语言懒加载）
- **未安装**：`rehype`、`@shikijs/transformers`（本期未用到，避免无用依赖）
- **移除**：`@tiptap/extension-mathematics`（顶层 import KaTeX 会把主 chunk 撑到 341 KB，改为自建节点 + 懒加载；见 M5.10）
- `@tiptap/extension-mention` 已安装但**暂不注册**（缺真实用户 / 笔记数据源，后置 M7）

### M5.2 目录与预设

> 文件命名为 **kebab-case**（`tiptap-editor.tsx` / `toolbar.tsx` / `bubble-menu.tsx`），与仓库既有前端约定
> （`app-header.tsx` / `command-palette.tsx`）一致，未采用计划里的 PascalCase。

- [x] `components/editor/core/tiptap-editor.tsx`（主组件，`immediatelyRender:false`；`components/editor/TiptapEditor.tsx` 为 `dynamic(ssr:false)` 懒加载入口）
- [x] `components/editor/core/toolbar.tsx`
- [x] `components/editor/core/bubble-menu.tsx`（BubbleMenuPortal）
- [x] `components/editor/presets/{full,minimal,readonly}.ts`
- [x] `components/editor/extensions/`：`anynote-callout` `anynote-image`（含上传）`anynote-wikilink` `anynote-ai-block` `code-block-shiki` `slash-command`，另加 `anynote-marks`（下划线/高亮 markdown 桥）、`anynote-math`（公式节点 + 懒加载 KaTeX）、`anynote-tight-lists`（taskList 紧凑输出修复）
- [x] Markdown 序列化：不另建 `serializer/` 目录，改为每个扩展在 `addStorage().markdown` 内声明 `serialize` / `parse`，公共 helper 在 `lib/editor/markdown-it.ts`（`addInlineAtom` / `addInlineWrapper` / `registerMdPlugin`）
- [x] `src/styles/tiptap.css`：`@tailwindcss/typography` 的 `.prose` + 暗色覆盖 + 节点专属样式（另附自托管 KaTeX 样式 `src/styles/katex.css`）

### M5.3 图片上传集成

> ⚠️ **不存在 `/files/presign` 端点**。M0 期间曾新增（`a305f5a`）又整体 revert（`cafee8c`）；浏览器直传统一复用 file 服务既有的分片直传流程（M0.3 表格已确认）。下列路径为 Gateway 路由前缀 `/api/file/**`，前端实际经 BFF 代理走 `/api/proxy/file/*`。

- [x] `lib/editor/upload.ts`：走 file 服务分片直传五步
  1. `POST /api/file/ossSliceUploadTasks` 建任务 → 返回 `uploadId` / `chunkSize` / `totalChunk` / `finishedChunks`（`hash` 命中即秒传，`finishedChunks` 支持断点续传）
  2. `POST /api/file/getOssSliceUploadSignatures` 按 `chunkIndexList` 换分片签名（`OSSSignature.type` = `MIN_IO` / `HUAWEI_OBS`）
  3. 浏览器按签名直接 PUT 各分片到 OSS
  4. `POST /api/file/markOssSliceUploadSignatures` 标记已完成分片
  5. `POST /api/file/composeOssSliceUploadObject` 合并 → 返回 `fileId` / `objectName` / `hash`；再用 `GET /api/file/public/byObjectName` 换可访问 URL（`ObjectURL.url` + `expireTime`，**非永久公开 URL，注意过期处理**）
- [x] `AnynoteImage` 扩展接 `uploadFn`，支持工具栏插入 / 粘贴 / 拖拽 三种入口
- [x] 分片大小由后端返回的 `chunkSize` 决定，前端不再自定单文件上限；进度可选用 `GET /api/file/progress/{uploadId}`，任务详情用 `GET /api/file/ossSliceUploadTask/{uploadId}`

### M5.4 代码高亮（Shiki）
- [x] `lib/editor/shiki.ts`：`createHighlighterCoreSync` 单例，懒加载语言
- [x] `code-block-shiki` 扩展：在 NodeView 中调用单例
- [x] 服务端 RSC 用同一份 shiki 实例预渲染只读代码块

### M5.5 数学公式
- [x] KaTeX 自托管字体放 `public/fonts/katex/`，`<link rel="preload">` 关键字重
- [x] `Mathematics` 扩展行内 `$...$` + 块 `$$...$$`

### M5.6 Slash 菜单 + Bubble 菜单
- [x] `slash-command` 扩展基于 `@tiptap/suggestion`
- [x] 命令清单：H1/H2/H3、Bullet/Ordered/Task List、Quote、Code、Table、Image、Callout、Math、Divider、**AI 续写**（占位，M7 接入）
- [x] BubbleMenu：选区出现时显示加粗 / 斜体 / 链接 / 颜色 / AI 改写（占位）

### M5.7 Markdown 双向序列化测试
- [x] `components/editor/__tests__/roundtrip.test.ts`：每个自定义节点 round-trip（markdown → editor → markdown 等价）
- [x] 5 篇真实风格笔记 fixture 作为对照（**差异**：`apps/web-legacy/` 实测既无 `.md` 笔记样本也无编辑器源码，改为在 `__tests__/fixtures/` 手写 5 篇覆盖全部语法的 fixture）

### M5.8 演示页
- [x] `app/(workspace)/playground/editor/page.tsx`（仅 dev 环境暴露）：三个预设切换展示，右侧实时查看序列化结果
  - **差异**：计划写的 `_playground` 会被 Next 当作 private folder 整体排除出路由，因此改为 `playground/editor`；生产构建下该路由返回 404
- [x] 提交后用户可手动验收编辑体验（2026-09-10 浏览器实测，见 M5.10）

### M5.9 验收
- [x] 三预设全部可用，编辑器整包 `dynamic(() => ..., { ssr: false })` 懒加载
- [x] Markdown round-trip 测试全过（51 个用例：19 个单节点 × 精确/幂等 + 5 篇 fixture × 精确/幂等 + 预设差异）
- [x] 复制粘贴富文本（从 Notion / Google Docs）能正确清洗（浏览器实测：内联 `style` 与 `<script>` 被剥除，加粗 / 斜体 / 链接 / 列表语义保留）
- [ ] 图片粘贴上传 → 渲染 → 序列化为 `![](url)` —— **被后端 `@InnerAuth` 阻塞**，见 M5.10
- [x] Bundle 报告：编辑器 chunk gzipped ≤ 250KB（实测 211.3 KB）
- [x] 合并到 `dev`（2026-09-11 `--no-ff` merge commit `7b96e67`）

### M5.10 实际执行结果与差异（2026-09-10）

**依赖版本与计划不符**：TipTap 实际解析为 **v3.31.3**（计划按 v2 编写），带来一批 API 变化，已在实现中适配：

| 计划假设（v2） | 实际（v3.31.3） |
|---|---|
| `@tiptap/extension-bubble-menu` / `-floating-menu` 作为扩展注册 | `BubbleMenu` / `FloatingMenu` 从 `@tiptap/react/menus` 以 React 组件使用，无需单独注册扩展 |
| StarterKit 之外另装 Link / Underline | StarterKit v3 已内置 `link` / `underline` / `codeBlock` / `undoRedo` / `trailingNode`，用 `configure({ …: false })` 关掉要替换的项 |
| `@tiptap/extension-history` | 已并入 StarterKit 的 `undoRedo` |
| `NodeViewContent` 的 `as` 可自由传标签 | `as` 走 `NoInfer<T>`，需写成 `<NodeViewContent<"pre"> as="pre" />` |

**依赖增减**：新增 `@tiptap/extension-code-block`、`@tailwindcss/typography`（`.prose`）、`prosemirror-markdown`（`MarkdownSerializerState` 类型）、`@shikijs/core` / `@shikijs/langs` / `@shikijs/themes`（按语言懒加载语法）；**移除 `@tiptap/extension-mathematics`**（原因见下）。

**Bundle 性能修复**：首轮产物编辑器主 chunk **341.2 KB gzip**，超 250 KB 预算。定位到两个被静态引入的大包后改为动态 import：

| 改动 | 效果 |
|---|---|
| KaTeX（145.3 KB gzip）原被 `@tiptap/extension-mathematics` 顶层 import | 自建 `inlineMath` / `blockMath` 节点（`data-type` / `data-latex` 约定与官方一致），渲染走 `lib/editor/katex.ts` 的 `loadKatex()` 动态 import |
| Shiki core + JS 正则引擎原被 `lib/editor/shiki.ts` 顶层 import | 改为 `import()` 懒加载，语言按需加载并缓存 |
| 结果 | 编辑器主 chunk **211.3 KB gzip → PASS**；KaTeX（75.0 KB）与 Shiki（35.6 KB）成为独立懒加载 chunk |

复测脚本：`node apps/web/scripts/bundle-report.mjs`。

**Markdown 序列化约定与限制**（`tiptap-markdown`，`html: false`）：

- `==文本==` ↔ highlight，`++文本++` ↔ underline，`$latex$` / `$$latex$$` ↔ 公式，`[[目标|别名]]` ↔ 双链，`> [!INFO|TIP|WARN|DANGER]` ↔ callout，` ```anynote-ai ` ↔ AI 块
- **上游缺陷修复**：`tiptap-markdown` 的 `tight` 全局属性只挂 `bulletList` / `orderedList`，漏掉 `taskList`，导致任务列表序列化成 loose（项间插空行）。新增 `AnynoteTightTaskList` 把 `tight` 补到 `taskList`
- **已知限制**：`textAlign` 与 highlight 的颜色不写进 Markdown（编辑期保留、持久化丢失）；`Color` / `TextStyle` 未启用；`Mention`（@用户 / #笔记）需真实数据源，后置 M7；富文本粘贴以语义清洗为准，不保留视觉样式
- 表格序列化结尾会多一个换行，测试断言统一裁掉文档末尾空行

**前端 ⇄ 后端契约缺口（阻塞 M5.9 图片上传验收）**：分片直传第 1 步 `POST /file/ossSliceUploadTasks` 在 `FileController` 上标了 **`@InnerAuth`**，浏览器请求被 `InnerAuthAspect` 直接拒绝：

```
POST /api/proxy/file/ossSliceUploadTasks → {"code":"A0301","msg":"没有内部访问权限，不允许访问"}
```

其余四步（`getOssSliceUploadSignatures` / `markOssSliceUploadSignatures` / `composeOssSliceUploadObject` / `public/byObjectName`）**没有** `@InnerAuth`，实测可达（返回正常业务错误码），说明只有第一步被遗漏。前端 `lib/editor/upload.ts` 按计划实现且带 6 个单测；**后端注解不改，端到端图片上传无法跑通**。按"实现必须偏离方案前先说明并确认"的约定，本轮未擅自改后端鉴权。

**环境发现（与 M5 代码无关）**：

- `next build --turbopack` 的产物用 `next start` 起不来：`TypeError: routesManifest.dataRoutes is not iterable`（生成的 `routes-manifest.json` 无 `dataRoutes`）。浏览器验收因此跑在 `next dev` 上；生产构建本身成功（24 条路由）
- 本会话期间本地分支 ref 曾被外部清空（仅剩 `main`）。当时按已知 commit 还原，但 `phase/5.2-auth-bff` 误用了 `dd3ca98`（`origin` 的值，比真值旧 3 个提交）；2026-09-11 已按事故前快照更正为 `be0fcdb`。真值：`phase/5.2-auth-bff`(be0fcdb) / `phase/5.2a-auth-backend`(2a12afc) / `phase/5.3-api-layer`(186b50c) / `phase/5.4-app-shell`(b6035d5) / `phase/5.5-tiptap-core`(5600106)。根因为 WorkBuddy 沙箱把删除劫持成回收站、破坏 `rmdir` 非空必失败语义，导致 git 清理空父目录时一路递归

**浏览器端到端验收（2026-09-10，真实 Docker 后端 + `next dev`）**：

- `/register` 注册 + BFF 登录建立真实 Cookie 会话后进入 `/playground/editor`
- `full`：工具栏 1 个、`contenteditable=true`、示例文档渲染；**Shiki 高亮 36 个 token span**、**KaTeX 行内 / 块级各 1 个**、2 个 callout（`info` / `warn`）、2 个双链、字数统计「69 字」
- `minimal`：工具栏仅基础按钮，无「表格」按钮
- `readonly`：无工具栏、`contenteditable=false`，代码高亮与公式照常渲染
- 富文本粘贴：`window.__xss` 未触发、`<script>` 数量 0、粘贴段落的 `color` / `font-size` 内联样式被剥离；加粗 / 斜体 / 链接 / 列表语义保留，并实时序列化为 `**加粗** *斜体*` / `[链接](https://example.com)` / `- 条目一`
- 页面 `console` 无 error（仅 React DevTools 提示）
- 图片粘贴上传：见上方契约缺口，未通过

---

## M6：笔记业务页面

**目标**：替代 `apps/web-legacy/` 的笔记核心流程。

**分支**：`phase/5.6-notes`（2026-09-11 自合并 M2-M5 后的 `dev` 切出）

**状态**：🟢 **2026-09-11 完成 M6.0-M6.4 实现与浏览器端到端验收，同日 `--no-ff` 合并 `dev`（`888c7da`）**。验收与差异记录见 M6.5。

### M6.0 后端配合：保存返回完整结果与乐观并发版本 ✅

M6 开工前先按 §2 的强制配合点补齐后端契约，变更提案与核验记录见
[2026-09-11-note-save-result-and-version.md](../../.claude/openspec/changes/2026-09-11-note-save-result-and-version.md)：

- `PATCH /notes/{noteId}` 响应从 `ResData<String>` 改为 `ResData<NoteSaveResultVO>`（id / title / content / updateTime / version）；请求体 `NoteEditDTO` 新增可选 `version` 与 `knowledgeBaseId`（移动笔记）。
- `version` 取 `n_note.update_time` 毫秒时间戳字符串（无 version 列、不改表）；客户端显式携带且与库中不一致时抛新枚举 `ResCode.RESOURCE_VERSION_CONFLICT("A0409")`，冲突不落库、不发 RocketMQ 消息。缺省 `version` 按后写入者胜出，legacy 与内部调用不受影响。
- 移动笔记到其他知识库时校验目标库编辑权限（`A0301`）。
- 实现细节：写库前把 `update_time` 截断到整秒（秒级 `datetime`，避免毫秒尾数让下一次保存被误判冲突）。
- 单测：`NoteServiceImplEditNoteTest`（10）+ `NoteVersionUtilTest`（6）；`mvn test -pl note -am` 全绿（common-core 55、security 37、note 16）。
- `pnpm openapi:generate` 重生 baseline：仅 `note.json` 一行变更且结构 diff 与契约逐一对应，其余 5 份零漂移。

### M6.1 数据 hooks ✅
- [x] `features/notes/use-knowledge-bases.ts`（列表 + 详情 + 新建库 mutation；`permissions=4` 取「全部可见」）
- [x] `features/notes/use-notes.ts`（分页 + `keepPreviousData` 防翻页闪烁）
- [x] `features/notes/use-note.ts`（详情；关闭自动重取避免覆盖正在编辑的正文）
- [x] `features/notes/use-save-note.ts`（debounce 1.5s + 乐观更新 + 失败回滚 + 冲突/离线/卸载状态机）
- [x] `features/notes/use-create-note.ts` / `use-delete-note.ts`（另有计划外补充 `use-move-note.ts`，与拖拽移动共用 PATCH 端点）
- [x] `features/notes/schemas.ts`：zod 白名单校验（后端加字段不致前端崩），`toVersion` 与后端口径一致
- [x] query keys 工厂 `features/notes/query-keys.ts` 并入 `features/_keys.test.ts` 前缀关系断言

### M6.2 页面 ✅
- [x] `(workspace)/notes/page.tsx`：知识库卡片列表 + 新建知识库弹窗
- [x] `(workspace)/notes/[baseId]/page.tsx`：知识库页头 + 笔记分页卡片 + 新建笔记弹窗
- [x] `(workspace)/notes/[baseId]/[noteId]/page.tsx`：双栏（左 `NoteTree` 目录、右 TipTap 编辑器）；`key={noteId}` 强制重挂载，切笔记时先经 `useSaveNote` 卸载清理把上一篇待存内容 flush 出去
- [x] `components/note/note-tree.tsx`：基于 `@dnd-kit/core` 拖拽。**与计划的差异**：`n_note` 无排序列，同库排序无法落库，拖拽语义改为「跨知识库移动」（未安装 `@dnd-kit/sortable`）
- [x] `components/note/conflict-dialog.tsx`（行级 diff）、`save-status.tsx`（六态保存徽章）、`features/notes/components/note-editor.tsx`（编辑页编排）
- [x] `/notes/new` 从占位升级为可用创建页（先选知识库再起标题；无库时引导建库）

### M6.3 自动保存与冲突提示 ✅
- [x] 在线 / 离线检测：`navigator.onLine` 离线时改动留在本地，`online` 事件补发；保存失败按 5s 固定间隔重试（仅网络/服务端故障，冲突不重试）
- [x] 版本冲突：保存携带服务端 `version`，`A0409` 时停止自动保存、回读服务端内容并弹窗展示行级 diff（`lib/notes/diff.ts`，LCS）；用户可选「用我的改动覆盖」（以服务端最新版本号重发）或「放弃我的改动」。三方合并 UI 按计划留待 M8
- [x] 离开页面 flush：SPA 路由切换 / `pagehide` / `beforeunload` 均经 keepalive 请求把待存改动送出

### M6.4 验收 ✅
- [x] 创建（知识库/笔记）/ 编辑（正文+标题自动保存、刷新后持久）/ 删除（confirm 后逻辑删除、列表回空态）/ 移动（操作菜单 + 目录树拖拽两条路径均验证）全部正常
- [x] 离开页面前未保存内容自动 flush：debounce 未到即导航，keepalive 补存后回读内容完整
- [x] 版本冲突：两个标签页真实触发后端 `A0409`，弹窗 diff 与两种解决路径均验证
- [x] **与 legacy 对比的替代口径**：未起 `web-legacy` 做 A/B 对比；以 M5.7 的 51 个 Markdown round-trip 用例 + 本轮「编辑器 → 自动保存 → 服务端读回原始 markdown」的逐字节核验（标题 / 段落空行结构无损）作为格式保真依据。legacy A/B 对比留待 M8 清理前复验
- [x] 单测：笔记域新增 75 个用例（hooks / use-save-note 状态机 / schemas / diff / 组件 / 创建页），全仓 359 个前端单测 + 后端 note 模块 16 个单测通过；`pnpm typecheck`、`pnpm check`、webpack 生产构建通过
- [x] 合并到 `dev`（2026-09-11 `--no-ff` merge commit `888c7da`）

### M6.5 实际执行结果与环境发现（2026-09-11）

**浏览器端到端验收**（真实 Docker 栈 18 容器 + 生产构建 `next start`，ZCode 浏览器工具）：

- 注册 `m6notes0911` → 自动登录 → `/notes` 建库（id 56/57）→ 建笔记 → 编辑器页自动保存全链路（debounce 合并、`已保存 HH:MM`、刷新持久）。
- 冲突：A/B 两个标签页编辑同一笔记，后写入者被后端 `A0409` 拒绝 → 弹窗行级 diff（本地 `-` / 服务端 `+`）→「用我的改动覆盖」后保存成功且持久化。
- 移动：菜单移动（56→57）与目录树 dnd-kit 拖拽（57→56）均成功；删除经 `window.confirm` 后回空态。
- 离开 flush：debounce 未到即导航，回读内容完整（keepalive 生效）。

**本轮修复的缺陷（先复现后修复）**：

- `DropdownMenuLabel` 在 base-ui 下必须位于 `DropdownMenuGroup` 内，否则打开「笔记操作」菜单即抛 `MenuGroupContext is missing` 运行时错误——按 M4 user-menu 的既有写法补包一层分组，并补组件单测。
- `roundtrip.test.ts` 的 `normalize` 补 CRLF→LF 归一：Windows `autocrlf` 检出会把 M5 的 fixture 变成 CRLF 导致 5 个用例红。
- `lib/notes/diff.ts` 按 `noUncheckedIndexedAccess` 重写索引访问（vitest 不做类型检查，`pnpm typecheck` 才暴露）。
- 测试工具 `renderHookWithProviders` 支持注入自定义 `QueryClient`：`useSaveNote` 只做命令式缓存读写，默认 `gcTime: 0` 会回收无观察者条目，无法断言缓存内容。

**环境发现（与 M6 代码无关，长期生效）**：

1. **Windows `autocrlf` 会把容器挂载的 shell 脚本检出成 CRLF**：MySQL 初始化脚本 `00-import-sql.sh` 变 CRLF 后容器内 `/bin/sh^M: bad interpreter`（exit 126），全栈起不来。已新增仓库根 `.gitattributes`（`*.sh` / `*.sql` 强制 LF）。此坑与 M0.1 的 `--env-file=/dev/null` 同级，换 Windows 机器必踩。
2. **Next 15.5.18 dev 模式在本机不稳定**：`next dev --turbopack` 与 `next dev`（webpack）运行约十几分钟后 node 进程均会占满全部核心并假死（curl 无响应）。浏览器验收因此改用 **webpack 生产构建 + `next start`**（构建成功且 First Load JS 比 turbopack 产物小约一半：shared 104 kB vs 215 kB）。dev 假死根因未查明，记入 TASKS.md 候选。

**遗留**：M5.10 的图片分片直传 `@InnerAuth` 阻塞项未在本轮处理；`use-save-note` 首次打开编辑器会触发一次内容相同的幂等保存（TipTap StarterKit `trailingNode` 初始化补尾部段落触发 `onUpdate`），无害，留 M8 打磨。

---

## M7：AI / PDF / Mooc / Tasks / Wikis

**目标**：覆盖剩余业务页面。

**分支**：`phase/5.7-features`（2026-09-11 自 `dev` 切出）

**状态**：🟢 **2026-09-11 完成 M7.1–M7.4 实现与浏览器端到端验收**。AI 流式的**成功路径**被后端缺陷阻塞（见 M7.6 第 1 条），前端按错误路径验收通过。合并 `dev` 状态见 M7.5。

### M7.1 AI 聊天（SSE）
- [x] `features/ai/use-chat-stream.ts`：进程级 zustand store + `lib/ai/sse.ts`（`@microsoft/fetch-event-source`）接 SSE。**与计划的差异**：实际端点是 `/api/proxy/aiNio/chat/completions`（spec 路径 `/chat/completions`，无 `/v1` 前缀；且 Gateway 上只有 `/api/aiNio/**` 路由到 anynote-ai-nio，`/api/ai` 指向 Phase 3 合并前的旧 ai 服务、恒 503）
- [x] `(workspace)/ai/chat/page.tsx` + `/ai/chat/[id]`：左侧会话列表（分页加载、重命名、删除）+ 右侧消息流；新会话首条消息从 chunk 拿 `conversationId` 后迁移 store key 并 `router.replace` 回填，不重发请求
- [x] 消息渲染：用户消息纯文本气泡；AI 输出完成后 `<TiptapEditor preset="readonly" />` 渲染 Markdown；流式进行中用轻量文本 + 光标（半截 Markdown 逐 chunk 重建 ProseMirror 文档开销大且抖动，完成后切编辑器）
- [x] Slash 菜单中的 "AI 续写" 接入此流：插入 `aiBlock` 节点并逐增量更新 payload；`PresetContext.aiContinue` 注入点，未配置时降级提示
- [x] 流挂 store 层而非组件状态：流式进行中切换路由（组件卸载）消息与流都不丢，对应 M7.5「中途切页不丢消息」；会话列表/详情/重命名/删除走 typed client

### M7.2 AI 工作流（ReactFlow）
- [x] `(workspace)/ai/workflow/page.tsx`：`@xyflow/react` v12 画布，dynamic ssr:false 懒加载
- [x] 节点 / 边 schema 用 zod 校验（`features/ai/schemas.ts` workflowDataSchema，节点名 1-30 字、自动持久化前校验）
- [x] 保留对接后端工作流执行端点：`workflow-storage.ts` 的 `runWorkflow` 异步对接点，当前后端无执行端点（与旧前端一致），点击运行时 toast 说明；画布数据持久化 localStorage

### M7.3 Chat PDF
- [x] `(workspace)/ai/pdf/page.tsx`：中间 react-pdf 预览 + 右侧聊天面板（里程碑原文"左 PDF 右聊天"，实现为三栏：文档库 / PDF / 问答，文档多时三栏更可用）
- [x] 拖拽上传 PDF → `POST /docs/pdfs`（multipart，XHR 实现以获得真实上传进度，fetch 无上传进度事件；豁免 typed client 走同源 BFF 路径）→ 自动 `POST /docs/{id}/index` 触发异步索引（RocketMQ→ES）→ 轮询 `indexStatus`；问答走 `/rag/query/docs/v1` SSE
- [x] **上传后端链路阻塞**（M7.6 第 4 条）：note→file 的 Feign multipart 转存失败，端到端无法走通；前端上传/错误路径已实现并由单测覆盖

### M7.4 Mooc / Tasks / Wikis / Settings
- [x] Mooc：课程卡片 + 新建课程 + 课程详情（章节展开、DPlayer 懒加载视频播放、`/file/public/byObjectName` 换临时播放地址、文档条目 readonly 渲染）；创建时补 `dataScope: 1`（`n_mooc.data_scope` 列 NOT NULL 无默认值，缺省触发后端 B0001，见 M7.6 第 2 条）
- [x] Tasks：`@tanstack/react-table` + shadcn `Table`（**用 v8**：v9 为 2026 新大版本、API 全面重构，按里程碑写作时的 v8 认知选用稳定版）；提交对话框选知识库/笔记提交成果；`/noteTasks` 的 `knowledgeBaseId` 必填（任务按知识库组织）
- [x] Wikis：知识库→笔记两级导航 + `<TiptapEditor preset="readonly" />`，复用笔记域 hooks
- [x] Settings：嵌套路由 `profile(=account)` / `appearance` / `ai` / `integrations`（沿用 legacy 的 /settings/profile 路径名，/settings/account 等价）；资料表单、改密码（auth 域 `/resetPassword`）、主题三选一、AI 模型偏好（localStorage，聊天页读取）、集成说明页
- [x] 公共组件：`components/shared/knowledge-base-select.tsx`（mooc/tasks 共用）

### M7.5 验收
- [x] 所有页面无 console error / warning：SPA 遍历 13 条路由 console 全干净（2026-09-11，ZCode 浏览器）
- [x] AI 流式：SSE 连接、chunk 解析、failed 状态展示、重试按钮、readonly 渲染全部验证；**成功流式路径被后端阻塞**（M7.6 第 1 条：ai-nio servlet 栈 reactor context 丢失 + LLM 上游 ai-service 未启动），已在单测覆盖成功路径、浏览器覆盖错误路径。中途切页不丢消息由 store 层设计保证并单测覆盖
- [x] PDF 上传进度条：XHR `upload.onprogress` 真实进度（百分比条）；端到端被后端转存失败阻塞（M7.6 第 4 条）
- [x] 单测：全仓 **440 个**前端用例通过（M6 结束 359 个，本轮 +81：SSE 解析、流式 store 状态机、会话/文档/课程/任务 hooks、组件、schema、keys 契约）；`pnpm typecheck`、`pnpm check`、webpack 生产构建、编辑器 chunk 10.0KB gzip（预算 250KB）均通过；`test:integration:auth` 14 个真实链路用例通过
- [ ] 合并到 `dev`（代码与验收已完成，合并见分支记录）

### M7.6 实际执行结果与环境发现（2026-09-11）

**后端契约/实现缺口（前端无责，需后端跟进；延续 M5.10 的挂起模式）**：

1. **ai-nio SSE 全链路不可用（阻塞 M7.1 成功路径）**：`services/ai` 跑在 Servlet/Tomcat 栈，`Mono.deferContextual` 里 `ctx.get(LOGIN_USER)` 抛 `NoSuchElementException: Context is empty`（`ChatServiceImpl.java:259` 附近）——WebFlux 的 `ContextWebFilter` 上下文桥在 servlet 部署下不生效，`chat/completions`（新会话与续聊两分支都取 ctx）、`chat/conversations/list` 等所有需要登录用户的 reactive 端点全部失败（B0001 / failed 事件）。叠加 M0.1 记录的 `ai-service`（Python LLM 上游，`ANYNOTE_AI_FASTAPI_ADDRESS=http://host.docker.internal:8000`）Phase 5 之后才接，即使 context 修复流式也无可答上游。**需后端开工单**：servlet 环境的登录上下文注入 + LLM 上游部署。
2. **`POST /moocs` 缺 `data_scope` 即失败**：`n_mooc.data_scope` 列 NOT NULL 无默认值，`MoocCreateDTO.dataScope` 可选导致缺省时 B0001。前端已补 `dataScope: 1` 规避；后端宜给列加默认或 DTO 必填。
3. **课程条目权限规则缺失**：`GET /moocs/items/{id}` 返回「获取SysPermissionRule：n:mooc:read失败」——系统权限规则表无 `n:mooc:read` 配置（数据问题）。
4. **PDF 上传后端链路失败**：`POST /docs/pdfs` 经 note→file Feign multipart 转存触发 fallback（「上传文档失败」），note 日志中根因被 gson 序列化 Throwable 的二次异常掩盖。与 M5.10 的图片直传 `@InnerAuth` 同族——**上传/解析链路的后端配合点未达成**。
5. **Settings 资料保存无可用对外端点**：`PUT /system/user/{userId}` 标注 `@InnerAuth`（内部端点），浏览器经代理调用被 A0301 拒绝；auth 域无资料更新端点。改密码（auth `/resetPassword`）不受影响。需后端提供对外资料更新端点或去除该端点 InnerAuth。

**前端侧修正（本轮发现并修复）**：

- **readonly 预设炸树 bug（M5 遗留）**：`preset="readonly"` 未显式传 `editable=false` 时 Toolbar 仍挂载，`useEditorState` selector 对 readonly 预设不存在的 `can().undo()` 求值抛 TypeError，整棵 React 树崩成 "Application error"。现在 readonly 预设强制只读并跳过 Toolbar/BubbleMenu。
- **ai 域代理前缀**：`aiApi` 与 SSE 引擎改走 `/api/proxy/aiNio`（见 M7.1）。
- **DTO 包装 query 平铺绑定**：`/docs`、`/moocs`、`/moocs/items`、`/chat/conversations/list` 的 springdoc 契约把 ModelAttribute POJO 呈现为包装对象（`query: { docListDTO: {...} }`），但 Spring 实际按平铺参数绑定——实测 bracket（`docListDTO[page]`）与 dot（`docListDTO.page`）语法后端均不绑定（A0160）。新增 `lib/api/dto-query.ts` 平铺 serializer 按请求注入。
- `GET /docs` 的 pageSize 上限 50（传 100 报「页面大小错误」），文档列表一次拉 50。
- BFF/网关 Origin 校验对无 Origin 头的脚本化 POST 一律 403（A0301「请求来源不受信任」）——curl 验证需显式带 `Origin` 头，浏览器场景不受影响。

**环境发现**：

- 同一 `.next` 目录上并行两个 `next start`（不同端口）且 build 与运行进程并发时，可能产出引用了不存在 chunk 的 HTML（页面 404 部分静态资源，水合失败、表单回退原生 GET 提交）。验收前确保旧进程终止、`rm -rf .next` 后重新 build。
- react-pdf 11（pdfjs 6）worker 经 `scripts/sync-pdf-worker.mjs` 落 `public/pdf.worker.min.mjs`（1.2MB，产物入库），workerSrc 指向 `/pdf.worker.min.mjs`；pdfjs 不能进 SSR 包，渲染器走 dynamic ssr:false。

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

## 5. 当前执行位置（2026-09-11 核对）

**最新：M7 已于 2026-09-11 完成实现、单测与浏览器验收**（分支 `phase/5.7-features`，自合并 M6 后的 `dev` 切出；合并 `dev` 待执行）。AI 聊天（SSE 流式会话 + 会话管理 + readonly Markdown 渲染 + slash AI 续写）、Chat PDF（上传/索引轮询/预览/文档问答）、AI 工作流（ReactFlow + zod）、Mooc（课程卡片/详情/视频）、Tasks（react-table + 提交）、Wikis（两级导航 + 只读渲染）、Settings（四分区嵌套路由）全部落地；全仓前端单测 359 → **440** 个，认证/代理集成 14 个真实用例通过，13 条路由 console 零 error。**AI 成功流式路径被后端阻塞**（ai-nio servlet 栈 reactor context 丢失 + LLM 上游未启动，见 M7.6 第 1 条），前端按错误路径验收；PDF 上传与资料保存同受后端缺口阻塞（M7.6 第 4、5 条）。执行差异见 **M7.6**。

**历史：M6 已于 2026-09-11 完成并合并 `dev`**（分支 `phase/5.6-notes`，自合并 M2-M5 后的 `dev` 切出；`--no-ff` merge commit `888c7da`）。笔记业务页面全量落地：知识库/笔记/编辑器三页面 + 数据 hooks + 自动保存状态机（debounce/乐观更新/回滚/离线/冲突/卸载 flush）+ 基于 `update_time` 版本号的后端乐观并发契约（`A0409`，见 openspec `2026-09-11-note-save-result-and-version`）。后端 note 模块 16 个、前端笔记域 75 个（全仓 359 个）单测通过；OpenAPI baseline 仅 note.json 契约性变更；生产构建 + 真实 Docker 栈的浏览器端到端验收通过（含双标签页冲突、拖拽移动、卸载 flush）。执行差异与环境发现见 **M6.5**；M5 遗留的 `@InnerAuth` 图片直传阻塞继续挂起。

**历史：M2-M5 已于 2026-09-11 全部合并 `dev`**（`e6384e5` / `05c2598` / `c3c3597` / `7b96e67`，逐个 `--no-ff`，无冲突；合并后 `dev` 的 tree 与 `phase/5.5-tiptap-core` 为同一 OID）。M5 实现与浏览器验收完成于 2026-09-10，分支 `phase/5.5-tiptap-core` 自 `phase/5.4-app-shell` 叠出。
TipTap 实际版本 v3.31.3；编辑器主 chunk 从 341.2 KB 降到 **211.3 KB gzip**（KaTeX / Shiki 改懒加载）；
285 个前端单测、110+ 文件 Biome、类型检查、生产构建与 `next dev` 浏览器实测均通过。
完整差异、已知限制与后端契约缺口见 **M5.10**。唯一未通过项：图片分片直传第 1 步 `POST /file/ossSliceUploadTasks`
被后端 `@InnerAuth` 拦截（`A0301`），需后端确认后重跑端到端。

> 备注：本次核对期间本地分支 ref 曾被外部清空（仅剩 `main`），已按已知 commit 还原
> `phase/5.2a-auth-backend`(2a12afc) / `phase/5.2-auth-bff`(**be0fcdb** —— 2026-09-11 更正，原记的 `dd3ca98` 是 `origin` 的值、旧 3 个提交) / `phase/5.3-api-layer`(186b50c) /
> `phase/5.4-app-shell`(b6035d5)。

---

M2.0 已于 2026-09-07 合并 `dev`（`3865a2f`）。当前分支 `phase/5.2-auth-bff` 已完成用户确认的 Gateway 仅 Bearer 前置改造，以及 OpenAPI 安全方案、测试和六份 baseline 更新；代码提交分别为 `57bf8b3` 和 `216a930`。

**当前执行位置**：M2 已全部验收（含浏览器端 M2.4），并于 2026-09-11 合并 `dev`（`e6384e5`）。M3 于 2026-09-10 在 `phase/5.3-api-layer`（自 `phase/5.2-auth-bff` 叠出）完成：`pnpm openapi:generate` 零漂移；`types/api.ts` 聚合导出、`lib/api/openapi.ts` 分域代理 client、`lib/api/errors.ts` ApiError、全局 `providers.tsx`、`features/auth/use-me.ts` + query-keys、dashboard 雏形页、CI spec-diff 增强。单测 182 个全绿（新增 use-me 4 个、query key 1 个、dashboard 3 个），typecheck / Biome / build 通过；浏览器实测登录后 dashboard 渲染昵称、登出后回登录页。M4 于同日继续完成 AppShell、主题和命令面板，并通过单测、Docker 后端集成测试与 Codex 浏览器验证（详见 M4.5）；M5 也已于同日完成（见 M5 / M5.10）。M2-M5 四条叠分支已于 2026-09-11 逐个 `--no-ff` 合并 `dev`；M6 已于同日完成实现、验收并合并 `dev`（`888c7da`，见 M6 / M6.5）。

**2026-09-10 本轮验证与发现**：
- 实现：`src/lib/auth/refresh.ts`（单飞刷新，锁挂进程级 `globalThis`）、`src/app/api/auth/refresh|me/route.ts`、`src/app/api/proxy/[...path]/route.ts`、`backend.ts` 增 `systemClient`。BFF 三处 catch 增加 `console.error` 服务端日志（此前异常被静默吞掉，本轮定位 502 全靠日志补齐）。
- 单测：前端 **174 个用例全部通过**（新增 25 个：单飞模块 4、refresh 路由 6、me 路由 6、代理 9）；`tsc --noEmit`、Biome（含 integration 目录）、OpenAPI 工具 20 个用例均通过；`pnpm --filter web build` 生产构建成功（本轮字体下载未再阻断），`next start` 启动正常。
- 端到端：`docker compose up -d` 复用既有容器（18 个全部 healthy，含带 LogoutFilter 修复的 auth）；集成测试扩展为 **14 个用例全部通过**（新增 `integration/proxy.live.test.ts` 6 个：me 白名单、me 仅 rt 自动刷新、代理 Bearer 透传、10 并发仅 1 次刷新、无 Cookie 401、写方法 Origin + POST body 透传）。测试账号会话在 afterAll 定向撤销。
- 端到端发现并修复：me 白名单初版把 `SysRole` 字段猜成 `name`/`code`，真实契约为 `roleKey`/`roleName`，zod 严格校验失败导致 502——按生成契约修正并改为可选字段 + `looseObject` 放行后端新增字段。另发现后端 JWT 的 `userContext` 内嵌 bcrypt 密码哈希（登录/刷新令牌均可 base64 解出），属后端议题，未在本轮处理，建议另开工单。
- 运行状态：Docker 全栈保持运行；`next start` 生产服务为浏览器验收重新启动并保持运行（`http://localhost:3000`）。探针账号（probe*/p5-p8）保留在库中，其令牌均有 Redis TTL 自然过期。

**2026-09-10 M2.4 浏览器端验收（ZCode In-app Browser，真实栈 + `next start` 生产构建）**：
- GUI 注册（表单校验、性别下拉）→ 自动登录跳转 `/dashboard`（页面本身 404 属 M3/M4 范围，不影响验收）。
- 注册后与登录后两个时点：`document.cookie` **完全为空**（JS 读不到 `at`/`rt`，HttpOnly 对浏览器生效）；`localStorage` / `sessionStorage` 键数均为 0。
- 同页 `fetch /api/auth/me` 返回 200 与白名单资料（无 password/token）；刷新 `/dashboard` 不被重定向（中间件凭 `at` Cookie 放行）。
- GUI 错误密码 → sonner 吐司"用户身份校验失败"、停留登录页、可重试；正确密码 → 跳转 `/dashboard`。
- 页面内登出（POST `/api/auth/logout`）→ 200 后 `me` 401/A0311、再访问 `/dashboard` 被重定向 `/login`、`document.cookie` 仍为空。
- 验收账号 `e2eguie127` 会话已在浏览器内撤销；登录页截图留存于会话产物。

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

文档与验收记录另行同步提交。分支已推送 `origin/phase/5.2-auth-bff`（2026-09-10 核对确认与本地同步）；2026-09-11 已 `--no-ff` 合并 `dev`（`e6384e5`），`main` 未动。刷新已于 2026-09-10 按用户指示实现；M2.4 全部完成。

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
