# 移动端适配（M10.0 – M10.5）改动清单

> 分支 `feat/mobile-foundation`（从 `fix/notes-editor-bugs` 切出，7 个 commit，**未并 `dev`**）
> 方案与决策：[`docs/mobile/MOBILE_PLAN.md`](../mobile/MOBILE_PLAN.md)
> 进度、实测数字与偏差：[`docs/mobile/MOBILE_MILESTONES.md`](../mobile/MOBILE_MILESTONES.md)
> 契约登记：[`.claude/openspec/changes/2026-09-12-mobile-route-segment.md`](../../.claude/openspec/changes/2026-09-12-mobile-route-segment.md)

## 概览

`git diff --stat 0bf840e..HEAD`（不含尚未提交的 `apps/web/e2e/mobile-core.spec.ts`）：

| 项 | 数字 |
|----|------|
| 文件总数 | **104**（新增 82 · 修改 22 · 删除 0）—— 上表各行相加：新增 22+33+9+4+6+1+1+1+5 = 82，修改 2+8+10+2 = 22 |
| 行数 | +8103 / −194 |

按目录分布：

| 目录 | 新增 | 修改 | 说明 |
|------|:----:|:----:|------|
| `apps/web/src/app/(mobile)/` | 22 | 0 | 移动端路由段：1 个 layout + 21 条页面 |
| `apps/web/src/features/**`（移动端组件与单测） | 33 | 0 | 25 个在 `*/components/mobile/` 下，8 个是 settings / dashboard / search 的 `mobile-*` 文件 |
| `apps/web/src/components/layout/mobile/` | 9 | 0 | 外壳（shell / screen / tab bar / action sheet / view switch）与单测 |
| `apps/web/src/components/editor/` | 4 | 2 | 工具栏命令注册表 + mobile variant 与单测 |
| `apps/web/src/lib/mobile/` + `src/hooks/` | 6 | 0 | 入口分流、搜索候选、visualViewport 三组纯逻辑与单测 |
| `apps/web/src/styles/mobile.css` | 1 | 0 | 安全区 + 高度变量 + 工具条横滑 |
| `apps/web/scripts/` + `package.json` + `playwright.config.ts` | 0 | 8 | 产物预算分桶 + Lighthouse 移动口径 + mobile project |
| `apps/web/e2e/` | 1 | 0 | 窄屏溢出回归（`mobile-core.spec.ts` 在本清单之后提交） |
| 桌面既有业务文件 | 1 | 10 | 见「对桌面既有代码的改动」一节；新增的那 1 个是 `/ai/pdf` 溢出 bug 的复现用例 |
| 文档 | 5 | 2 | `docs/mobile/` 四份 + OpenSpec 提案；`CLAUDE.md` / `README.md` |

### 验证结果

| 命令 | 结果 |
|------|------|
| `pnpm --filter web test` | ✅ **835 条 / 92 文件全绿**（工作前 619 条） |
| `npx tsc --noEmit`（apps/web） | ✅ 无错误 |
| `npx biome check apps/web/src apps/web/scripts` | ✅ 无错误 |
| `npx next build` | ✅ 编译 + 37 条路由静态生成通过。standalone 拷贝阶段在本机报 `EPERM: symlink`（Windows 符号链接权限），与代码无关 |
| `node scripts/bundle-report.mjs` | ✅ 桌面最重 295.1KB / 300KB；移动端最重 242.8KB / 250KB；编辑器 13.2KB / 250KB |
| `npx playwright test --list` | ✅ `chromium` 20 条（不变）、`mobile` 29 条 |
| `pnpm --filter web test:e2e` | ❌ **未跑**：需生产构建 + 真实 Docker 全栈 |
| `pnpm --filter web lighthouse:budget:mobile` | ❌ **未跑**：同上，且需 E2E 攒的会话 Cookie |
| 真机验收（方案 §8.3 的 8 条） | ❌ **未做**：无 iOS / Android 真机 |

---

## 1. 移动端路由段 `apps/web/src/app/(mobile)/`（新增 22）

整段都是新增，桌面 `(workspace)` 一个文件没动。页面本身只做参数校验 + 组件装配，业务逻辑全在 `features/`。

