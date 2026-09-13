# CLI 地址配置与网关自检修复（M9.7）

## 背景

用户执行 `anynote config set api-url https://notes.example.com` 后运行 `anynote auth login`，
浏览器打开的是 `http://localhost:3000/cli/authorize...`——不是他配置的域名。

排查后确认是**两个独立问题叠加**：

1. **授权页地址不可配**：CLI 的 `webUrl`（授权面）与 `apiUrl`（数据面）是两个独立地址，
   而 `config set` 只认 `api-url`（`z.enum(["api-url"])` 写死），`webUrl` 只读
   `ANYNOTE_WEB_URL` 环境变量、**不落盘**，因此永远回落默认 `localhost:3000`。
2. **该域名不是网关**：`notes.example.com` 是 Next 前端，`/api/*` 归 BFF；而 CLI 直连 Gateway
   打 `/api/<domain>/*`。实测该域 `/api/system/user/mine` 返回 **404 HTML**，
   `POST /api/auth/cli-exchange` 返回 401 业务 JSON，且 8080/3000/1234 公网均不可达
   ——**生产没有给 CLI 用的网关入口**。

排查过程中另外发现两个会掩盖真实故障的缺陷（下方单列）。契约与决策见
[`docs/cli/CLI_MILESTONES.md`](../cli/CLI_MILESTONES.md) 的 M9.7。

## 概览

| 项 | 数值 |
|---|---|
| 修改文件 | 29 |
| 新增文件 | 3（`apps/cli/src/core/health.ts`、`apps/cli/src/__tests__/health.test.ts`、本清单） |
| 删除文件 | 1（`infra/nginx/snippets/sse-common.conf`） |
| 增删行数 | +700 / −93（已跟踪文件，`git diff --shortstat`） |
| 单测 | 272 → **299** 通过 / 19 → 20 文件 |

按目录分布：`apps/cli/src`（9 个源文件 + 5 个测试）、`infra`（3 个部署文件）、
`docs`（5 个文档）、生成物 3 个。

### 验证结果

| 命令 | 结果 |
|------|------|
| `pnpm --filter @anynote/cli test` | **299 通过 / 20 文件**（新增 `health.test.ts` 9 条） |
| `pnpm --filter @anynote/cli lint` | 通过（`biome check`，56 文件） |
| `pnpm --filter @anynote/cli typecheck` | 通过 |
| `pnpm --filter @anynote/cli build` + `manifest:write` | 生成物稳定，重跑无新增 diff |
| `docker compose -f infra/docker-compose.yaml -f infra/docker-compose.prod.yaml config` | gateway 发布 `127.0.0.1:8080`；auth/system/note/file/ai/manage/notify/job 与全部中间件 `(无)` |
| 同上，覆盖 `GATEWAY_BIND_IP=0.0.0.0`（跨主机 Nginx 场景） | gateway 变为 `0.0.0.0:8080`，证明绑定地址确实可配 |
| `docker compose -f infra/docker-compose.yaml -f infra/docker-compose.dev.yaml config` | dev 仍 `127.0.0.1:8080`、`restart: no`，未被本次改动破坏 |
| 真实域名复验（`doctor` 指向 `notes.example.com`） | 由误报 `UP` 变为 `HTTP 307 → /login（被重定向，这个地址不是网关）` |
| 真实域名复验（`config set` 两个键） | `settings.json` 写入 `apiUrl` + `webUrl`；`auth login` 生成的授权地址为 `https://notes.example.com/cli/authorize?...` |
| nginx 结构静态校验 | 花括号平衡、6 个 server 块、无重复 `listen+server_name`；全文件零 `include`，10 个 location 各恰好 0/1 条 `proxy_pass` |
| **`nginx -t`（真实执行，nginx 1.31.5）** | `syntax is ok` + `test is successful` |
| 反证：故意重复 `proxy_pass` | `"proxy_pass" directive is duplicate` —— 验证了「自带上游的片段无法服务第二个上游」这一论断 |
| `proxy_set_header` 继承审计 | 9 个 location 0 条（继承 server 级整组）、`/collab/` 6 条（整组重写）；无部分覆盖 |
| nginx 中重复 `proxy_pass` 的判据 | 核对 nginx 1.27.0 源码 `ngx_http_proxy_pass()`：`if (plcf->upstream.upstream \|\| plcf->proxy_lengths) return "is duplicate";`，确认该指令在 location 层只能出现一次 |

