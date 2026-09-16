# Changelist · 2026-09-14 · 前端新 UI 重设计

按 `docs/ui/Anynote 新前端 UI 重设计.pdf` 重构 `apps/web`：**设计系统语义化 Token**、
**知识库为唯一顶层对象的信息架构**、桌面与移动端页面的逐屏落地，配套单测与真实栈 E2E。

- 方案来源：`docs/ui/Anynote 新前端 UI 重设计.pdf`（11 页：设计系统 / 信息架构 / 桌面 4 屏 / 移动 5 屏）
- 架构速查已同步：`.claude/context/frontend.md`
- 门禁命令见 `README.md`「端到端与性能门禁」

---

## 概览

本批改动：**119 个已跟踪文件被修改、24 个新文件新增、1 个文件删除**
（以上计数由 `git status --porcelain` / `git ls-files --others` 逐条核对，
并**已排除**仓库里既有的、与本批无关的未提交改动：`infra/docker-compose.yaml`
与两份 `docs/changelist/2026-09-13-*.md`，它们在本批开工前就是 modified/untracked）。

| 目录 | 改动量 | 性质 |
|------|--------|------|
| `apps/web/src/app/globals.css` | 重写 | 设计系统 Token 单一来源 |
| `apps/web/src/components/ui/**` | 20 个文件 | 原子组件对齐新 Token / 圆角 / 字阶 |
| `apps/web/src/components/layout/**` | 12 个文件 | 外壳重构（侧栏、顶栏、导航注册表） |
| `apps/web/src/app/(workspace)/**` | 8 个文件 | 路由树重构（知识库二级 Tab） |
| `apps/web/src/app/(mobile)/**` | 5 个文件 | 移动端二级 Tab 路由 |
| `apps/web/src/features/**` | 56 个文件 | 页面与组件按设计稿重做 + Token 迁移 |
| `apps/web/src/lib/**` | 4 个文件 | 纯函数工具（相对时间、渐变） |
| `apps/web/e2e/**` | 8 个文件 | E2E 用例更新 + 新增重设计验收 |

### 验证结果

全部在**本机 Docker 全栈**上实跑（`docker compose --env-file <空文件> -f infra/docker-compose.yaml
-f infra/docker-compose.dev.yaml`），前端镜像按 `E2E_BASE_URL=http://localhost:3000` 重建：

| 命令 | 结果 |
|------|------|
| `pnpm --filter web typecheck` | 通过（0 error） |
| `pnpm --filter web test` | **105 文件 / 1035 用例全绿**（改动前 100 / 982） |
| `pnpm check`（Biome lint + format） | 通过（494 文件） |
| `pnpm --filter web build` | 编译通过，41 个页面全部生成 |
| `pnpm --filter web test:e2e` | **72 passed / 0 failed**（桌面 39 + 移动 33；1 skipped 是 `pdf-upload` 里既有的条件跳过） |
| `pnpm --filter web bundle:budget` | **三条全 PASS**：首屏 293.5 KB / 300 KB（`/notes/[baseId]/[noteId]`）、移动端 221.8 KB / 250 KB（`/m/notes`）、编辑器 13.7 KB / 250 KB |

> `bundle:budget` 量的是宿主机 `.next`（需先停掉占用 3000 端口的容器再跑，否则会与容器里的
> 实例争同一份产物）。
>
> `lighthouse:budget` **未在本批执行**，未验证项不写进结果。

### 过程中发现并修复的真问题

都不是"为了让测试变绿"而改的断言，逐条列出便于评审复核：