| 文件 | 状态 | 作用与原因 |
|------|------|-----------|
| `layout.tsx` | 新增 | 套 `MobileShell`；导出 `viewport`：`interactiveWidget: "resizes-content"` 让软键盘压缩布局而不是盖住贴底工具条，`maximumScale: 5` 是为了不踩 Lighthouse 无障碍门槛（禁缩放会直接扣分） |
| `m/dashboard/page.tsx` | 新增 | UA 分流的落点，也是登录后落地页（决策 2 取备选） |
| `m/notes/page.tsx` | 新增 | 知识库列表 |
| `m/notes/[baseId]/page.tsx` | 新增 | 笔记列表；非法 `baseId` 在服务端 `notFound()`，不让它带着去打后端 |
| `m/notes/new/page.tsx` | 新增 | 新建笔记；包了 `Suspense`——`useSearchParams`（`?baseId=` 预选）没有边界会让整页退化成动态渲染 |
| `m/notes/[baseId]/[noteId]/page.tsx` | 新增 | 编辑器；`key={noteId}` 强制重挂载，让 `useSaveNote` 的卸载清理把上一篇待存改动 flush 出去（与桌面同一处理） |
| `m/wikis/page.tsx` · `m/wikis/[baseId]/page.tsx` · `m/wikis/[baseId]/[noteId]/page.tsx` | 新增 | 三级 URL 路由取代桌面的组件内 `useState`——否则系统返回键会直接退出整页 |
| `m/docs/page.tsx` · `m/docs/[id]/page.tsx` | 新增 | 协同文档库与编辑；非法 doc id 在服务端挡掉（它会被拼成协同房间名） |
| `m/ai/chat/page.tsx` | 新增 | 会话列表（桌面是 `hidden md:block` 的左栏，手机上完全不可达） |
| `m/ai/chat/[id]/page.tsx` | 新增 | 全屏对话；`new` 是新对话的保留 id——`/m/ai/chat` 已被列表占用，桌面"无 id 即新对话"的表达在这里用不了 |
| `m/ai/pdf/page.tsx` · `m/ai/pdf/[docId]/page.tsx` | 新增 | 文档列表 + 预览/问答 Tabs（桌面三栏在 375px 放不下，正是溢出 bug 的成因） |
| `m/tasks/page.tsx` · `m/mooc/page.tsx` · `m/mooc/[id]/page.tsx` | 新增 | 任务卡片、课程列表与详情 |
| `m/settings/page.tsx` | 新增 | 重定向到 `/m/me`——移动端的设置入口是「我的」分组列表 |
| `m/settings/[section]/page.tsx` | 新增 | 设置子页；保留桌面的 `account` → `profile` 旧路径别名 |
| `m/search/page.tsx` · `m/me/page.tsx` | 新增 | 全屏搜索（替代 ⌘K）与「我的」 |

## 2. 移动端外壳 `apps/web/src/components/layout/mobile/`（新增 9）

| 文件 | 状态 | 作用与原因 |
|------|------|-----------|
| `mobile-shell.tsx` | 新增 | 外壳：不挂 `SidebarProvider` / `CommandPalette`（省下的首屏额度用于 250KB 预算）；沉浸式路由隐藏 tab bar，判定走纯函数而不是 CSS `:has()`（要能单测，也不依赖浏览器支持）；把 `visualViewport.height` 写进 `--mobile-viewport-h` |
| `mobile-screen.tsx` | 新增 | 每页统一外框（顶栏 + 内容区）。标题由页面给而不是 shell 从路由猜——详情页标题是数据（笔记名 / 会话名）；返回键在 `history.length <= 1` 时用兜底地址，避免直接打开分享链接时 `back()` 退出站点 |
| `mobile-tab-bar.tsx` | 新增 | 5 格底部导航，`fixed` 在视口底部（跟文档流会被滚走），高度与安全区由 CSS 变量统管 |
| `mobile-action-sheet.tsx` | 新增 | 桌面 `DropdownMenu` 的移动端替代：下拉菜单的锚点在手指底下、命中区只有 28px。危险动作第一次点击只切确认态——触摸端误触成本高 |
| `view-switch.tsx` | 新增 | 桌面 ⇄ 移动互切；链接带 `?desktop=1` / `?mobile=1`，否则"切到桌面版"下次进来又被 UA 推回 |
| `__tests__/mobile-shell.test.tsx` | 新增 | tab 可达与高亮、沉浸式隐藏 tab bar、跳转到内容的无障碍链接 |
| `__tests__/mobile-screen.test.tsx` | 新增 | 返回键两条路径（有/无站内历史）、动作与工具条插槽、`fill` 的高度模式 |
| `__tests__/mobile-action-sheet.test.tsx` | 新增 | 受控/非受控打开、二次确认、禁用项点不动 |
| `__tests__/view-switch.test.tsx` | 新增 | 双向映射、无移动端对应页时回退工作台、移动端独有页回退到最近的桌面页 |

