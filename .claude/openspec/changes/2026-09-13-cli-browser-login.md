# CLI 浏览器授权登录（`/cli/authorize`）

## 背景

`anynote auth login` 目前只支持口令登录（`--password-stdin` / `--password`）。这条路径在三个场景下不好用：

1. **用户侧**：口令要进 stdin 或 shell history，多设备/多 profile 时反复输；
2. **安全侧**：口令是长期凭据，CLI 落盘的 `credentials.json` 里却是 Token——口令在 shell 管道里多经一手；
3. **体验侧**：用户已经在浏览器里登录了 Anynote，却还要在终端里再输一次口令。

2026-09-13 用户要求：在 `apps/web` 新增一个**专门给 CLI 用的登录页**，`auth login` 跳到该页面；
**已登录就直接颁发 token，未登录就先要求登录**。

## 已确认决策（2026-09-13 用户确认）

| # | 决策 | 理由 |
|---|------|------|
| 1 | **新增后端端点 `POST /api/auth/cli/token`**，为当前会话用户签发**独立**的 token 对 | 浏览器会话那一对是 httpOnly Cookie、BFF 专用；直接复用会让「CLI 登出」把网页也踢下线。独立签发让两端各自登出互不影响。 |
| 2 | 已登录时**需点一次「授权」**，页面展示当前账号 | 阻止本机恶意进程借用户浏览器**静默**骗取 token：没有用户手势就不完成回环回调。 |
| 3 | `anynote auth login` **默认走浏览器**，保留 `--password-stdin` 作显式备用 | 与需求原话一致；agent 无浏览器时仍可用口令路径（文档与 skill 生成物同步说明）。 |

## 授权协议（回环重定向，RFC 8252 风格）

CLI 是本地进程、没有 Cookie jar，也不该把 Token 送进浏览器地址栏。因此采用
**回环地址 + 一次性授权码 + PKCE** 的公开客户端模式：

```
CLI                                                 浏览器 / BFF                            后端 auth
 │ 1. 起回环 HTTP 服务 127.0.0.1:<随机端口>
 │    生成 state（防跨进程串号）
 │    生成 PKCE verifier + S256 challenge
 │ 2. 打开 https://<web>/cli/authorize?port&state&challenge
 │                                                    │ 3. 未登录 → 307 /login?next=<授权页完整地址>
 │                                                    │    已登录 → 展示当前账号 + 「授权」按钮
 │                                                    │ 4. 点授权 → POST /api/auth/cli-token
 │                                                    │    {codeChallenge, state, port}
 │                                                    │    ├─ checkOrigin（同源）
 │                                                    │    ├─ loadSessionProfile（会话 Cookie，必要时刷新）
 │                                                    │    └─ POST /api/auth/cli/token（Bearer）──►│ 5. 另发一对令牌
 │                                                    │◄────────── Token ─────────────────────────│
 │                                                    │ 6. 返回 {code, state, redirectTo}，**不含 token**
 │ 7. 回环收到 state + code（校验 state、一次性、60s 过期）
 │ 8. POST /api/auth/cli/exchange {code, codeVerifier}
 │    （直连网关，不经浏览器；code 只能换一次）
 │◄───────── accessToken / refreshToken ──────────────│
 │ 9. 校验 state → 写 credentials.json → 关回环服务
```

**关键点：Token 从不经过浏览器地址栏，也不进入页面 JS。** 浏览器只拿到一次性 code，
且该 code 必须配合 CLI 私藏的 PKCE verifier 才能换取 Token——即使本机其他进程抢先
注册了那个端口，也换不走凭据。

## 已确认契约

### 后端

| 项 | 值 |
|---|---|
| 路径 | `POST /api/auth/cli/token` |
| 认证 | **网关 Bearer**（不在 `security.ignore.whites` 白名单里，与 `/logout`、`/refresh` 同层） |
| 请求体 | 无（身份完全取自 accessToken） |
| 响应 | `ResData<CliTokenVO>`：`{ username, nickname, token: { accessToken, refreshToken, accessTokenExpirationTime } }` |
| 失败 | 无有效 Bearer → 网关 401 `A0350`；`LoginUser` 缺 `sysUser`（脏缓存）→ `A0300` |
| 会话隔离 | 新令牌在 Redis 里是**独立的 key**（`{username}_{ACCESS_TOKEN}_<new-at>`），与浏览器会话那一对互不影响 |

`TokenUtil.createToken` 会把 token 回写到传入的 `LoginUser` 实例上，而
`tokenUtil.getLoginUser()` 返回的是**请求上下文里的对象**。因此 Service 层显式
`new LoginUser(...)` 复制身份字段后再签发，避免污染当前会话对象。这条边界有专门的单测
（`LoginServiceImplCliTokenTest#doesNotReuseSessionInstance`）。

