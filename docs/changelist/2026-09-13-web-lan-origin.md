# 2026-09-13 前端容器允许域切到内网 192.168.3.90:3000

## 概览

把前端容器的「允许域」（Origin 校验用的自身来源 + 协同服务握手来源）从默认的
`http://localhost:3000` / `ws://localhost:1234` 改为内网入口 `http://192.168.3.90:3000`。

| 项 | 值 |
|---|---|
| 修改文件数 | 2（`infra/docker-compose.yaml`、`README.md`） |
| 新增 / 删除文件 | 0 |
| 增删行数 | 22 insertions / 11 deletions |
| 代码改动 | 无（纯配置与文档） |
| 验证方式 | 真实 Docker 栈 + 从零重建镜像 + 容器外 Nginx + Playwright 全量 E2E |

改动前运行态与仓库默认值**已经不一致**：容器里跑的是 `192.168.3.90:3000`（上一次
`up` 时通过 shell 环境变量注入），而 `docker-compose.yaml` 的默认值仍是 `localhost`。
只要有人按 README 原样重跑一次 `up`，前端就会退回 `localhost` 并连带 collab 拒握手。
本次把默认值对齐到内网入口，消除这个漂移。

## 基础设施

| 文件 | 状态 | 作用与原因 |
|------|------|------|
| `infra/docker-compose.yaml` | 修改 | `anynote-web` 的构建参数与运行时 `NEXT_PUBLIC_APP_URL` / `NEXT_PUBLIC_COLLAB_WS_URL` 默认值改为 `http://192.168.3.90:3000` 与 `ws://192.168.3.90:3000/collab`。前者被 Next 在构建时内联、运行时又用于 BFF 的 `checkOrigin`，两者必须同时改否则容器启动即报「与镜像不一致，请重新构建」；后者从直连 `:1234` 改为走 Nginx 的 `/collab` 反代路径，与容器外 Nginx 的实际拓扑一致。`anynote-collab` 的 `COLLAB_ALLOWED_ORIGINS` 默认值同步成 `http://192.168.3.90:3000`——协同服务的 `isOriginAllowed` 是精确匹配，不同步则所有浏览器握手 403。生产覆盖文件 `docker-compose.prod.yaml` 仍用 `${NEXT_PUBLIC_APP_URL:?...}` 强制显式传值，不受本次默认值影响。 |

## 文档

| 文件 | 状态 | 作用与原因 |
|------|------|------|
| `README.md` | 修改 | 「应用运行配置」与新前端 env 两张表的默认值同步为内网地址，并给 `COLLAB_ALLOWED_ORIGINS` 补一行（原先只在 compose 里出现，表里查不到）。场景 A 的访问地址改为 `http://192.168.3.90:3000/login`，并补两条须知：改地址必须重新构建镜像、明文 HTTP 内网 IP 不是 secure context。「端到端与性能门禁」的协同用例注意事项改为可复制的覆盖命令——镜像默认已是 LAN 地址，要跑协同/图片/PDF 用例得显式切回 `localhost`。 |

## 审计要点

1. **`NEXT_PUBLIC_*` 是构建参数，不是运行时配置**。`infra/web/config.mjs` 的
   `validateContainerConfig` 会逐字比对构建值与运行值，只改一处会让容器直接
   `exit 1`。本次两处同改，并已用 `config.mjs` 的单测（6/6 通过）与真实容器验证。
2. **`COLLAB_ALLOWED_ORIGINS` 是精确匹配不是前缀匹配**（`apps/collab/src/auth.ts`
   的 `allowedOrigins.includes(origin)`）。端口或协议写错一位就是 403，且报错只
   出现在浏览器控制台。
3. **默认值带内网 IP 的副作用**：`docker-compose.yaml` 现在默认绑定 `192.168.3.90`。
   换网络环境（换网段、别人克隆仓库）必须显式覆盖三个变量，否则 Origin 校验会
   把访问者挡在外面。生产走 `docker-compose.prod.yaml`，不受影响。
4. **本次没有改 Nginx**。`C:\Users\YXLMz\software\nginx-1.31.5\conf\conf.d\anynote-local.conf`
   已经是 `listen 192.168.3.90:3000` + 回源 `127.0.0.1:3000` 的正确结构，`nginx -t`
   通过并已 `reload`。仓库内的 `infra/nginx/nginx.conf` 是 HTTPS 生产模板
   （`YOUR_DOMAIN` 占位），与本机内网部署无关，未改动。
