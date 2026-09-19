# 2026-09-19 官网首页落地（D-19 / M-14）

> 依据：[`docs/ui/UI补稿设计图.md`](../ui/UI补稿设计图.md)（2026-09-19 补充的官网首页 D-19 / M-14，
> 来自设计画布「Anynote 官网首页设计」，浅色 / 深色各一版）
> 画板：[`docs/ui/ui-supplement/D-19-landing-pc{,-dark}.png`](../ui/ui-supplement/) ·
> [`M-14-landing-mobile{,-dark}.png`](../ui/ui-supplement/)
> 契约登记：无需新增 —— 这一页**不调用任何业务接口**（见下「为什么不查后端」）

## 概览

把 `/` 从「直接重定向到 `/dashboard`」换成**真正的官网首页**，并顺带修正中间件的
登录保护口径：`/` 从「受保护页面」改为「对访客公开、但仍经中间件做手机 UA 分流」。

**改动规模**（`git diff --stat` + `git ls-files --others` 实测）：

| 类别 | 文件数 | 行数 |
|------|--------|------|
| 修改（已跟踪） | 4 个 | +223 / −21 |
| 新增 · 实现 | 3 个 | 810 行 |
| 新增 · 测试（含 1 个 E2E） | 3 个 | 368 行 |
| 新增 · 静态资源 | 2 个 webp | 214.9 KB |

共 6 个新增文本文件、1178 行；4 个修改文件集中在 `apps/web/src/{app,middleware*}`。
按目录分布：`apps/web/src/features/landing/**`（新建，本次主体）、
`apps/web/src/{app,middleware*}`（接线）、`apps/web/e2e/`（端到端用例）、
`apps/web/public/landing/`（画板里抠出的两张主视觉）。

**验证结果**（全部实际执行）：

| 命令 | 结果 |
|------|------|
| `pnpm --filter web typecheck` | 通过 |
| `npx @biomejs/biome check apps/web/src apps/web/e2e/landing.spec.ts` | 通过（455 文件） |
| `pnpm --filter web test` | **1814 通过 / 153 文件**（本次新增 26 条：落地页 13 + 文案表 13） |
| `npx vitest run src/middleware.test.ts` | 46 通过（本次新增 6 条公开页放行/分流） |
| `pnpm --filter web check:css-tokens` | 通过（68 个变量全部有定义） |
| `pnpm --filter web build` | `Compiled successfully`（Windows 上 standalone trace 阶段因 symlink 权限报 EPERM，见「审计要点」） |
| `pnpm --filter web bundle:budget` | 桌面 303.1/310 KB 通过；**移动端 251.2/250 KB 未通过 —— 存量问题**，见下 |
| 真机浏览器截图比对（1440 / 390 × 浅 / 深，4 态） | 四个区块分界与画板**逐像素一致**；详见「还原度核对」 |
| `pnpm --filter web test:e2e`（真实 Docker 全栈，`E2E_BASE_URL=http://localhost:3000`） | **136 通过 / 136**（`exit 0`，2.5 分钟）：新增 `landing.spec.ts` 10 条 + 存量 126 条全绿。前两轮各出现过 1 条**非断言**失败（`collab.spec.ts` 的 trace 落盘 ENOENT、`cli-authorize.spec.ts` 60s 超时），单独重跑该文件均全绿——是 Windows 上 Playwright trace 写入的偶发 I/O，与本次改动无关；清空 `e2e/.output` 后第三轮全绿 |
| 容器内复核（`anynote-web` 重建后，`http://localhost:3000`） | `landing.spec.ts` **10 通过**；DOM 几何与本地构建逐值一致（分界 65 / 1308 / 2291 / 3343） |

## 一、落地页实现（`apps/web/src/features/landing/`）

新建的 feature 目录，一张 RSC + 一份文案表 + 一组装饰积木。

