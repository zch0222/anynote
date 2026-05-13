# Anynote 前端重构里程碑（可执行版）

> 文档版本：v1.0 | 生成日期：2026-05-13
> 关联文档：[REFACTOR_PLAN.md](./REFACTOR_PLAN.md) Phase 5、[FRONTEND_REFACTOR_PLAN.md](./FRONTEND_REFACTOR_PLAN.md)
> 当前状态：Phase 0-4、6、7 已 ✓；Phase 5 未启动，`apps/web/` 为空，`packages/api-client/src/` 未生成
> 主干分支：`dev`；本计划工作分支：`phase/5-frontend-rewrite`

---

## 0. 当前可复用资产盘点

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
| **M5** | TipTap 编辑器核心 | 3-4 天 | M1（可与 M2-M4 并行） | `phase/5.5-tiptap-core` | 中（文件上传 presign） |
| **M6** | 笔记业务页面 | 2-3 天 | M3, M5 | `phase/5.6-notes` | 强（笔记 CRUD） |
| **M7** | AI / PDF / Mooc / Tasks / Wikis | 3-4 天 | M3, M5 | `phase/5.7-features` | 强（AI SSE / chat-pdf） |
| **M8** | 协同 + 桌面 + 收尾 | 2 天 | M6, M7 | `phase/5.8-polish` | 弱 |

**总工期估算**：14-19 工作日（约 3-4 周），与 REFACTOR_PLAN 中 Phase 5 估算 5-7 天的差异来自 TipTap 切换 + 完整业务页面迁移成本。

---

## M0：OpenAPI 集成验证（强制门禁）

**目标**：用一次端到端跑通证明"后端 spec → 前端类型"链路可用，识别并补齐缺失注解。本里程碑不通过，后续禁止合并到 dev。

**分支**：`phase/5.0-openapi-validation`（从 `dev` 切出）

**状态**：🟢 **2026-05-13 完成 M0.1 / M0.2 / M0.3（strict 范围）/ M0.4，待 M0.5 合入。**

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

### M0.5 验收 🟡 待用户审阅合入
- [x] `pnpm openapi:generate` 干净退出，6 个 service spec 全部产出
- [x] `pnpm --filter @anynote/api-client typecheck` 0 错误
- [x] 12 个关键端点中**已存在的 10 个**在生成的 paths 类型中均可找到，且请求体 / 响应体均有具名 schema（非 unknown）；2 个未实现的 auth refresh/logout 已下推 M2
- [ ] PR 合并到 `dev`，打 Tag `v0.5.1-openapi-ready` ← **等待用户审阅**

> ⚠️ 如果 M0.3 发现后端缺口较多（>5 个端点没法用），优先补完再开 M1，不要并行启动前端。

---

## M1：前端骨架与工具链

**目标**：可启动的空壳应用，工具链全绿。

**分支**：`phase/5.1-skeleton`

### M1.1 初始化 Next.js 15
- [ ] 删除当前空 `apps/web/`（确认是空目录后），重新生成：
  ```bash
  cd apps && pnpm create next-app@latest web \
    --typescript --tailwind --app --src-dir \
    --import-alias "@/*" --no-eslint --turbo
  ```
- [ ] 校验 `apps/web/package.json` 加入 workspace（取消 `pnpm-workspace.yaml` 注释，确保 `apps/web` 已纳入）

### M1.2 依赖安装
```bash
cd apps/web && pnpm add \
  @tanstack/react-query @tanstack/react-query-devtools \
  zustand react-hook-form @hookform/resolvers zod \
  ky openapi-fetch openapi-typescript \
  next-themes jose \
  class-variance-authority clsx tailwind-merge lucide-react \
  @microsoft/fetch-event-source date-fns cmdk

pnpm add -D @types/node vitest @vitest/ui @testing-library/react jsdom
```

### M1.3 shadcn/ui 初始化与首批组件
```bash
pnpm dlx shadcn@latest init       # 选 New York + slate + CSS Variables
pnpm dlx shadcn@latest add button input form dialog dropdown-menu \
  sheet sidebar avatar badge card table tabs tooltip skeleton sonner \
  command separator scroll-area
```

