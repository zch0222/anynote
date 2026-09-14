# 笔记编辑器满幅化与 Token 静默失效修复

- **日期**：2026-09-14
- **分支**：`fix/editor-fullbleed-tokens` → `dev`
- **上一批**：`docs/changelist/2026-09-14-ui-fidelity.md`（对齐设计稿逐页截图比对）
- **设计依据**：`docs/ui/Anynote 新前端 UI 重设计.pdf` 第 4 / 6 页（桌面编辑器 浅/深）
- **触发问题**：笔记编辑页的编辑器仍是一张独立卡片而非占满剩余空间；代码块在浅色与深色下都没有底色与边框

## 概览

上一批把配色与版式对齐了设计稿，但**编辑器仍是"灰底上浮着的一张白卡片"**，
且**代码块的样式在明暗两态下都完全不生效**。本批用真实浏览器截图定位这两个问题。

第二个问题的根因是**一整类静默失效**：`src/styles/tiptap.css` 长期使用 shadcn v3
时代的变量名（`--muted` / `--border` / `--card` / `--radius` / `--foreground` …），
而本套设计系统从建立之初用的就是另一套语义名（`--separator` / `--surface-block` /
`--label-primary` …）。**CSS 对未定义的 `var()` 不报错、不回退**，只让整条声明失效
（invalid at computed-value time）——于是代码块的 `background-color`、`border`、
`border-radius` 三条一起作废，退化成一段裸文字，**而构建、typecheck、单测、E2E 全绿**。
本批除了修掉这 16 处引用，还补了 `scripts/check-css-tokens.mjs` 把这一类问题变成可执行的门禁。

| 项目 | 数量 |
|------|------|
| 新增文件 | 6（含本清单） |
| 修改文件 | 18 |
| 删除文件 | 0 |
| 增 / 删行数 | +581 / −153（已跟踪文件；新增文件另有 439 行） |

按目录分布：`apps/web/src/styles/**`（3 个）、`apps/web/src/components/layout/**`（5 个）、
`apps/web/src/components/editor/**`（1 个）、`apps/web/src/components/ui/**`（3 个）、
`apps/web/src/features/notes/**`（2 个）、`apps/web/src/app/**`（2 个）、
`apps/web/scripts/**`（3 个）、`apps/web/e2e/**`（4 个）、`apps/web/package.json`（1 个）。

### 验证结果

| 命令 | 结果 |
|------|------|
| `pnpm --filter web test` | **108 文件 / 1089 用例全绿**（本批起点 1083） |
| `pnpm --filter web test:e2e`（chromium） | **44 passed / 0 failed / 1 skipped**，跑在本机 Docker 全栈上 |
| `pnpm --filter web test:e2e`（mobile） | **32 passed / 0 failed** |
| `pnpm --filter web typecheck` | 0 error |
| `pnpm check`（Biome） | 500 文件 clean |
| `pnpm --filter web check:css-tokens` | 通过：45 个被引用的自定义属性全部有定义（修复前 16 个未定义） |
| `pnpm --filter web bundle:budget` | 三条全 PASS：`/notes` **285.7** / 300 KB、`/m/notes` **224.8** / 250 KB、编辑器 chunk **13.7** / 250 KB |
| `pnpm --filter web lighthouse:budget` | 全 PASS：`/login` 100 · `/dashboard`→`/notes` 99 · `/notes` 99 · `/docs` 99 · `/ai/chat` 99，无障碍均 96 |
| `pnpm --filter web lighthouse:budget:mobile` | **4/5 PASS**，`/m/dashboard` FAIL（80 / 门槛 85）——**既有问题**，见「审计要点」 |
| `docker compose build anynote-web` | 成功（`pnpm install --frozen-lockfile` 通过，lockfile 无漂移） |
| 真实浏览器截图 | 1440×900 @2x 下逐项量取计算样式，两态各一张，见下方各章 |

## 一、代码块与设计 Token（本批的根因所在）

问题表现：代码块在浅色与深色下都是"没有底色、没有边框、没有圆角"的一段裸文字。
真实浏览器实测（修复前）：`.anynote-code-block` 的计算样式为
`bg=rgba(0,0,0,0)`、`border=0px none`、`radius=0px`；`pre` 的文字色落到
`oklch(0.371 0 0)`——即 **`prose` 的颜色赢了**，正是"全局样式污染编辑器"。