| # | 问题 | 影响 | 修法 |
|---|------|------|------|
| 1 | `globals.css` 的 `--font-sans: var(--font-sans)` 是**自引用** | `@apply font-sans` 从未拿到 `next/font` 注入的 `--font-geist-sans`，字体一直在走继承回退 | 直接指向 `var(--font-geist-sans)` |
| 2 | Base UI 的 `RadioItem` 默认 `closeOnClick: false`（普通 `Item` 是 true） | **选完主题菜单不关** | `DropdownMenuRadioItem` 显式置 `closeOnClick = true` |
| 3 | `DialogTrigger` 自定义触发内容时套了 `<button>` | 形成 `<button><button>` 非法嵌套，浏览器把内层提出来后**对话框永远打不开** | `trigger` 改为传**内容**，并置 `nativeButton={false}` |
| 4 | `CreateBaseDialog` 成功后硬编码跳 `/notes/${baseId}` | 在 `/m/*` 下创作会**被扔进桌面布局** | 按 `isMobilePath(pathname)` 选目标地址 |
| 5 | `MobileScreen` 用 `history.length <= 1` 判断"有无站内历史" | 直接 `goto` 详情页后 `length` 已是 2（多出 `about:blank`），**点返回退到空白页** | 改用 Next 的 `history.state.idx > 0`，抽成可单测的 `hasInAppHistory()` |
| 6 | `note-image-upload` 用例按 `getByRole("button", { name: /图片/ })` 找工具栏按钮 | 左侧笔记目录每行都是 `role="button"`（dnd-kit 注入），标题含「图片」时**先命中目录行**，filechooser 永不出现 | 限定在 `getByRole("toolbar")` 内查找 |
| 7 | `/notes/new` 的 `CreateNotePage` 仍是旧版式且不接受 `?baseId=` | 与重设计不一致；移动端「+」带过来的 `baseId` 被忽略 | 按设计稿重做（卡片式选库）+ 路由透传 `initialBaseId` |

### 发现的既有缺陷（本批不修，单独跟）——**归因已于 2026-09-16 更正**

> ⚠️ **本节结论已被推翻，阅读时请以 2026-09-16 的更正为准。**
> 这**不是后端缺陷**，而是**新前端选错了列表端点**；「后端修复另开工单」也没有真正建立，
> 问题因此在 `dev` 上留了两天，直到 2026-09-16 用户报障才修。
> 完整分析见 **`docs/changelist/2026-09-16-note-list-endpoint.md`**。
> 下方原文保留，作为「跨端问题被误判为后端缺陷」的审计留痕。

**新建的空笔记不会出现在自己的列表里。**

`GET /api/note/notes?knowledgeBaseId=N` 走的 `selectNoteList`（`services/note/src/main/resources/mapper/NoteMapper.xml:116`）
是 `FROM n_note_operation_log LEFT JOIN n_note`，而 `n_note_operation_log` **只由
RocketMQ 消费者在内容 diff 非空时写入**（`NoteMessageListener.generateNoteEditLog`）。
于是"建完没动过"的笔记在列表查询结果里恒为空。

实机证据（本机栈上直接用网关复现）：

```
建笔记前: code=00000 total=0 rows=0
create:   00000 id=2805              # 创建成功
建笔记后: code=00000 total=0 rows=0   # 仍是 0 行
GET /api/note/notes/2805 → 00000, knowledgeBaseId=431, deleted=0   # 单条能查到
SELECT COUNT(*) FROM n_note_operation_log WHERE note_id=2805; → 0  # 没有操作日志
SELECT COUNT(*) FROM n_note n WHERE n.is_delete=0 AND NOT EXISTS
  (SELECT 1 FROM n_note_operation_log l WHERE l.note_id=n.id); → 86  # 全库 86 篇同样情况
```

**观察本身是准确的**（现象、SQL、数据都对），**错的只有归因**：

| 本节当时的判断 | 更正后的事实（2026-09-16 核实） |
|---|---|
| 「旧前端用的是同一个 `useNotesQuery`」 | **不成立**。legacy `useNoteList` 用的是 `POST /notes/bases/{baseId}`（`getNoteInfoList`，`FROM n_note`），它**没有**这个问题；`GET /notes` 在 legacy 里只用于首页小部件（`useNoteListV2` / `DashboardHomeButtons`）。CLI 同样早就分成 `note list --base` 与 `note recent` 两条命令 |
| 「既有后端缺陷」 | 后端无缺陷。`GET /notes` 的行为与它自己的语义（「我最近操作过的笔记」）一致，是**新前端把两种语义合并成了一条查询** |
| 「后端修复另开工单」 | 工单从未建立。修法在前端：改回 `POST /notes/bases/{baseId}` |

旧 E2E 之所以没暴露它，是因为用例总是先输入正文再回列表——输入产生了 diff，
也就产生了操作日志。**这一点当时的判断是对的**，2026-09-16 的修复沿用了它：
新回归用例刻意不输入，并把该用例放进独立 `describe` 以切断与前序用例的耦合。

本批的处理：`ui-redesign.spec.ts` 里如实写入正文（对应真实用法"建完就写"）并在断言旁
注明原因，**不掩盖也不绕过**。这条「不绕过」的做法本身没问题，保留。

---

## 设计系统（影响面最大）

先落 Token，再改页面——否则每个页面都会长出自己的一套颜色。

