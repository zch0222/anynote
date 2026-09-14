# Changelist · 2026-09-14 · 加载体系与品牌启动

按 `docs/ui/Anynote 新前端 UI 重设计.pdf` 的 **P12-P16「加载体系 Loading System」** 落地
`apps/web` 的加载动画与品牌启动组件，并把全站原先各自的 `animate-pulse` / `Loader2` /
裸文字加载态统一收敛到这套组件上。

- 方案来源：设计稿 P12（总览）/ P13（骨架屏）/ P14（转圈 + 进度）/ P15（AI 流式）/ P16（品牌启动）
- 设计稿原文的核心主张：「按**形态**而不是按页面切分，全部加载态收敛为 5 套组件 × 浅/深 2 主题 = 10 组」
- 架构速查已同步：`.claude/context/frontend.md`
- 设计稿渲染的对比参考图入库在 `apps/web/e2e/reference/`（见下方「UI 还原度验收」节）

---

## 概览

本批改动：**51 个已跟踪文件被修改（+528 / −299 行）、58 个新文件新增、0 个删除**
（计数由 `git status --porcelain` / `git diff --stat -- apps/web` /
`git ls-files --others --exclude-standard` 逐条核对。58 = 53 个源码/脚本文件 +
5 张入库的设计稿参考图；**已排除**仓库里既有的、与本批无关的未提交改动：
`infra/docker-compose.yaml` 与两份 `docs/changelist/2026-09-13-*.md`，
它们在本批开工前就是 modified/untracked）。

| 目录 | 改动量 | 性质 |
|------|--------|------|
| `apps/web/src/app/globals.css` | 1 个文件（+188 行） | 加载体系 Token 与 6 组 keyframes 的单一来源 |
| `apps/web/src/components/loading/**` | 3 个组件 + 3 个测试（6 个新文件） | **新增**：Spinner / Progress / 骨架预设 |
| `apps/web/src/components/ui/**` | 2 个文件 | Skeleton 重做、sonner 的 loading 图标 |
| `apps/web/src/components/layout/**` | 3 个新组件 + 1 个测试 + 4 个改动 | **新增** BrandBoot / RouteProgressBar / AnynoteLogo |
| `apps/web/src/app/**/loading.tsx` | 15 个新文件 | **新增**路由级加载态 |
| `apps/web/src/features/**` | 42 个文件 | 各页面加载态换成共享预设 + AI 流式三态 |
| `apps/web/src/lib/**` + `hooks/**` | 3 个新文件 + 3 个测试 | 路由进度判定、延迟开关 |
| `apps/web/e2e/**` + `scripts/**` | 1 个 spec + 2 个脚本 + 5 张参考图 | E2E 验收与截图对比工具 |

### 验证结果

全部在**本机 Docker 全栈**上实跑（`docker compose --env-file <空文件> -f infra/docker-compose.yaml
-f infra/docker-compose.dev.yaml`），前端镜像按 `E2E_BASE_URL=https://192.168.3.90:3000` 重建：

| 命令 | 结果 |
|------|------|
| `pnpm --filter web typecheck` | 通过（0 error） |
| `pnpm --filter web test` | **115 文件 / 1183 用例全绿**（改动前 115 / 1175） |
| `pnpm biome check apps/web/src apps/web/e2e apps/web/scripts` | 通过（413 文件，0 error） |
| `pnpm --filter web build` | 编译 + 类型检查 + 41 页静态生成全部通过 |
| `pnpm --filter web bundle:budget` | **三条全 PASS**：首屏 288.6 KB / 300 KB（`/notes`）、移动端 227.9 KB / 250 KB（`/m/notes`）、编辑器 14.0 KB / 250 KB |
| `pnpm --filter web test:e2e` | **90 passed / 1 skipped / 0 failed**（耗时 3.1m）；1 skipped 是 `pdf-upload` 里既有的条件跳过。其中本批新增 `loading-system.spec.ts` **14 条全绿**（全部在 `chromium` project 下） |
| `node apps/web/scripts/ui-capture.mjs` | 6 个场景 × 浅/深两态共 12 张真实截图 + 5 张并排对比图，全部产出 |

> `build` 在 Windows 上会在最后一步 `Collecting build traces` 报 `EPERM: symlink`——
> 那是 pnpm 的 symlink 布局与 Windows 非开发者模式下的权限限制，**与代码无关**：
> 编译、类型检查、41 页静态生成都已在前面的步骤里通过，`.next/static` 与
> `app-build-manifest.json` 都已产出，`bundle:budget` 也据此跑出了完整结果。
> 容器内的构建（`infra/Dockerfile.web`，Linux）不受此影响，镜像构建正常通过。