| 文件 | 状态 | 作用与原因 |
|------|------|-----------|
| `apps/web/src/styles/tiptap.css` | 修改 | 把 10 处 shadcn v3 变量名全部换成设计系统真实存在的 Token（`--separator` / `--surface-block` / `--label-secondary` / `--accent-tint` / `--radius-md` …），代码块这才第一次拿到底色、发丝边与圆角。同时**移除对 `prose` 的全部"复位"规则**：编辑器不再加载 `prose`（见下条），那些 `code::before { content: none }` 之类的对抗性覆盖已无对手。新增「正文排版」一节，自己接管 h1–h3 / 列表 / 引用 / 表格 / 链接的字阶，取值走 `--text-*` 语义 Token（与设计稿 Display 34/41、Title 22/28、Body 15/24 对齐）。 |
| `apps/web/src/components/editor/core/tiptap-editor.tsx` | 修改 | 正文类名去掉 `prose prose-neutral dark:prose-invert`。prose 是给"整页 Markdown 文档"用的：它给 `pre` 套深色底、给行内 code 加反引号伪元素、接管表格与引用边框，与编辑器自己的节点样式正面冲突；此前的做法是"用更高特异度一条条复写回来"，那要求每次都赌对两个样式表的加载顺序，而加载顺序由构建决定。另新增 `flush` 属性：正文不自带内边距，把留白交给页面（笔记页的正文列自带 `px-*`，再叠一层会让标题比正文多缩进一截）。 |
| `apps/web/src/app/globals.css` | 修改 | ① 新增 `--surface-block`（浅 `#f7f7f9` / 深 `#1c1c1e`）与 `--color-block` 工具类名——正文块级浅底（代码块 / 行内代码 / 引用 / 上传占位）需要独立一档：它在浅色下等于侧栏色、深色下等于分组色，复用任何一个都会在另一态错位。② 移除 `@plugin "@tailwindcss/typography"`（全仓已无 `prose` 使用）。 |
| `apps/web/scripts/lib/css-tokens.mjs` | 新增 | Token 引用审计的判定逻辑：`collectDefinitions` / `collectReferences` / `analyzeTokenReferences` / `formatReport`，外加与脚本共用的 `collectEntries` / `auditAppTokens` 读盘入口。口径刻意放宽到"全仓任何文件定义过就算数"——要抓的是"这个名字谁都没写过"这类外来词，不是级联作用域分析。`--tw-*` / `--default-*` 与 next/font、Shiki、Base UI 运行时注入的变量走显式白名单，每条都注明谁注入。 |
| `apps/web/scripts/lib/__tests__/css-tokens.test.mjs` | 新增 | 10 条单测钉住判定边界：定义/引用的两种写法（CSS 声明与 JSX style 对象，含 `["--x" as string]:` 断言写法）、带 fallback 的 `var()`、跨文件定义即算有定义、抓出外来 Token 并报出引用文件、放行框架命名空间、**不放行 `--color-*`**（那是我们自己声明的语义映射，写错名字要能被抓到）。 |
| `apps/web/scripts/check-css-tokens.mjs` | 新增 | 门禁的可执行外壳，退出码 1 表示存在未定义引用。扫 `src` 与 `scripts` 下 270+ 个文件，**跳过测试文件**——单测里必然出现刻意编造的变量名，把它们当真实引用会让门禁永远红着，最后只能靠往白名单里塞绕过。 |
| `apps/web/package.json` | 修改 | 新增 `check:css-tokens` 脚本，让门禁可被发现、可被 CI 直接调用。 |
| `apps/web/src/styles/__tests__/editor-styles.test.ts` | 新增 | 11 条回归用例。最关键的一条走 `auditAppTokens`（**与命令行同一份口径**，避免"命令扫 273 个文件、单测只读 3 个"的假绿），断言全仓未定义 Token 为空；其余钉住代码块容器确实拿到 `background-color` / `border` / `border-radius` 且引用的 Token 在浅深两态都有取值，以及 `globals.css` 不再加载 typography、编辑器容器不设边框圆角底色、`data-flush` 规则存在。 |

## 二、编辑器满幅化

问题表现：满幅内容区里浮着一张白卡片。真实浏览器实测（修复前）：
`note-panel` 为 `x=288 y=56 w=1120 h=756`、`bg=rgb(255,255,255)`、`radius=14px`，
而 body 底色 `rgb(242,242,247)` 从四周透出来。
设计稿实测（p04/p06，1440×900）：内容区 `x 296→1439.5` 是**一整块连续底色**，
顶栏下方只有一条 1px 分隔线（CSS `y=53`，横跨 `x 297→1438.5`），**没有卡片、没有圆角、没有投影**。

