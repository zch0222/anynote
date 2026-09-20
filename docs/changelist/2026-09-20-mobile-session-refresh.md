# 2026-09-20 移动端整页刷新会话保活（mobile-session-refresh）

## 概览

修复「移动端刷新之后登录状态丢了」：`at`（accessToken）是带 `expires` 的 httpOnly Cookie，过期后浏览器直接删除它，而寿命两倍的 `rt`（refreshToken）仍有效。原中间件只凭 `at` 判定「已登录」，于是「at 过期 + 整页刷新」的请求被 307 到 `/login`——而 BFF 的 `/api/auth/me`（`lib/auth/profile.ts` 的 `loadSessionProfile`）本来就支持仅凭 `rt` 换新 `at` 再拉资料，中间件先一步拦截导致续期链路永远走不到。移动端整页加载频繁（切后台回来、标签页被杀重开、下拉刷新），最先撞上；桌面 SPA 少整页刷新所以不易察觉，但缺陷两端同享。

修复口径：**「可能已登录」= 存在非空 `at` 或非空 `rt`**，放行到页面后由会话闸门 `WorkspaceSession` → `/api/auth/me` 完成真实校验：`rt` 有效则换新 `at` 并写回；无效则该端点返回 401，页面自己跳登录页兜底。首页 `page.tsx` 的「已登录跳工作台」判据与中间件同口径（`at || rt`），避免仅剩 `rt` 的用户刷新首页被当成访客留在官网。

- 改动：7 个文件（修改 4 · 新增 3），+98 / -4 行（已跟踪文件），全部在 `apps/web`
- 复现证据（修复前，本机 Docker 栈）：`curl -H "Cookie: rt=<有效rt>" http://localhost:3000/m/dashboard` → `307 → /login`；修复后同一请求 → `200`

### 验证结果

| 命令 | 结果 |
|---|---|
| `npx vitest run src/middleware.test.ts src/app/__tests__/home-page.test.tsx`（修复前先跑，5 条红复现 bug） | 修复前 5 failed / 47 passed，修复后 52 passed |
| `pnpm --filter web test`（全量前端单测） | **1831 passed**（155 个文件，含新增 17 条） |
| `npx playwright test --project=mobile mobile-core.spec.ts`（真实 Docker 栈 + 生产构建） | **26 passed**（含新增「会话保活」2 条） |
| `npx playwright test --project=chromium session-refresh.spec.ts auth.spec.ts` | **5 passed**（新增桌面保活 2 条 + 登录回归 3 条） |
| `npx playwright test`（全量两项目） | **140 passed**（存量 136 + 新增 4；首跑时 cli-authorize 1 条因与人工浏览器验证并行打同一服务器而瞬时超时，单独重跑与干净重跑均全绿） |
| 浏览器真实比对（ZCode 内置浏览器，390×844 移动视口） | 整页重进 `/m/dashboard` 登录态保持（标题「你好，…」渲染）；`/` 正确 307 进工作台；截图留档 |

> E2E 环境：后端为 `docker compose`（场景 A）真实栈；前端为宿主机 `NEXT_DISABLE_STANDALONE=1 pnpm --filter web build` + `npx next start`（Windows 无符号链接权限，standalone 追踪步会 EPERM，见 `next.config.ts` 注释；Docker 镜像内构建不受影响）。

## apps/web — 页面层会话判定（根因修复）

| 文件 | 状态 | 作用与原因 |
|---|---|---|
| `apps/web/src/middleware.ts` | 修改 | 「可能已登录」判据从仅 `at` 放宽为 `at \|\| rt`（注释说明用 `\|\|` 而非 `??`：`at=` 空值必须落到 rt），仅剩 rt 的整页请求放行到页面，由 `/api/auth/me` 续期；rt 也失效时该端点 401、页面跳登录兜底。未登录访客（两 Cookie 皆无）仍照旧 307 `/login`，公开页 `/` 放行与 UA 分流逻辑不变 |
| `apps/web/src/app/page.tsx` | 修改 | 首页「已登录跳 `/dashboard`」判据同步为 `at \|\| rt`，与中间件同口径；否则仅剩 rt 的用户刷新首页会被当成访客留在官网 |

## apps/web — 单元测试