### M1.4 TypeScript / Biome / Turbo 配合
- [ ] `apps/web/tsconfig.json` extends `packages/tsconfig/base.json`，开启 `strict + noUncheckedIndexedAccess + exactOptionalPropertyTypes`
- [ ] 根 `package.json` 加 `"typecheck": "turbo typecheck"`，子包加对应脚本
- [ ] 把 `apps/web` 的 dev/build/lint 接到 turbo pipeline，验证 `pnpm dev` `pnpm build` `pnpm check` 全绿
- [ ] `apps/web/src/lib/env.ts` 用 zod 校验环境变量（`NEXT_PUBLIC_*` 与服务端变量分离）

### M1.5 验收
- [ ] `pnpm dev` 在 3s 内启动，访问 `http://localhost:3000` 见默认页
- [ ] `pnpm build` 成功，bundle 报告打印
- [ ] `pnpm check` 无 warning
- [ ] 合并到 `dev`

---

## M2：认证 BFF + Cookie 安全

**目标**：登录全链路走通；浏览器侧无法读到 token；并发刷新无竞争。

**分支**：`phase/5.2-auth-bff`

### M2.1 BFF 路由
- [ ] `src/app/api/auth/login/route.ts`：调用 `/auth/login` → 响应中 `Set-Cookie` 三件套（`at` / `rt` / `sid`）
- [ ] `src/app/api/auth/refresh/route.ts`：进程内 `Map<rt, Promise<void>>` 锁防并发
- [ ] `src/app/api/auth/logout/route.ts`：清三件套 + 通知后端
- [ ] `src/app/api/auth/me/route.ts`：转发 `/system/user/getInfo`，返回用户资料
- [ ] `src/app/api/proxy/[...path]/route.ts`：所有业务请求经此，自动注入 `Authorization: Bearer ${at}` 并在过期时触发刷新

### M2.2 中间件路由保护
- [ ] `apps/web/src/middleware.ts`：未带 `at` cookie 的私有路由重定向到 `/login`
- [ ] `matcher` 排除 `/login` `/register` `/api/auth/**` `/_next` 静态资源

### M2.3 登录 / 注册页
- [ ] `(auth)/login/page.tsx`：react-hook-form + zod，提交到 `/api/auth/login`
- [ ] `(auth)/register/page.tsx`：调 `/system/register`
- [ ] 错误吐司用 sonner
- [ ] 登录成功 `router.push('/dashboard')`

### M2.4 验收
- [ ] 登录后 DevTools → Application → Cookies：只有 `at` / `rt` / `sid`，HttpOnly 均为 ✓
- [ ] DevTools → Application → LocalStorage / SessionStorage 全空
- [ ] 手动让 `at` 提前过期（缩短 TTL 至 30s 测试），并发触发 10 个请求，只产生 1 次 `/auth/refresh` 调用
- [ ] 登出后 cookies 三件套全部清空
- [ ] 合并到 `dev`

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
- [ ] `lib/editor/upload.ts`：调 `/api/v1/files/presign`（M0.3 已确认存在）→ PUT 到 MinIO → 返回 publicUrl
- [ ] `AnynoteImage` 扩展接 `uploadFn`，支持工具栏插入 / 粘贴 / 拖拽 三种入口
- [ ] 大文件分片：复用 file 服务现有分片端点（若有），否则单文件上限 50MB

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
| M0 | 补齐前端必需的 12 个端点 `@Operation` / `@Schema`；若 `/files/presign` 不存在则新增 | 强制 |
| M3 | CI workflow 接入；后端 PR 改动 Controller 时跑 spec 生成 + diff | 持续 |
| M5 | 确认 `/files/presign` 返回 PUT URL + 公共可读 URL；MinIO bucket CORS 放通前端域名 | 强制 |
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

## 5. 立即可执行的下一步

1. `git checkout dev && git pull` 同步主线
2. `git checkout -b phase/5.0-openapi-validation`
3. 启动 `docker compose -f infra/docker-compose-middleware.yaml up -d`
4. 启动各后端服务（参考 `docs/` 中已有启动指南）
5. 跑 `pnpm openapi:generate`，把第一份输出 commit 进 `openapi/specs/`（仅作快照基线，后续 gitignore）
6. 按 M0.3 表格逐端点检查注解，缺一个补一个
7. M0 通过 → 切 M1 分支，开始前端骨架

**预计本周（W1）可推进到 M2 中段**。
