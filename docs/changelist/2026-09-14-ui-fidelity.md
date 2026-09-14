# 前端 UI 还原（对齐设计稿逐页截图比对）

- **日期**：2026-09-14
- **分支**：`feat/ui-fidelity` → `dev`
- **上一批**：`docs/changelist/2026-09-14-ui-redesign.md`（建立设计系统与信息架构）
- **设计依据**：`docs/ui/Anynote 新前端 UI 重设计.pdf`（11 页：p01 设计系统、p02 信息架构、p03/p05 画廊浅/深、p04/p06 编辑器浅/深、p07/p10 移动画廊浅/深、p08 移动知识库详情、p09/p11 移动编辑器浅/深）

## 概览

上一批把**配色 Token** 对齐了设计稿，但**信息架构与版式仍是旧的**。本批改用「真实页面截图 vs 设计稿逐页比对」的办法定位差异：把设计稿逐页导出 PNG，用本机 Docker 全栈在 `1440×900 @2x`（桌面）与 `390×844 @2x`（移动）下截同样的页面，再按像素扫描行/列的色块边界量出边距、圆角、行高。

据此改了三块：**知识库导航从顶栏移进侧栏**、**编辑器版式按阅读顺序重排并去掉桌面常驻工具栏**、**画廊与列表的卡片/行结构**。

| 项目 | 数量 |
|------|------|
| 新增文件 | 3 |
| 修改文件 | 21 |
| 删除文件 | 2 |
| 增 / 删行数 | +1129 / −463 |

按目录分布：`apps/web/src/components/layout/**`（4 个，含侧栏两态与新组件）、
`apps/web/src/features/notes/**`（7 个）、`apps/web/src/components/editor/**`（3 个）、
`apps/web/e2e/**`（4 个）、`packages/api-core/**`（1 个）、`.claude/context/**`（1 个）。

### 验证结果

| 命令 | 结果 |
|------|------|
| `pnpm --filter web test` | **106 文件 / 1061 用例全绿**（本批起点 1031） |
| `pnpm --filter web test:e2e` | **74 passed / 0 failed / 1 skipped**（跳过的是 `pdf-upload.spec.ts` 里既有的条件跳过） |
| `pnpm --filter web typecheck` | 0 error |
| `pnpm check`（Biome） | 495 文件 clean |
| `pnpm --filter web build` | 41 页全部编译通过 |
| `pnpm --filter web bundle:budget` | 三条全 PASS：`/notes` **285.6** / 300 KB、`/m/notes` **224.7** / 250 KB、编辑器 chunk **13.7** / 250 KB |
| `pnpm --filter web lighthouse:budget` | 全 PASS：`/login` 100 · `/dashboard`→`/notes` 99 · `/notes` 99 · `/docs` 99 · `/ai/chat` 99，无障碍均 96 |
| `pnpm --filter web lighthouse:budget:mobile` | **4/5 PASS，`/m/dashboard` FAIL（81–83 / 门槛 85）——既有问题，见下方「审计要点」** |

## 一、侧栏：知识库内换一套内容（本批最大的结构性改动）

设计稿 p04 的侧栏是「当前知识库卡片 → 知识库内容（六个带图标的二级入口 + 计数）
→ 分隔线 → 笔记目录」；库外才是「搜索 + 知识库列表 + 跨库能力」。
此前我们两处都放二级 Tab（顶栏一行 + 侧栏罗列知识库），进库后侧栏还在回答
"我有哪些库"，而顶栏挤了六个入口。