> **验证方式**：`nginx -t` 需要 `events{} + http{}` 外层与真实证书，而 `YOUR_DOMAIN`、`/path/to/cert`、
> `/var/log/nginx/...` 都是占位符。校验时把它们替换到一个**临时 prefix**（含自签证书与 temp 目录）后执行，
> **仓库文件未做任何为测试而设的改动**。用户本机 `C:\Users\YXLMz\software\nginx-1.31.5` 为只读安装，
> 未被写入（其 `conf/nginx.conf` 时间戳与内容均未变）。
>
> **仍未验证**：真实 `api.` 子域端到端（需部署侧 DNS 与证书）；`infra/tests/proxy-smoke.sh` 全链路
> （需 Docker daemon + 生产前端镜像）。

## 修复项一：`webUrl` 可持久化（`apps/cli`）

把"两个地址各自独立解析"这件事落到数据模型上：设置文件加一项，`CliEnv` 加一个来源字段，
`config` 四个命令共用一张 key 表。

| 文件 | 状态 | 作用与原因 |
|------|------|-----------|
| `apps/cli/src/core/settings.ts` | 修改（+13/−1） | `Settings` 与 zod schema 增加 `webUrl`；`read()` 两项各自可选地回填，`write()` 两项各自可选地落盘。新增"确认一整份文件校验失败即当没设过"的边界 |
| `apps/cli/src/core/env.ts` | 修改（+24/−3） | 抽出 `resolveWebUrl()`，与既有 `resolveApiUrl()` **同构**：`ANYNOTE_WEB_URL` > 文件 > 默认；`CliEnv` 增 `webUrlSource`。原实现注释写着"Web 前端地址只有环境变量一个来源"——正是本 bug 的根因，已改 |
| `apps/cli/src/commands/meta.ts` | 修改（+61/−27） | 新增 `SETTING_KEYS` 表把 `api-url`/`web-url` ↔ `Settings` 字段 ↔ 默认值集中一处（原先 `z.enum(["api-url"])` 在 set/get/unset 三处硬编码，加一项要改三遍）；`config set` 的"空串"分支改为只清**目标键**（原先 `write({})` 会把另一项一起抹掉）；`config get` / `config path` 分开报告两个来源；`doctor` 输出 `webUrl` / `webUrlSource` |
| `apps/cli/src/core/context.ts` | 修改（+1/−2） | 仅 `biome format` 调整换行（**非本次逻辑改动**，HEAD 上该文件已不符合格式规范） |

## 修复项二：`doctor` 网关探针假阳性（新增模块）

旧实现只有 `response.ok ? "UP" : ...` 一行。fetch **默认跟随重定向**，于是前端的
`/actuator/health → 307 → /login → 200 HTML` 被判为 `UP`——自检工具给出与事实相反的结论。
同一个配置我先后得到 `unreachable: timeout` 与 `UP` 两种结果，证明它既不可靠也不诚实。

| 文件 | 状态 | 作用与原因 |
|------|------|-----------|
| `apps/cli/src/core/health.ts` | **新增（52 行）** | `probeGateway()`：三重设防——`redirect: "manual"`（不跟随）、校验 JSON content-type（挡掉 HTML 登录页）、要求 body 有 `status` 字段。3xx 时回显 `Location` 并直说"这个地址不是网关"；连不上统一 `unreachable: ` 前缀。成功仍返回 `"UP"`，保持既有对外契约与 e2e 断言 |
| `apps/cli/src/__tests__/health.test.ts` | **新增（98 行）** | 9 条：正常 UP、末尾斜杠拼接、断言 `redirect: manual`、307 不报 UP 且带 Location、200 HTML 不报 UP、JSON 缺 `status`、非 2xx、连不上前缀、503 不透传为 UP |