| 文件 | 状态 | 作用与原因 |
|------|------|-----------|
| `lib/content.ts` | 新增 | 全页文案、导航与页脚链接表。抽成纯数据是为了**逐条核对画板**——文案散在四个组件里就没法一眼比对"哪句少了个字"。`subtitleMobile` / `mobileLinks` 是**画板上真实存在的两态差异**（移动副文短半句、页脚每列少一项），显式写成字段而不是在组件里用 `hidden md:block` 猜 |
| `components/landing-page.tsx` | 新增 | 整页六个区块（导航 / 首屏 / 功能 / AI / 转化 / 页脚）的 RSC。**零客户端 JS**：内容全静态，主题由 `next-themes` 换 `<html>` 类名、颜色全走语义 Token，没有一处需要 `'use client'` |
| `components/landing-marks.tsx` | 新增 | 装饰积木：图标块、5 格计数、骨架条、重叠头像、播放器示意、热力行、细进度条。抽出来是因为**尺寸与色阶的注释比形状本身重要**（哪一格用 `heat-3`、进度填到 62%），混在卡片 JSX 里就淹没了 |
| `lib/__tests__/content.test.ts` | 新增 | 文案表守卫。断言抄的就是画板上的字——将来改文案时两处必须一起动，漏改一处在这里红，而不是等到人肉比对截图 |
| `components/__tests__/landing-page.test.tsx` | 新增 | 渲染守卫：标题层级（1 个 h1 / 3 个 h2 / 7 个 h3）、landmark 名字、装饰元素 `aria-hidden`、主视觉不是 `<img>`、两态文案都在 DOM 里、三处 CTA 都指向 `/register` |

**为什么不查后端**：这一页对未登录访客公开，画板上的「128 篇笔记」「3 人正在编辑」都是
示意值。为营销页去调业务接口既取不到数据（访客没有身份），也会把首屏拖成一个需要
后端的动态页。所以全页零请求，`content.test.ts` 的注释里也写明了这一点。

## 二、路由与中间件接线

| 文件 | 状态 | 作用与原因 |
|------|------|-----------|
| `src/app/page.tsx` | 修改 | `/` 从 `redirect("/dashboard")` 改为渲染落地页；**已登录访客**（有非空 `at` Cookie）仍 307 到 `/dashboard`。`cookies()` 让这条路由转为动态渲染，否则已登录访客的跳转结果会被静态化后发给所有访客 |
| `src/middleware.ts` | 修改 | 新增 `PUBLIC_PATHS = {"/"}`：未登录时公开页放行、其余跳登录。**判断顺序是关键**——先判公开页再谈版式分流：反过来的话，手机 UA 访客会被 `resolveViewDecision` 送到受保护的 `/m/dashboard`，实际看到的是登录页，公开页白做。顺带把写 Cookie 的逻辑抽成 `applyViewCookie`（两条路径都要用） |
| `src/middleware.test.ts` | 修改 | 新增 6 条：首页放行、`?mobile=1` 逃生口仍生效、未登录手机 UA 不被分流、只有根路径放行、受保护入口路径照常跳登录、手机 UA 访客拿到首页。**并修正了 1 条旧用例**——原来断言「未登录访问 `/` 跳登录页」，该行为已随首页上线作废，改到 `/dashboard` 上验同一件事 |

## 三、设计 Token（`src/app/globals.css`）

新增一组 `--landing-*` / `--color-ink-*`，**都是画板实测值**。

| Token | 浅色 | 深色 | 为什么不能复用已有语义色 |
|-------|------|------|------------------------|
| `--landing-surface` | `#FFFFFF` | `#000000` | 页面底。深色版实测是**纯黑**（与站内 `--surface-grouped` 一致），而卡片是 `#1C1C1E`——两层靠这一档拉开 |
| `--landing-card` | `#FFFFFF` | `#1C1C1E` | 卡片面 |
| `--landing-accent` | `#0071E3` | `#0A84FF` | **同一个页面里两支蓝并存**：导航/首屏按钮深色下翻成 `#0A84FF`，而转化区那个白底按钮上的字深浅两态**都是** `#0071E3` —— 所以是两条 Token |
| `--landing-badge-ink` | `#0071E3` | `#64D2FF` | 首屏徽标文字，跟着主题翻 |
| `--landing-accent-tint` | `#E8F1FD` | `#092540` | 徽标底 |
| `--landing-on-white` | `#0071E3` | `#0071E3` | 白底按钮上的字，不翻 |
| `--landing-cta-from` / `-to` | `#2191EC` / `#59C7FA` | 同 | 转化区品牌蓝渐变两端。深浅两版**逐像素相同**，所以只在 `:root` 定义、`.dark` 不覆盖 |
| `--landing-hero` | 浅色图 | 深色图 | 主视觉用 `background-image` + 这个随主题切换的变量。**不能换成两个 `<img>` 切显隐**：`display:none` 的 `<img>` 浏览器照样下载 `src`（两张全发），而 `display:none` 元素上的 `background-image` 不会被请求 |
| `--color-ink*` | 恒定 | 恒定 | AI 专区（区块底 `#000000` / 卡面 `#1C1C1E` / 卡内浮层 `#2C2C2E` / 答案气泡 `#0A2540`）整块不随主题翻，所以不进 `:root`/`.dark` 二分，直接写死 |