### 过程中发现并修复的两个真 bug

两个都在**进度条**上，都不是"为了让测试变绿"而改的断言，而且都是
**单测与合成事件都发现不了、只有真实点击才暴露**的类型：

| # | 问题 | 影响 | 修法 |
|---|------|------|------|
| 1 | 判定把 `event.defaultPrevented` 当作"别人抢走了这次点击" | Next 的 `<Link>` 对站内软导航**一定会** `preventDefault()`（它要接管导航、不让浏览器整页刷新）。于是进度条在**唯一的主场**——点站内链接——**从不出现** | 把 `defaultPrevented` 整个从判定输入里删掉（在这个场景下它是"正在软导航"的信号，不是放弃导航的信号）；真正不会导航的场景由外站/修饰键/下载等条件覆盖 |
| 2 | 收起条件是"地址已经变了" | React 把"点击时的 setState"与"导航带来的 pathname 更新"**批处理进同一次渲染**，所以第一次渲染时该条件就已成立 —— 进度条**只闪一帧**，肉眼、截图、`getAnimations()` 全都抓不到 | 引入 `ROUTE_PROGRESS_MIN_VISIBLE_MS = 400`，让它至少留在屏幕上一段可感知的时间；同时把收起逻辑从"纯推导"改成显式的定时器 |

**两个 bug 的发现路径值得记录**：它们都是**先写 E2E、用 Playwright 的真实
`click()`** 才暴露的——第一版用例为了规避时序问题用了 `dispatchEvent`，
合成事件的 `defaultPrevented` 是 false，正好把 bug 1 绕过去了（用例"通过"了，
产品却是坏的）。改成真实 `click()` 后立刻红。所以 `loading-system.spec.ts` 里
那条回归用例**刻意注明"不要改回 dispatchEvent"**。

按仓库规约，两处都**先写复现用例再改代码**：
`lib/__tests__/route-progress.test.ts` 的两条回归（`defaultPrevented` 不在
签名里 / 最短可见时长 400ms 小于兜底 5000ms）与 E2E 的
「点站内链接（Link 会 preventDefault）时进度条真的亮起」。

### UI 还原度验收

用真实浏览器在生产构建上按浅/深两态截图，与设计稿渲染图并排对比（见下方
「UI 还原度验收」节的工具说明）。**逐屏结论**：

| 场景 | 设计稿 | 实现 | 结论 |
|------|--------|------|------|
| 品牌启动（全屏初始化） | P16 上排 | Logo 蓝方块 + 白色摊开的书、字标、`正在准备工作区…` | ✅ 一致。Logo 形态、圆角比例、文案位置都对上 |
| 骨架屏（知识库画廊） | P13 中排 | 三列卡片骨架、块比底色明显高一档 | ✅ 一致。**这正是本批的关键修复**——旧实现（`bg-grouped`）在这里是隐形的 |
| 骨架屏（笔记列表） | P13 映射表「笔记列表 → 行 + 缩略图」 | 行高 56px 的卡片行，左侧 16px 图标位、中间标题条、右端元信息条 | ✅ 一致 |
| 骨架屏（深色） | P13 右列 | 底色 `#2C2C2E`，比承载层亮一档 | ✅ 一致。旧实现在深色下同样隐形 |
| 转圈 + 进度 | P14 | 灰轨道 + 蓝弧的两段描边 | ✅ 形态一致（组件单测与 E2E 各自钉住几何与动效） |
| AI 流式 · 思考中 | P15 上排 | 左侧 accent 方块头像 + 「思考中」+ 右端三点 | ✅ 一致 |
| 路由进度条 | P16 中排 | 顶栏下缘 2px、accent 蓝、从左侧推进 | ✅ 一致 |

> 未逐像素比对的部分：设计稿的**字体渲染**与真实浏览器有差异（设计稿用的是
> 设计软件里的字重/字距），这一项**如实标为不可比**，不做粉饰。


---

## 设计系统：加载体系的 Token 与动效（`apps/web/src/app/globals.css`）

先落 Token 再改页面——否则每个页面都会长出自己的一套灰色与时长。