| 文件 | 状态 | 作用与原因 |
|------|------|-----------|
| `apps/web/src/components/layout/knowledge-base-sidebar.tsx` | 新增 | 知识库内侧栏的三件套：`SidebarKnowledgeBaseCard`（渐变块 + 类型/篇数 + 切库箭头，回画廊）、`SidebarKnowledgeBaseNav`（六个二级入口，图标 + 计数，当前项 accent 底）、`SidebarNoteDirectory`（分隔线下的笔记目录，**静态列表**）。目录刻意不做拖拽：设计稿没有拖拽手柄，而 dnd-kit 一旦被侧栏静态引入就进所有工作区路由首屏。 |
| `apps/web/src/components/layout/app-sidebar.tsx` | 修改 | `SidebarBody` 按路径二选一：库内渲染卡片 + 二级导航 + 笔记目录，库外渲染知识库列表 + 跨库能力。库内把 `SidebarKnowledgeBaseCard` 与三级计数（笔记/慕课/任务各取 `total`）一起订阅——计数与对应 Tab 页共用同一棵 query 缓存，切 Tab 不重复请求。另导出纯函数 `sectionSegmentFromPath` 与 `parseNoteIdFromPath` 供单测钉住边界。 |
| `apps/web/src/components/layout/app-header.tsx` | 修改 | 删掉 `KnowledgeBaseTabs`（六个 Tab 移进侧栏），库内顶栏只留知识库切换器（名称 + 类型 + 下拉箭头）；加 `data-testid="app-header"` 供 E2E 断言"顶栏里没有第二份二级导航"。 |
| `apps/web/src/components/layout/__tests__/knowledge-base-sidebar.test.tsx` | 新增 | 19 条：路径解析边界（`/notes/70` 不被 `baseId=7` 误认、静态段不是 noteId）、卡片三态（普通/组织/加载中）、六个入口的 href 与 `aria-current`、**计数为 0 时照常显示**（0 是有效信息不是缺数据）、目录空态与加载态、非笔记面收起。 |
| `apps/web/src/components/layout/__tests__/app-shell.test.tsx` | 修改 | 原本断言"顶栏给切换器与二级 Tab""侧栏高亮当前知识库"的 3 条按新结构重写，并新增"库内不再列出别的知识库""编辑器里目录高亮当前那篇""非笔记面收起目录"。 |

## 二、编辑器版式

设计稿 p04：顶栏一条状态条（保存徽标 + 更多）→ 文章标题 → 元信息行（作者 · 更新 ·
阅读次数）+ 细分割线 → 正文 → **末尾**字数；**没有常驻工具栏**。
移动端 p09 有贴底工具栏，并在标题下多一行元信息。

| 文件 | 状态 | 作用与原因 |
|------|------|-----------|
| `apps/web/src/features/notes/components/note-editor.tsx` | 修改 | ① 标题/元信息/正文/末尾字数按阅读顺序重排，元信息行下加 `border-b`；② 字数**只留末尾一处**（`data-testid="note-char-count"` 随之移到 footer），元信息行只留「更新于 · 所属知识库」——设计稿那行的作者与阅读次数后端没返回，不编；③ 删掉左侧目录栏（目录在侧栏）；④ 传 `toolbar="none"`；⑤ **修掉删除笔记后跳 `/notes/<id>/notes`**（该地址命中 `[baseId]/[noteId]`、把字面量当 noteId → `notFound()`，用户删完直接掉 404），改跳列表页裸地址。 |
| `apps/web/src/features/notes/components/mobile/note-editor-mobile.tsx` | 修改 | 补标题与正文之间的元信息行（设计稿 p09）：更新 · 字数 · 所属知识库；缺字段时不留下悬空的分隔点。 |
| `apps/web/src/components/editor/core/toolbar.tsx` | 修改 | `ToolbarVariant` 加第四种 `none`：在 `useEditorState` 之后（保证 hooks 顺序不变）直接返回 `null`，不建 23 个按钮。 |
| `apps/web/src/components/editor/core/tiptap-editor.tsx` | 修改 | `none` 形态下不挂常驻工具条，但**保留选区气泡菜单**——它是这种情况下唯一的就地格式化入口（其余是 Slash 菜单与快捷键）。 |
| `apps/web/src/features/collab/components/doc-workspace.tsx` | 修改 | 协同文档桌面版同样传 `toolbar="none"`，与笔记保持一致。 |
| `apps/web/src/components/editor/__tests__/mobile-toolbar.test.tsx` | 修改 | 新增 2 条钉住 `none`：工具条整条不渲染但编辑器本体在，`data-toolbar` 仍是 `none`；只读预设不受影响。 |

## 三、画廊与列表

设计稿 p03 的卡片是**内嵌封面**（四周 12px 白边、封面自身圆角 10、渐变左上→右下），
页头标题是 Display 字阶，网格前有「最近访问 + 计数」分组标题。
移动端 p08 的知识库详情是**单行库头 + 分隔线行列表**，不是卡片堆。