## 修复项三：`auth login` 假成功（`apps/cli`）

数据面完全不可达时，旧实现仍打印"已通过浏览器授权登录"并落盘凭据——用户以为成功了，
下一条命令才炸。`resolveUsername` 吞掉所有异常返回 `null`，正好把真正的问题盖住。

| 文件 | 状态 | 作用与原因 |
|------|------|-----------|
| `apps/cli/src/commands/auth.ts` | 修改（+28/−5） | `resolveUsername` → `resolveIdentity`，保留"探测失败不让已到手的登录作废"的语义，但**调用方必须把这件事告诉用户**：不通时 stderr 打警告并指向 `anynote config get`；结果新增 `verified: boolean` 让 agent 不必解析 stderr；输出补 `webUrl` 便于定位是哪一侧配错 |
| `apps/cli/src/__tests__/browser-login.test.ts` | 修改（+40/−0） | 3 条新增：不通时必须警告且 `verified=false`、通时 `verified=true` 且无警告、探测失败不毁掉已有凭据 |

## 修复项四：`manifest` markdown 枚举竖线撑破表格（HEAD 既有缺陷）

类型列由 `enumValues.join(" | ")` 生成，而 Markdown 表格以 `|` 分列，
`| api-url | web-url |` 多出一个单元格导致**整张表错位**。真实注册表里的
`manifest --format`（`json | markdown`）**在 HEAD 上就已损坏**，本次 `config set --key`
又新增两处，故一并修复。

| 文件 | 状态 | 作用与原因 |
|------|------|-----------|
| `apps/cli/src/manifest/markdown.ts` | 修改（+20/−3） | 新增 `escapeCell()` 把 `\|` 转义后拼单元格，5 列全部过一遍（说明列是用户写的描述，同样可能含竖线） |
| `apps/cli/src/__tests__/manifest.test.ts` | 修改（+39） | 2 条：枚举参数行必须转义、且**真实注册表每一行**单元格数都正确（不只测构造样例） |

## 测试补充（`apps/cli/src/__tests__`）

先写复现用例再改代码：上述用例在实现前均**实际失败**（7 条 + 表格 2 条）。

| 文件 | 状态 | 作用与原因 |
|------|------|-----------|
| `apps/cli/src/__tests__/env.test.ts` | 修改（+34/−0） | 5 条：`webUrlSource` 缺省/覆盖、文件值生效、env 优先于文件、文件值非法回落、两个地址各自独立互不覆盖 |
| `apps/cli/src/__tests__/settings.test.ts` | 修改（+31/−0） | 4 条：两项共存、清一项不动另一项、`webUrl` 非法时整份作废、写盘结构与 `version` 保持 |
| `apps/cli/src/__tests__/skill-commands.test.ts` | 修改（+68/−0） | 7 条：`config set/unset web-url` 的成功与互不覆盖路径、空串只清一项、协议校验、`config get`/`path` 报告两个来源 |
| `apps/cli/src/__tests__/helpers.ts` | 修改（+2/−0） | 测试上下文补 `webUrlSource`，跟随 `CliEnv` 类型的变化 |
| `apps/cli/e2e/browser-login.live.test.ts` | 修改（+12/−4） | 仅 `biome format` 调整换行（**非本次逻辑改动**） |
| `apps/cli/src/__tests__/install-mode.test.ts` | 修改（+8/−2） | 仅 `biome format` 调整换行（**非本次逻辑改动**） |

## 基础设施（`infra`）

给 Gateway 开公网入口是本次用户拍板的方向（另一选项是改 CLI 走 BFF `/api/proxy/*`）。
`notes.example.com` 的 `/api/` 是 **BFF 的地盘**，而两者路径前缀重叠、上游不同
（`/api/auth/cli-exchange` 属 BFF、`/api/auth/login` 属 Gateway），无法用同一 server 块按路径区分，
只能用独立 `server_name`。