> 配套样式是新增的 `apps/web/src/styles/mobile.css`，**只放三类规则**：安全区、统一高度变量
> （`--mobile-viewport-h` / `--mobile-content-h` / `--mobile-tabbar-h`）、移动端工具条横滑。
> 业务样式仍写在组件的 Tailwind 类里——放进 CSS 就会变成第二套真相。
>
> `mobile-placeholder.tsx` 在 M10.1 新增、M10.4 删除（五个 tab 的真实页面都落地后它就没用了），
> 因此在本区间的 `git diff` 里不出现。

## 3. 各域移动端组件 `apps/web/src/features/**`（新增 33）

全部只做版式，数据层复用桌面同一批 hooks 与 schema，**没有新写任何 `use*Query` / `use*Mutation`**。

| 文件 | 状态 | 作用与原因 |
|------|------|-----------|
| `dashboard/components/mobile-dashboard.tsx` | 新增 | 移动端工作台：问候 + 快捷操作 + 首个知识库最近 5 篇 + 未提交待办前 3 条 + 知识库卡片。协同索引**不进**这页——它要连 WebSocket 并加载 yjs，落地页为此建连接不值得 |
| `notes/components/mobile/note-bases-mobile.tsx` | 新增 | 知识库单列列表；`/m/notes` 与 `/m/wikis` 共用一个组件，只换跳转前缀与新建入口 |
| `notes/components/mobile/note-list-mobile.tsx` | 新增 | 笔记列表 + 整行翻页。做"上一页/下一页"而不是"加载更多"，因为复用的 `useNotesQuery` 是按页取、不是无限滚动 |
| `notes/components/mobile/create-note-mobile.tsx` | 新增 | 新建笔记；`?baseId=` 预选让"从列表点 +"少点一次；创建后跳 `/m/notes/...` |
| `notes/components/mobile/note-editor-mobile.tsx` | 新增 | 全屏编辑器：目录树换返回键、保存状态进顶栏、`toolbar="mobile"`、移动与删除走底部动作表。`useSaveNote` 的自动保存 / 冲突 / 卸载 flush 一行没改 |
| `wikis/components/mobile/wiki-reader-mobile.tsx` | 新增 | 只读阅读页（`preset="readonly"`，不挂工具栏与交互扩展），带一个去编辑器的入口 |
| `collab/components/mobile/doc-library-mobile.tsx` | 新增 | 协同文档库单列；删除走底部动作表（触摸端没有 hover）；新建表单走底部弹层——居中对话框会被软键盘顶掉一半 |
| `collab/components/mobile/doc-workspace-mobile.tsx` | 新增 | 协同编辑；同样连正文 + 索引两个房间，状态与在线成员收进顶栏 |
| `tasks/components/mobile/task-cards-mobile.tsx` | 新增 | 卡片列表替代 react-table（五列表格在 375px 下必然溢出，而 react-table 只为表格语义服务）；`SubmitTaskDialog` 改 `dynamic` 按需加载，否则该路由首屏 247.7KB 离预算只剩 2.3KB |
| `mooc/components/mobile/mooc-list-mobile.tsx` | 新增 | 课程单列卡片。移动端不做"新建课程"：要填封面、简介等一堆字段，手机上是反体验 |
| `mooc/components/mobile/mooc-detail-mobile.tsx` | 新增 | 桌面双栏换「目录 / 内容」Tabs，选中非章节条目自动切到内容页 |
| `ai/components/mobile/conversation-list-mobile.tsx` | 新增 | 会话列表独立成页；重命名 / 删除走动作表 |
| `ai/components/mobile/chat-mobile.tsx` | 新增 | 全屏对话，复用桌面 `ChatPanel`；新会话拿到 id 后迁移流式 key 并 `replace` 路由，与桌面同一套逻辑 |
| `ai/components/mobile/pdf-list-mobile.tsx` | 新增 | 文档列表 + 系统文件选择器上传，PDF 类型校验在前端先做 |
| `ai/components/mobile/pdf-detail-mobile.tsx` | 新增 | 预览 / 问答 Tabs，复用 `PdfViewer`（宽度自适应）与桌面相同的 `docSessionKey` |
| `search/components/mobile-search.tsx` | 新增 | 全屏搜索页替代 ⌘K；**不引入 `cmdk`**，候选与匹配都在纯函数里 |
| `settings/components/mobile-me.tsx` | 新增 | 「我的」：设置分区 + tab 放不下的入口 + 仅桌面能力的说明 + 互切 + 登出 |
| `settings/components/mobile-settings.tsx` | 新增 | 设置子页外框；四个分区内容直接复用桌面组件（纵向表单，窄屏本来就能用） |
| 上述各自的 `__tests__/*.test.tsx`（8 个文件） | 新增 | 覆盖列表渲染 / 空态 / 错误态 / 分页 / 筛选 / 动作表二次确认 / 路由跳转；编辑器与 ChatPanel 在测试里打桩，只验证接线 |