| 文件 | 状态 | 作用与原因 |
|---|---|---|
| `apps/web/src/middleware.test.ts` | 修改 | 原 it.each 把 `rt=refresh-only` 固化成「跳登录」（M2 初版口径，早于移动端落地），与 BFF 的 rt 续期设计矛盾——移出该组；新增「整页刷新只剩 rt 时不丢会话」组 4 条：仅剩 rt 的受保护页（桌面/移动）放行、手机 UA 入口仍分流到 `/m/dashboard`、深层移动路由放行。修复前先跑，5 条红复现 bug |
| `apps/web/src/app/__tests__/home-page.test.tsx` | 新增 | 首页判据 3 条：带 at 跳工作台、仅剩 rt 同样跳、两者皆无渲染官网不跳转。mock `next/headers` / `next/navigation`（模式同 `cli-authorize.test.tsx`），LandingPage mock 掉避免拖整棵组件树 |

## apps/web — 端到端测试（需生产构建 + 真实 Docker 栈）

| 文件 | 状态 | 作用与原因 |
|---|---|---|
| `apps/web/e2e/mobile-core.spec.ts` | 修改 | 新增「移动端会话保活」describe：① 清掉 at 只留有效 rt 后整页刷新 `/m/dashboard`，断言仍在工作台且 `at` 已被 `/api/auth/me` 换新写回（httpOnly，从 Playwright 上下文读）；② 仅剩**无效** rt 时刷新最终仍回 `/login`，证明中间件放宽后验伪兜底还在 |
| `apps/web/e2e/session-refresh.spec.ts` | 新增 | 桌面侧同链路 2 条：仅剩 rt 刷新 `/notes` 不丢登录态且 at 续期写回；仅剩 rt 刷新 `/` 仍进工作台（覆盖 `page.tsx` 判据）。文件名不带 `mobile-` 前缀，跑在 chromium project |
| `apps/web/e2e/support/session.ts` | 新增 | `establishFreshSession`：现场登录换一对全新 at/rt 注入浏览器上下文。**必须自包含**——refresh 会轮换并吊销旧 rt，直接用 global-setup 留在 storageState 里的共享凭据，第一个保活用例跑完就会把后面所有需要 rt 的用例（桌面与移动两 project 共享同一份 state.json）全部拖垮 |

## 审计要点

1. **`middleware.ts` 的判据放宽是行为变更的核心**：`at || rt` 意味着「带任意 rt 字符串」的请求都能到达受保护页面的外壳（品牌启动屏），数据层完全不动——所有业务数据仍经 BFF + Gateway 鉴权，`rt` 验伪由 `/api/auth/me` 的 401 兜底（e2e 第②条用例专门锁住这条路）。评审重点看这是否可接受：与改动前「带任意垃圾 at 同样能过中间件」的既有信任模型一致，未引入新的数据暴露面。
2. **`||` 与 `??` 的区别**是唯一实现细节坑：`at=`（空值 Cookie）必须视为「没有 at」落到 rt 上，用 `??` 会把空串当有效值（单测「仅剩 rt 的桌面受保护页面同样放行」锁的就是这条）。
3. **e2e 的 rt 一次性语义**：refresh 轮换吊销旧 rt，`support/session.ts` 的自包含登录是三个保活用例不互相拖垮、也不拖垮全量套件里其它用例的前提。以后新增「仅剩 rt」类用例必须走这个 helper，不能直接用共享 storageState。
4. `page.tsx` 与 `middleware.ts` 的判据必须**永远同口径**（两处注释互相引用）；只改一处会出现「刷新首页被当访客」或「首页放行但下页被踢」的分裂行为。
5. 本次未动 BFF（`lib/auth/profile.ts` / `refresh.ts`）与后端：`loadSessionProfile` 的「仅凭 rt 先刷新再拉资料」分支在修复前就存在且有单测，只是整页请求到不了它。

## 环境与过程备注（非代码改动）

- 排障过程中发现宿主机残留一个上次会话的 `next start`（PID 56752，占 `0.0.0.0:3000` + `[::]:3000`）与 Docker 的 `127.0.0.1:3000` 形成端口分脑：浏览器/Node 走 IPv6 时命中宿主机旧进程，其 `/api/*` 全部挂起。已终止该进程并停掉 web 容器跑 e2e（README「跑之前确认没有旧的 next start 占着 3000 端口」即此坑）。
- `apps/web/.next` 的宿主机构建需 `NEXT_DISABLE_STANDALONE=1`（Windows 无符号链接权限，EPERM symlink），该开关此前已入库于 `next.config.ts`。