5. **明文 HTTP 内网 IP 不是 secure context**——这是本次验证暴露的真实限制，不是
   本次改动引入的。`http://192.168.3.90:3000` 下 `crypto.subtle` 与
   `crypto.randomUUID` 均为 `undefined`，导致协同建文档、笔记图片上传、Chat PDF
   上传三条链路必然失败；`http://localhost:3000` 与 `http://127.0.0.1:3000` 则正常。
   已验证的应对方式：以 localhost 访问，或给 Nginx 配证书走 HTTPS。

## 验证结果

| 命令 | 结果 |
|------|------|
| `docker compose --env-file=<empty> -f docker-compose.yaml -f docker-compose.dev.yaml config` | 渲染出 `http://192.168.3.90:3000` / `ws://192.168.3.90:3000/collab` / `COLLAB_ALLOWED_ORIGINS=http://192.168.3.90:3000`，与运行中容器 `docker inspect` 完全一致 |
| `docker compose ... -f docker-compose.prod.yaml config` | 生产仍强制取 `.env` 的 `https://notes.example.com`，默认值改动不泄漏到生产 |
| `node --test`（`infra/web`） | 6/6 通过 |
| `nginx -t` + `nginx -s reload` | 配置语法 ok、重载成功；`192.168.3.90:3000` 与 `127.0.0.1:3000` 均返回 200 |
| 注册 → 登录 → `/api/auth/me` | 全链路 `00000`，`at`/`rt` httpOnly Cookie 正常下发 |
| 伪造 Origin 打 `/api/auth/login` | HTTP 403（`checkOrigin` 生效） |
| `POST /api/auth/collab-token` | `00000`，`expiresIn=300` |
| WebSocket 握手（经 Nginx `/collab/`） | 正确 Origin + 合法令牌 → Open；错误 Origin → **403**；伪造令牌 → **401** |
| `docker compose ... build --no-cache anynote-web` | 从零构建成功（Next 构建 108s，无缓存命中），镜像内 `web-build-config.json` = `{"NEXT_PUBLIC_APP_URL":"http://192.168.3.90:3000","NEXT_PUBLIC_COLLAB_WS_URL":"ws://192.168.3.90:3000/collab"}` |
| `docker compose ... up -d --no-build anynote-web`（**不注入任何 shell 环境变量**） | 容器用新镜像重建后 `healthy`；容器启动即通过 `config.mjs` 的构建值/运行值一致性校验（不一致会 `exit 1`） |
| 新镜像下的端到端复验 | 页面 200（`server: nginx/1.31.5`）／匿名 `/me` 401／伪造 Origin 403／注册+登录+`/me` 全 `00000`／协同 WS 正确 Origin Open、错误 Origin 403 |
| `E2E_BASE_URL=http://192.168.3.90:3000 pnpm --filter web test:e2e`（重建后复跑） | **45 passed / 5 failed / 3 did not run**，与重建前逐条一致 |
| `E2E_BASE_URL=http://localhost:3000` 跑同批失败用例 | global-setup 即 403「请求来源不受信任」——反证镜像已正确绑定 LAN 来源 |

> 首次尝试构建时 Docker Hub 的 BuildKit 前端镜像解析走 IPv6 超时（`dial tcp [2a03:...]:443`），
> 属当时本机网络问题；网络恢复后重跑，含 `--no-cache` 全量构建均成功。

### 5 条 E2E 失败的归因（均非本次改动引入）

| 用例 | 浏览器实测报错 | 结论 |
|------|----------------|------|
| `collab.spec.ts` 新建协同文档 | `TypeError: crypto.randomUUID is not a function` | 非 secure context |
| `notes-image-upload.spec.ts` ×2 | `TypeError: Cannot read properties of undefined (reading 'digest')` | `crypto.subtle` 缺失，非 secure context |
| `pdf-upload.spec.ts` 选中 PDF 后上传 | 未发出 `/docs/pdfs` 请求，卡在 `crypto.randomUUID()` 之前 | 非 secure context |
| `mobile-core.spec.ts` 输入自动保存 | 断言收到 `about:blank`；单独跑时提示「上一条用例未能创建笔记」 | 移动端返回键 `router.back()` 在无站内历史时退到空白页，与 Origin 无关 |

三条 secure-context 用例的根因用探针固定下来：同一浏览器下
`http://192.168.3.90:3000` → `isSecureContext:false, subtle:undefined, randomUUID:undefined`；
`http://localhost:3000` → `isSecureContext:true, subtle:object, randomUUID:function`。