| 文件 | 状态 | 作用与原因 |
|------|------|-----------|
| `apps/web/src/features/notes/components/knowledge-base-gallery.tsx` | 修改 | ① 卡片改为 `p-3` + 封面 `rounded-md`（内嵌而非通栏出血——通栏会让相邻两卡的色块连成一条色带，边界反而看不出来）；② 标题改 `text-display`、副标题改 `text-body`；③ 网格前加「最近访问 + 共 N 个知识库」分组标题。副标题**只报知识库个数**：设计稿那行还有「N 篇笔记 · N 节慕课 · N 个任务」，但后端没有跨知识库的聚合端点（`GET /notes/list` 返回「暂未实现」，慕课与任务都必须带 `knowledgeBaseId`），前端拼出来要么 N 次请求、要么是个会过期的假数字。 |
| `apps/web/src/app/globals.css` | 修改 | `.kb-cover` 渐变方向改 `to bottom right`，五组色值改用设计稿 p03 的取样值（起点更饱和、终点更亮）。 |
| `apps/web/src/features/notes/components/mobile/note-list-mobile.tsx` | 修改 | 库头收成**一行**「类型 · 篇数」（原本还有第二行 `detail`，会把 Tab 条挤出首屏）；笔记列表从卡片堆改成**一个白底容器 + 行间 1px 分隔线**（卡片会把每行的上下留白叠起来，一屏少看两条），行高 `min-h-16`。 |
| `apps/web/src/features/notes/components/__tests__/knowledge-base-gallery-layout.test.tsx` | 新增 | 5 条版式断言：页头 Display 字阶且副标题不含「篇笔记」、分组标题排在网格之前、封面内嵌（`rounded-md` + 卡片 `p-3`）、加载态与空态都不渲染分组标题。 |
| `apps/web/src/features/notes/components/__tests__/note-editor.test.tsx` | 修改 | 字数位置断言从"元信息行"改为"正文末尾"，并新增"元信息行里不出现字数"；新增"编辑器不再自带宽目录栏"；新增**删除后跳转的回归用例**（已实测在旧代码上失败）。 |

## 四、数据层

| 文件 | 状态 | 作用与原因 |
|------|------|-----------|
| `packages/api-core/src/note-schemas.ts` | 修改 | `knowledgeBaseSchema` 补 `type` 字段。此前解析时把它丢了，侧栏卡片与顶栏因此判断不了「普通知识库 / 组织知识库」——而这两种库用的是**不同的列表端点**（`/bases` vs `/bases/organizations`），这个字段不能丢。 |

## 五、删除

| 文件 | 状态 | 作用与原因 |
|------|------|-----------|
| `apps/web/src/components/note/note-tree.tsx` | 删除 | 设计稿的笔记目录是静态列表（无拖拽手柄），而它是全仓**唯一**的 dnd-kit 消费者：被侧栏静态引入后进所有工作区路由首屏，`/notes` 一度贴到 300 KB 预算线（298.8）。「把笔记移到别的知识库」由编辑器操作菜单承担，那条路径不需要拖动、移动端也能用。删除后 `/notes` 降到 285.6 KB。 |
| `apps/web/src/components/note/__tests__/note-tree.test.tsx` | 删除 | 随被测文件一起删。 |
| `apps/web/package.json` | 修改 | 摘掉随之失去消费者的 `@dnd-kit/core` 依赖。 |

## 六、端到端用例

| 文件 | 状态 | 作用与原因 |
|------|------|-----------|
| `apps/web/e2e/ui-redesign.spec.ts` | 修改 | 二级 Tab 的断言改到侧栏（`getByTestId("app-sidebar")` 内），目录断言改为侧栏目录并校验当前笔记高亮；新增"侧栏库内/库外换内容"与"顶栏在库内没有第二份二级导航"。 |
| `apps/web/e2e/notes-title.spec.ts` | 修改 | 目录行现在是「标题 + 更新于…」两行，`toHaveText` 收敛为对标题那一行的断言。 |
| `apps/web/e2e/notes-image-upload.spec.ts` | 修改 | 插图入口从工具栏按钮改走 **Slash 菜单**（桌面已无常驻工具栏）。这条路径本来就是占位文案「输入 "/" 唤起命令」指向的那条，也比测工具栏更贴近真实用法。 |
| `apps/web/e2e/mobile-core.spec.ts` | 修改 | 新增"知识库详情：单行库头 + 行列表"：补建第二篇后按**算出来的**边框宽度、行高、圆角、阴影判定行列表形态（不数类名——`last:border-b-0` 本身含 `border-b` 子串，数类名会数错）。 |

