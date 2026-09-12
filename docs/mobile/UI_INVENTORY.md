# 移动端适配现状盘点（逐页核对）

> 文档版本：v1.0 | 创建 2026-09-12 | 状态：**核对完成，未开工**
> 关联文档：[README.md](./README.md) · [MOBILE_PLAN.md](./MOBILE_PLAN.md)（方案） · [MOBILE_MILESTONES.md](./MOBILE_MILESTONES.md)（执行）
> 本文是方案的**证据附录**：每条结论都带 `文件:行` 出处，改方案前先确认这些事实是否仍成立。
> 核对对象：`apps/web` 分支 `fix/notes-editor-bugs`（与 `dev` 同 tree），以及 `apps/web-legacy`。

---

## 1. 一句话结论

| 对象 | 结论 |
|------|------|
| `apps/web`（新前端） | **部分适配**。外壳、列表页、表单页窄屏可用；三个 master-detail 页面的次级面板在手机上**不可达**；`/ai/pdf` 在 < 1024px **横向溢出**；无任何移动端门禁 |
| `apps/web-legacy`（线上在用） | **基本未适配**。整个 `src/` 只有 1 处断点前缀，28 处硬编码 px 宽度，2 处 `@media` 全是注释 |

---

## 2. `apps/web` 已经做对的部分（不要重做）

| 项 | 证据 | 说明 |
|----|------|------|
| viewport meta | `app/layout.tsx` 无 `viewport` export | 用 Next 15 默认注入的 `width=device-width, initial-scale=1`，不会被当桌面页渲染 |
| 侧边栏抽屉 | `ui/sidebar.tsx:63`、`hooks/use-mobile.ts:9` | `useIsMobile()` 阈值 768px，窄屏走 `Sheet`（`SIDEBAR_WIDTH_MOBILE = 18rem`），`AppHeader` 有 `SidebarTrigger` → 主导航在手机上可达 |
| `Sheet` 支持底部弹出 | `ui/sheet.tsx:56` | 已有 `data-[side=bottom]` 分支，移动端动作面板不需要新组件 |
| 列表 / 卡片页 mobile-first | `note-list.tsx:43`、`knowledge-base-grid.tsx:25`、`doc-library.tsx:113`、`mooc-page.tsx:72` | 统一 `grid gap-4 sm:grid-cols-2 lg:grid-cols-3`，默认单列 |
| 表格横向滚动 | `ui/table.tsx:9` | `table-container` 带 `overflow-x-auto`，不会把 body 顶宽 |
| 对话框宽度 | `ui/dialog.tsx:52` | `max-w-[calc(100%-2rem)] sm:max-w-sm` |
| 认证页版式 | `app/(auth)/layout.tsx` | `max-w-sm` + `px-4`，窄屏正常 |
| 视口高度单位 | `note-editor.tsx:40`、`chat-page.tsx:44`、`pdf-page.tsx:114` | 用 `100svh` 而非 `100vh`，对移动浏览器地址栏伸缩是正确选择 |
| 工具栏不裁切 | `styles/tiptap.css:59-70` | `flex-wrap: wrap`，窄屏折行而不是溢出 |
| 头部渐进隐藏 | `app-header.tsx:22 / 27 / 43-45` | 面包屑 `hidden sm:block`，搜索按钮文案 `hidden md:inline`，快捷键 `hidden lg:inline` |
| 内容区内边距 | `layout/app-shell.tsx:29` | `p-5 sm:p-8` |

**结论**：组件库底子（shadcn + base-ui + Tailwind v4）没有问题，不适配的是**页面版式范式**。

---

## 3. `apps/web` 的问题清单（按严重度排序）

### P0-1 `/ai/pdf` 在 < 1024px 横向溢出

| | |
|---|---|
| 位置 | `features/ai/components/pdf/pdf-page.tsx:114` |
| 结构 | 根容器 `flex`；左 `aside w-72 shrink-0`（:115，288px）；中间预览 `hidden … lg:flex`（:251）；右问答 `w-full min-w-72 shrink-0`（:278） |
| 现象 | < lg 时剩下两块都带 `shrink-0`，在 375px 视口里求和约 `288 + 375 = 663px`，父级没有任何 `overflow` 约束 → **body 级横向滚动**；同时 PDF 预览整块消失 |
| 性质 | 这是桌面版自身的缺陷，**不属于移动端新增范围**，应独立修复（见 MOBILE_MILESTONES M10.0） |

### P0-2 三个次级面板在手机上完全不可达

全仓 `Sheet` 只被 `ui/sidebar.tsx` 用了一处（`grep -rn 'from "@/components/ui/sheet"' src` 仅 1 个非测试命中），所以这些被 `hidden` 掉的面板**没有任何移动端替代入口**：