| 文件 | 状态 | 作用与原因 |
|------|------|------------|
| `apps/web/src/app/globals.css` | 修改 | 重写为**三层 Token**：`@theme` 出类名、`:root`/`.dark` 出取值、组件只写类名。新增 `surface-{window,grouped,primary,elevated,sidebar}` / `separator` / `label-{primary,secondary,tertiary}` / `accent-{primary,tint}` / 五个状态色，并补齐字阶（display 34、title 22、headline 17、body 15、footnote 13）、圆角（6/10/14/20）、`shadow-card` 与 `shadow-popover` 两个高度。保留 shadcn 兼容层（`--color-muted` 等）做兜底，所以遗漏处不会掉色。**顺带修掉一个真 bug**：原 `--font-sans: var(--font-sans)` 是自引用，`@apply font-sans` 从来没拿到 `next/font` 注入的 `--font-geist-sans`，字体一直在走继承回退。 |
| `apps/web/src/app/globals.css`（`.kb-cover-*`） | 修改 | 知识库封面 5 组双色渐变（色值取自设计稿第 1 页的色板采样），由 id 取模选组。**不用后端 `cover` 字段**：那是一张全站默认图，一屏 6 张卡会长得一模一样。 |

### Token 迁移（跨全仓）

设计规范把 `accent` 定义成**品牌蓝**，而旧 shadcn 的 `accent` 是"浅灰 hover 底"。
两者同名不同义，所以做了逐处改写而不是改映射（改映射会让品牌蓝在 vendored 组件里消失）：

| 旧 | 新 | 语义 |
|----|----|------|
| `bg-accent` / `hover:bg-accent` | `bg-grouped` / `hover:bg-grouped` | 浅灰 hover 底 |
| `bg-accent text-accent-foreground` | `bg-accent-soft text-accent` | 选中行（浅蓝底 + 蓝字） |
| `text-muted-foreground` | `text-label-secondary` | 次要文字 |
| `text-foreground` | `text-label` | 主文字 |
| `bg-card` / `bg-popover` | `bg-surface` / `bg-elevated` | 内容卡 / 浮层 |
| `text-destructive` 等 | `text-danger` 等 | 状态色统一为 `-danger` |
| `rounded-2xl` / `3xl` / `4xl` | `rounded-xl` / `rounded-xl` / `rounded-full` | 收敛到设计规范的圆角档 |

涉及 **20 个 `components/ui/**` 原子组件**与 **55 个 `features/**` 文件**（后者的表格在对应章节）。

---

## 原子组件（`apps/web/src/components/ui/**`）

| 文件 | 状态 | 作用与原因 |
|------|------|------------|
| `button.tsx` | 修改 | 按钮改为**全圆（pill）**并按设计规范重排高度（32/36/40），`destructive` 变体走 `danger` Token；主按钮是唯一强调色（"一屏一个主按钮"）。 |
| `badge.tsx` | 修改 | 新增 `success` / `warning` / `organization` / `info` 四个语义变体，供文档索引状态与成员权限档位使用。 |
| `card.tsx` | 修改 | 从"描边 + ring"改为 `bg-surface + shadow-card`，圆角收到 14px。 |
| `segmented.tsx` | **新增** | 分段控件（设计稿的「全部/我的/组织」）。用 `radiogroup` 而不是 `tablist`：它切的是**同一列表的过滤条件**，不切面板；方向键在组内循环，`tabIndex` 只留选中项。 |
| `dropdown-menu.tsx` | 修改 | **修一个真 bug**：Base UI 的 `RadioItem` 默认 `closeOnClick: false`（普通 `Item` 默认 true），于是"选完主题菜单还杵在那儿"。显式置 true。 |
| `sidebar.tsx` | 修改 | Token 迁移；新增 `SidebarSheet` 导出供窄屏抽屉复用。 |
| `dialog.tsx` `sheet.tsx` `command.tsx` `input.tsx` `textarea.tsx` `label.tsx` `field.tsx` `input-group.tsx` `table.tsx` `tabs.tsx` `avatar.tsx` `skeleton.tsx` `scroll-area.tsx` `separator.tsx` `tooltip.tsx` `sonner.tsx` | 修改 | 逐一迁到新 Token（圆角、描边、浮层底色、次要文字）。 |

---

## 桌面外壳（`apps/web/src/components/layout/**`）

原来的"工作台 / 笔记 / 文档 / 知识库 / 课程 / 任务"六项平铺导航不见了——
这是本次改动**最影响使用习惯**的一处。