| 文件 | 状态 | 作用与原因 |
|------|------|-----------|
| `apps/web/src/features/notes/components/note-editor.tsx` | 修改 | ① 面板去掉 `rounded-lg bg-surface shadow-card`，只保留 `flex-1 + min-h-0` 吃满剩余高度。② 顶层不再用 `h-[calc(100svh-9rem)]` 猜高度（页头高度一变就露出底色），改由外层 flex 决定。③ 顶栏的内边距从 `<header>` 挪到内容上，分隔线才能铺满整列（设计稿那条线是 `x 297→1438.5`，跟着内边距缩进去就不对了）。④ 正文列按设计稿实测改为**恰好 1000px、左右各 72px**：判据取元信息行底下那条分隔线（它铺满整列，量到的是列宽本身，而不是某一行文字恰好断在哪里）。⑤ 传 `flush` 给编辑器，避免标题与正文缩进不一致。 |
| `apps/web/src/components/layout/app-shell.tsx` | 修改 | 内容区按路由分两种形态：满幅路由（`isFullBleedRoute`）不加内边距，并给整列 `h-svh + overflow-hidden + bg-surface`。**这三条缺一不可**：`SidebarProvider` 的 wrapper 只有 `min-h-svh`（高度由内容决定），一路 `flex-1` 下去拿到的都是"内容多高就多高"，长文会把整页顶长、`note-scroll` 永远不产生内部滚动条——这一条是先被 E2E 抓出来后补上的（见「审计要点」）。 |
| `apps/web/src/components/layout/navigation.ts` | 修改 | 新增纯函数 `isFullBleedRoute`：只有 `/notes/<baseId>/<noteId>`（两段纯数字）满幅。必须按**数字段**判定——`/notes/7/overview`、`/notes/7/members` 这些二级页是普通文档流页面，仍要有留白；`/notes/new` 也不能被误判成编辑器。 |
| `apps/web/src/app/layout.tsx` | 修改 | 字体变量类名从 `<body>` 挪到 `<html>`。`globals.css` 的 base 层在 `html` 上求值 `font-family: var(--font-geist-sans), …`，而 next/font 生成的变量只定义在挂类名的那个元素上；挂在 `<body>` 时 `<html>` 上这个变量是空的，`var()` 解析失败会让**整条 `font-family` 声明失效**，全站退回浏览器默认字体。与代码块是同一类静默失效。 |

## 三、其余同类 Token 失效

追查过程中用 `audit-vars.mjs` 全仓扫出 16 处未定义引用，除 `tiptap.css` 的 10 处外还有 3 个文件。
它们与代码块是同一个病，一并修掉；不改的话门禁过不去，而门禁白名单一旦开口子就废了。

| 文件 | 状态 | 作用与原因 |
|------|------|-----------|
| `apps/web/src/styles/mobile.css` | 修改 | `border-top: 1px solid var(--border)` → `var(--separator)`。移动端贴底工具条的上边线此前不生效。 |
| `apps/web/src/components/ui/sonner.tsx` | 修改 | sonner 的 4 个 CSS 变量右侧原本是 `--popover` / `--popover-foreground` / `--border` / `--radius`，本仓从未定义过，于是 toast 拿不到底色与圆角。改为 `--surface-elevated` / `--label-primary` / `--separator` / `--radius-md`，并注明左边是 sonner 自己的契约名、右边必须是本设计系统的 Token。 |
| `apps/web/src/components/ui/input-group.tsx` | 修改 | 3 处 `calc(var(--radius) - 5px)` / `- 3px` → `var(--radius-md)`。`--radius` 不存在，整条 `border-radius` 作废。 |
| `apps/web/src/components/ui/sidebar.tsx` | 修改 | 任意值写法 `shadow-[0_0_0_1px_var(--sidebar-border)]` 里的 `--sidebar-border` / `--sidebar-accent` 并不存在——`[...]` 任意值**不经过** `@theme` 解析，不能把 `@theme` 条目名去掉 `--color-` 前缀就当变量用（同文件里的 `bg-sidebar-accent` 这类**具名**工具类是可以的，构建产物证明它被编译成了 `var(--accent-tint)`）。改为 `--separator` / `--accent-tint`。 |

## 四、测试