| 文件 | 状态 | 作用与原因 |
|------|------|-----------|
| `infra/docker-compose.yaml` | 修改（+1/−1） | gateway 端口行改为 `${GATEWAY_BIND_IP:-127.0.0.1}:${GATEWAY_PORT:-8080}`，与 web/collab 的 `*_BIND_IP` 命名保持一致（跨主机 Nginx 时只改 `BIND_IP` 一处，不必手改 compose） |
| `infra/docker-compose.prod.yaml` | 修改（+6/−0） | `anynote-gateway` 保留宿主机入口，作为容器外 Nginx 的可反代上游。**默认只绑回环**，不等于暴露公网；其余 Java 服务与中间件继续 `ports: !reset []` |
| `infra/.env.example` | 修改（+5/−0） | 补 `GATEWAY_BIND_IP` / `GATEWAY_PORT`——README 变量表已列但生产模板漏了，照着模板建 `.env` 的人会缺这一项 |
| `infra/nginx/nginx.conf` | 修改（+122/−1） | 新增 `api.YOUR_DOMAIN` 的 80/443 server 块：`/api/` 转 gateway、`/actuator/health` 放通供 `doctor` 探测、`/actuator/` 其余与 Springdoc 一律 404、兜底 `/` 返回 404；新增 `anynote_gateway` upstream。**两处 `/api/` 的 SSE 指令改为就地写全**，并在两个 location 里刻意不写 `proxy_set_header` 以完整继承 server 级转发头（文件头补了继承规则说明：一旦写了任意一条，整组都会被覆盖） |
| `infra/nginx/snippets/sse-common.conf` | **删除（−40）** | 该片段自带 `proxy_pass http://anynote_frontend`，而本站点有**两个不同的 `/api/` 上游**（站点域→BFF、api 域→Gateway）；`proxy_pass` 每个 location 只允许出现一次，片段写死上游后第二处必然 `nginx -t` 失败。曾试过「片段不带 proxy_pass、由调用方指定」，但那会让两份文件必须同时更新（旧 conf + 新片段 = `/api/` 无上游、**静默 404** 而非报错）。用户裁定：配置改为**自包含单文件**，入口变简单比复用几行更重要 |
| `infra/tests/proxy-smoke.sh` | 修改（+2/−2） | 去掉挂载已删除的 `infra/nginx/snippets` 目录的两处 `-v`。**注意该脚本会在容器里跑 `nginx -t`**——即本仓库既有的 nginx 配置校验入口，本次改动后可继续用它验证 |

## 文档

| 文件 | 状态 | 作用与原因 |
|------|------|-----------|
| `CLAUDE.md` | 修改（+4/−3） | **两条既有约束会与新配置直接冲突，必须同步**：①「新前端外部路由」原文说"不能沿用旧模板把 `/api/` 直连 Gateway"，现在 `api.YOUR_DOMAIN` 正是有意的例外，已标注；② prod 启动约束原文说"只给容器外 Nginx 发布 web:3000 / collab:1234"，现补 gateway:8080。另新增「CLI 直连 Gateway」约束条并更新 `docs/cli/` 导航指针（原指向 M9.5） |
| `.claude/skills/anynote-cli/SKILL.md` | 修改（+22/−6） | agent 面向的 skill **源文**：新增「易错点 6」讲清两个地址配混的症状与 `doctor` / `verified` 两个诊断信号；环境变量表补 `ANYNOTE_OPEN_BROWSER` 与两项优先级；`doctor` 一节区分"网关没起"与"地址不是网关"两种失败 |
| `README.md` | 修改（+24/−6） | CLI 小节说明两个地址需分别配；C.4 表格补 `api.` 子域一行并解释为何不能用站点域、配置命令示例；生产变量表把 `GATEWAY_BIND_IP` / `GATEWAY_PORT` 并入 web/collab 那两行；C.4 跨主机段改用 `GATEWAY_BIND_IP` 表述；Java 端口表加注"仅 dev 生效，gateway 是生产唯一例外"（原表未说明，容易被误读成生产也开这些端口） |
| `apps/cli/README.md` | 修改（+21/−4） | 环境变量表补 **`ANYNOTE_OPEN_BROWSER`**（上一批 changelist 声称补过，实际漏了）与 `ANYNOTE_WEB_URL` 的优先级；登录一节写明两个地址独立、配错的症状与 `doctor` 的作用；持久化一节补两项各自的优先级链 |
| `docs/cli/CLI_PLAN.md` | 修改（+15/−3） | §2.1 补生产部署对 Gateway 公网入口的要求；环境变量表补两项与"必须分开配"的说明；命令表更新 `doctor` / `config` 四个命令的描述 |
| `docs/cli/CLI_MILESTONES.md` | 修改（+54/−0） | 新增 **M9.7** 小节：根因表、修复项、用户拍板、验证表与"未验证"声明 |
| `docs/deployment-network.md` | 修改（+7/−1） | 生产拓扑图加 CLI 直连链路与 `gwPort`；补 `api.` 子域的存在理由与安全边界；"生产只发布 web/collab"改为含 gateway 的三个回环入口 |