| 文件 | 状态 | 作用与原因 |
|------|------|------------|
| `navigation.ts` | 重写 | 导航注册表按新信息架构重写。新增 `knowledgeBaseSections`（概览/笔记/慕课/任务/资料/成员）与 `knowledgeBaseSectionHref()`——**二级 Tab 的地址真相**；`toolGroups` 收敛为「AI 助手」+「协作」两组；`workspaceRoutes` 从 10 条降到 7 条。移动端 `mobileTabs` 从 5 格降到 4 格（知识库成为 tab，「文档」收进「我的」），`mobileMoreRoutes` 相应改为协同文档/任务/慕课/PDF 问答。 |
| `sidebar-nav.tsx` | **新增** | 侧栏的三块内容：知识库动态列表（消费 `/bases` query 缓存，与画廊共用同一份数据，新建后自动同步）、跨库能力分组、页脚用户卡。设置入口收进用户卡，不再占一级导航。 |
| `app-sidebar.tsx` | 重写 | 用固定宽度 `aside` 替掉 `ui/sidebar` 的 `collapsible="icon"`（本设计没有图标折叠态，留着那套 tooltip/宽度动画只会互相打架）。宽窄两态**按 `useIsMobile` 二选一渲染**：`ui/sidebar` 的桌面分支与抽屉分支在 DOM 里并列，两个都挂会把同一份导航渲染两遍（读屏念两遍、`data-testid` 撞车）。 |
| `app-header.tsx` | 重写 | 两种形态：工作区页给面包屑，**知识库内给「切换器 + 二级 Tab」**（层级越深越要说明"我在哪"）。新增 `parseBaseIdFromPath()` 纯函数从路径反解知识库 id。 |
| `app-shell.tsx` | 修改 | 侧栏折叠状态**只在桌面端**绑 Zustand：移动端 `SidebarProvider` 自管抽屉，若也被 store 接管，第一次点开抽屉就会把桌面偏好写成 true。 |
| `command-palette.tsx` | 修改 | 「跳转到」组新增**动态知识库列表**（从 `/bases` 缓存取）。以前 9 条静态路由够用，现在库才是用户真正要去的地方，面板里搜不到任何一个库等于废了一半。 |
| `__tests__/app-shell.test.tsx` | 修改 | 15 条用例重写：钉住"侧栏把知识库铺成一级入口"、"只高亮当前库"、"知识库内顶栏给 Tab / 库外给面包屑"、"编辑器里笔记 Tab 仍高亮"、侧栏搜索框派发 ⌘K 事件等。 |
| `__tests__/navigation.test.ts` | 修改 | 断言新的一级导航恰好是 7 条固定路由、四类子资源**不在**顶层、移动端恰好 4 格。 |
| `__tests__/knowledge-base-routing.test.ts` | **新增** | 8 条用例覆盖二级 Tab 地址生成/反解，以及 `parseBaseIdFromPath` 的边界（`/notes/new`、`/notes/0`、`/notes-archive/12` 都不能被误判成知识库）。 |
| `__tests__/workspace-session.test.tsx` | **新增** | 把会话闸门的四条分支独立钉住（放行 / 加载占位 / 401 跳登录 / 非 401 就地报错可重试）。原先这些是靠 dashboard 页面间接覆盖的，而 dashboard 已改成重定向。 |
| `workspace-session.tsx` `workspace-placeholder.tsx` | 修改 | Token 迁移。 |

---

## 知识库路由树（`apps/web/src/app/(workspace)/**`）

二级 Tab 用**静态段**而不是 query 参数：静态段能被 Next 的路由优先级排在 `[noteId]` 之前，
而笔记 id 恒为正整数，所以段名与 id 不会互抢。