## 4. 编辑器 `apps/web/src/components/editor/`（新增 4 · 修改 2）

| 文件 | 状态 | 作用与原因 |
|------|------|-----------|
| `core/toolbar-commands.ts` | 新增 | 命令 id 的**唯一注册表** + 桌面 `full` / `minimal` 排版表。单独成文件，是为了让分组表只 import 类型而不牵连整个 `toolbar.tsx`（它带 lucide 图标与编辑器状态） |
| `core/mobile-toolbar-groups.ts` | 新增 | 常驻 10 个命令 + 「更多」分组。两个集合必须不重不漏覆盖全部 23 个——漏掉的命令在手机上就永远点不到 |
| `core/toolbar.tsx` | 修改 | 重构成 `Record<ToolbarCommandId, ToolbarCommand>` 注册表 + 按排版表渲染；新增 `mobile` variant（单行横滑 + 「更多」底部弹层）。桌面两个 variant 的按钮顺序与标签逐个保持原样，既有用例全绿 |
| `core/tiptap-editor.tsx` | 修改 | 新增可选 `toolbar` 覆写（不传时仍按 preset 推导，桌面调用方一行不用改）；移动端把 `<Toolbar>` 移到正文之后（只改 CSS 会贴在正文顶部）、并且不挂 `BubbleMenuPortal`——触摸选区会和系统复制/粘贴菜单争同一位置 |
| `__tests__/mobile-toolbar-groups.test.ts` | 新增 | 常驻/更多不重不漏、与注册表一一对应、桌面排版表是全集与子集 |
| `__tests__/mobile-toolbar.test.tsx` | 新增 | mobile variant 只渲染常驻命令、「更多」弹层能找到其余命令、不挂气泡菜单、**不传 `toolbar` 时两个桌面 variant 行为不变** |

## 5. 纯逻辑 `apps/web/src/lib/mobile/`、`src/hooks/`（新增 6）

| 文件 | 状态 | 作用与原因 |
|------|------|-----------|
| `lib/mobile/routing.ts` | 新增 | `isMobileUserAgent` + `resolveViewDecision`：入口分流的全部判定。不 import 任何 Next 运行时，middleware 与单测调同一份。平板一律判为非手机（决策 7 定的是平板落桌面窄屏形态） |
| `lib/mobile/search.ts` | 新增 | 搜索候选从导航注册表派生 + 子串匹配。不引入 `cmdk`：为一页搜索背一个库顶不住 250KB 预算 |
| `hooks/use-visual-viewport.ts` | 新增 | 软键盘兜底。直接读 `visualViewport.height` 当可用高度，而不是算"键盘占了多少"——后者要拿 `innerHeight` 做差，而 `resizes-content` 生效时 `innerHeight` 自己就缩了，差值恒为 0 |
| `lib/mobile/__tests__/routing.test.ts` | 新增 | 19 条：iPhone / Android 手机 / iPad / Android 平板 / 桌面 / 空 UA / 伪造 UA；逃生口、偏好优先级、深层路由不改写、UA 判定不写 Cookie |
| `lib/mobile/__tests__/search.test.ts` | 新增 | 候选全是 `/m/*`、不重复、`/ai/workflow` 不进候选；标题命中排在关键词命中之前 |
| `hooks/use-visual-viewport.test.ts` | 新增 | resize / scroll 两条事件路径、不支持时返回 null、卸载后不留监听器 |