| 文件 | 状态 | 作用与原因 |
|------|------|-----------|
| `apps/web/src/features/notes/components/__tests__/note-editor.test.tsx` | 修改 | 原本断言 `shell.className` 含 `h-[calc(100svh-9rem)]`——那正是本批要废弃的写法，改断言 `flex-1 + min-h-0` 且不含 `100svh`。新增"编辑面板不画卡片"（不含 `rounded` / `shadow`）与"编辑器按 flush 接线"。 |
| `apps/web/src/components/layout/__tests__/app-shell.test.tsx` | 修改 | 新增 3 条：满幅路由的内容区不留内边距且是确定高度的 flex 列、其它路由仍保留 `px-5 pb-5 sm:px-8`、满幅页面把内容列底色换成卡片白。 |
| `apps/web/src/components/layout/__tests__/navigation.test.ts` | 修改 | 新增 `isFullBleedRoute` 的 3 条边界：只有两段纯数字满幅、列表页与二级页不满幅、不接受非数字或尾随段。 |
| `apps/web/e2e/ui-redesign.spec.ts` | 修改 | 正文列宽上限按设计稿实测从 820 改为 1010（1000px 列 + 取整容差）。新增"笔记编辑器满幅铺满内容区，不是浮在灰底上的一张卡片"：量面板与内容区同宽同起点、圆角为 `0px`、投影为 `none`、面板底色与所在内容列一致。 |
| `apps/web/e2e/notes.spec.ts` | 修改 | 新增代码块用例，在真实编辑器里建块后**跨浅深两态各量一次计算样式**，断言底色/边框/圆角都真的落了值且两态取值不同——只看类名或 DOM 结构的话，上面那种静默失效照样能通过。行内代码用例补断言芯片底色与圆角，保留反引号伪元素断言（"哪天有人把 prose 加回来"正是最可能的回归方式）。 |
| `apps/web/e2e/support/theme.ts` | 新增 | 把 `setTheme` 从 `theme.spec.ts` 提出来共用。`notes.spec.ts` 的代码块用例要跨两态各量一次，复制一份 helper 迟早漂移。含"必须等菜单完全收起再开下一次"的既知节奏坑说明。 |
| `apps/web/e2e/theme.spec.ts` | 修改 | 删掉本文件里重复的 `setTheme` 定义（改用 support 共用件）。本批一度在此新增过代码块用例，后移到 `notes.spec.ts`——那边复用已有笔记，不必新建。 |

## 审计要点

1. **`tiptap.css` 是整批的核心**，值得逐条看。改动最大的 171 行里有三类内容：
   变量名替换、`prose` 复位规则的删除、新增的「正文排版」一节（原本由 prose 提供）。
   第三类最需要确认——去掉了 prose 就等于自己接管全文字阶，漏掉某个节点会静默变成浏览器默认样式。
2. **`isFullBleedRoute` 的判定口径要与路由一致**。只认 `/notes/<数字>/<数字>`：
   放宽到"`/notes/` 下任意路径"会让 `/notes/7/overview` 这些二级页丢掉留白；
   写松成"包含两段"则 `/notes/abc/def` 也会命中。
3. **`data-flush` 与 AppShell 的满幅内边距是一对**，改一个要同时看另一个。
   内边距现在只在一个地方产生（正文列外层的 `px-6 sm:px-8 lg:px-18`），
   编辑器与 AppShell 都不再加——三处都加过，就成了"标题比正文多缩进一截"。
4. **`app-shell.tsx` 的 `h-svh + overflow-hidden` 不是可选优化**。
   第一版只改了内边距与 `flex-1`，E2E 立刻报出整页纵向溢出 1189px：
   `SidebarProvider` 的 wrapper 是 `min-h-svh`，没有确定高度，`flex-1` 分不到剩余空间，
   长文会把整页顶长。**这个回归是 E2E 抓出来的，单测（jsdom 不算布局）抓不到**。
5. **`check:css-tokens` 是本批新增的门禁，注意它跳过测试文件**。
   跳过是刻意的（单测里必然有编造的变量名），但这也意味着
   在测试文件里写错 Token 名不会被它拦下——那些由 `editor-styles.test.ts` 自己覆盖。
6. **移动端 `/m/dashboard` 的 Lighthouse 未达门槛（80 / 85）是既有问题，不是本批引入**。
   上一批 `2026-09-14-ui-fidelity.md` 记录的是 81–83，本次在无其它进程争抢 CPU 的情况下复测为 80；
   `docs/mobile/MOBILE_MILESTONES.md` 的 T5.2「Lighthouse 移动模式跑通」本就未勾选。
   本批可能影响到移动端的只有 `mobile.css` 的一条边框色，其余三条移动端路由（`/m/notes` 86、
   `/m/docs` 85、`/m/ai/chat` 90）均通过。
7. **`infra/docker-compose.yaml` 的改动不属于本批**（`NEXT_PUBLIC_APP_URL` 默认值改为局域网地址，
   配套 `docs/changelist/2026-09-13-web-lan-origin.md`），本批未纳入提交。
