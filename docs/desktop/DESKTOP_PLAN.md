# Anynote 桌面客户端技术方案（精简版）

> 文档版本：v0.1（草案）| 创建日期：2026-10-01 | 状态：**待拍板，未开工**
> 关联文档：[README.md](./README.md)（摘要与待拍板决策）· [GIT_MODULE_PLAN.md](./GIT_MODULE_PLAN.md)（知识库 Git 仓库模块）·
> [DESKTOP_MILESTONES.md](./DESKTOP_MILESTONES.md)（执行计划）· [`docs/cli/CLI_PLAN.md`](../cli/CLI_PLAN.md)（直连网关与浏览器授权）·
> [`docs/refactor/FRONTEND_MILESTONES.md`](../refactor/FRONTEND_MILESTONES.md) M8.2（被本方案取代的 Tauri 骨架）
>
> 本文所有「现状」都在 2026-10-01 对照代码核对过，出处写到 `文件:行`。改方案前先确认这些事实是否仍然成立。
> 本文假设 D1 选 Electron；选 Tauri 时分层不变，差异见 §4.1。

---

## 1. 目标与非目标

### 1.1 目标

1. 重做 `apps/desktop`：界面打包在安装包里、本地功能可离线使用的桌面客户端，不再是远端网页的外壳。
2. 功能只保留两条主线：
   - **云端知识库**：知识库的列表、新建、改名、删除；笔记的新建、编辑、自动保存、改名、移动、删除。
   - **本地 Markdown**：打开本机文件夹或 Git 仓库，像 Typora 一样所见即所得地编辑 `.md` 文件，并完成提交、拉取、推送。
3. 知识库新增「Git 仓库」模块，把知识库和一个 Git 仓库绑定并同步（见 [GIT_MODULE_PLAN.md](./GIT_MODULE_PLAN.md)）。
4. 编辑器继续基于 TipTap，并且**保存时不改动用户没碰过的内容**：打开即保存逐字节不变，改一处只差一处。
5. 服从仓库既有约束：contract-first、改动必带单测、中文 commit、Token 不进页面 JS。

### 1.2 非目标