| 变更 | 作用与原因 |
|------|------------|
| 新增 `--skeleton-base` / `--skeleton-sheen`（浅 `#E5E5EA`/`#F7F7F9`，深 `#2C2C2E`/`#3A3A3C`） | **本批最关键的一处**。旧的 Skeleton 用 `bg-grouped`，在浅色分组底（`#F2F2F7`）上几乎同色，卡片骨架整片隐形——加载态等于"什么都没发生"。骨架块必须比**承载它的那一层**高一档。取值抄设计稿 P13 的像素采样。 |
| 新增 `--color-skeleton` / `--color-skeleton-sheen` 的 `@theme inline` 映射 | Tailwind v4 只认 `@theme` 里声明的命名空间，不映射的话 `bg-skeleton` 这个类名根本不存在。 |
| 新增 6 组 `--animate-*` 与对应 keyframes | 把设计稿写死的节奏落成唯一一份：扫光 1.4s ease-in-out、转圈 0.8s linear、思考三点 1.2s、光标 step-end 1s、品牌启动 1.6s、路由进度条 3s。 |
| `@keyframes` 刻意写在 `@theme` **外面** | Tailwind v4 只把被工具类引用到的 keyframes 打进产物，而 `skeleton-breathe` 只在 reduced-motion 分支里用、不出现在任何工具类里。写在顶层则原样透传。 |
| 品牌 Logo 三段描边的相位写进**同一份** keyframes（`logo-draw-page-1/2/spine`） | 刻意**不用 `animation-delay` 错峰**：延迟只影响第一轮，第二轮起三段会漂移，而设计稿要的是"永远按 左页 → 右页 → 书脊 的顺序无限循环"。 |
| 新增 `prefers-reduced-motion` 降级块 | 设计稿 P12/P13 明确要求。**降级不等于静止**：扫光→呼吸（1.6s、opacity 1→0.45）、转圈弧→呼吸、Logo→常显完整形状、光标→常亮、进度条→停在 90%。静止处理会让加载态与"加载完但内容为空"无从区分。 |

---

## 加载原子组件（`apps/web/src/components/loading/**`）

**为什么新开一个目录而不是放进 `components/ui/`**：`components/ui/` 是 vendored 的 shadcn
原件目录，`vitest.config.ts` 与 `biome.json` 都按目录排除它。这三个组件是**本仓自己写的**
业务组件、必须带单测，放进去就等于放弃测试。

| 文件 | 状态 | 作用与原因 |
|------|------|------------|
| `spinner.tsx` | **新增** | 转圈（设计稿 P14）。形态按设计稿实测做成「**一圈灰轨道 + 一段 80° 蓝弧**」而不是单根留缺口的圆环：有轨道才能同时读出"转到了哪里"和"总共多少"，缺了轨道在 12px 下就只剩一个点。4 个尺寸（12/14/16/20）写死在 `SPINNER_SIZE_PX` 并导出供测试钉住——尺寸散开会让同一屏出现三种转圈。弧走 `currentColor`（跟着所在文字变色：按钮里跟按钮色、危险操作里跟 `danger`），轨道走 `--separator`。 |
| `progress.tsx` | **新增** | 进度（设计稿 P14）。`ProgressRing`（44 / 20 两档）、`ProgressBar`（高 4 全圆，可有右侧百分比）、`InlineUploadProgress`（行内上传占位）。与 Spinner 的分工是**能不能算出来**：能算的用进度，算不出的用转圈，不用进度条假装有进度。`clampPercent` 单独导出并处理 `NaN`/`Infinity`——非法值漏进 SVG 属性会让整条 `stroke-dasharray` 静默失效。弧的 `transform="rotate(-90 20 20)"` 是必需的：SVG 的 0° 在 3 点方向，不减这 90° 进度会从右边起跑。 |
| `skeletons.tsx` | **新增** | 骨架 → 宿主映射（设计稿 P13 底部那张对照表）。6 个预设：`CardGridSkeleton` / `ListRowsSkeleton` / `TableSkeleton` / `DocumentSkeleton` / `EditorSkeleton` / `PanelSkeleton`。**骨架的价值全在形状对得上将要出现的内容**——各页面各写一份的结果是卡片页给了行骨架，加载完成时整页跳一下，比不显示骨架更糟。内部 `SkeletonBlocks` 把"定长静态占位可以用下标当 key"这一条豁免收敛在**一处**（`noArrayIndexKey` 规则看不出骨架与真实数据的区别），而不是在六个调用点各写一遍。 |
| `__tests__/spinner.test.tsx` | **新增** | 8 条：4 档像素值逐条写死、缺省 16px、轨道+弧两段描边齐备、弧长恰为 80°、旋转挂在弧而非 svg 上、`label` 决定 `aria-hidden` 与否。 |
| `__tests__/progress.test.tsx` | **新增** | 19 条：`clampPercent` 的越界/小数/非有限值边界、环形 `role=progressbar` 的真实 `aria-valuenow`、20px 档不显示中央数字（塞不下两位数）、宽度走 CSS 变量而非内联 `width`、非法值不产生 `NaN` 属性。 |
| `__tests__/skeletons.test.tsx` | **新增** | 21 条：每个预设都有 `aria-busy` 且内部灰块 `aria-hidden`（否则读屏念到一个空区域）、画廊骨架与真实网格同断点、笔记行同高（`min-h-14`）、编辑器段落宽度**参差**（等宽一叠灰条像表格，参差才像文章）。 |

