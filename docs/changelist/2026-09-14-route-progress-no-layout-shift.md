# 修复顶栏路由进度条占高度导致页面下沉

- **日期**：2026-09-14
- **分支**：`dev`（直接在工作区修改，未开分支）
- **上一批**：`docs/changelist/2026-09-14-loading-system.md`（本文件修掉的 bug 由那一批引入）
- **触发问题**：站内切页时，顶栏那条 2px 路由进度条一出现，**整页内容往下沉一下**；
  导航结束它被卸载，内容又弹回去

## 概览

`RouteProgressBar` 原来把 `h-0.5` 放在**自己身上**，于是这条"浮在顶栏下面的细线"
实打实占了 2px 文档流高度。它是个条件渲染（导航时挂载、结束即卸载），
所以每切一次页面，`#workspace-content` 就下移 2px 再弹回——**切一次抖两次**。

修法是拆成两层：外层只做定位与状态播报（`h-0`，不占高度），
可见的 2px 交给**绝对定位**的子元素。视觉位置与"紧跟顶栏"完全一致。

| 项目 | 数量 |
|------|------|
| 新增文件 | 1（`route-progress-bar.test.tsx`，109 行） |
| 修改文件 | 4 |
| 删除文件 | 0 |
| 增 / 删行数 | +97 / −7（本批的 4 个已跟踪文件，`git diff --numstat`：`frontend.md` 7/0、`loading-system.spec.ts` 64/4、`ui-capture.mjs` 7/1、`route-progress-bar.tsx` 19/2） |

按目录分布：`apps/web/src/components/layout/**`（2 个）、`apps/web/e2e/**`（1 个）、
`apps/web/scripts/**`（1 个）、`.claude/context/**`（1 个）。

### 验证结果

全部为**实际执行过**的命令与真实输出。

| 命令 | 结果 |
|------|------|
| `npx playwright test`（修复前探针，量 `#workspace-content` 的 `top`） | **56 → 58**，复现下沉 2px |
| `npx vitest run src/components/layout/__tests__/route-progress-bar.test.tsx`（修复前） | **5 failed / 2 passed**，红在 `h-0` / `absolute` / `pointer-events-none` 等断言上 |
| 同上（修复后） | **7 passed** |
| `pnpm --filter web test` | **118 文件 / 1213 用例全绿** |
| `pnpm --filter web typecheck` | 0 error |
| `pnpm check`（Biome） | 541 文件 clean |
| `docker compose ... build anynote-web` + `up -d --no-deps anynote-web` | 镜像重建成功、容器 `healthy`（E2E 跑的是容器里的生产构建，不重建验不到修复） |
| `E2E_BASE_URL=https://192.168.3.90:3000 npx playwright test loading-system.spec.ts --project=chromium` | **15 passed**（含本批新增的回归用例） |
| 同上，`--project=mobile` | **32 passed / 0 failed** |
| 同上，全量（两 project） | **90 passed / 1 skipped / 1 failed**；唯一失败是 `collab.spec.ts` 的定位用例如与 Playwright 的 trace 产物 `ENOENT`（`_wrapApiCall: ENOENT ... recording25.network`），**单独重跑 2 passed**，属工具产物 IO 抖动 |
| `node apps/web/scripts/ui-capture.mjs --only route-progress` | 六张图全部产出（未修 `ui-capture.mjs` 前该场景会超时，见下） |

> **本机环境前提**：E2E 跑在 Nginx 自签 HTTPS 入口（`https://192.168.3.90:3000`）上，
> 与 `docs/changelist/2026-09-13-nginx-tls.md` 一致。`cli-authorize.spec.ts` 的 3 条
> 需要 `NODE_EXTRA_CA_CERTS` 指向本地 CA，否则 CLI 子进程报
> `UNABLE_TO_VERIFY_LEAF_SIGNATURE`（退出码 4）。本批未动 CLI，见「审计要点」第 5 条。

## 修复本体

| 文件 | 状态 | 作用与原因 |
|------|------|------------|
| `apps/web/src/components/layout/route-progress-bar.tsx` | 修改 | ① 外层 `<output>` 的 `h-0.5` 改成 `h-0`，并去掉 `overflow-hidden`——**留着它会把绝对定位的子元素裁到 0 高，进度条直接消失**，归零只能靠"容器不占位"而不是"裁剪"。② 新增 `pointer-events-none`：条从"文档流里的一条"变成"浮在内容上沿的一条"，不吃掉那 2px 上的点击。③ `<span data-slot="boot-bar">` 从 `block h-full w-full` 改成 `absolute inset-x-0 top-0 h-0.5`，那 2px 像素改由它画，`top-0` 让它贴在零高容器的上沿，视觉位置与改动前逐像素相同。 |

## 回归测试