| 文件 | 状态 | 作用与原因 |
|------|------|------------|
| `notes/page.tsx` | 修改 | 从 `KnowledgeBaseGrid` 改为 `KnowledgeBaseGallery`；`?new=1` 由**服务端**读出并传给客户端组件，于是"新建知识库"在整站只有一个 URL，客户端不必再解析一次 query（少一层 `useSearchParams` + Suspense 依赖）。 |
| `notes/[baseId]/overview/page.tsx` | **新增** | 知识库概览 Tab。 |
| `notes/[baseId]/docs/page.tsx` | **新增** | 知识库资料 Tab（PDF 列表 + 索引状态）。 |
| `notes/[baseId]/members/page.tsx` | **新增** | 知识库成员 Tab。 |
| `notes/[baseId]/mooc/page.tsx` | **新增** | 知识库慕课 Tab。 |
| `notes/[baseId]/tasks/page.tsx` | **新增** | 知识库任务 Tab。 |
| `notes/[baseId]/page.tsx` | 修改 | 保留为「笔记」Tab（裸路径是默认落地页）。 |
| `dashboard/page.tsx` | 重写 | 变成到 `/notes` 的重定向，且 **query 原样带走**：`?desktop=1` 是版式逃生口，中间件已按它写好偏好 Cookie，重定向丢掉它用户就看不出自己刚做的选择（E2E 的逃生口用例也会失败）。 |
| `dashboard/__tests__/page.test.tsx` | **删除** | 内容已迁到 `components/layout/__tests__/workspace-session.test.tsx`——dashboard 不再是个有内容的页面，为它保留测试只会测重定向。 |
| `(auth)/login/page.tsx` `(auth)/register/page.tsx` `(auth)/layout.tsx` `(auth)/cli/authorize/page.tsx` `playground/editor/editor-playground.tsx` | 修改 | Token 迁移。 |

---

## 知识库画廊与详情（`features/notes/**`）

| 文件 | 状态 | 作用与原因 |
|------|------|------------|
| `components/knowledge-base-gallery.tsx` | **新增** | `/notes` 首屏：分段筛选 + 渐变卡片网格 + 末尾「新建知识库」卡。`selectBases()` 是导出的纯函数，三段筛选规则因此可被单测直接钉住。 |
| `components/knowledge-base-detail.tsx` | **新增** | 概览 / 资料 / 成员三个 Tab 的页面实现，含 `permissionLabel()`（把后端 `KnowledgeBasePermissions` 的 1-4 反向档位翻译成人话——数值越小权限越大，反直觉，集中翻译一次）。 |
| `components/__tests__/knowledge-base-gallery.test.ts` | **新增** | 6 条用例覆盖三个"不同口径端点"的选取规则与跨来源去重。 |
| `lib/cover-gradient.ts` | **新增** | 封面渐变选组纯函数 + `KB_COVER_VARIANTS`（与 CSS 的 `.kb-cover-0..4` 是契约，单测钉住数量）。 |
| `lib/__tests__/cover-gradient.test.ts` | **新增** | 6 条用例：取模稳定性、大 ID 不越界、NaN/负数/小数退回合法值、类名不被 `twMerge` 合并。 |
| `components/note-list.tsx` | 重写 | 笔记列表从**卡片网格改成行列表**：一篇笔记的辨识信息就是标题 + 时间，卡片会把一屏能看的条数砍掉一半。 |
| `components/note-editor.tsx` | 重写 | 版式对齐设计稿：顶栏一条文档状态条（保存徽标 + 操作菜单），下方是**限宽 3xl 的纸面**（正文超过约 75 字符后回行会丢行），标题与元信息行是文章的一部分、跟着正文滚，滚动由中间的独立列承担。新增 `data-testid="note-panel"` / `"note-scroll"` / `"note-document"` 供 E2E 定位。 |
| `components/create-note-page.tsx` | 重写 | 按设计稿重做：归属库是一排**可选卡片**（渐变缩略图 + 名字 + 选中勾）而不是下拉框——选库是这一步唯一的决策，值得占视觉重心。新增 `initialBaseId` prop。 |
| `app/(workspace)/notes/new/page.tsx` | 修改 | 服务端读 `?baseId=` 并透传 `initialBaseId`（移动端「+」带过来的归属库不再被忽略）。 |
| `components/create-base-dialog.tsx` | 重写 | 新增 `trigger`（内容）/ `triggerClassName` / `triggerLabel` / `triggerTestId` / `defaultOpen` / `redirectOnCreated`。**两条关键约束**：① `trigger` 传的是内容不是元素——套 `<button>` 会形成非法嵌套，浏览器把内层提出来后点击落不到触发器上（本批实测踩到）；② 成功后按当前版式跳转（`/m/*` 下不能跳到 `/notes/:id`）。创建成功后跳进新库。 |
| `components/create-note-dialog.tsx` | 修改 | 同上，支持自定义触发内容与 testid。 |
| `components/__tests__/create-base-dialog.test.tsx` | **新增** | 8 条用例：默认/自定义触发都能打开对话框、自定义内容不被包成 `<button>`、`defaultOpen`、桌面与移动端各自跳对地址、`redirectOnCreated=false` 不跳、失败不跳且留在原地。 |
| `query-keys.ts` | 修改 | 新增 `organizationBases` / `managedBases` / `baseMembers` / `docList` 四棵子树。三个分段对应三个**不同端点**，缓存不能互相复用。 |
| `schemas.ts` | 修改 | 新增 `baseMemberSchema` / `docListSchema` / `DOC_INDEXED` / `baseScopeOptions` 与 `memberDisplayName()`。 |
| `use-knowledge-bases.ts` | 修改 | 新增 `useOrganizationKnowledgeBasesQuery`（`/bases/organizations`）与 `useManagedKnowledgeBasesQuery`（`/bases/managerList`，**专门为此写的查询**，语义比在 `/bases` 上按 `permissions` 过滤明确）与 `useKnowledgeBaseMembersQuery`。 |
| `use-docs.ts` | **新增** | 知识库资料 Tab 的数据源，用 `flattenedDtoQuerySerializer` 把 `DocListDTO` 展平成后端要的三个平铺键。 |
| `components/mobile/*` | 重写/新增 | 见「移动端」节。 |