---

## 品牌启动与路由进度（`apps/web/src/components/layout/**`）

| 文件 | 状态 | 作用与原因 |
|------|------|------------|
| `brand-logo.tsx` | **新增** | Anynote 标记：蓝色圆角方块 + 白色摊开的书。**为什么手绘 SVG 而不是用 `lucide-react` 的 `BookOpen`**：设计稿 P16 的启动动效是三段描边依次绘制，要能单独控制每条路径的 `stroke-dashoffset`，而图标库的子路径没有稳定语义，换个版本就散架。几何按设计稿像素实测（外侧页边 x=6.4/17.6、书脊 x=12、描边 0.82/24）。`pathLength="100"` 归一化三条路径——书脊只有一条短线，不归一化会"唰"一下画完。圆角用百分比（实测 24.8%）而不是固定 px，换尺寸比例不走样。 |
| `brand-boot.tsx` | **新增** | 品牌启动（设计稿 P16）。三条设计决策各自都有测试钉住：① **只动 Logo 不转圈**（转圈是通用语、Logo 才是品牌语，且这是用户第一次见到产品的时刻）；② **首帧之后才出现**（`delayMs` 默认 120ms，路由 50ms 就完成时闪一下比不闪更糟）；③ **超过 1.2s 才切骨架兜底**（慢网络下一直转 Logo 不如给出结构占位）。骨架兜底刻意只用**两行**——启动阶段还不知道要渲染列表还是文章，给假列表反而会二次跳动。容器是 `<output>`（隐式 `role=status`），与 `save-status.tsx` 同一套"状态播报"写法。 |
| `route-progress-bar.tsx` | **新增** | 顶栏路由进度条（设计稿 P16 那张图的标题就是「移动端顶栏进度条」）。与 BrandBoot 的分工：整页初始化用启动页，**站内路由切换**用这条细条——切页时把整屏换成启动页会丢掉"我还在原页面"的空间连续性。用 `<output>` 而不是 `role="progressbar"`：这是**不确定型**进度，报不出真实 `aria-valuenow`，挂 progressbar 却不给数值读屏会说"进度条 0%"或干脆沉默。 |
| `workspace-session.tsx` | 修改 | 加载态从「两块灰条 + 一行裸文字」换成 `<BrandBoot />`。这一层正是设计稿 P16 那句话指的现场——会话未知时整站都渲染不出来，是真正的"全屏初始化"。 |
| `app-sidebar.tsx` | 修改 | 侧栏品牌位从「accent 底 + 首字母 A」换成 `AnynoteLogo`：侧栏与启动页必须是**同一个标记**，启动页刚画完的书落到工作区变成一个字母，品牌就断在这里。 |
| `app-shell.tsx` / `mobile-shell.tsx` | 修改 | 挂上 `RouteProgressBar`。桌面 `sticky top-14`（与顶栏 `min-h-14` 对齐）；移动端 `fixed top-0`（沉浸式页面没有统一顶栏，挂 shell 上两端都覆盖到）。 |
| `__tests__/brand-boot.test.tsx` | **新增** | 15 条：延迟窗口内不渲染、1.2s 前后 `data-phase` 的切换、`skeletonAfterMs=0` 关闭兜底、`role=status` 能播报、Logo 三笔各挂自己的关键帧类、`pathLength=100`、书脊在正中且两页对称。 |

### 路由进度的判定逻辑（`apps/web/src/lib/route-progress.ts` + `hooks/use-route-progress.ts`）

