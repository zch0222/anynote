# 移动端路由段与版式偏好 Cookie

## 背景与授权

2026-09-12 用户拍板 [`docs/mobile/MOBILE_PLAN.md`](../../../docs/mobile/MOBILE_PLAN.md) §11 的 7 个决策点
（1、2 取备选，其余取默认），移动端适配进入实施（里程碑 M10.0 – M10.5）。

本提案登记两件**与既有约束相关**的决定，避免后续评审误判：

1. 移动端 UI 落在 `apps/web` 的 `app/(mobile)/m/**` 路由段，**不新开应用、不新开子域**；
2. 引入一个非 httpOnly 的版式偏好 Cookie `anynote_view`。

**本提案不改任何后端契约**：没有新增 / 修改 Controller、没有新增端点、`openapi/specs/*.json` 不变，
因此不需要跑 `pnpm openapi:generate`。移动端所有数据仍走既有 `@anynote/api-client` + Next BFF。

## 决定一：落点在同一个 Next 应用内

移动端不能换 origin，理由是**认证与同源强绑定**：

| 事实 | 出处 |
|------|------|
| 会话 Cookie 写死 `sameSite: "strict"` + `path: "/"`，**不设 `domain`**（host-only） | `apps/web/src/lib/auth/cookies.ts` |
| 刷新单飞锁是**进程级** `Map`，挂在 `globalThis.__anynoteRefreshInflight` | `apps/web/src/lib/auth/refresh.ts` |

推论：换 origin（含子域）既拿不到身份，又会让两个 Next 进程各持一把互不可见的锁，
同一个 `refreshToken` 被并发刷两次——正是 M2.1 已解决的问题。因此：

- `/m/*` 与桌面路由同源、同进程、同一套 BFF 与刷新锁；
- Nginx、Compose、Dockerfile **零改动**（生产只发布 `web:3000` 与 `collab:1234`，见 `docs/deployment-network.md`）；
- 逻辑层（`src/features/**/*.ts`、`src/lib/**`、`src/app/api/**`）**一行不改**，移动端只加 UI 层。

## 决定二：版式偏好 Cookie `anynote_view`

决策 1 取备选（一开始就做 UA 分流）后，需要一个可覆盖 UA 判定的用户偏好。

| 项 | 取值 |
|----|------|
| 名称 | `anynote_view` |
| 取值 | `mobile` \| `desktop`（其它值按未设置处理） |
| httpOnly | **否**（前端要能读它做互切链接的当前态提示） |
| sameSite | `lax`（跨站点跳转回来仍保留偏好；它不参与鉴权，不需要 `strict`） |
| path / maxAge | `/` / 一年 |
| 写入方 | `middleware.ts`，仅在请求带 `?desktop=1` / `?mobile=1` 时写 |

**与 `CLAUDE.md` 禁止清单的关系**：禁止的是"把 token 写到 `document.cookie` / localStorage / sessionStorage"。
`anynote_view` **不含任何身份信息**，值域只有两个字面量，泄露它既不能鉴权也不能识别用户，
因此不构成该条禁令的例外，也不需要像 `lib/desktop/bridge.ts`（M8.2）那样的授权豁免。
会话 Cookie（`at` / `rt`）仍然只由 BFF 以 httpOnly 写入，本提案不碰。

## 分流规则（纯函数 `resolveViewRedirect`）

只在**入口路径** `/` 与 `/dashboard` 做一次 307，深层路由（`/notes/3/7` 这类分享链接）永不改写。

优先级：

1. `?desktop=1` / `?mobile=1` —— 逃生口，同时写偏好 Cookie；
2. `anynote_view` 偏好 Cookie —— 优先于 UA；
3. `isMobileUserAgent(ua)` —— 兜底判定。

已在 `/m/*` 下的请求不再参与分流。`middleware.ts` 的 matcher 不变，仍排除
`/api/*`、`/_next/*`、`/login`、`/register` 与带扩展名的静态资源。

## 验证

- `apps/web/src/lib/mobile/__tests__/routing.test.ts`：`isMobileUserAgent` 与 `resolveViewRedirect`
  的 UA / 偏好 / 逃生口 / 非入口路径 / 已在移动端五类输入；
- `apps/web/src/__tests__/middleware.test.ts`：未登录仍跳登录页、分流写 Cookie、桌面 UA 行为不变；
- `apps/web/e2e/mobile-core.spec.ts`（M10.5）：移动 project 访问 `/` 落 `/m/dashboard`，`?desktop=1` 可逃生。

## 关联文档

- 方案与决策：`docs/mobile/MOBILE_PLAN.md`（D1 / D2 / §11）
- 执行与验收：`docs/mobile/MOBILE_MILESTONES.md`（M10.1 的 T1.10）
- 现状证据：`docs/mobile/UI_INVENTORY.md`