| 不做 | 原因 |
|------|------|
| 协同编辑（`apps/collab`、Yjs） | 用户明确不要；桌面端只走单人保存 |
| AI 对话、PDF 问答、工作流 | 同上；AI 流式仍受 M7.6 后端缺口阻塞 |
| 慕课、任务、资料（PDF）、成员管理、知识库分组 | 同上；需要时在网页端操作 |
| 云端笔记的历史版本页 | 不在保留范围；本地仓库的历史由 Git 提供 |
| 离线编辑云端知识库 | 需要本地数据层 + 同步协议，是架构级改动；离线需求由「本地仓库 / Git 知识库」承担 |
| 移动端、平板 | 本方案只针对桌面 |
| 替代 `apps/web` | 桌面端是补充前端，**不进入** `web-legacy` 的删除条件 |
| 服务端执行 git | 凭据托管、出网与 SSRF、长任务都不该进 note 服务（[GIT_MODULE_PLAN §2](./GIT_MODULE_PLAN.md#2-核心决策git-在桌面端跑服务端只记账)）|

### 1.3 名词

| 名词 | 含义 |
|------|------|
| 云端知识库 | 服务端的知识库与笔记（`n_knowledge_base` / `n_note`），在线读写 |
| 本地仓库 | 本机任意文件夹；含 `.git` 时额外启用 Git 功能 |
| Git 知识库 | 绑定了 Git 仓库的云端知识库。本机有克隆时，以本地仓库的形态编辑（D4） |
| 主进程 / 渲染进程 | Electron 的 Node 进程（持有凭据、文件、git）与界面进程（沙箱，没有网络和文件权限） |

---

## 2. 既有事实盘点（均已核对）

### 2.1 现有 `apps/desktop` 只是远端网页的外壳

- `apps/desktop/src-tauri/src/lib.rs:37` 用 `WebviewUrl::External` 打开远端 Next 应用（默认 `http://localhost:3000`，`:5`），
  并在页面加载前注入 exchangeKey（`:41`）。
- 这份 Rust 代码**从未编译过**：本机没有 rustc / cargo / MSVC（`apps/desktop/README.md`），M8.2 的构建验证一直后置。
- 配套的令牌交换：`apps/web/src/lib/desktop/bridge.ts:45`、`:62`、`:74` 的 `exchangeDesktopSession` / `storeDesktopSession` /
  `readDesktopSession` **除测试外没有任何调用方**，BFF 端点 `apps/web/src/app/api/auth/exchange/route.ts` 也就没有真实使用者。

→ 现有骨架沉没成本约等于零，新客户端原地重做，旧链路一起退役（§8）。

### 2.2 直连网关与浏览器授权已有现成实现

- CLI 用 Bearer 直连网关（[CLI_PLAN §2.1](../cli/CLI_PLAN.md#21-gateway-路由与认证)），生产已有 `api.YOUR_DOMAIN` 入口（`infra/nginx/nginx.conf`）。
- CLI 的浏览器授权登录：回环 `127.0.0.1` + 一次性授权码 + PKCE
  （[`.claude/openspec/changes/2026-09-13-cli-browser-login.md`](../../.claude/openspec/changes/2026-09-13-cli-browser-login.md)）。
  授权页是 `apps/web/src/app/(auth)/cli/authorize/page.tsx`（标题写死「授权 CLI 登录」，`:9`），
  换码走 BFF 的 `/api/auth/cli-exchange`（`apps/cli/src/auth/browser-login.ts:100`）。
- 这套逻辑在 `apps/cli/src/auth/` 共 704 行。其中 `pkce.ts`、`loopback.ts`、`browser-login.ts` 与 CLI 本身无关，可以抽包复用；
  `store.ts`、`lock.ts` 是 CLI 的明文凭据文件和跨进程锁，桌面端用不上。

→ 桌面端是 RFC 8252 定义的「原生应用」，正是这套流程的目标场景。**直接复用，不新造登录协议。**

### 2.3 笔记模型

| 事实 | 出处 | 对方案的影响 |
|------|------|------|
| 笔记在知识库内**平铺**，没有目录层级 | `openapi/specs/note.json` 的 `NoteListVO`（没有 parentId） | 本地仓库的目录结构要靠 Git 模块的映射表保存 |
| 标题就是正文的首个 H1；打开缺 H1 的笔记会补一个 | `packages/editor-core/src/leading-heading.ts:22` | 任意 Markdown 文件不一定以 H1 开头：本地文件与 Git 知识库要关掉补 H1 |
| 新建时标题 3–15 字，编辑时标题 ≤ 80 字 | `NoteCreateDTO.java:20-21`、`NoteEditDTO.java:22-23` | 从文件名新建笔记会撞上 3–15 的限制（D9） |
| 正文列是 `TEXT`，上限 65,535 **字节**（中文约 2.1 万字） | `infra/sql/anynote.sql:675` | 超长文件进不了知识库，同步时要报告 |
| 版本号 = `update_time` 的毫秒值；带 version 的 PATCH 冲突返回 A0409 | `NoteSaveResultVO.version`、`apps/web/src/features/notes/use-save-note.ts:19` | 桌面端保存和同步都用乐观并发 |
| 笔记列表分页上限 100 | `NoteController` 的 `@Max(100)` | 同步时分页拉全量，或由 Git 模块的快照接口一次返回 |

### 2.4 笔记权限：只有创建者能读写

`NoteServiceImpl.java:191` 新建笔记时把权限写死为 `"70000"`；`getNotePermissions`（`:470-511`）按「所有者 / 库管理员 /
库编辑者 / 库外用户」取第 1–4 位，于是**只有创建者和系统管理员能读写**，同库其他成员连读都读不到。
全仓没有修改笔记权限的端点（已登记在 `docs/changelist/2026-09-21-notes-collab-coldstart-fixes.md:115`、
`docs/collab-persistence/COLLAB_PERSISTENCE_PLAN.md` 现状表第 17 条）。

→ Git 同步只能代表一个人，见 [GIT_MODULE_PLAN §9](./GIT_MODULE_PLAN.md#9-权限与安全) 与决策 D6。

### 2.5 图片

- 正文里存的是 `/api/proxy/file/objects/{fileId}/redirect`（`apps/web/src/lib/editor/upload.ts:80`），一个**站点相对**的 BFF 路径；
  网关侧的等价地址是 `/api/file/objects/{fileId}/redirect`，它 302 到新鲜的预签名 URL。
- 该端点带归属校验，**非本人上传的文件返回 A0301**（`services/file/.../FileController.java:156-160`）。
- 上传是五步分片直传：note `POST /notes/{noteId}/images/uploadTasks` → file `getOssSliceUploadSignatures` → 直传 MinIO →
  `markOssSliceUploadSignatures` → `composeOssSliceUploadObject`（`apps/web/src/lib/editor/upload.ts:6-10`）。

→ 桌面端渲染云端笔记里的图片要带 Bearer 去换地址（§6.5）；Git 同步下载图片只对同步者本人上传的图有效。

### 2.6 编辑器：保存会整篇重排

2026-10-01 用 `packages/editor-core` 的实际配置实测 19 种常见写法，打开后直接保存有 15 种被改写：
`*` 列表变 `-`、`__粗__` 变 `**粗**`、Setext 标题变 `#`、**手动折行的段落被拼成一行**、表格对齐丢失、引用式链接被展开；
其中 **front matter 变成分隔线加二级标题、HTML 被转义成 `&lt;…&gt;`、脚注被当成链接**——这三种是内容破坏。

同日验证了「按顶层块保留原文」的原型：不编辑直接保存逐字节一致；只改一段只差那一段；撤销后又一致。

→ 本地文件编辑与 Git 同步都以编辑器保真为前置（M15.1）。Typora 实现的分析与取舍见 §6.9。

### 2.7 编辑器界面与 Next 耦合很浅

`apps/web/src/components/editor/**` 对应用代码的依赖只有：`@/lib/utils` 的 `cn`、`@/lib/editor/katex`、`@/lib/editor/shiki`、
`@/components/ui/sheet`（仅移动端工具条）、`TiptapEditor.tsx` 里的 `next/dynamic`。图片上传以 `UploadFn` 注入。

→ 可以整体抽成 `packages/editor-ui`，web 和桌面共用（M15.2）。

### 2.8 工程基线

- `pnpm-workspace.yaml` 逐个列出 apps，`apps/desktop` 已在其中；Node 22。
- 开发机已装 Git 2.55（Git for Windows），没有 Rust 工具链。

---

## 3. 架构总览

```
┌──────────────────────────── Anynote Desktop（Electron）────────────────────────────┐
│ 渲染进程（沙箱，无 Node）                                                            │
│   React 19 + TanStack Query + Tailwind                                              │
│   ├─ 云端知识库：知识库 / 笔记列表、编辑器（@anynote/editor-ui，单人保存）           │
│   ├─ 本地仓库：文件树、Typora 式编辑器、Git 面板                                    │
│   └─ Git 知识库：同步预览、冲突处理                                                  │
│   CSP connect-src 'none' —— 页面自己发不出任何网络请求                               │
│          │  window.anynote.*（preload 暴露的窄接口，每次调用都做 zod 校验）           │
├──────────┼──────────────────────────────────────────────────────────────────────────┤
│ 主进程（Node 22）                                                                    │
│   auth/       浏览器授权登录（@anynote/native-auth）、Token 加密存储、单飞刷新         │
│   api/        网关代理：路径白名单 + Bearer + 401 后刷新重试                          │
│   protocol/   app://（界面资源）、anynote-asset://（云端图片 / 本地图片）            │
│   workspace/  本地仓库注册表、工作区信任、路径守卫、原子写、文件监听                  │
│   git/        调系统 git（execFile，不经 shell）、porcelain 解析                      │
│   sync/       Git 知识库同步引擎（规划器是纯函数）                                    │
└──────┬─────────────────────────┬──────────────────────────┬────────────────────────┘
       │ HTTPS + Bearer           │ fs                        │ child_process
       ▼                          ▼                           ▼
 Gateway（api.YOUR_DOMAIN）   本机文件夹 / 仓库            系统 git ──► 远程仓库（GitHub / GitLab / 自建）

 只在登录时：系统浏览器打开 <webUrl>/cli/authorize?client=desktop
```

三条原则：

1. **Token 只在主进程。** 渲染进程没有网络（CSP `connect-src 'none'`），所有请求经主进程代理。
   这与 DeepSeek Harness 桌面端「壳持有凭据、页面只拿窄接口」的做法一致。
2. **渲染进程不直接碰文件和 git。** 文件读写、git 命令都是主进程里带参数校验的 IPC 调用，文件路径必须落在用户打开的工作区内。
3. **不走 Next BFF。** 界面是打包进安装包的静态 SPA，数据面直连网关（与 CLI 同口径）；只有登录授权页借用 web。

---

## 4. 技术选型

| 维度 | 选择 | 理由 |
|------|------|------|
| 桌面框架 | **Electron**（D1） | 见 §4.1 |
| 界面 | React 19 + Vite + TanStack Query + Zustand + Tailwind | 与 web 同栈；不需要 SSR，所以不用 Next |
| 路由 | TanStack Router | 类型安全，与 TanStack Query 同生态 |
| 编辑器 | TipTap 3 + `@anynote/editor-core` + 新抽出的 `@anynote/editor-ui` | 与 web 共用 schema、Markdown 规则和界面 |
| 源码模式 | CodeMirror 6，按需加载 | Typora 式「切到源码」，只在切换时加载 |
| 数据层 | `@anynote/api-client`（类型）+ `openapi-fetch`（自定义 fetch 走 IPC）+ `@anynote/api-core` | contract-first 不变 |
| 登录 | `@anynote/native-auth`（从 CLI 抽出 PKCE、回环、换码） | 复用已上线的协议和单测 |
| 凭据存储 | Electron `safeStorage`（Windows DPAPI / macOS 钥匙串 / Linux 密钥服务） | 不落明文；Linux 上只能退化为明文后端时拒绝落盘并提示 |
| Git | 系统 `git`（≥ 2.30）+ `child_process.execFile` | 尊重用户已有的凭据助手、SSH 配置、钩子与 LFS（D3） |
| 文件监听 | chokidar | 跨平台行为一致 |
| 构建 | Vite（渲染进程）+ tsup（主进程与 preload，同 CLI）+ electron-builder | 是否改用 electron-vite 在 M15.0 评估 |
| 自动更新 | electron-updater（generic 源） | M15.8 |
| 测试 | Vitest（主进程 node 环境、渲染进程 jsdom）+ Playwright 的 Electron 支持 | §9 |

### 4.1 Electron 还是 Tauri（D1）

| 维度 | Electron（推荐） | Tauri 2（现骨架） |
|------|------|------|
| 主进程语言 | TS / Node 22，与 CLI、collab 同栈 | Rust：仓库里没有 Rust 代码，也没人维护过 |
| 可复用的现成代码 | CLI 的回环登录、PKCE、换码；`@anynote/api-core`；同步引擎可直接用 editor-core 的纯函数 | 登录、刷新、同步要用 Rust 重写；或者把逻辑放进 webview，那 Token 就进了页面 JS |
| 渲染引擎 | 三个平台都是 Chromium，与 web 的 chromium E2E 一致 | Windows WebView2、macOS WKWebView、Linux WebKitGTK 三套引擎 |
| 端到端测试 | Playwright 可直接启动并驱动 Electron 应用 | 需要另起 WebDriver 方案 |
| 本机工具链 | 只要 Node（已具备） | Rust + MSVC（本机未装，M8.2 正是卡在这里） |
| 安装包体积 | 大，百 MB 量级 | 小，十 MB 量级 |
| 安全模型 | contextIsolation + sandbox + preload，IPC 要自己守好（有成熟范式） | capability 白名单，默认更严 |
| 自动更新 | electron-updater，成熟 | tauri-plugin-updater |

推荐 Electron。唯一实质代价是安装包体积，换来的是：不引入 Rust 工具链、登录与同步全用 TS 写并复用现成代码、
三平台同一个渲染引擎、Playwright 直接做 E2E。

如果拍板选 Tauri：分层不变，§6 里的「主进程」换成 Rust 侧命令；同步引擎可以放在 webview 里用 TS 写、通过 Rust 命令调用 git 和文件，
但「Token 不进页面 JS」要重新论证（例如让 Rust 侧代理所有请求）。

### 4.2 被否决的方案

| 方案 | 否决理由 |
|------|------|
| 保留 Tauri 骨架，继续加载远端网页 | 与浏览器没有区别；做不了离线和本地文件 |
| 桌面端内嵌 Next 服务器走 BFF | 要在本机跑 Node 服务器和 Cookie 会话，复杂；BFF 是按浏览器威胁模型设计的（CLI_PLAN §2.2 同理） |
| Next 静态导出（`output: 'export'`）后打包 | web 依赖服务端组件、BFF 与中间件，导不出来 |
| 渲染进程直接带 Token 请求网关 | Token 进页面 JS；而本地仓库会渲染来自互联网的 Markdown，攻击面比 web 更大 |
| libgit2 / isomorphic-git | 不认用户的凭据助手、SSH 配置与钩子；isomorphic-git 大仓库慢、合并能力弱 |
| 与 CLI 共用凭据文件 | CLI 的凭据是明文 JSON（Windows 上没有权限保护）；桌面端用系统加密存储，两边各自登录、各自登出 |

---

## 5. 目录结构

```
apps/desktop/                       # 原地重做，Tauri 骨架删除（D10）
├── package.json                    # @anynote/desktop
├── electron-builder.yml
├── tsup.config.ts                  # 主进程 + preload
├── vite.config.ts                  # 渲染进程
└── src/
    ├── shared/                     # 主进程与渲染进程共用
    │   └── ipc.ts                  # IPC 契约：zod schema + 类型 + 错误码
    ├── main/
    │   ├── index.ts                # 单实例、协议注册、生命周期（退出前刷盘）
    │   ├── window.ts               # BrowserWindow 安全选项、导航拦截、CSP
    │   ├── ipc/                    # 每个命名空间一个文件：注册、发送方校验、参数校验
    │   ├── auth/                   # 登录、safeStorage 凭据、单飞刷新、服务器地址
    │   ├── api/                    # 网关代理与白名单、图片上传
    │   ├── protocol/               # app://、anynote-asset://
    │   ├── workspace/              # 工作区注册表、信任、路径守卫、原子写、监听
    │   ├── git/                    # runner、命令构造、porcelain 解析
    │   └── sync/                   # Git 知识库同步引擎（GIT_MODULE_PLAN §6）
    ├── preload/index.ts            # contextBridge 暴露 window.anynote
    └── renderer/
        ├── main.tsx、router.tsx
        ├── lib/api.ts              # openapi-fetch + 走 IPC 的 fetch
        ├── features/
        │   ├── auth/  bases/  notes/   # 云端知识库
        │   ├── workspace/  git/        # 本地仓库
        │   └── git-sync/               # Git 知识库的同步与冲突
        └── components/ui/              # shadcn 原件（生成物，同 web 约定）

packages/
├── editor-ui/                      # 新：从 apps/web/src/components/editor 抽出（M15.2）
└── native-auth/                    # 新：从 apps/cli/src/auth 抽出 PKCE、回环、换码（M15.2）
```

---

## 6. 核心模块设计

### 6.1 进程与安全边界

- `BrowserWindow`：`contextIsolation: true`、`sandbox: true`、`nodeIntegration: false`、`webSecurity: true`，不启用 `webviewTag`。
- 界面从 `app://bundle/` 加载：`protocol.handle` 只读安装包内的文件，路径不能越界。
- CSP：

  ```
  default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline';
  img-src 'self' data: blob: anynote-asset:; font-src 'self' data:;
  connect-src 'none'; object-src 'none'; frame-src 'none'
  ```

  `style-src 'unsafe-inline'` 是 ProseMirror 与 KaTeX 的行内样式所需。
- `will-navigate` 一律阻止；`setWindowOpenHandler` 一律拒绝新窗口。`http(s)` 链接经确认后用系统浏览器打开，其它协议直接拒绝。
- `session.setPermissionRequestHandler` 默认拒绝（剪贴板读写除外）。
- 每个 `ipcMain.handle` 先确认发送方是主窗口的主 frame，再用 `shared/ipc.ts` 的 zod schema 校验参数；校验失败直接拒绝，不做宽松解析。
- 外部图片：Markdown 里的 `http(s)` 图片默认不加载（CSP 已经挡住）。工作区设置里可以开启「允许加载外部图片」，
  开启后由主进程经 `anynote-asset://remote/` 代取。不给页面开 `img-src https:`，避免它变成数据外带通道。

### 6.2 IPC 契约

| 命名空间 | 方法 | 说明 |
|------|------|------|
| `auth` | `login()`、`logout()`、`status()`、`onExpired(cb)` | 登录走系统浏览器；`status` 只返回用户名与服务器地址，不含 Token |
| `settings` | `get()`、`setServer({ apiUrl, webUrl })`、`check()` | 两个地址分开配，同 CLI；`check` 探测网关，并校验响应确实来自网关 |
| `api` | `request({ service, method, path, query?, body? })` | 只代理白名单内的组合（§6.4） |
| `upload` | `noteImage({ noteId, bytes \| workspacePath, fileName, contentType })` | 五步分片直传由主进程执行 |
| `workspace` | `list()`、`open({ path })`、`clone({ url, parent })`、`trust({ id })`、`close({ id })` | 不是本应用创建或克隆的文件夹，首次打开要信任（§6.7） |
| `fs` | `tree`、`read`、`write`、`create`、`rename`、`trash`、`saveAsset` | 路径都是工作区内的相对路径；`write` 带期望的 mtime + size + hash，用于外部修改检测 |
| `watch` | `onChange(cb)` | 主进程监听后推送 |
| `git` | `status`、`diff`、`stage`、`commit`、`fetch`、`pull`、`push`、`log`、`branches`、`switch` | §6.8 |
| `sync` | `plan({ kbId })`、`apply({ planId, confirmations })`、`resolve({ conflictId, resolution })`、`onProgress(cb)` | [GIT_MODULE_PLAN §6](./GIT_MODULE_PLAN.md#6-同步引擎桌面端主进程) |
| `app` | `version()`、`openExternal(url)`、`onBeforeQuit(cb)` | 退出前通知渲染进程刷盘 |

返回值统一为 `{ ok: true, data } | { ok: false, code, message }`。`code` 复用 `@anynote/api-core` 的业务码，再加桌面端自己的码：
`WORKSPACE_UNTRUSTED`、`PATH_OUTSIDE`、`FILE_CHANGED`、`GIT_MISSING`、`GIT_AUTH`、`GIT_CONFLICT`、`SYNC_CURSOR_MOVED` 等。

### 6.3 登录与凭据

流程（复用 CLI M9.6）：

1. 主进程用 `@anynote/native-auth` 起回环服务 `127.0.0.1:<随机端口>`，生成 state 与 PKCE。
2. `shell.openExternal(<webUrl>/cli/authorize?port&state&challenge&client=desktop)`。
3. 用户在浏览器里登录并点「授权」，回环服务收到一次性 code。
4. 主进程 `POST <webUrl>/api/auth/cli-exchange { code, codeVerifier }`，拿到一对**独立的** Token：
   与浏览器会话、CLI 互不影响，各自登出。
5. `safeStorage.encryptString` 后写入 `userData/credentials.bin`；渲染进程只收到「已登录：用户名」。

web 侧只改一处：授权页按 `client` 参数切换文案（「授权 Anynote 桌面端」/「授权 CLI」）。协议、端点、签发方式都不变。

刷新：主进程只有一个，用进程内单飞即可（同一时刻只发一个刷新请求，其它请求等它），不需要 CLI 的跨进程文件锁。
刷新成功后先落盘再放行等待中的请求；refreshToken 失效则清掉凭据并广播 `auth.expired`。

服务器地址：与 CLI 一样分成 `apiUrl`（网关，数据面）和 `webUrl`（授权页）。首次启动引导填写；
`settings.check` 复用 CLI `doctor` 的判定：被重定向说明填的不是网关，直接报错。

### 6.4 网关代理

渲染进程照常用 `openapi-fetch` + `@anynote/api-client` 的类型，只是把 `fetch` 换成「打包成 IPC 调用，再把结果还原成 `Response`」的实现。

主进程：

- 拼出 `${apiUrl}/api/${service}${path}`，只放行白名单：

  | service | 放行 |
  |------|------|
  | `note` | `GET/POST /bases`、`GET/PUT/DELETE /bases/{id}`、`GET /notes`、`POST /notes`、`GET/PATCH/DELETE /notes/{id}`、`POST /notes/{id}/images/uploadTasks`、`/bases/{id}/git/**`（M15.6 新增） |
  | `file` | `getOssSliceUploadSignatures`、`markOssSliceUploadSignatures`、`composeOssSliceUploadObject`（只供 `upload.noteImage` 内部使用）、`GET /objects/{id}/redirect`（只供资源协议内部使用） |
  | `system` | `GET /user/mine` |
  | `auth` | 不开放：登录、登出、刷新只在主进程内部发起 |

- 带上 `Authorization: Bearer`；遇到 401 / A0301 先单飞刷新，再重试一次。
- 超时 30 秒（上传除外），响应体上限 10 MB，只回传 `content-type` 等必要的响应头。
- 分片直传 MinIO 的 PUT 只发往**本次上传任务里服务端签出来的地址**。
- 不涉及 CORS：请求从 Node 发出，网关的 CORS 配置与桌面端无关。

### 6.5 资源协议 `anynote-asset://`

| 地址 | 处理 |
|------|------|
| `anynote-asset://server/{fileId}` | 主进程带 Bearer 请求 `/api/file/objects/{fileId}/redirect`，跟随 302 取图，按 fileId 缓存到 `userData/cache/assets/`（LRU，上限 500 MB） |
| `anynote-asset://local/{workspaceId}/{relPath}` | 读工作区内的文件；路径越界、符号链接跳出工作区一律 403 |
| `anynote-asset://remote/{encodedUrl}` | 只在工作区允许外部图片时代取 `http(s)` 图片 |

编辑器只在**渲染时**改写 `img src`：节点视图里把 `/api/proxy/file/objects/{id}/redirect` 映射成 `anynote-asset://server/{id}`，
把相对路径映射成 `anynote-asset://local/…`。**存盘的正文一个字节都不改。**

### 6.6 云端知识库

界面：左栏知识库列表 → 中栏笔记列表（按最近更新排序）→ 主区编辑器。

- **知识库**：列表（`GET /bases`）、新建（沿用 web 的 `DEFAULT_BASE_COVER` 与 `type: 0`，见 `use-knowledge-bases.ts:167-177`）、
  改名与描述、删除（需要管理权限，二次确认）。
- **笔记**：新建、打开、编辑、改名（标题即 H1，规则与 web 相同）、移动到其它知识库、删除。搜索放到后续，不进 MVP。
- **保存**：沿用 web 的节奏（`use-save-note.ts:21-27`）——停止输入 1.5 秒保存、持续输入最长 10 秒保存一次、Ctrl/⌘+S 立即保存；
  带 version 做乐观并发，A0409 进入冲突态（「用我的覆盖 / 用服务器的 / 对比」）。
  web 的 `use-save-note.ts` 绑着浏览器卸载语义（keepalive、`beforeunload`），桌面端改用 Electron 的退出拦截
  （`before-quit` → 渲染进程刷盘 → 再退出），所以**重写一份更简单的保存会话**；版本号换算、冲突判定等纯函数下沉到
  `@anynote/api-core`，两边共用。
- **图片**：粘贴或拖入 → `upload.noteImage` → 正文写入与 web 完全相同的 `/api/proxy/file/objects/{fileId}/redirect`，网页端照常显示。
- **断网**：已打开的笔记可以继续看；编辑留在内存并提示，恢复网络后补存。不做离线写队列。

### 6.7 本地仓库

- **打开**：选择文件夹、克隆远程仓库、最近打开列表（`userData/workspaces.json` 记 id、路径、名称、信任状态、绑定的知识库）。
- **工作区信任**：不是本应用克隆或新建的文件夹，首次打开时询问是否信任。未信任时只能查看和编辑文件，Git 功能关闭。
  原因：仓库自带的 `.git/config`（如 `core.fsmonitor`、`core.sshCommand`）和钩子会在执行 git 时运行任意命令，这是 git 自身的模型，
  只能由用户决定是否信任。
- **文件树**：默认只显示文件夹与 `.md` / `.markdown`，可以切到「显示全部」；隐藏 `.git` 和 `node_modules`。
- **读取**：只支持 UTF-8。记下是否带 BOM（读入时去掉）、行尾风格（CRLF / LF）、mtime + size + 内容哈希。
- **保存**：节奏同云端笔记。`fs.write` 带打开时记下的期望值，与磁盘不符返回 `FILE_CHANGED`；
  写入用「同目录临时文件 + rename」原子替换；按记下的 BOM 与行尾风格还原。
- **外部修改**：chokidar 监听。当前文件没有未保存改动时静默重载；有改动时提示「保留我的 / 载入磁盘版本 / 对比」。
- **图片**：粘贴或拖入的图片写到「笔记所在目录 `/assets/<原文件名>-<内容哈希前 8 位>.<扩展名>`」，正文插入相对路径；目录名可以在工作区设置里改。
- **删除**走系统回收站（`shell.trashItem`），不硬删。
- 支持新建、重命名、移动文件与文件夹；不自动改写其它文件里指向它的链接（Typora 也不做）。

### 6.8 Git 基础能力

runner 骨架：

```ts
// apps/desktop/src/main/git/runner.ts
const BASE_ARGS = [
  "-c", "core.quotepath=false",   // 中文路径原样输出
  "-c", "core.fsmonitor=false",   // 不启动仓库配置里的 fsmonitor 钩子
  "-c", "protocol.allow=never",   // 默认禁止所有传输……
  "-c", "protocol.https.allow=always",
  "-c", "protocol.ssh.allow=always", // ……只放行 https 与 ssh，挡掉 ext:: 这类能执行命令的传输
];

export function runGit(cwd: string, args: readonly string[], opts: RunOptions = {}): Promise<GitResult> {
  return execFileAsync("git", [...BASE_ARGS, ...args], {
    cwd,
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0", GIT_OPTIONAL_LOCKS: "0" },
    windowsHide: true,
    maxBuffer: 64 * 1024 * 1024,
    timeout: opts.timeoutMs ?? 120_000,
  });
}
```

- 只用 `execFile`（参数数组，不经 shell）；用户提供的路径前一律加 `--`；以 `-` 开头的远程地址直接拒绝（防参数注入）。
- 最低版本 2.30（`git --version` 检测）。没装就引导安装 Git for Windows 或 Xcode Command Line Tools；是否内置 MinGit 在 M15.8 评估（D3）。
- 凭据不自己存：HTTPS 交给用户的 credential helper（Git for Windows 自带的 Git Credential Manager 会弹自己的登录窗口），
  SSH 用系统 ssh-agent。`GIT_TERMINAL_PROMPT=0` 保证 git 不会卡在看不见的终端提示上；需要口令时报 `GIT_AUTH` 并给出配置指引。
  应用内的 askpass 对话框放到后续。
- 首次提交缺 `user.name` / `user.email` 时提示设置（写仓库级配置）。

| 能力 | 命令 | 说明 |
|------|------|------|
| 识别 | `rev-parse --show-toplevel`、`rev-parse --abbrev-ref HEAD` | |
| 状态 | `status --porcelain=v2 -z --branch --untracked-files=all` | v2 + NUL 分隔，含空格和中文的路径也稳定 |
| 差异 | `diff --no-color -U3 -- <path>`、`diff --cached -- <path>` | 文本 diff 视图 |
| 提交 | `add -- <paths>`、`commit -F -`（提交信息走 stdin） | |
| 拉取 | `fetch --prune origin` → `merge --ff-only @{u}`；不能快进时 `merge --no-edit @{u}` | 有冲突时列出未合并文件 |
| 推送 | `push origin HEAD:<branch>`（首次带 `-u`） | 非快进被拒时提示先拉取 |
| 克隆 | `clone --progress -- <url> <dir>` | 解析 stderr 的进度 |
| 历史 | `log --format=<用 %x1f 分隔的字段> -n 100 -- [path]` | 仓库历史与单文件历史 |
| 分支 | `branch --format=…`、`switch <branch>` | 有未提交改动时拒绝切换 |

合并冲突：未合并的文件在编辑器里以「冲突视图」打开（本地版本 / 对方版本 / 合并结果三栏，结果栏是源码模式），
解决后 `add` 并提交这次合并。

### 6.9 编辑器：Typora 式编辑与保真保存

**Typora 怎么做的**（2026-10-01 分析 Typora 0.9.98 的 `resources/app/app/window/frame.js`）：

- `getMarkdown()` 在非源码模式下调 `nodeMap.toMark()`，**每次保存都把整篇重新生成**，不缓存原文片段。
- 行内内容不做结构化：段落节点的 `text` 就是行内 Markdown 原文。分隔符作为隐藏的 `<span class="md-meta">` 留在 DOM 里，
  光标进入时加 `md-expand` 类显示出来——这也是「光标进去显示源码」的实现；编辑后用 DOM 的 `textContent` 取回原文。
- 块级写法在解析时记到节点属性上：前后空行数（`ahead` / `tail`）、标题与列表与代码围栏的 `pattern`、列表逐行缩进（`userIndent`）、
  表格原文（`userText`）、对齐行与单元格边距等；属性缺失时才用设置里的语法偏好。
- 已知缺陷正出在属性没覆盖的地方：改任一单元格就清掉 `userText`，整张表按列宽重排；列表「松紧」是整个列表的属性，
  一项变松散全表补空行（typora-issues #5228）。

TipTap 的行内是「文本 + 格式标记（marks）」，照搬「行内存原文」就等于不用 TipTap。所以本方案取 Typora 块级的那一半，
再加上 Typora 没有的「原文兜底」：

| 层 | 做什么 | 改 schema |
|------|------|------|
| **L1 原文兜底** | 载入时用 markdown-it 的 `token.map` 把顶层节点对应到原文区间，并逐块重新解析校验；保存时**没改过的块原样输出原文**（连同块之间原有的空行），改过的块才序列化。「没改过」靠 ProseMirror 的节点复用判断，撤销后用内容比对兜底；剔除 StarterKit 3 的 TrailingNode 在文末补的空段落 | 否 |
| **L2 记住写法** | 解析时把列表符号、强调符号、代码围栏字符与长度、Setext 标题、表格对齐、段内折行记到节点属性上，改过的块也按原写法输出；只有新块用默认写法 | 是 |
| **L3 原样块** | 新增 front matter、原始 HTML（块级与行内，**只显示源码，不渲染**）、脚注节点：编辑器不认识的语法整块原样保留 | 是 |

- L1 已有原型验证。L2、L3 要递增 `EDITOR_SCHEMA_VERSION` 并登记 `schema-lock.json`（仓库强制约束）；
  `apps/collab` 同样依赖 editor-core，要一起回归。
- 避开 Typora 的两个坑：列表松紧不做成整个列表的属性（只看相邻两项之间原来有没有空行）；表格永远不重新计算列宽。
- L1–L3 落在 `packages/editor-core`，web 同样受益。这对 Git 知识库是**硬前提**：网页上改一个字，仓库里只能多一行 diff。

**Typora 式显示**：

- 第一档（M15.4）：光标进入粗体、斜体、行内代码、链接、标题时，用装饰在两端显示灰色的 `**`、`` ` ``、`[](url)`、`## `；
  这些标记只显示、不能直接编辑。输入规则（`# `、`**x**`、```` ``` ````）沿用现有的。
- 源码模式：Ctrl/⌘+/ 切到 CodeMirror 6 编辑原文；切回时用新原文重建 L1 的对照基线，来回切换不会重排。
- 第二档（标记可直接编辑，即 Typora 的真实行为）不在本期：要处理输入法组合、撤销历史和光标映射，风险高。

**编辑器预设**：

| 预设 | 用于 | 与 web `full` 预设的差异 |
|------|------|------|
| `cloud` | 云端知识库的笔记 | 去掉协同；保存走 L1–L3 |
| `local` | 本地文件、Git 知识库 | 在 `cloud` 基础上再去掉 `Typography`（输入时会把 `"` 改成弯引号、`--` 改成破折号写进文件）和 `TextAlign`（Markdown 表达不了，存盘就丢）；**关闭「首个节点必须是 H1」**；工具栏隐藏下划线（`++` 不是通用语法，但解析照常支持，打开别人写的文件不会坏） |

**标题规则**：editor-core 新增纯函数 `deriveTitle(markdown, fallback)`，优先级为 front matter 的 `title` > 文首 H1（跳过 front matter）>
文件名 > fallback，截断复用现有的 `truncateTitle`。web 的 `leadingHeadingOf` 要能跳过 front matter 节点。

---

## 7. 界面结构

```
┌────────────┬───────────────────┬─────────────────────────────────────────────┐
│ 工作区      │ 列表 / 文件树      │ 编辑器                                        │
│ 云端知识库  │ ▾ docs/           │ # 标题                                        │
│  ☁ 读书笔记 │    intro.md       │                                               │
│  ☁ 工作     │    guide.md   M   │ 正文……                                       │
│ 本地仓库    │ ▸ assets/         │                                               │
│  ⎇ blog    │                   │                                               │
│  ⎇ 知识库C ↻│                   │                                               │
│ ＋ 打开…    │                   │                                               │
├────────────┴───────────────────┴─────────────────────────────────────────────┤
│ 状态栏：已保存 · main ↑1 ↓0 · 3 处改动 · 上次同步 5 分钟前                      │
└──────────────────────────────────────────────────────────────────────────────┘
```

- 左栏分两组：「云端知识库」和「本地仓库」。Git 知识库在本机有克隆时出现在「本地仓库」组，带同步按钮。
- 视觉沿用 web 的设计 token（Tailwind 主题、深浅色）。桌面端**没有设计稿**，M15.3 前需要按 `docs/ui/` 的流程补一版画板，
  否则只能按 web 现有页面的风格实现。

---

## 8. 退役与迁移

新客户端可用之后（M15.8）一起清理：

| 对象 | 处理 |
|------|------|
| `apps/desktop/src-tauri/**`、`apps/desktop/scripts/make-icons.mjs`、Tauri CLI 依赖 | 删除，被 Electron 实现替换 |
| `apps/web/src/app/api/auth/exchange/route.ts` 及其测试 | 删除 |
| `apps/web/src/lib/desktop/bridge.ts` 及其测试 | 删除 |
| `DESKTOP_EXCHANGE_KEY` / `DESKTOP_ALLOWED_ORIGINS` | 从 `apps/web/src/lib/env.ts`、`apps/web/.env.example`、`infra/web/config.mjs` 及各自测试、`README.md`、`CONTRIBUTING.md`、`apps/web/README.md`、`.claude/context/frontend.md` 中移除 |
| `CLAUDE.md` | 「仓库定位」的 `apps/desktop` 一行改写；「禁止清单」里 Token 落盘的**例外一**和 `DESKTOP_EXCHANGE_KEY` 一条删除 |
| `docs/refactor/FRONTEND_MILESTONES.md` M8.2 | 历史记录保留，补一句「已由 `docs/desktop/` 取代」 |

外部契约 `POST /api/auth/exchange` 下线，需要一份 OpenSpec 提案（`YYYY-MM-DD-retire-desktop-token-exchange.md`）。

---

## 9. 测试计划

按 `CLAUDE.md`「测试要求」，每个模块都要有单测：

| 范围 | 测什么 | 方式 |
|------|------|------|
| editor-core L1–L3 | 往返保真 | 现有 `fixtures/` 加上**仓库自己的 `docs/**/*.md` 与 `README.md` 作为语料**：打开即保存逐字节一致；随机改一个词，差异只有那一行；撤销后一致 |
| native-auth | PKCE、回环、换码 | CLI 原有单测随代码迁移 |
| 主进程 IPC | 发送方校验、参数校验失败即拒绝 | Vitest（node 环境） |
| 路径守卫 | `..`、绝对路径、符号链接跳出、Windows 盘符与 UNC 路径、大小写 | Vitest，含只在 Windows 上跑的用例 |
| 原子写 | 期望值不符返回 `FILE_CHANGED`；BOM 与 CRLF 还原 | Vitest + 临时目录 |
| 网关代理 | 白名单、401 单飞刷新、刷新失败广播 | Vitest，fetch 打桩 |
| git runner 与解析 | 参数构造；porcelain v2 解析（中文与空格路径、改名、未合并） | 解析用夹具；命令用**真实 git + 临时仓库**（`git init --bare` 当远程，测试里单独放行 `file` 传输，不出网），可以留在默认单测里 |
| 渲染进程 hooks | 保存会话、冲突态 | Vitest + Testing Library（同 web 约定） |
| 端到端 | 登录（授权页打桩）、知识库与笔记增删改、打开本地仓库编辑并提交推送到临时 bare 仓库 | Playwright 驱动 Electron；需要真实后端栈，**不进**默认 `pnpm test`（同 web E2E） |

---

## 10. 打包、更新与 CI

- electron-builder：Windows NSIS 安装包首发（D11），之后是 macOS dmg、Linux AppImage。
- 代码签名：Windows 不签名会被 SmartScreen 拦截，macOS 不签名加公证无法正常打开。证书是采购问题，M15.8 前拍板。
- 自动更新：electron-updater 的 generic 源（静态文件服务器或 MinIO 的公开桶），校验签名。
- CI：新增 `desktop` job，跑 typecheck、单测、渲染进程构建；打包与 E2E 不进默认 CI。
- 依赖改动按仓库约束同步 `pnpm-lock.yaml`。

---

## 11. 安全清单

1. **Token**：只在主进程；`safeStorage` 加密落盘；日志与错误信息脱敏。
2. **渲染进程**：沙箱、没有 Node、CSP `connect-src 'none'`、禁止导航与新窗口。
3. **IPC**：发送方校验 + zod 参数校验；返回值不含 Token。
4. **文件**：只在工作区内读写；路径越界和符号链接跳出一律拒绝；删除走回收站。
5. **Git**：`execFile` 不经 shell；路径前加 `--`；只允许 https 与 ssh 传输；未信任的工作区不执行 git。
6. **内容**：Markdown 里的 HTML 只显示源码；外部图片默认不加载；链接经确认后用系统浏览器打开。
7. **网关代理**：路径白名单；分片直传只发往本次任务签出的地址。
8. **自动更新**：校验签名。

---

## 12. 风险

| 风险 | 影响 | 应对 |
|------|------|------|
| 保真改造范围大（L2 / L3 动 schema） | 牵动 web 与协同服务 | L1 不动 schema，先上；L2 / L3 单独交付，带 schema 版本锁与语料门禁 |
| Electron 安装包体积 | 下载与更新慢 | 差分更新；或在 D1 改选 Tauri |
| 用户没装 git | Git 功能不可用 | 启动检测 + 安装引导；评估内置 MinGit（D3） |
| Windows 上 git 的凭据弹窗不可控 | 推送卡住 | `GIT_TERMINAL_PROMPT=0` + 超时 + 引导配置 Git Credential Manager |
| 桌面端没有设计稿 | 视觉返工 | M15.3 前补画板 |
| 生产环境没开 `api.YOUR_DOMAIN` | 桌面端连不上 | 模板已有（CLI 同样依赖）；`settings.check` 首次启动就明确报错 |
| 正文 64 KB 字节上限 | 大文件进不了知识库 | 同步时跳过并列出；是否改 `MEDIUMTEXT` 另行讨论 |