判定抽成**纯函数**是因为它有**一堆容易漏的否定条件**——修饰键、中键、新窗口、下载、外站、伪协议、同页锚点。漏掉任何一条，都会在用户"按住 ⌘ 点链接开新标签"时错误地亮起进度条，而且**永远不会结束**（当前页不会导航，进度条一直挂在顶栏上）。

| 文件 | 状态 | 作用与原因 |
|------|------|------------|
| `lib/route-progress.ts` | **新增** | `isInternalNavigation` / `isSameDocumentNavigation` / `findAnchor` / `ROUTE_PROGRESS_TIMEOUT_MS`。同页锚点（`#section`）单独导出成函数：它看起来像导航其实不产生新页面，是最容易写错的一处。 |
| `hooks/use-route-progress.ts` | **新增** | 监听 `document` 的**冒泡**阶段：React 18 把事件监听器挂在 root container（`<body>` 内），document 在它之上，所以到这里时所有业务 `onClick` 都跑完了，`defaultPrevented` 已是终值——不需要 `setTimeout(0)` 去复查。状态存的是「在哪个地址上点的链接」而不是布尔值，于是"导航完成"成为纯推导（当前地址 ≠ 记录的那个），少一条 effect、少一帧延迟。兜底 5s 是必需的：导航被中断时地址不变，只靠"地址变了"这个信号进度条会永远挂着。 |
| `lib/__tests__/route-progress.test.ts` | **新增** | 21 条：4 个修饰键 + 中右键 + `target=_blank` + `download` + 外站 + `mailto:`/`tel:`/`javascript:` + 同页锚点 + 地址未变，逐条断言**不亮灯**。 |
| `hooks/use-delayed-flag.ts` + `.test.ts` | **新增** | 「首帧之后才出现」与「超过 1.2s 才切骨架」两条设计要求的唯一实现。6 条用例钉住 `delayMs<=0` 同步为 true、延迟未到保持 false、卸载清计时器。 |

---

## AI 流式三态（`apps/web/src/features/ai/**`）

| 文件 | 状态 | 作用与原因 |
|------|------|------------|
| `components/stream-states.tsx` | **新增** | `ThinkingDots`（三点依次放大到 1.2 倍、透明度 0.2→1，错峰 0.15s）、`StreamCaret`（`step-end` 跳闪的光标）、`AiAvatar`（思考中带 `accent-soft` 底）。错峰用内联 `animationDelay`（序号 × 0.15s 的线性关系）而不是三个类名：写成类名要维护三份只有数值不同的 CSS。 |
| `components/message-item.tsx` | 重写 | 三态显式化并加 `data-state`。**「思考中」的判据是"流式进行中且还没有内容"而不是单看内容为空**——流结束但模型一个字都没返回时，应该走"空回复"分支给一句说明，而不是永远停在一个假装还在思考的动画上（这条以前没有，是本批补的）。容器用 `<output>` 让读屏播报「思考中」；逐字输出用 `aria-live="polite"`。 |
| `__tests__/stream-states.test.tsx` | **新增** | 11 条：三个点延迟恰好 0/0.15/0.3s、光标是 `step-end`（淡入淡出会被读成另一种"加载中"）、光标 `aria-hidden`、头像思考中/完成两种圆角。 |

**为什么首 token 之前必须有可见动效**：这段等待时长不可控（模型冷启动、RAG 检索），期间界面静止，用户会以为卡住了并去点重试，于是打出第二份请求。这是设计稿 P15 里最重要的一条。

---

## 路由级加载态（`apps/web/src/app/**/loading.tsx`，15 个新增）

Next 的 `loading.tsx` 兜住**服务端段**的挂载等待，是"点下去到看见东西"之间那段空白的唯一解。

