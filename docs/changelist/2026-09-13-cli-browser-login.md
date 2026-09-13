# 2026-09-13 CLI 浏览器授权登录（`/cli/authorize`）

## 概览

给 `apps/cli` 增加**浏览器授权登录**：`anynote auth login` 默认打开 Web 前端的
`/cli/authorize` 页面，未登录先引导登录、已登录则展示当前账号并要求点一次「授权」，
随后为 CLI **另发**一对独立令牌（与浏览器会话各自登出互不影响）。

采用**回环重定向 + 一次性授权码 + PKCE**（RFC 8252 风格）的公开客户端模式：
浏览器只传一个 60 秒有效的一次性授权码，**Token 从不经过浏览器**。

| 项 | 值 |
|---|---|
| 修改文件数 | 26 |
| 新增文件数 | 28（不含本文件） |
| 删除文件数 | 0 |
| 增删行数（已跟踪文件） | 593 insertions / 33 deletions（`git diff --stat`，不含新增文件） |
| 新增文件行数 | 3 254 行（`git ls-files --others` + `wc -l`，不含本文件） |
| 代码改动 | Java（auth 服务）+ Next BFF/页面 + TypeScript CLI，三端均有单测 |

对应契约提案：[`.claude/openspec/changes/2026-09-13-cli-browser-login.md`](../../.claude/openspec/changes/2026-09-13-cli-browser-login.md)。
里程碑记录：[`docs/cli/CLI_MILESTONES.md`](../cli/CLI_MILESTONES.md) 的 M9.6。

> ⚠️ 本文件**不包含** `infra/docker-compose.yaml` 的改动与
> `docs/changelist/2026-09-13-{nginx-tls,web-lan-origin}.md`——那三项在本批工作开始前
> 就已存在于工作区（内网 HTTPS 入口），属于另一批改动，见各自的 changelist。

## 后端 auth 服务

为当前会话用户**另发**一对令牌。与 `/login` 的区别是不校验口令：调用方身份已由网关用
Bearer accessToken 验证过。

| 文件 | 状态 | 作用与原因 |
|------|------|-----------|
| `services/auth/src/main/java/com/anynote/auth/model/vo/CliTokenVO.java` | 新增 | CLI 授权响应体：`username` / `nickname` / `token`。不复用 `LoginDTO`——那是登录响应，带 avatar / role，且语义上属于"口令登录"；这里要明确表达"为 CLI 单独签发的一对令牌"。 |
| `services/auth/src/main/java/com/anynote/auth/service/LoginService.java` | 修改 | 新增 `issueCliToken()` 声明与契约注释（为什么不校验口令、会话隔离在哪里体现）。 |
| `services/auth/src/main/java/com/anynote/auth/service/impl/LoginServiceImpl.java` | 修改 | `issueCliToken()` 实现。**关键点**：`tokenUtil.getLoginUser()` 返回的是**请求上下文里的 LoginUser 实例**，而 `TokenUtil.createToken` 会把 token 回写到入参对象上——直接复用会污染当前会话对象，因此显式 `new LoginUser(...)` 复制身份字段后再签发。 |
| `services/auth/src/main/java/com/anynote/auth/controller/TokenController.java` | 修改 | `POST /cli/token`（`@Operation` 带 summary/description，遵守 Phase 1 的 contract-first 约束）。**刻意不加 `@InnerAuth`、不加网关白名单**：与 `/logout`、`/refresh` 同层，由 BFF 以用户 Bearer 调用。 |
| `services/auth/src/test/java/com/anynote/auth/service/impl/LoginServiceImplCliTokenTest.java` | 新增 | 5 条纯单测（Mockito，不加载 Spring）：正常签发、身份字段复制、**不污染会话对象**、无登录用户拒绝、脏缓存（缺 sysUser）拒绝。 |

## OpenAPI 契约

| 文件 | 状态 | 作用与原因 |
|------|------|-----------|
| `openapi/specs/auth.json` | 修改 | 由 `pnpm openapi:generate` 从运行中的网关重新拉取（重建 auth 镜像后），只多了 `CliTokenVO` 与 `/cli/token`。**其余 5 份 spec 逐字节未变**，说明没有意外漂移。CI 的 `openapi-check.yml` 会对该 baseline diff 阻断。 |