## 6. 门禁脚本与配置 `apps/web/scripts/`、`package.json`、`playwright.config.ts`（修改 8）

| 文件 | 状态 | 作用与原因 |
|------|------|-----------|
| `scripts/lib/bundle.mjs` | 修改 | 加 `mobileInitialJs: 250KB`、`isMobileRoute`（**按路径段匹配**，`startsWith("/m")` 会把 `/mooc`、`/me` 误判进更紧的桶）、`heaviestByBucket`；移动端路由不存在时不产生该检查，而不是按 0 记通过 |
| `scripts/bundle-report.mjs` | 修改 | 改成分桶判定，两个桶各取最重的一条 |
| `scripts/lib/lighthouse.mjs` | 修改 | 加 `MOBILE_THRESHOLDS`（0.85 / 0.95）、`MOBILE_ROUTES`、`--mobile` 解析与 `selectProfile` |
| `scripts/lighthouse.mjs` | 修改 | 移动口径**不加载** `desktop-config`——移动 form factor 叠桌面预设量出来的是假高分 |
| `scripts/lib/__tests__/bundle.test.mjs` | 修改 | 新增 15 条：路径段匹配（含 `/mooc` 不被误判）、分桶、移动端超标即失败、无移动端路由时不产生检查 |
| `scripts/lib/__tests__/lighthouse.test.mjs` | 修改 | 新增 6 条：`--mobile` 解析、两个 profile 的阈值与路由、按移动阈值判分。既有 `parseArgs` 的 `toEqual` 断言补了新增字段 |
| `package.json` | 修改 | 加 `lighthouse:mobile` / `lighthouse:budget:mobile` 两条 script |
| `playwright.config.ts` | 修改 | 加 `mobile` project（Pixel 5）；两个 project 按文件名分工（`testMatch` / `testIgnore`），避免 `workers: 1` 下全量时间翻倍 |

## 7. 对桌面既有代码的改动（新增 1 · 修改 10）

方案 D7 把桌面版式列为"不碰"，下面 8 处是显式例外——两类：修既有 bug，和向后兼容的扩展。

| 文件 | 状态 | 作用与原因 |
|------|------|-----------|
| `features/ai/components/pdf/pdf-page.tsx` | 修改 | **修既有 bug**：文档库（288px）与问答（`w-full` + `shrink-0`）并排在同一行 flex 里，375px 下宽度之和恒大于视口，整页被顶出横向滚动条。改为 `lg` 以下纵向 + 一次只显示一个面板 + 顶部切换；删除按钮 `md` 以下常显 |
| `features/ai/components/pdf/__tests__/pdf-page.test.tsx` | 新增 | 该 bug 的复现用例（**先写后改**）：jsdom 量不到布局，所以断言的是产生溢出的结构条件（面板不并排、切换控件存在、断点类名正确） |
| `features/ai/components/conversation-list.tsx` | 修改 | 操作入口原来是 `opacity-0` + `group-hover` 揭示，触摸端没有 hover，等于在手机上无法重命名 / 删除。改成 `md` 以上才靠 hover，以下常显并放大到 40px |
| `features/ai/components/__tests__/conversation-list.test.tsx` | 修改 | 补一条断言：触摸端常显 |
| `components/layout/navigation.ts` | 修改 | 新增移动端导出（`mobileTabs` / `toMobileHref` / `toDesktopHref` / `isMobilePath` / `activeMobileTab` / `isImmersiveMobileRoute` / 更多与仅桌面路由表）。桌面既有导出一个没动，tab 与映射都从同一份注册表派生 |
| `components/layout/__tests__/navigation.test.ts` | 修改 | 新增 13 条：映射、前缀整段匹配、沉浸式判定、`/m/tasks` 不点亮任何 tab |
| `components/layout/user-menu.tsx` | 修改 | 桌面头部加"手机版"入口（放进既有用户菜单，不加宽头部），链接带 `?mobile=1` 让偏好落库 |
| `components/layout/__tests__/app-shell.test.tsx` | 修改 | 补断言：菜单里的"手机版"指向当前页的移动端对应地址 |
| `features/collab/components/collab-loader.tsx` | 修改 | 加两条移动端懒加载入口，yjs 仍不进 `/m/docs` 首屏 |
| `middleware.ts` | 修改 | 接线入口分流：未登录仍先跳登录页；判定全在纯函数里，这里只负责写偏好 Cookie（非 httpOnly、`sameSite=lax`、https 下才加 `Secure`） |
| `middleware.test.ts` | 修改 | 新增 8 条：入口跳转、深层路由不跳、逃生口写 Cookie、偏好双向优先于 UA、未登录优先、`Secure` 随协议 |