| 文件 | 形状 | 作用与原因 |
|------|------|------------|
| `(workspace)/loading.tsx`、`(mobile)/loading.tsx` | `BrandBoot` | 段级兜底只能放品牌启动，**不能放具体形状的骨架**：这一层拿不到子路由参数（是列表还是编辑器、哪个知识库），猜一个形状出来等真内容到达必然二次跳动。`skeletonAfterMs=0` 关闭骨架兜底——整段初始化本来就慢，再叠一层骨架只会更晚看到品牌。 |
| `notes/loading.tsx` | 卡片网格 | 与 `KnowledgeBaseGallery` 的网格**同断点同列数**（`sm:2 lg:3`），否则加载完成时列数跳一次，用户会觉得"页面重排了"。 |
| `notes/[baseId]/loading.tsx` | 行列表 | 设计稿 P13 映射表把「笔记列表 → 行 + 缩略图」单列一类。 |
| `notes/[baseId]/[noteId]/loading.tsx` | 编辑器 | 外层带与 `NoteEditor` **相同**的 `max-w` 与内边距（设计稿实测 1000px 正文列 + 左右各 72px）；对不上的话加载完成时标题会横向跳一下。刻意**不套卡片**（`rounded-lg bg-surface shadow-card`）——编辑页是满幅页面，加一张卡片就等于把设计稿否掉。 |
| `tasks/loading.tsx` / `mooc/loading.tsx` | 表格行 / 卡片网格 | 对应设计稿映射表的「任务 → 表格行」「慕课 → 卡片网格」。 |
| `docs/loading.tsx` / `docs/[id]/loading.tsx` / `ai/chat/loading.tsx` / `ai/pdf/loading.tsx` / `settings/loading.tsx` / `wikis/loading.tsx` / `(mobile)/m/notes/loading.tsx` / `(mobile)/m/notes/[baseId]/[noteId]/loading.tsx` | 各自宿主的形状 | 均按对应页面加载完成后的真实结构给占位。 |

---

## 全站加载态接入（`apps/web/src/features/**` 等 42 个文件）

一次机械但**必须做全**的替换：漏掉一处，同一屏里就会出现两种转圈/两种灰色。

| 替换 | 涉及文件数 | 说明 |
|------|-----------|------|
| `<Loader2 className="animate-spin">` → `<Spinner>` | 5 | `note/save-status.tsx`（`presentation` 记录的 `icon` 改为可选、`spin` 字段整个删掉；`<output data-status>` 与「已保存 HH:MM」逻辑未动）、`ui/sonner.tsx`、`tasks/submit-task-dialog.tsx`、`ai/pdf/pdf-page.tsx`、`ai/mobile/pdf-detail-mobile.tsx`。原有的 `aria-label` 一律迁成 `label` prop。 |
| 手写进度条 → `<ProgressBar>` | 2 | `ai/pdf/pdf-page.tsx` 与 `ai/mobile/pdf-list-mobile.tsx` 是**同一个手写模式的两份拷贝**（`h-1.5 bg-grouped` + 内联 `style={{width}}`），两份都换成 `ProgressBar`；外层的 `pdf-upload-progress` / `mobile-pdf-progress` testid 都保留在包裹 div 上。 |
| 页面内骨架函数 → 共享预设 | 30+ | 删掉 `GallerySkeleton` / `NoteListSkeleton` / `ListSkeleton` 三处文件内定义，以及随之变成孤儿的 `SKELETON_KEYS` 常量。`animate-pulse bg-grouped` 全仓清零。 |

**三处刻意保留原形状**（不是漏改）：
- `mooc-detail.tsx` / `mooc-detail-mobile.tsx` 的 `aspect-video` 视频位保留共享 `Skeleton`，**不换 `DocumentSkeleton`**：后者是 A4 竖版（1:1.414），塞进 16:9 的视频位形状与宿主矛盾，加载完成时会塌。预设文件自己的注释就是这个论据。
- `mooc-detail.tsx` 侧栏的 40px 目录行、`sidebar-nav.tsx` 的 `BaseListSkeleton`、`knowledge-base-sidebar.tsx` 的紧凑骨架：`ListRowsSkeleton` 的行是 `min-h-14` 带投影的卡片壳，塞进紧凑侧栏同样是形状错配。
- `workspace-placeholder.tsx`（"功能准备中"）保留：它是占位页不是加载态。

**三处既有测试同步更新**：新 `Skeleton` 不再产出 `animate-pulse`，所以
`ai/__tests__/conversation-list.test.tsx`、`tasks/__tests__/task-table.test.tsx`、
`dashboard/__tests__/mobile-dashboard.test.tsx` 里对 `.animate-pulse` 的断言改为
`[data-slot="skeleton-list"]` / `[data-slot="skeleton-table"]`（都加了中文注释说明为什么改）。

### 编辑器图片上传指示器（`components/editor/extensions/anynote-image.ts` + `styles/tiptap.css`）