---

## 移动端（`apps/web/src/app/(mobile)/**`、`components/layout/mobile/**`）

底部 tab 从 5 格降到 **4 格**（工作台 / 知识库 / AI / 我的），并按设计稿换成**浮岛胶囊**形态。

| 文件 | 状态 | 作用与原因 |
|------|------|------------|
| `components/layout/mobile/mobile-screen.tsx` | 修改 | **修一个真 bug**：原来用 `history.length <= 1` 判断"有没有站内历史"，但直接 `goto` 详情页后 `length` 已经是 2（多出来那条是 `about:blank`），点返回就退到空白页。改用 Next 维护的 `history.state.idx > 0`，并抽成纯函数 `hasInAppHistory()` 供单测钉住（拿不到 `idx` 时保守走兜底地址，宁可多跳一次也不退空白页）。 |
| `components/layout/mobile/__tests__/mobile-screen.test.tsx` | 修改 | 从 7 条扩到 9 条：新增 `hasInAppHistory` 的 2 条（`idx>0` 才算有历史；结构不符时保守判定），并把原来两条依赖改写 `history.length` 的用例改成改写 `history.state`。 |
| `components/layout/mobile/mobile-tab-bar.tsx` | 重写 | 整条 nav 是一条圆角浮岛，选中格自己再套一层 accent 实心胶囊。4 格在 375px 下每格 88px，比 5 格宽出 20%。 |
| `styles/mobile.css` | 修改 | `.mobile-tab-bar` 不再固定高度改为浮岛内边距；`--mobile-tabbar-h` 仍决定内容区垫高，两者职责分离。 |
| `features/notes/components/mobile/note-bases-mobile.tsx` | 重写 | 知识库列表：大标题 + 搜索框 + 分段筛选 + 「最近访问」单列卡片。分段与去重**复用桌面同一个 `selectBases()`**，两端各写一份筛选规则迟早会漂。新增 `data-state` 终态标记供 E2E 等"加载结束"。 |
| `features/notes/components/mobile/note-list-mobile.tsx` | 重写 | 知识库详情：库头（渐变块 + 类型/篇数）+ 横向 Tab（只列移动端真有页面的四项）+ 笔记卡片。 |
| `features/notes/components/mobile/base-docs-mobile.tsx` | **新增** | 移动端资料 Tab（只读列表；上传仍走「PDF 问答」那条带索引轮询的完整链路，避免出现第二条上传实现）。 |
| `app/(mobile)/m/notes/[baseId]/{docs,mooc,tasks}/page.tsx` | **新增** | 移动端二级 Tab 路由，与桌面同构。 |
| `features/dashboard/components/mobile-dashboard.tsx` | 重写 | 桌面 `/dashboard` 已收敛成重定向，所以"接下来做什么"由这页承担：快捷操作 + 最近笔记 + 待办 + 我的知识库，每段都写明是哪个库的上下文。 |
| `features/settings/components/mobile-me.tsx` | 修改 | 「更多」入口按新 tab 结构调整（知识库升为 tab 后不再重复出现）。`features/settings/components/__tests__/mobile-me.test.tsx` 同步。 |
| `app/(mobile)/m/wikis/page.tsx` | 修改 | 去掉已废弃的 `description` prop。 |

