# @anynote/desktop

Anynote 的 Tauri 2 桌面壳（Phase 5 **M8.2**）。

## 它是什么

一个**只负责开窗的壳**：窗口里加载的是远端运行的 Next.js 应用（`apps/web`），
不是打包进安装包的静态产物。原因是 `apps/web` 的 SSR 与 BFF 路由（`/api/auth/*`、
`/api/proxy/*`）必须跑在服务端，没法静态化。

因此 `tauri.conf.json` 里 `devUrl` / `frontendDist` 都是 URL 而非目录，
壳启动时用 `WebviewUrl::External` 打开它。

## 令牌交换（这个壳存在的技术理由）

Web 端的 Token 只存在 httpOnly Cookie 里，前端 JS 拿不到。桌面壳是独立进程，
跨进程复用这套 Cookie 并不可靠（见 `docs/refactor/FRONTEND_MILESTONES.md` 风险表 M8.2）。

流程：

1. 壳在页面加载前注入 `window.__ANYNOTE_DESKTOP__ = { exchangeKey }`
   （`src-tauri/src/lib.rs`，密钥在编译期由 `ANYNOTE_DESKTOP_EXCHANGE_KEY` 打进二进制）
2. 用户在窗口里正常登录，Cookie 落在 webview 里
3. 前端检测到桌面标记后调 `POST /api/auth/exchange`，带上 `x-anynote-desktop-key`
   （`apps/web/src/lib/desktop/bridge.ts`）
4. BFF 三道闸都过才返回真实 Token：**服务端配了 `DESKTOP_EXCHANGE_KEY`** +
   **密钥匹配** + **Origin 在 `DESKTOP_ALLOWED_ORIGINS` 里**
5. 桌面把 Token 存进 localStorage（仓库规约禁止此举，此处是 M8.2 明确授权的唯一例外）

> **纯 Web 部署不要配 `DESKTOP_EXCHANGE_KEY`。** 不配即关闭交换端点；
> 配了等于给 XSS 留了一条取 Token 的路。密钥打包在二进制里、理论上可被逆向，
> 所以真正的边界是 Origin 校验，两道闸缺一不可。

## 构建前置条件（**当前开发机未满足，故 M8.2 的构建验证后置**）

`pnpm --filter @anynote/desktop tauri info` 在本机的输出：

```
✔ WebView2: 152.0.4191.66
✘ Couldn't detect any Visual Studio or VS Build Tools instance with MSVC and SDK components
✘ rustc: not installed!
✘ Cargo: not installed!
```

要跑起来需要：

1. [rustup](https://rustup.rs/)（含 cargo，Windows 上选 `stable-x86_64-pc-windows-msvc`）
2. [Visual Studio Build Tools](https://aka.ms/vs/17/release/vs_BuildTools.exe) 勾选
   「使用 C++ 的桌面开发」（MSVC + Windows SDK）
3. WebView2 Runtime（Windows 11 自带）

**`src-tauri/` 下的 Rust 代码尚未经过编译验证**——工具链就绪后需先跑一次
`cargo check` 再谈 dev / release 构建。

## 命令

```bash
# 开发：先起 web（beforeDevCommand 会自动跑 pnpm --filter web dev），再开窗
pnpm --filter @anynote/desktop dev

# 发布构建（需要上面的工具链）
ANYNOTE_DESKTOP_EXCHANGE_KEY=<与部署侧一致的密钥> pnpm --filter @anynote/desktop build

# 指向非本机的部署地址
ANYNOTE_APP_URL=https://notes.example.com pnpm --filter @anynote/desktop dev

# 重新生成占位图标（正式图标请用 `pnpm --filter @anynote/desktop tauri icon <source.png>`）
pnpm --filter @anynote/desktop icons
```

## 目录

| 路径 | 作用 |
|------|------|
| `src-tauri/src/main.rs` | 二进制入口，只调 `lib::run()` |
| `src-tauri/src/lib.rs` | 建窗 + 注入桌面标记 |
| `src-tauri/tauri.conf.json` | 产品信息、远端 URL、打包目标 |
| `src-tauri/capabilities/default.json` | 只开 `core:default`，不暴露额外 IPC |
| `src-tauri/icons/` | 占位图标（纯色圆角方块），由 `scripts/make-icons.mjs` 生成 |