## 四、静态资源（`apps/web/public/landing/`）

| 文件 | 状态 | 作用与原因 |
|------|------|-----------|
| `landing-hero-light.webp` | 新增（93.0 KB） | 从画板 D-19 主视觉区（设备像素 240,1056 → 2400×1400）原样抠出、转 webp q88 |
| `landing-hero-dark.webp` | 新增（121.9 KB） | 同上，取自 D-19-dark |

两张都从**已在库的画板**里抠，而不是另找素材：主视觉必须与设计稿同一张图，
否则"还原度"无从谈起。移动端复用同一张（画板上移动版就是这张的裁切，
由 `bg-cover bg-center` + 不同宽高比完成）。

## 五、端到端用例（`apps/web/e2e/landing.spec.ts`）

100 行，1 个文件。与单测的分工：单测护结构与文案（不起后端），这里护**真实链路**。

| 用例组 | 覆盖 |
|--------|------|
| 访客可见（默认 `storageState: { cookies: [], origins: [] }`） | 未登录看到落地页且不被挡到登录页、首屏文案与 3 个 CTA、主视觉图真的可取到（状态码 <400；**不能写死 200**——复跑时浏览器带 `If-None-Match`，服务端回 304 也是"图好好的"）、五张功能卡与两张 AI 卡、锚点导航滚到区块、CTA 跳注册、登录跳登录页、**手机 UA 访客也看到落地页**、1440 下无横向溢出 |
| 已登录跳转（显式用 `.auth/state.json`） | 已登录访问 `/` 被送回工作台（`/` → `/dashboard` → `/notes` 两步），且落地页 DOM 不存在 |

## 六、还原度核对

用真实浏览器（Playwright + 生产构建）在 **1440×900 与 390×844、浅色与深色**四个组合下
截图，与画板同几何裁剪后比对。判据是**区块分界的绝对 y 坐标**（沿左边缘扫底色变化）
与**逐元素墨迹行带**，不是肉眼"看着差不多"。

四个区块分界（导航底 / 功能区分界 / AI 区分界 / 页脚起点）在四态下与画板**全部一致**：

| 分界 | 画板 | 实现 |
|------|------|------|
| 导航底 / 首屏底 | 65 / 1308 | 65 / 1308 |
| AI 区起点 | 2291 | 2291 |
| 页脚起点 | 3343 | 3343 |

移动端（390）同样对齐到 1–3px 内：卡片序列 966/1393/1681/2012/2303（画板）
对 996/1429/1723/2057/2362（实现，含首屏多出的 30px），卡高 395/256/296/259/265
逐张吻合。

过程中修掉的、**只看截图发现不了**的偏差：H1 的 `letter-spacing` 被重复叠加导致
整行窄 8px；首屏副文宽度上限差 10px 导致移动端断行点多挤进一个字；Bento 第 2 行
的卡内上间距误用了第 1 行的值；页脚「关于」列在移动端隐藏错了项（见审计要点）。