**移动端 E2E 计划外的三处修正**（全部已纳入上面的 72 passed）：
`mobile-core.spec.ts` 与 `mobile-notes-title.spec.ts` 里的"新建知识库"按钮定位
从可访问名改为 `data-testid="mobile-base-create"`——新的画廊上「新建知识库」有两个触发点
（页头主按钮 + 网格末尾卡片），按名字定位会命中两个而触发 strict mode 报错；
tab 断言同步改为 4 格，并新增"选中格是 accent 实心胶囊、未选中格是透明底"的形状检查。

---

## 纯函数工具（`apps/web/src/lib/**`）

| 文件 | 状态 | 作用与原因 |
|------|------|------------|
| `format-time.ts` | **新增** | `formatRelativeTime`（刚刚 / n 分钟前 / 昨天 / 上周 / n 个月前…）与 `formatCountLine` / `formatCardMeta`。设计稿统一用相对时间，卡片上裸露 `2026-09-13 23:44` 读不出远近。`now` 可注入，所以边界能被单测钉死；未来时间（服务端时钟略快）按"刚刚"处理而不是显示负数。零值维度不占位——"0 个任务"是噪音。 |
| `__tests__/format-time.test.ts` | **新增** | 12 条用例：边界取整、缺失/非法输入返回空串、未来时间、零值过滤、`·` 分隔符不悬空。 |

---

## 端到端测试（`apps/web/e2e/**`）

| 文件 | 状态 | 作用与原因 |
|------|------|------------|
| `ui-redesign.spec.ts` | **新增** | 重设计验收 11 条：语义 Token 在浅/深两态取值不同且驱动实际样式、侧栏一级导航只剩跨库能力、二级 Tab 可达、顶栏两种形态、画廊渐变封面与分段筛选、渐变按 id 稳定、`?new=1` 创建跳转、笔记行列表、编辑器头部与纸面限宽、左侧目录。 |
| `theme.spec.ts` | 修改 | 主题标签改成「浅色/深色」；新增一条**把设计系统承诺变成可执行检查**的用例：浅/深两态下同一元素的 Token 取值必须不同、但页面类名一致（证明没有靠 `dark:` 打补丁）。抽了 `setTheme()` 助手等菜单完全收起——Base UI 下拉的收起动画期间旧菜单项还在 DOM 上，紧接着点触发按钮会拿到正在卸载的元素。 |
| `notes.spec.ts` | 修改 | 编辑器高度断言改为量 `note-panel`（"占满视口"的职责已从编辑器移到面板），滚动断言改为 `note-scroll`；离开笔记改用顶栏切换器（面包屑在知识库内已让位给二级 Tab）。 |
| `notes-image-upload.spec.ts` | 修改 | 工具栏「图片」按钮的定位限定在 `getByRole("toolbar")` 内——全局 `getByRole("button", { name: /图片/ })` 会先命中左侧目录里标题含「图片」的行（dnd-kit 给每行注入了 `role="button"`），filechooser 永不出现。 |
| `mobile-core.spec.ts` | 修改 | tab 断言改 4 格 + 新增"选中格 accent 实心胶囊 / 未选中格透明底"的形状断言；新建入口与列表等待改 testid 与 `data-state`（`count()` 不会等待，加载中会读到 0 而重复建库）。 |
| `mobile-notes-title.spec.ts` | 修改 | 新建知识库改 testid，并补上"创建后跳进新库"的等待。 |
| `ai-stream.spec.ts` | 修改 | 侧栏已无「工作台」导航项，改用品牌位链接做 SPA 软导航。 |
| `auth.spec.ts` `cli-authorize.spec.ts` | 修改 | 登录落点从 `/dashboard` 改为 `/notes`（dashboard 现在是重定向）。 |
| `support/account.ts` | 修改 | `ensureKnowledgeBase` 改用 testid 并等待跳进新库；新增 `openKnowledgeBase()`；`loginThroughUi` 等最终地址。 |
| `global-setup.ts` | 修改 | `request.newContext` 补 `ignoreHTTPSErrors`——globalSetup 的 context 不吃 config 的 `use.ignoreHTTPSErrors`。 |
| `playwright.config.ts` | 修改 | 仅当 `E2E_BASE_URL` 显式为 `https:` 时才设 `ignoreHTTPSErrors`（默认的 http://localhost 不受影响）；显式给了该变量时不再尝试拉起本地 `next start`（自签地址上的健康检查必然等到 120s 超时）。 |

---