## Web 前端（`apps/web`）

### 页面与组件

| 文件 | 状态 | 作用与原因 |
|------|------|-----------|
| `apps/web/src/app/(auth)/cli/authorize/page.tsx` | 新增 | 授权页 RSC 外壳。**自己检查会话**并在未登录时带着**完整参数**跳 `/login?next=...`（页面被 middleware 排除，见下）；参数非法时直接渲染可读错误而不跳登录——那种请求多半是手改的 URL 或过期的 CLI 链接。`robots: noindex`。 |
| `apps/web/src/features/auth/components/cli-authorize.tsx` | 新增 | 授权确认客户端组件：展示账号 + 「授权」/「取消」。**必须有用户手势**——若自动回传，本机恶意进程只要抢先占住回环端口就能白拿凭据。成功后整页 `location.assign` 到 CLI 回环地址（目标是本地服务，不是 Next 路由，故不能用 `router.push`）。 |
| `apps/web/src/features/auth/components/account-badge.tsx` | 新增 | 账号回显（昵称优先，回落用户名）。**加载完成前不渲染授权按钮**——显示错账号等于把凭据发给错误的身份；读取失败给出可操作提示。 |
| `apps/web/src/features/auth/use-cli-authorize-mutation.ts` | 新增 | `use<X>Mutation` 命名约定。走普通 `fetch` 而非 typed client：`/api/auth/cli-token` 是 **BFF 自有端点**，不在 OpenAPI 契约里（与 `use-me.ts` 同一处理）。 |

### BFF 路由

| 文件 | 状态 | 作用与原因 |
|------|------|-----------|
| `apps/web/src/app/api/auth/cli-token/route.ts` | 新增 | 用户点「授权」时调用：`checkOrigin` → `loadSessionProfile`（会话 Cookie，必要时刷新）→ 调后端 `/cli/token` → 把令牌存**服务端内存**并返回一次性授权码。**响应体绝不含 Token**，只含 `{code, state, redirectTo}`。 |
| `apps/web/src/app/api/auth/cli-exchange/route.ts` | 新增 | CLI 用 `code` + PKCE verifier 兑换令牌。整条链路里**唯一**把 Token 交给请求方的出口，因此：码一次性（取用即删）、**必校验 S256**、失败一律回同一个 `A0301`（不区分"不存在/已用过/已过期/verifier 不匹配"，避免给攻击者"这个码曾经有效"的信号）。导出 `pkceChallengeOf` 供 CLI 侧对齐算法。 |
| `apps/web/src/lib/auth/cli-code-store.ts` | 新增 | 授权码的一次性内存存储（60s TTL、取用即删、不落盘不进 Redis）。Map 挂在 `globalThis` 上——与 `refresh.ts` 同一套路，否则 dev HMR 与分路由打包会重新实例化模块、丢掉正在进行的授权。**注释写明单实例假设**（多实例部署需挪进 Redis）。 |
| `apps/web/src/lib/auth/cli-schemas.ts` | 新增 | BFF 边界的 zod 校验（不可信输入）：回环端口范围、state/challenge/verifier 的 base64url 形状与长度。 |

### 纯函数与安全工具

| 文件 | 状态 | 作用与原因 |
|------|------|-----------|
| `apps/web/src/lib/auth/cli-authorize.ts` | 新增 | 授权参数的**单一校验规则**（页面、BFF、单测都调它）：只用正则卡十进制 port（`parseInt` 会接受 `"80abc"`）、限制 1024–65535、base64url 形状与长度上限；并提供回环回调 URL 与登录重定向 URL 的构造。回环地址固定 `127.0.0.1` 而非 `localhost`——双栈机器上 `localhost` 可能先解析到 `::1`，而 CLI 只监听 IPv4。 |
| `apps/web/src/lib/auth/redirect.ts` | 新增 | `?next=` 的**开放重定向防护**：只接受站内绝对路径，拒绝 `//host`、`/\host`、控制字符，且**不做二次解码**（`useSearchParams` 已解过一次，再解会把 `%2F%2Fevil` 还原成协议相对地址）。 |

### 既有文件改动