| 文件 | 状态 | 作用与原因 |
|------|------|------------|
| `apps/web/src/components/layout/__tests__/route-progress-bar.test.tsx` | **新增** | 7 条。**先写、先红、再改代码**：修复前 5 条失败。用类名契约钉住结构（`h-0`、不含 `h-0.5`、子元素 `absolute inset-x-0 top-0`、不加 `overflow-hidden`、`pointer-events-none`），并保留既有语义断言（`<output>` 的隐式 `role=status`、播报文案、不编造 `aria-valuenow`、不活跃时不渲染）。另有一条钉**移动端覆盖定位**后高度仍归零（`MobileShell` 传的是 `fixed` 版，要确认 `twMerge` 换掉 `sticky/top-14` 时不带回高度）。 |
| `apps/web/e2e/loading-system.spec.ts` | 修改 | ① 新增回归用例「进度条亮起时内容不被推下去——加载条不占高度」：量 `#workspace-content` 的 `top` 与文档总高，**亮起前后必须逐像素相等**，收起后再量一次防反向位移；同时断言条本身仍是 **2px**（防止"把条改成 0 高"这种假修复）。② 既有用例「点站内链接时进度条真的亮起」的可见性断言从外层移到内层 `[data-slot="boot-bar"]`——**外层现在是零高度，在 Playwright 眼里永远不可见**，`toBeVisible` 会一直等到超时；语义与文案断言仍留在外层，那才是读屏读到的东西。 |

## 连带修复

| 文件 | 状态 | 作用与原因 |
|------|------|------------|
| `apps/web/scripts/ui-capture.mjs` | 修改 | `route-progress` 场景原本 `waitForSelector('[data-slot="route-progress"]')`，而 `waitForSelector` 默认 state 是 `visible`——**零高度元素永远不可见**，改完后该场景会一直等到 5s 超时。改等内层 `[data-slot="boot-bar"]`。这条是用真实探针量出来的（零高 host `waitForSelector` 失败、2px 内层成功），不是推断。 |
| `.claude/context/frontend.md` | 修改 | 「加载体系」节补一段**加载态一律不占布局高度**：与既有的"骨架形状必须对得上宿主"同源（都是"出现/消失各引发一次重排"）。写清 `RouteProgressBar` 为什么是零高容器 + 绝对定位子元素，以及三条容易被"顺手改回去"的配套约束（别加 `overflow-hidden`、要 `pointer-events-none`、可见性判定查内层）。 |

## 审计要点

1. **`h-0` 与 `overflow-hidden` 不能同时出现**，这是本批最容易踩回去的一处。
   直觉上"高度 0 + 裁掉溢出"很自然，实际会把绝对定位的条一起裁没，进度条彻底看不见
   ——而它只在导航期间出现，**很容易被误判成"时序问题"而不是"被裁掉了"**。
2. **不能用 `hidden` / `visibility` / 透明度去"不占高度"**。`hidden` 会同时去掉
   `<output>` 的状态播报；`opacity-0` 仍然占 2px。要的是"零高度但可播报、可绘制"，
   `h-0` + 绝对定位是满足这三条的最小写法。
3. **进度条是条件渲染的**，所以这类 bug 的表现不是"页面一直偏移"而是"抖一下"，
   截图对比很难发现，必须量 `getBoundingClientRect()` 的前后差。
   本批的 E2E 用例就是这么写的，改这块时请保留"取基准 → 亮起 → 再量"的三段结构。
4. **`sticky` 在零高度容器上仍然有效**（已用真实探针验证：滚动 2932px 后
   `boot-bar` 的视口 `top` 仍为 56，与顶栏底边对齐）。`h-0` 不会让它失去吸顶能力，
   所以不需要改成 `fixed`——桌面端正是靠 `sticky top-14` 与顶栏 `min-h-14` 对齐的。
5. **全量 E2E 的那 1 条 `collab.spec.ts` 失败与本批无关**：报错是 Playwright 写 trace
   产物时 `ENOENT`（`_wrapApiCall: ENOENT ... recording25.network`、`open ... .zip`），
   落在 `e2e/.output/` 而不是产品代码；单独重跑 2 passed。
   另一组 3 条 `cli-authorize.spec.ts` 失败是 `NODE_EXTRA_CA_CERTS` 未设导致的 Node
   自签证书不信任（`UNABLE_TO_VERIFY_LEAF_SIGNATURE`，CLI 退出码 4 = NETWORK），
   加上环境变量后即恢复——两者都不是本批引入，也不是产品缺陷。
6. **`infra/docker-compose.yaml` 的未提交改动不属于本批**（`NEXT_PUBLIC_APP_URL` 默认值
   与协同来源改为 `https://192.168.3.90:3000`，配套 `docs/changelist/2026-09-13-nginx-tls.md`），
   本批未纳入、也未修改。本机 E2E 正是跑在这套 HTTPS 入口上。

## 相关文档

- [`docs/changelist/2026-09-14-loading-system.md`](./2026-09-14-loading-system.md) —
  引入本 bug 的那一批；其「品牌启动与路由进度」节的组件说明仍是准确的设计依据
- [`.claude/context/frontend.md`](../../.claude/context/frontend.md) — 加载体系选型表、
  Token 与动效时长、无障碍约定（本批新增"不占布局高度"一段）
- [`docs/changelist/2026-09-13-nginx-tls.md`](./2026-09-13-nginx-tls.md) — 本机 HTTPS 入口
  与 `NODE_EXTRA_CA_CERTS` 的由来（E2E 的跑法前提）