| 面板 | 位置 | 隐藏断点 | 手机上失去的能力 |
|------|------|---------|----------------|
| 笔记目录树 | `note-editor.tsx:147` | `< lg` | 无法在知识库内切换笔记、无法移动笔记 |
| AI 会话列表 | `chat-page.tsx:45` | `< md` | 无法切换历史会话（只能手改 URL） |
| 工作流节点面板 | `workflow-canvas.tsx:218` | `< lg` | 无法添加节点 |

**这不是断点能修的**：三个页面都是 master-detail 双栏，移动端正确形态是**两个路由 + 返回导航**，而不是折叠面板。

### P1-1 触摸目标与工具栏密度

| 项 | 证据 | 问题 |
|----|------|------|
| 工具栏 / 气泡菜单按钮 28×28px | `styles/tiptap.css:72-78` | 低于 44px 触摸推荐值 |
| 工具栏 23 个按钮 | `editor/core/toolbar.tsx`（`<ToolbarButton` 出现 23 次） | 23 × 约 30px ≈ 690px，375px 宽需折 3 行，约吃掉 90px 垂直空间，而编辑区总高是 `calc(100svh-9rem)`（`note-editor.tsx:40`） |

### P1-2 hover 才出现的操作入口

| 位置 | 类名 |
|------|------|
| `conversation-list.tsx:108` | `opacity-0 group-hover:opacity-100` |
| `pdf-page.tsx:236` | `opacity-0 group-hover:opacity-100` |

触摸设备上 `:hover` 行为不一致（iOS Safari 需"先点一次再点一次"），属于移动端反模式。
`ui/sidebar.tsx:546` 的同类写法已经用 `md:opacity-0` 限定在桌面，可作为参考修法。

### P1-3 触摸手势冲突：拖拽移动笔记

`components/note/note-tree.tsx:44`：

```ts
const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
```

只配了 `PointerSensor` + 距离约束。触摸下 6px 位移判定会与页面滚动抢手势（dnd-kit 对触摸推荐 `delay` 约束或显式 `touch-action`）。移动端不应启用拖拽。

### P1-4 依赖硬键盘的入口

| 入口 | 位置 | 移动端状况 |
|------|------|-----------|
| ⌘K / Ctrl+K 命令面板 | `layout/command-palette.tsx`、`ui/sidebar.tsx:88-97` | 手机无硬键盘；头部虽有按钮，但文案 `hidden md:inline` 后只剩一个放大镜图标，且面板内容是桌面式列表 |

### P2-1 桌面式版式需要移动端重排（不影响可用性但体验差）

| 页面 | 位置 | 问题 |
|------|------|------|
| `/tasks` | `features/tasks/components/task-table.tsx` | `@tanstack/react-table` + 桌面表格，窄屏只能横向滚动；描述列 `max-w-72`（:57） |
| `/wikis` | `features/wikis/components/wikis-page.tsx` | 知识库 → 笔记 → 只读正文三级，用组件内 `useState` 而非 URL，窄屏下没有返回语义 |
| `/mooc/[id]` | `features/mooc/components/mooc-detail.tsx:32` | `lg:grid-cols-[20rem_1fr]`，窄屏退化为纵向堆叠，章节树与播放器顺序需重排 |
| `/dashboard` | `app/(workspace)/dashboard/page.tsx` | 当前只渲染 `WorkspacePlaceholder`（欢迎语 + 骨架网格），移动端为它设一个 tab 不划算 |
| `/ai/workflow` | `features/ai/components/workflow/workflow-canvas.tsx` | `@xyflow/react` 画布，手机上没有可接受的交互方案 |

### P2-2 全局缺失项

| 项 | 现状 |
|----|------|
| CSS `@media` | `src/**/*.css` 里 **0 条**（Tailwind v4，配置在 `globals.css` 的 `@theme inline`，无 `tailwind.config.js`） |
| 断点前缀分布 | 仅 27 个文件出现 `sm:` / `md:` / `lg:` / `xl:`，其中 13 次在 shadcn 自带的 `ui/sidebar.tsx` 里 |
| `themeColor` / 移动浏览器 chrome 着色 | 未设置（`app/layout.tsx` 只有 `metadata`，无 `viewport` export） |
| 软键盘策略 | 未设置 `interactiveWidget`，编辑页未处理 `VisualViewport` |
| 安全区（刘海屏 / 底部 home 条） | 无 `env(safe-area-inset-*)` 使用 |

---

## 4. 门禁现状：没有任何移动端覆盖