| 文件 | 状态 | 作用与原因 |
|------|------|-----------|
| `apps/web/src/middleware.ts` | 修改 | matcher 排除 `/cli`。**这是授权页能工作的必要条件**：middleware 的未登录跳转**不带 `next`**，走它的话用户登录后就回不到授权页、整条链路断掉。授权动作本身仍由 BFF 校验会话 Cookie。 |
| `apps/web/src/features/auth/components/login-form.tsx` | 修改 | 支持 `?next=`：登录后回授权页。用 `safeNextPath()` 过滤，防开放重定向。 |
| `apps/web/src/app/(auth)/login/page.tsx` | 修改 | 把 `LoginForm` 包进 `Suspense`——它开始读 `useSearchParams`，不包会让整页退化成动态渲染。 |

### Web 单测

| 文件 | 状态 | 作用与原因 |
|------|------|-----------|
| `apps/web/src/lib/auth/__tests__/cli-authorize.test.ts` | 新增 | 26 条：port 形状与边界（1024/65535 收、1023/0/65536 拒）、state/challenge 的非法字符与长度、回环 URL 与登录重定向的参数保留与编码。 |
| `apps/web/src/lib/auth/__tests__/redirect.test.ts` | 新增 | 23 条：站内路径与各种开放重定向载荷、控制字符、**不做二次解码**。 |
| `apps/web/src/lib/auth/__tests__/cli-code-store.test.ts` | 新增 | 9 条：CSPRNG 形状、取用即删、TTL 边界（正好到期失效 / 到期前一毫秒有效）、多码互不干扰。 |
| `apps/web/src/app/api/auth/__tests__/cli-authorize-routes.test.ts` | 新增 | 25 条：两路由的**安全契约**——响应不含 Token、Bearer 取自 Cookie（刷新后用新 token 并回写 Cookie）、跨源 403、未登录 401 且不签发码、参数非法 400、上游异常 502 不泄露内部地址、兑换端点接受无 Origin 的 CLI 请求、verifier 不匹配拒绝、错误不回显码是否存在。 |
| `apps/web/src/features/auth/__tests__/cli-authorize.test.tsx` | 新增 | 13 条：**未点击前不发任何请求**、点击后提交正确参数并整页跳转、失败提示不跳转、提交期间禁用按钮防重复签发、取消不授权、RSC 的参数非法/未登录带 next/已登录三分支。 |
| `apps/web/src/features/auth/__tests__/auth.test.tsx` | 修改 | 原有 mock 补 `useSearchParams`；新增 4 条覆盖 `?next=` 的合法跳转与三种开放重定向载荷回落到 `/dashboard`。 |
| `apps/web/src/middleware.test.ts` | 修改 | 新增 5 条：`/cli` 及其子路径不被 matcher 覆盖；并断言 middleware 函数体本身跳转**不带 next**，解释为什么 matcher 排除是必要条件而非可选优化。 |

## CLI（`apps/cli`）

### 新模块

| 文件 | 状态 | 作用与原因 |
|------|------|-----------|
| `apps/cli/src/auth/loopback.ts` | 新增 | 回环回调服务：**只绑 `127.0.0.1`**（授权码不能出现在局域网）、端口由内核分配、state 不匹配的回调被拒但继续等待、收到合法回调即结束。用"显式终态 + 通知钩子"而不是散落的布尔量——早期实现用可变 `settle` + `done` 布尔量，导致**超时后再调一次 `waitForCode` 会永远挂起**（被单测抓到并修掉）。 |
| `apps/cli/src/auth/pkce.ts` | 新增 | PKCE S256 参数与授权 URL 构造。用 `new URL("cli/authorize", base)` 保留反代子路径前缀，避免子路径部署下 404。 |
| `apps/cli/src/auth/browser-login.ts` | 新增 | 串起整条协议：起回环 → 开浏览器（失败则打印链接）→ 等回调 → 校验 state → 用 code+verifier 兑换 → **无论成败都关掉监听**。 |
| `apps/cli/src/auth/browser.ts` | 新增 | 三平台打开浏览器。命令数组传参、**不经 shell**——授权链接恰好带三个 `&` 参数，走 shell 必被截断；无头环境返回 `false` 而不是抛错。 |