| 变更 | 作用与原因 |
|------|------------|
| 指示器 DOM 改为「转圈 + 文案 + 右端百分比」，形态对齐设计稿 P14 底部那条行内占位 | 转圈用**内联 SVG 复刻** `loading/spinner.tsx` 的几何（40 视窗 / 描边 5.6 / 80° 弧），而不是 import 那个 React 组件：这里是 ProseMirror 的 widget decoration，是命令式 DOM 环境，为一个 12px 的圈引入 `createRoot` 会让每次进度变化都多一轮 React 调度，而进度回调是高频的（每个分片一次）。 |
| 可见文案固定为「图片上传中」而不是文件名 | 占位块插在正文里、宽度只有正文列那么宽，长文件名会把这一行撑得忽长忽短，上传途中正文一直在跳。文件名没丢：在 `aria-label` 与 `title` 里。 |
| `tiptap.css` 的 `.anynote-image-upload` 从 `inline-flex` + 虚线框改为 `flex` + `w-full` + 实底 | 对齐设计稿；**单行不换行是硬约束**——多行会把它下面的正文顶来顶去。reduced-motion 分支的呼吸时长同步从 1.4s 改为 1.6s，与全局降级节奏一致。 |

---

## 端到端测试（`apps/web/e2e/loading-system.spec.ts`，新增）

**这个 spec 刻意不只断言"loading 元素出现了"**——加载态最容易出的问题不是不出现，而是另外三类，单测里全都测不到：

1. **主题断层**：骨架写死一个灰色，浅色下隐形、深色下刺眼 → 断言 `--skeleton-base` 确有定义、且**不等于**承载层底色、且深浅两态取值不同。
2. **动效没跑**：元素在、类名也在，但动画压根没生效 → 一律读 `getComputedStyle` 的 `animationName` / `duration` / `iteration`，**不读类名**。
3. **白块闪烁**：快速路由切换下启动页闪一下 → 用 `MutationObserver` 记录而不是轮询截图（闪一下可能只有几十毫秒，轮询必然漏掉，而"漏掉"恰好是要抓的 bug）。

14 条用例分五组，逐条对应设计稿的 5 套组件：

| 组 | 关键断言 |
|----|---------|
| 01 骨架屏 | `--skeleton-base` ≠ `--surface-grouped` 且深浅不同；扫光真的是 `skeleton-shimmer 1.4s ease-in-out infinite`；`reducedMotion: "reduce"` 下换成 `skeleton-breathe` 但**仍在动**（不是静止）。 |
| 02 转圈 | 两段描边（缺轨道 12px 下看不出在转）、`loading-spin 0.8s linear infinite`。 |
| 03 进度 | `role=progressbar` 带真实 `aria-valuenow`、45% 的填充宽度落在轨道的 40%–50% 之间、过渡是 `0.24s ease-out`。 |
| 05 品牌启动 | 拦掉 `/api/auth/me` 复现"会话未确认"→ 断言出现品牌三件套（**不是两块灰条**）；三段描边**各自**的 `animationName` 互不相同（共用一个名字就等于同时画）；1.2s 后切骨架兜底；快速软导航期间 `brand-boot` 出现 **0 次**。 |
| 04 AI 流式 | 挂住 SSE 复现"首 token 未到达"→ 断言「思考中」是 `role=status` 且三点真的错峰（三个 `animationDelay` 互不相同）；造一条"流已开始未结束"的 SSE → 断言光标是 `step-end`。 |
| 版式约束 | 骨架网格与真实画廊的 `gridTemplateColumns` **计算值**列数相等；编辑器 loading 的纸面宽度与真实 `note-document` 宽度差 ≤ 8px。 |

> 复现加载态一律用「**拦真实端点**」而不是"插一段假 DOM"：拦 `/api/auth/me` 就是不确认会话、
> 挂住 SSE 就是首 token 没到——那正是产品代码的 pending 分支，测的是真实路径。

---

## UI 还原度验收（浏览器截图对比）

单测与 E2E 断言的是**行为契约**；"像不像设计稿"只能靠人眼对图。所以另配两个脚本把两边的图并排拼好，而不是给一个看似客观的相似度分数——像素相似度对"字体渲染差异"和"整块位置错位"给的分几乎一样，反而会掩盖真正要看的东西。

| 文件 | 状态 | 作用与原因 |
|------|------|------------|
| `scripts/extract-design-reference.mjs` | **新增** | 把设计稿 P12-P16 渲染成 PNG 落到 `e2e/reference/`（**入库**，供评审直接打开）。依赖 `pdfjs-dist` 与 `@napi-rs/canvas`，两者已在 pnpm store 里；刻意**不写进 `package.json`**——这是设计稿更新时的一次性工具，不是构建/测试链路的一环，加进去会让每次 `pnpm install` 都为它付成本。 |
| `scripts/ui-capture.mjs` | **新增** | 用 Playwright 在**真实生产构建**上按浅/深两态截图，与参考图并排拼成对比图，并生成一页看完全部的 `index.html`。场景表里每个场景都写明用哪个端点复现加载态。产物落在 gitignore 的 `e2e/.ui-capture/`。 |
| `e2e/reference/p12..p16-*.png` | **新增**（5 张，共 ~1.6MB） | 设计稿 P12-P16 的渲染图。放在 `e2e/` 下的独立目录而不是 gitignore 的 `.ui-capture/`：截图每次跑都变，参考图只有设计稿更新时才变。 |