| 门禁 | 配置 | 移动端覆盖 |
|------|------|-----------|
| Playwright | `playwright.config.ts:37` `projects: [{ name: "chromium", use: devices["Desktop Chrome"] }]`，`fullyParallel: false`、`workers: 1` | ❌ 仅桌面 |
| E2E 用例 | `e2e/` 6 个 spec（`auth` / `notes` / `collab` / `ai-stream` / `pdf-upload` / `theme`），共 20 条 | ❌ 无移动端 spec |
| Lighthouse | `scripts/lighthouse.mjs:15` 显式加载 `lighthouse/core/config/desktop-config.js`；阈值 `performance 0.9` / `accessibility 0.95`（`scripts/lib/lighthouse.mjs:5-8`）；默认路由 5 条（:14） | ❌ 仅桌面 form factor |
| 产物预算 | `scripts/lib/bundle.mjs:5-11` `initialJs: 300KB`、`editorChunk: 250KB`（gzip），全路由同一阈值 | ⚠️ 不区分移动端路由 |

> `scripts/lib/bundle.mjs` 的 `toRoutePath()` 会把 Next 路由组 `(xxx)` 从 key 里剥掉（:36-45），
> 所以新增 `(mobile)` 路由组后，预算报告里会直接出现 `/m/...` 路由，不需要改解析逻辑——
> 但**阈值分桶要改**（见 [MOBILE_PLAN §3 D8](./MOBILE_PLAN.md)）。

---

## 5. 规划资产：可以零改动复用的部分

| 层 | 规模 | 移动端复用率 |
|----|------|-------------|
| `src/features/**/*.ts`（query hooks、zod schema、query-keys、SSE、workflow 存储） | 32 个文件 | **100%，一行不改** |
| `src/lib/**`（api、auth、collab、editor、notes diff、env） | 26 个文件 | **100%** |
| `src/app/api/**`（BFF Route Handlers） | 345 行 | **100%** |
| `src/middleware.ts` | 15 行 | 复用，仅可能增加 UA 分支 |
| `packages/api-core`、`packages/api-client` | — | **100%** |
| `src/components/ui/*` | 21 个 | 大部分复用（`Sheet` 已支持 bottom；触摸尺寸需补） |
| `src/components/editor/*` | 预设 4 套（`presets/types.ts:5`）、`ToolbarVariant = "full" \| "minimal"`（`toolbar.tsx:32`） | 复用内核，**新增一个 toolbar variant** |
| `src/components/layout/navigation.ts` | 3 组 9 项 + 设置 + 新建笔记 | 复用注册表，新增移动端 tab 派生 |
| `src/components/**/*.tsx` + `src/features/**/components/*.tsx` | 8195 行 | 约 30% 可直接用（卡片、表单、骨架），master-detail 页面需重写版式 |

**LOC 量级**（不含测试）：UI `.tsx` 8195 行 / 逻辑 `.ts` 4096 行。移动端复用掉的正是贵的那一半。

---

## 6. 与后端缺口的关系（M7.6）

`docs/refactor/FRONTEND_MILESTONES.md` 的 M7.6 记录的 5 个后端缺口**同样卡移动端**，移动端方案不负责修它们：

| 缺口 | 对移动端的影响 |
|------|--------------|
| ai-nio SSE 在 servlet 栈取不到登录上下文 | `/m/ai/chat` 只能验收错误路径，与桌面同状 |
| PDF 上传 note→file Feign 转存失败 | `/m/ai/pdf` 的上传同样走不通 |
| 图片分片直传第 1 步被 `@InnerAuth` 拦截 | 移动端编辑器插图（含拍照上传）走不通 |
| `PUT /system/user/{userId}` 是内部端点 | `/m/settings` 资料保存走不通 |
| mooc 权限规则缺 `n:mooc:read` | `/m/mooc/[id]` 详情走不通 |

→ 移动端的验收标准必须**显式标注这些路径与桌面同步阻塞**，不能因为移动端跑不通就判定移动端实现有问题。

---

## 7. `apps/web-legacy` 核对结果

| 项 | 数据 |
|----|------|
| 断点前缀总数 | **1 处**（`src/components/home/HomeHead/index.tsx:17` 的 `hidden sm:flex`） |
| `@media` | 2 处，**全部是注释掉的死代码**（`app/globals.css:11`、`components/home/HomeFooter/fotter.scss:34`） |
| 硬编码 px 宽度且无断点 | 28 处，例：dashboard 侧栏 `w-[250px]`、AI 对话 `w-[800px]`、PDF 预览 `w-[500px]`、wiki 布局 `w-[250px]`、登录卡 `w-[350px]` |
| UI 栈 | antd 5 + NextUI 2（组件自身有限自适应，页面版式是固定宽度桌面布局） |

**结论**：legacy **不做移动端适配**。它的删除条件已在 `CLAUDE.md` 的 Phase 5 表中定义（M7.6 缺口关闭 + 新前端接管流量稳定 1 周 + E2E 全绿），移动端工作不进入该条件，也不为 legacy 增加任何适配投入。