### 既有文件改动

| 文件 | 状态 | 作用与原因 |
|------|------|-----------|
| `apps/cli/src/commands/auth.ts` | 修改 | `auth login` 默认走浏览器；给了口令参数（或 `--password-only`）则走原口令路径。新增 `--timeout`。**先落盘再 whoami**：`createAuthFetch` 一律用凭据存储里的 token 覆盖 `Authorization`，所以想用新令牌打后端就必须先存；whoami 成功再用**后端返回的**用户名覆盖 BFF 的回显值。 |
| `apps/cli/src/core/env.ts` | 修改 | 新增 `ANYNOTE_WEB_URL`（默认 `http://localhost:3000`）与 `ANYNOTE_OPEN_BROWSER`（置 0 只打印链接，供无头环境与 E2E）。 |
| `apps/cli/src/core/context.ts` | 修改 | 注入 `openBrowser` 与 `webFetch` 两个可替换依赖，让单测不弹窗、不打真实网络。 |
| `apps/cli/src/core/exit.ts` | 修改 | 新增 `AuthFlowError`（→ 退出码 3）。**超时/取消/端口占用归到「未认证」而不是「用法错误」**：对 agent 的结论是同一个——当前没有可用凭据，让用户重跑 `auth login`，而不是去看 `--help`。 |

### CLI 单测

| 文件 | 状态 | 作用与原因 |
|------|------|-----------|
| `apps/cli/src/__tests__/loopback.test.ts` | 新增 | 10 条：**真的起服务**、只绑回环、state 匹配/不匹配（后者不影响后续合法回调）、缺参数、非回调路径 404、一次性、**回调早于 `waitForCode` 也不丢**、超时、`AbortSignal` 取消、端口占用给出可操作提示。 |
| `apps/cli/src/__tests__/pkce.test.ts` | 新增 | 8 条：verifier 长度符合 RFC 7636、challenge 与 **RFC 7636 附录 B 官方测试向量**一致（同时锁住 CLI 与 BFF 两侧算法相同）、随机性、URL 构造（末尾斜杠、子路径前缀、特殊字符编码）。 |
| `apps/cli/src/__tests__/browser.test.ts` | 新增 | 5 条：三平台命令、URL 作为单个参数不经过 shell、未知平台/命令不存在返回 false 而不是崩掉。 |
| `apps/cli/src/__tests__/browser-login.test.ts` | 新增 | 9 条：完整闭环（真回环 + 打桩浏览器与兑换）、**输出与 stderr 都不含 token**、verifier 与 challenge 自洽、打不开浏览器时打印链接、超时、授权被拒、连不上报 `NetworkError`、whoami 失败不使登录作废、显式 `--username` 不启回环。 |
| `apps/cli/src/__tests__/exit.test.ts` | 修改 | 新增 2 条：`AuthFlowError` 与 `LoopbackError` → 退出码 3，且**不是**用法错误。 |
| `apps/cli/src/__tests__/env.test.ts` | 修改 | 新增 2 条：`ANYNOTE_WEB_URL` 缺省与覆盖、`ANYNOTE_OPEN_BROWSER` 只有显式 `0`/`false` 才关闭。 |
| `apps/cli/src/__tests__/commands.test.ts` | 修改 | 原 3 条 `authLogin` 用例补 `passwordOnly` / `timeout` 参数（命令签名变更）。 |
| `apps/cli/src/__tests__/helpers.ts` | 修改 | 测试上下文补 `webUrl` / `openBrowser` / `webFetch`；默认"打不开浏览器"与"没有 webFetch 打桩就抛错"，避免用例意外触网或弹窗。 |
| `apps/cli/e2e/helpers.ts` | 修改 | 新增 `startCli`（长驻子进程，用于等待用户操作的命令）与 `waitFor`（轮询子进程 stderr）。 |

## 端到端用例（真实 docker 栈）