### BFF（`apps/web/src/app/api/auth/cli-token/route.ts`）

| 项 | 值 |
|---|---|
| 路径 | `POST /api/auth/cli-token` |
| 入参 | `{ codeChallenge, port, state }`，均为 base64url / 数字，严格校验 |
| 校验 | `checkOrigin`（同源）→ `loadSessionProfile`（会话 Cookie，必要时刷新）→ 后端 `POST /cli/token` |
| 出参 | `{ code, state, redirectTo }`，**响应体里绝不含 Token** |
| 未登录 | 401 `A0311`，前端据此跳登录页 |

### Web 页面

| 项 | 值 |
|---|---|
| 路由 | `app/(auth)/cli/authorize/page.tsx`（RSC 外壳 + 客户端组件） |
| 参数 | `port`（回环端口）、`state`、`challenge`（PKCE S256） |
| 未登录 | 引导到 `/login?next=<授权页完整地址>`，登录后回到本页继续 |
| 已登录 | 展示当前账号（昵称 + 用户名）+ 「授权 CLI 登录」按钮 + 「取消」 |
| 成功后 | 浏览器导航到 `http://127.0.0.1:<port>/callback?code=&state=`（回环，`no-store`） |

`/cli/authorize` **必须排除在 middleware 的登录保护之外**——否则未登录用户会被
不带 `next` 地重定向到 `/login`，登录后回不到授权页，整个流程断掉。

### CLI

| 项 | 值 |
|---|---|
| 默认 | `anynote auth login` → 起回环 + 开浏览器 + 等回调 |
| 备用 | `--password-stdin` / `--password` → 原口令路径，完全不变 |
| 新环境变量 | `ANYNOTE_WEB_URL`（默认 `http://localhost:3000`） |
| 超时 | 回环等待默认 300s，`--timeout <秒>` 可调 |
| 无浏览器环境 | `--no-browser` 只打印授权链接（手动复制），或直接用 `--password-stdin` |

## 安全边界（本提案的核心约束）

1. **回环只绑 `127.0.0.1`**，不绑 `0.0.0.0`，端口由内核分配（`:0`）——避免暴露到局域网。
2. **state 必校验**：不匹配的回调直接拒绝，回调永不"先信再说"。
3. **PKCE S256**：verifier 只存在于 CLI 进程内，code 单独泄露换不到 Token。
4. **code 一次性 + 60 秒过期 + 内存存储**：BFF 侧用 Map 存，取用即删。
5. **授权需用户手势**：页面必须点按钮，`GET` 或自动跳转都不触发签发。
6. **BFF 出参不含 Token**：Token 由 CLI 用 code+verifier 从后端直接换，绕过浏览器。
7. **`ANYNOTE_WEB_URL` 只影响跳转地址**，不参与任何鉴权判定。

## 验证

- 后端：`LoginServiceImplCliTokenTest`（5 条）——签发、身份字段复制、不污染会话对象、
  无登录用户与脏缓存两条拒绝路径。
- Web 单测：`lib/auth/cli-authorize` 纯函数（端口范围、state/challenge 字符集、回环 URL 构造）、
  BFF route（Origin / Cookie / 上游失败 / 响应不含 Token）、页面组件交互（已登录授权、
  未登录引导、参数非法）。
- CLI 单测：`auth/loopback.ts`（成功回调、state 不匹配、超时、端口占用、一次性）、
  `auth/pkce.ts`（challenge 可被标准 S256 复算）、`auth login` 浏览器路径与回退。
- 端到端（真实 docker 栈）：`apps/cli/e2e/cli.live.test.ts` 走完整闭环；
  `apps/web/e2e/cli-authorize.spec.ts` 覆盖页面在已登录/未登录两种状态下的行为。

## 需要同步的文档

- `docs/cli/CLI_PLAN.md`（登录一节）、`docs/cli/CLI_MILESTONES.md`（M9.6）、
  `apps/cli/README.md`（登录方式与环境变量）。
- `.claude/skills/anynote-cli/SKILL.md`：agent 应改用 `--password-stdin`（无浏览器），
  并说明交互式人用默认浏览器路径。
- `README.md` 环境变量表补 `ANYNOTE_WEB_URL`。
- 生成物：`docs/cli/COMMANDS.md`、`.claude/skills/anynote-cli/reference/commands.md`、
  `apps/cli/src/bundled.ts`。
- 变更清单：`docs/changelist/2026-09-13-cli-browser-login.md`。