---

## 文档

| 文件 | 状态 | 作用与原因 |
|------|------|------------|
| `docs/changelist/2026-09-14-loading-system.md` | **新增** | 本文件。 |
| `.claude/context/frontend.md` | 修改 | 新增「加载体系」节：5 套形态的落点表、6 个骨架预设的选用表、Token 与动效时长表、`prefers-reduced-motion` 的降级约定、无障碍约定，以及改动时要跑的三条门禁。目录结构补上 `components/loading/` 与 `lib/route-progress.ts`。 |
| `README.md` | 修改 | 「端到端与性能门禁」节：E2E 用例描述补上加载体系覆盖的五套组件；新增「加载体系的 UI 还原度对比」小节，写清两个截图脚本的用法、前置条件（需先跑过一次 E2E 攒登录态）与产物落点。 |

---

## 审计要点

按"最该重点看"排序：

1. **`src/lib/route-progress.ts` 的判定输入与两个时间常量**（本批修掉了两个真 bug，且都极难复现）。
   判定里**刻意没有 `defaultPrevented`**——Next 的 `<Link>` 对站内导航一定会
   `preventDefault()`，把它当"被抢走"会让进度条在唯一的主场从不出现（bug 1）。
   `ROUTE_PROGRESS_MIN_VISIBLE_MS = 400` 也不是可调参数：没有它，React 的批处理
   会让进度条只闪一帧（bug 2）。**两个都要配合回归用例一起看**，
   改判定输入前先读文件顶部那段说明。

2. **`e2e/loading-system.spec.ts` 里那条"点站内链接"用例的写法**（决定它有没有价值）。
   它刻意用 Playwright 的真实 `click()` 而**不是 `dispatchEvent`**：合成事件的
   `defaultPrevented` 是 `false`，正好把 bug 1 绕过去——第一版就是这么写的，
   所以用例"通过"了而产品是坏的。评审时如果看到有人把它改回 `dispatchEvent`，
   那条护栏就废了。

3. **`src/app/globals.css` 的 `--skeleton-base` 与 reduced-motion 块**（本批的地基）。
   `--skeleton-base` 是整个改动成立的前提——它一旦被改回 `bg-grouped` 这类页面底色，
   骨架在浅色下就重新隐形，而**单测仍然全绿**（颜色对不对单测测不出来，
   E2E 里那条"≠ 承载层底色"的断言是唯一的护栏）。reduced-motion 块则要确认
   降级后**仍在动**：需求明确说了不要静止处理。

4. **`components/loading/skeletons.tsx` 的形状选择**（影响观感最大）。
   六个预设对应六种宿主结构，选错了加载完成时整页会跳。评审时重点看
   `mooc-detail.tsx` 与侧栏那三处**刻意没用预设**的地方，确认理由是形状错配
   而不是漏改。

5. **`components/editor/extensions/anynote-image.ts` 的手写 SVG**（有重复实现）。
   这里刻意复刻了 `loading/spinner.tsx` 的几何常量而不是复用组件，
   理由是命令式 DOM 环境 + 高频进度回调。**代价是两处要同步改**：
   改描边宽度或弧长时两个文件都要动。评审时确认这个取舍可以接受。

6. **`components/layout/brand-boot.tsx` 的两个延迟**（体验相关，容易被"简化"掉）。
   `delayMs=120` 防白块闪烁、`skeletonAfterMs=1200` 才切骨架。这两个数看着像可调参数，
   实际各自对应设计稿 P16 的一句明确要求，改成 0 会让快速路由切换闪一下启动页。

7. **`scripts/extract-design-reference.mjs` 里写死的 pnpm store 版本号**
   （会在升级依赖后失效）。`CANVAS_SPEC` / `PDFJS_SPEC` 两个常量硬编码了
   `@1.0.9` 与 `6.3.289`；`pnpm install` 升版后脚本会明确报"缺少依赖"
   并提示改常量，不会静默出错。