## 七、文档

| 文件 | 状态 | 作用与原因 |
|------|------|-----------|
| `.claude/context/frontend.md` | 修改 | 补一张工具栏形态表（`full` / `minimal` / `mobile` / `none`）——`none` 是新增的第四种，不说清会让人以为桌面漏了工具栏。原表把「工具栏」写成 `full` 预设的属性，已经不准。 |

## 审计要点

1. **顶栏与侧栏各只有一份二级导航**（`app-header.tsx` 删 `KnowledgeBaseTabs`、
   `app-sidebar.tsx` 的 `SidebarBody` 二选一）。这是本批最容易改漏的地方：
   两处都渲染会让人分不清哪个是主导航，`kb-tab-*` 的 testid 也会撞。
   E2E 里"顶栏在库内没有第二份"就是防这个的。

2. **`toolbar="none"` 必须保留气泡菜单**（`tiptap-editor.tsx`）。常驻工具条去掉后，
   选区格式化只剩气泡菜单、Slash 菜单与快捷键三条路；把气泡菜单一起关掉
   等于桌面端没法加粗。单测只钉了"工具条不渲染"，气泡菜单那条靠
   `BubbleMenuPortal` 的条件分支读代码确认。

3. **删除笔记的跳转地址**（`note-editor.tsx`）。`/notes/<baseId>/notes` 会命中
   `[baseId]/[noteId]` 路由、把字面量 `"notes"` 当 noteId 然后 `notFound()`。
   回归用例已实测在旧代码上失败（`expected "vi.fn()" to be called with ['/notes/7']`）。

4. **计数为 0 与计数缺失是两回事**（`knowledge-base-sidebar.tsx`）。
   `typeof count === "number"` 才会渲染——0 要显示（库里确实没有慕课），
   `undefined` 不显示（还没查到）。写反了会把"加载中"显示成"0 个"。

5. **`knowledgeBaseSchema` 的 `type` 字段**（`packages/api-core/note-schemas.ts`）。
   这是 `apps/web` 与 `apps/cli` **共用**的 schema，加字段要确认 CLI 侧不受影响
   （CLI 用的是同一份 `knowledgeBaseSchema`，多一个可选字段是兼容的）。

6. **移动端 `/m/dashboard` 的 Lighthouse 未达门槛（81–83 / 85）是既有问题，不是本批引入**。
   已用 9 小时前构建的 `anynote/anynote-web:local` 镜像（早于本批全部提交）在同一台机器上
   实测同一路由：**79 分**，同样 FAIL；本批的产物反而略高（81–83）。
   `docs/mobile/MOBILE_MILESTONES.md` 的 T5.2「Lighthouse 移动模式跑通」本就未勾选
   （原文：未跑），本批是**首次实跑**该门禁，因此首次暴露。桌面口径与移动口径其余 4 条路由全绿。
   该页首屏要拉三个查询（`/bases` → 最近笔记 → 待办），且是落地页，待后续工单处理。

## 未做

- **设计稿 p04 侧栏的笔记分组**（「设计原则」「组件规范」这样的折叠分组）没有实现：
  `n_note` 表没有 `group_id` 列，`NoteListVO` / `NoteCreateDTO` / `NoteEditDTO` 里
  也都没有分组字段，`/baseGroups` 只到知识库级别。要做需要先加后端字段与契约。
- **画廊副标题的多维计数**（篇笔记 / 节慕课 / 个任务）同上，见第三章说明。
- **设计稿里笔记列表行的摘要文字与作者、字数**：列表端点
  （`GET /notes`、`POST /notes/bases/{id}`）只返回标题与时间，摘要需要逐篇拉详情，是 N+1。
- 编辑器桌面版去掉常驻工具栏后，`full` 形态只剩 playground 在用；是否保留该形态
  留给后续决定。