## 文档

| 文件 | 状态 | 作用与原因 |
|------|------|------------|
| `README.md` | 修改 | 「端到端与性能门禁」节：更新用例描述与 Lighthouse 路由（`/dashboard` → `/notes`）、删掉过时的"22 条 / 29 条"硬编码数字；新增两条踩坑——**镜像必须与 `E2E_BASE_URL` 同域重建**（`NEXT_PUBLIC_APP_URL` 构建期内联 + BFF `checkOrigin` 逐字比对，不一致则全部 403），以及 `playwright.config.ts` 的 TLS/`webServer` 新行为。 |
| `.claude/context/frontend.md` | 修改 | 新增「信息架构」与「设计系统（Token 三层）」两节，含 `bg-accent` 旧新语义冲突的提醒；目录结构补上 `lib/format-time.ts`、`features/<f>/lib/`、`features/<f>/components/mobile/`。 |
| `docs/changelist/2026-09-14-ui-redesign.md` | **新增** | 本文件。 |

> `docs/ui/Anynote 新前端 UI 重设计.pdf` 是本批的输入材料，作为既有未跟踪文件随本批入库。

---

## 审计要点

按"最该重点看"排序：

1. **`src/app/globals.css` 的 Token 定义**（设计系统的单一来源）。
   所有页面的颜色、字阶、圆角、投影都由它决定；shadcn 兼容层是有意保留的兜底，
   评审时确认 `--color-*` 兼容层与上面语义层的映射方向没写反（尤其
   `--color-background: var(--surface-grouped)`——旧代码里的 `bg-background` 期望的是
   浅灰分组底，不是纯白）。

2. **`components/layout/navigation.ts` 的信息架构**（影响面最大、最影响使用习惯）。
   一级导航从 6 项平铺变成"知识库 + 跨库能力"，四类子资源降为二级 Tab。
   重点看 `knowledgeBaseSectionHref()` 的地址约定与 `mobileTabs` 的匹配前缀表——
   移动端 tab 高亮、`toMobileHref` 映射、`lib/mobile/search.ts` 的候选集都从这里派生。

3. **`features/notes/components/knowledge-base-gallery.tsx` 的 `selectBases()`**
   （业务规则，易错）。三个分段对应三个**不同后端端点**（`/bases`、
   `/bases/managerList`、`/bases/organizations`），不是同一份数据的本地切片；
   组织库与我参与的库可能重叠，去重按 id 且保留先出现的那份。改这里要同步
   `components/__tests__/knowledge-base-gallery.test.ts`。

4. **`features/notes/components/create-base-dialog.tsx` 的触发元素契约**
   （HTML 合法性，已实测踩坑）。`trigger` 传的是**内容**不是元素：`DialogTrigger`
   自己渲染可点元素，套一层 `<button>` 会得到 `<button><button>` 非法嵌套，
   浏览器把内层提出来后点击落不到触发器上；同时 `nativeButton` 必须跟着 `trigger`
   一起翻。新增调用方时若发现"点不开"，先看这里。
   `components/__tests__/create-base-dialog.test.tsx` 有 8 条用例钉住它。

5. **`apps/web/e2e/ui-redesign.spec.ts`**（把设计约束变成可执行断言）。
   它不只测"页面能打开"，而是测 Token 真的驱动了样式、渐变真的按 id 分配、
   纸面真的有宽度上限。评审时注意其中哪些断言是**回归护栏**——比如
   "侧栏一级导航里不能出现慕课/任务"，重设计回退时会立刻红。

6. **概览章节「发现的既有后端缺陷」**（跨出了本批范围，但会影响"用起来对不对"）。
   新建的空笔记不会出现在自己的列表里，原因是 `selectNoteList` 从
   `n_note_operation_log` 起 join，而那张表只在内容 diff 非空时才写。
   本批没改后端，已在 `ui-redesign.spec.ts` 里留下注释与复现路径，**建议合并后单独开修**。

7. **`apps/web/playwright.config.ts` 与 `e2e/global-setup.ts` 的环境开关**
   （安全相关）。`ignoreHTTPSErrors` 只在显式 `https:` BASE_URL 下打开，
   默认 `http://localhost` 不受影响——这个开关会静默削弱所有本地用例的传输安全假设，
   改动时别把它变成无条件 `true`。同理，显式给了 `E2E_BASE_URL` 就不再尝试
   拉起本地 `next start`（自签地址上的健康检查必然等到 120s 超时）。