| 文件 | 状态 | 作用与原因 |
|------|------|-----------|
| `apps/web/e2e/cli-authorize.spec.ts` | 新增 | 5 条 Playwright：**未登录 → 登录 → 回到授权页 → 授权 → CLI 落盘**的真浏览器闭环；CLI 与浏览器会话相互独立（CLI 登出后网页仍可用）；已登录直接展示账号；参数非法给可读错误；页面 JS 拿不到任何 token。 |
| `apps/cli/e2e/browser-login.live.test.ts` | 新增 | 6 条协议面用例（不需要浏览器，由测试扮演浏览器直接调 BFF）：授权链接形状、完整闭环 + whoami + 输出不泄漏 token、CLI 令牌与浏览器会话独立、**授权码一次性**（同码两次兑换第二次失败）、未登录被拒且 CLI 以退出码 3 超时、state 不匹配被拒但不影响后续合法回调。 |

## 生成物（必须与源头同步，CI 卡 diff）

| 文件 | 状态 | 作用与原因 |
|------|------|-----------|
| `docs/cli/COMMANDS.md` | 修改 | 由 `node dist/anynote.mjs manifest --format=markdown --write` 生成；`auth login` 的参数表随命令面变化。 |
| `.claude/skills/anynote-cli/reference/commands.md` | 修改 | 同上，同一份生成物的另一个落点。 |
| `apps/cli/src/bundled.ts` | 修改 | 由 `node scripts/build-bundled.mjs` 生成，是 `.claude/skills/anynote-{cli,notes}` 的构建期快照。本次改了 skill 源文（见下），必须重新烘焙。 |

## 文档

| 文件 | 状态 | 作用与原因 |
|------|------|-----------|
| `.claude/openspec/changes/2026-09-13-cli-browser-login.md` | 新增 | 契约提案：背景、三项已确认决策、授权协议图、已确认契约、**安全边界七条**、验证计划、需同步的文档。 |
| `docs/cli/CLI_MILESTONES.md` | 修改 | 总览表新增 M9.6 行；新增 M9.6 章节（完成项、与方案的三处偏差及原因、验证结果表）。 |
| `docs/cli/CLI_PLAN.md` | 修改 | §8.1 的 `auth login` 端点与说明更新；新增 §8.1.1 浏览器授权登录（含协议图与硬约束）。 |
| `apps/cli/README.md` | 修改 | 环境变量表补 `ANYNOTE_WEB_URL`（与 `ANYNOTE_OPEN_BROWSER`）；新增「登录」一节说明两条路径与"为什么不是复制浏览器 token"；凭据与安全一节补浏览器路径的边界。 |
| `README.md` | 修改 | 「让 AI 自己装好 CLI 与 skill」段的登录示例改为浏览器优先 + 口令备用，并说明独立令牌与 `ANYNOTE_WEB_URL`。 |
| `.claude/skills/anynote-cli/SKILL.md` | 修改 | 认证指引按"无头环境 / 有浏览器的用户"分开写（agent 必须走 `--password-stdin`，浏览器那条要人工点击、agent 等不到）；环境变量表补 `ANYNOTE_WEB_URL`；退出码 3 补充"含 `auth login` 授权超时/取消"。 |

## 审计要点

1. **Token 从不经过浏览器**。整条链路里浏览器只拿到一个 60 秒有效的一次性授权码；
   Token 存在 BFF 进程内存，由 CLI 带 PKCE verifier 从 `/api/auth/cli-exchange` 取走。
   评审时重点看 `cli-token/route.ts` 的响应构造与 `cli-authorize-routes.test.ts` 里
   "响应不含 Token" 的断言——这是本批改动最核心的安全属性。
2. **`/cli` 必须排除在 middleware 之外**。middleware 的未登录跳转不带 `next`，
   走它用户登录后就回不到授权页。`middleware.test.ts` 里有一条专门断言这个差异，
   评审时不要把它当成冗余用例。
3. **`?next=` 是用户可控输入**，`redirect.ts` 的过滤规则（只接受单个 `/` 开头的站内路径、
   拒绝 `//host`、不做二次解码）直接决定会不会变成开放重定向。
4. **回环服务的三条硬约束**：只绑 `127.0.0.1`、端口内核分配、state 必校验。
   `loopback.ts` 的终态设计有一个被单测抓到的真实缺陷（超时后重复等待会永久挂起），
   评审时建议看那份"显式终态"的注释。