## 生成物

由 `pnpm --filter @anynote/cli build` → `manifest:write` 产出，CI 的 `cli` job 卡 diff。
**评审请看源头**（`src/commands/**`、`src/manifest/markdown.ts`），不要看产物。

| 文件 | 状态 | 作用与原因 |
|------|------|-----------|
| `docs/cli/COMMANDS.md` | 修改（+12/−8） | 由命令注册表重新生成：`config set/unset` 的 key 描述与示例、`config get` 说明 |
| `.claude/skills/anynote-cli/reference/commands.md` | 修改（+12/−8） | 同上，随 skill 分发；**它同时又是 `bundled.ts` 的输入**，所以必须先写 commands.md 再重建快照 |
| `apps/cli/src/bundled.ts` | 修改（+2/−2） | skill 快照（含上面 SKILL.md 的改动），由 `build` / `manifest:write` 生成 |
## 审计要点

1. **两个地址的优先级链必须对称**（`core/env.ts`）。`resolveWebUrl` 是照 `resolveApiUrl`
   写的，两者都走"env > 文件 > 默认"且各自报 `source`；改一个记得改另一个。
2. **`config set` 的空串分支语义变了**（`commands/meta.ts`）：从"清空整个设置文件"改成
   "只清目标键"。这是行为变更，改动前后都只动一项的场景表现相同，但两项共存时旧行为会误删。
3. **`SETTING_KEYS` 是加设置项的唯一入口**。`exactOptionalPropertyTypes` 下不能给可选字段赋
   `undefined`、biome 又禁 `delete`，所以清项用解构丢弃 + `as Settings` 断言——这处断言是
   因为 key 是动态的，值得重点看。
4. **配置改为自包含单文件，`snippets/` 目录已删**：`infra/nginx/nginx.conf` 现在**零 `include`**——
   拷贝部署从"两个落点、必须同时更新"退回"一个文件"。若将来又想抽取片段，先读文件头那段
   注释：`proxy_pass` 在 location 层只能出现一次，任何自带上游的片段都无法服务第二个上游。
   另外注意 `proxy_set_header` 的**整组覆盖**语义：两个 `/api/` location 刻意一条都不写，
   以继承 server 级的 5 条转发头；在那里加任意一条都会让其余 4 条静默失效。
5. **`api.` 子域只做转发，鉴权仍靠网关 `AuthFilter`**：`/actuator/health` 被显式放通且
   **不满足 Bearer 校验**，所以必须与其他 actuator 端点分开处理（其余 404）；Springdoc 路径
   也一并挡住，避免生产配置漂移导致文档暴露。
6. **`verified` 字段是对 agent 的契约**：`auth login` 的 JSON 输出新增 `verified: boolean`，
   让自动化不必解析 stderr。语义是"数据面是否已通"，不改退出码——登录本身确实成功了。