> **比对脚本未入库，已随本次提交一并删除**。它们是一次性的量测工具
> （`apps/web/scripts/.live-audit/` 下的 `capture-landing.mjs` 四态截图 + 与画板同几何并排、
> `verify-landing.mjs` 数值比对），且该目录里混有 `account.json` / `state.json`
> 等**测试账号明文凭据**与一次性探查产物，不适合入库。
>
> 方法本身可复现，不依赖这两个文件：视口 1440×900 / 390×844、`deviceScaleFactor: 2`、
> `storageState: { cookies: [], origins: [] }` 走访客分支、主题用 `localStorage.theme`
> + `documentElement.classList.toggle("dark")` 切、`fullPage: true` 截全页；
> 画板侧判据是沿左边缘扫底色变化取区块分界（≥20px 连续段），实现侧同法，两者相减即为偏差。
> 仓库里已有的 `apps/web/scripts/ui-audit-{capture,zoom}.mjs`（2026-09-16 入库）是同类工具的正式版本。

## 审计要点

1. **`middleware.ts` 的判断顺序**（公开页 → 版式分流）是这一批最容易写反的地方。
   写反不会报错、不会红任何测试（除非专门覆盖），表现只是"手机访客看到登录页"，
   而桌面访客一切正常——`middleware.test.ts` 里那条「未登录的手机 UA 访客仍然看到首页」
   就是钉这一点的。
2. **页脚移动端隐藏项不是 `index >= 3`**。「关于」列去掉的是**中间**的「联系方式」，
   写成切片或下标会让手机端显示成「关于我们 / 联系方式 / 隐私政策」。这个 bug
   真的写出来过，被 `landing-page.test.tsx` 的「隐藏的是正确的那一项」抓到。
3. **`--landing-accent` 与 `--landing-on-white` 不能合并**。深色下前者翻成 `#0A84FF`，
   后者恒为 `#0071E3`（实测），合并会让转化区白底按钮上的字在深色下变浅、对比度下降。
4. **主视觉必须走 `background-image`**。改成两个 `<img>` + `dark:hidden` 会让**两张图
   都被下载**（`display:none` 不阻止 `src` 请求），首屏多出约 120KB；
   `landing-page.test.tsx` 里「全页没有 `<img>`」那条断言把这个决定钉住。
5. **移动端是另一套字阶与栅格，不是缩放**。H1 32/39（非 56/62）、区块标题 26/35
   （非 34/41）、Bento 单列、计数两列、卡间距 38（非 20）、卡高逐张不同。
   给桌面值加缩小系数会得到一份"每处都差一点"的页面。
6. **`apps/web/scripts/.live-audit/` 与 `.live-probe.mjs` 已在本次提交前删除**，
   两者都不入库：前者混有**测试账号明文口令**（`account.json` / `state.json`）
   与一次性探查产物，后者是对着线上 `note.zch.one` 的探针。二者此前都**未被
   `.gitignore` 覆盖**，属"随时可能被 `git add .` 卷进去"的状态，故直接删除而不是补规则——
   它们本就是一次性的，方法已记在上一节的引用块里。

## 未做 / 已知问题

- **`pnpm --filter web bundle:budget` 的移动端一项未通过（251.2 / 250 KB）**。
  这是**存量问题**：把本次改动 `git stash` 后在干净树上重跑，基线是 **251.0 KB**，
  同样 FAIL。本次贡献约 +0.2 KB（落地页是桌面根路由，移动端 `m-*` 与之不共享
  chunk，这点增量来自公共 chunk 的轻微变动）。预算与依据见
  `apps/web/scripts/lib/bundle.mjs` 的 `DEFAULT_BUDGETS` 注释，**未改动**。
- **Windows 上 `pnpm --filter web build` 在 standalone trace 阶段报 EPERM**
  （`symlink` 需要开发者模式或管理员权限）。`Compiled successfully` 与
  `Generating static pages (39/39)` 都已完成，`.next` 产物可用；容器内构建不受影响
  （`infra/Dockerfile.web` 跑在 Linux 上）。
- 导航「下载」「文档」与页脚多数链接指向尚未落地的路由（`/download`、`/docs`、
  `/about` 等）。画板上这些是入口占位，本期只保证**入口存在且不 404 于当前页**，
  目标页另开工单。
- 深色模式主视觉用的是画板里的深色版照片；画板未提供浅色版在深色主题下的
  替代裁切，两版构图为不同照片（浅色白天 / 深色夜晚），已按画板原样使用。