5. **`issueCliToken` 不能复用请求上下文里的 `LoginUser` 实例**——`TokenUtil.createToken`
   会把 token 回写到入参对象上，复用会污染当前会话。`LoginServiceImplCliTokenTest`
   有一条 `doesNotReuseSessionInstance` 专门锁这个行为。
6. **`auth login` 的默认行为变更**：不带参数时从"要求口令"变成"开浏览器"。
   `--password-stdin` / `--password` / `--username` / `--password-only` 全部保持原语义，
   因此现有 agent 与 CI 脚本只要显式给了用户名就不会受影响。
7. **`AuthFlowError` → 退出码 3 是刻意的**：登录超时/取消/端口占用对 agent 的结论是
   "没有可用凭据，重跑 auth login"，而不是"参数写错了去看 --help"。

## 验证结果

| 命令 | 结果 |
|------|------|
| `mvn -B test -pl auth -am`（含 `common-security-core` 等依赖模块） | **50 通过 / 0 失败**，含新增 `LoginServiceImplCliTokenTest` 5 条；`BUILD SUCCESS` |
| `pnpm --filter web test`（vitest） | **982 通过 / 100 文件**（基线 876；本批 +106） |
| `pnpm --filter @anynote/cli test`（vitest） | **268 通过 / 19 文件**（基线约 215；本批 +53） |
| `packages/api-core` vitest | 23 通过 |
| `pnpm --filter web test:e2e --project=chromium` | **30 通过**，其中 `cli-authorize.spec.ts` 5 条全绿（真实栈 + 真浏览器） |
| `pnpm --filter @anynote/cli test:e2e` | **50 通过 / 2 文件**，含新增 `browser-login.live.test.ts` 6 条 |
| `pnpm openapi:generate` → `git diff --stat openapi/specs/` | 仅 `auth.json` 变化（+`CliTokenVO`、+`/cli/token`），其余 5 份逐字节未变 |
| `pnpm --filter web typecheck` (tsc) | 通过（0 错误） |
| `pnpm --filter @anynote/cli typecheck` (tsc) | 通过（0 错误） |
| `biome check`（本批改动的 32 个文件） | 0 问题；全仓仅剩 1 条**改动前就存在**的 `toolbar.tsx` noArrayIndexKey |
| `pnpm --filter web bundle:budget` | 三项全 PASS（首屏 295.4/300 KB、移动端 243.1/250 KB、编辑器 13.8/250 KB） |

### 环境注意事项（复现验证时必读）

- **本机 Java 单测需要 workaround**：WSL 下 Byte Buddy 无法 attach（`Could not initialize
  plugin: org.mockito.plugins.MockMaker`），需追加
  `-DargLine="-javaagent:<m2>/net/bytebuddy/byte-buddy-agent/1.14.19/byte-buddy-agent-1.14.19.jar"`。
  这是**本机环境问题，未改仓库任何配置**；CI（ubuntu-latest）上 `mvn test` 直接通过。
- **Java 构建在 maven 容器里跑**：`docker run --rm -v <repo>:/work -v ~/.m2:/root/.m2 -w /work/services
  maven:3.9-eclipse-temurin-21 mvn ...`，与 CI 的 JDK 21 口径一致。
- **E2E 需要把前端 Origin 对齐**：容器镜像的 `NEXT_PUBLIC_APP_URL` 被编译进前端，
  BFF 的 `checkOrigin` 只认这个值。本机内网入口已是 `https://192.168.3.90:3000`，
  因此验证时用 `E2E_BASE_URL=https://192.168.3.90:3000` +
  `NODE_EXTRA_CA_CERTS` 指向本机自签名 CA（否则 Node 侧证书校验失败）。
  Playwright 走 **Windows 侧 Node**（浏览器已装在 Windows），跨 WSL 传环境变量需要
  `WSLENV=NODE_EXTRA_CA_CERTS/p:E2E_BASE_URL`——**漏掉 `E2E_BASE_URL` 会被静默丢弃**，
  表现为 `global-setup` 因 Origin 不匹配收到 403「请求来源不受信任」。
- **WSL 里没有 Linux node**：`/tmp/nodebin/node` 是一个转发到 Windows `node.exe` 的包装脚本，
  顺带把 WSL 绝对路径转成 Windows 路径，供 `openapi/generate.sh` 这类脚本使用。