## 8. 文档与契约（新增 5 · 修改 2）

| 文件 | 状态 | 作用与原因 |
|------|------|-----------|
| `docs/mobile/MOBILE_PLAN.md` | 新增 | 技术方案：8 条架构决策、6 个被否方案、路由映射、测试计划、风险表、7 个决策点（已拍板） |
| `docs/mobile/MOBILE_MILESTONES.md` | 新增 | M10.0 – M10.5 任务与验收；实施后补了「验收记录」（实测数字 + 未做项）与「与方案的偏差」10 条 |
| `docs/mobile/UI_INVENTORY.md` | 新增 | 开工前逐页核对证据，每条带 `文件:行`；是 P0 问题清单的出处 |
| `docs/mobile/README.md` | 新增 | 目录导航 + 决策结论 + 下一步 |
| `.claude/openspec/changes/2026-09-12-mobile-route-segment.md` | 新增 | 契约登记：为什么不换 origin（Cookie host-only + 进程级刷新锁），以及非 httpOnly 的 `anynote_view` 为什么不违反"token 不得进 document.cookie"。**不改任何后端契约**，`openapi/specs/*.json` 未变动 |
| `CLAUDE.md` | 修改 | 导航加 `docs/mobile/`；门禁命令补移动端两条；`apps/web` 条目标注两个路由段；Phase 5 单测数字补注 |
| `README.md` | 修改 | 「端到端与性能门禁」加移动端三行表 + project 分工说明 + 移动端门槛更低的口径解释 |


---

## 审计要点

按"最容易出错 / 影响面最大"排序，这 6 处值得重点看：

1. **`src/middleware.ts` + `lib/mobile/routing.ts`** —— 唯一会改变**所有用户**请求走向的改动。要确认：未登录仍然先跳登录页；深层路由永不改写；UA 判定不写 Cookie（写了会把误判固化）；`anynote_view` 确实只有两个字面量、不含身份信息。
2. **`components/editor/core/toolbar.tsx`** —— 桌面笔记与协同文档都用它。重构成注册表后要确认桌面 `full` / `minimal` 的按钮顺序、标签、禁用条件与改动前一致（`__tests__/mobile-toolbar.test.tsx` 末两条就是守这个的）。
3. **`features/ai/components/pdf/pdf-page.tsx`** —— 唯一改了桌面版式的业务文件。`lg` 以上必须仍是三栏；`lg` 以下的 `pane` 状态在桌面宽度下不该有任何可见影响。
4. **`scripts/lib/bundle.mjs` 的 `isMobileRoute`** —— 判错会让 `/mooc`、`/me` 被更紧的预算卡住，报出与事实不符的红灯。按路径段匹配这条有专门用例。
5. **`features/tasks/components/mobile/task-cards-mobile.tsx` 的 `dynamic` 提交对话框** —— 它是为了守 250KB 预算才改的按需加载；如果有人把它改回静态 import，`/m/tasks` 会直接顶破预算（静态时实测 247.7KB）。
6. **`features/notes/components/mobile/note-editor-mobile.tsx`** —— 复用了 `useSaveNote` 的全部时序（debounce、版本冲突、卸载 flush）。要确认"移动到别的知识库"前先 `flush()`，否则跳转会丢掉未保存的正文。

**没有生成物**：本批改动不含任何由脚本生成的文件；`packages/api-client/src/`、`openapi/specs/*.json`、
`docs/cli/COMMANDS.md` 均未变动（移动端不改后端契约）。
