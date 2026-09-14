# 前端架构速查

> 框架：Next.js 15 · React 19 · TypeScript 5 · Tailwind CSS 4 · shadcn/ui
>
> **2026-09-14 起信息架构与设计系统按 `docs/ui/Anynote 新前端 UI 重设计.pdf` 重构**，
> 详见 `docs/changelist/2026-09-14-ui-redesign.md`。

---

## 信息架构：知识库是唯一的顶层对象

后端 `n_knowledge_base` 是入口实体，笔记 / 慕课 / 任务 / 资料 / 成员全部通过
`knowledge_base_id` 归属其下。导航层级复刻这个结构，不再把四类子资源平铺成同级入口：

| 层级 | 内容 |
|------|------|
| L0（侧栏动态列表） | 知识库 —— 来自 `useKnowledgeBasesQuery()` 的缓存，**不是静态路由表** |
| L1（知识库内二级 Tab） | 概览 / 笔记 / 慕课 / 任务 / 资料 / 成员 |
| 跨库能力（侧栏固定分组） | AI 对话 · AI 工作流 · PDF 问答 · 协同文档 |
| 设置 | 收在侧栏页脚的用户卡里，不占一级导航 |

二级 Tab 的地址由 `knowledgeBaseSectionHref(baseId, section)` 生成（`notes` 是裸路径
`/notes/:id`，其余各占一段）。段名都是**静态词**，Next 的路由优先级会把它们排在
`[noteId]` 之前；笔记 id 恒为正整数，因此不会互抢。

> `/dashboard` 保留为登录后的稳定落地地址（middleware 入口分流与既有书签在用），
> 内容 redirect 到 `/notes`，**query 原样带走**（`?desktop=1` 是版式逃生口）。

---

## 设计系统（Token 三层）

```
@theme        → Tailwind 工具类名（bg-surface / text-title / rounded-card）
:root / .dark → 语义 Token 实体（--surface-primary / --label-primary …）
组件          → 只写 Token 类名
```

**页面里不写 `dark:` 分支**：浅色 / 深色是同一套语义名的两组取值。出现 `dark:`
通常意味着漏了一个 Token，应该回来补而不是就地打补丁。

| 组 | Token | 用途 |
|----|-------|------|
| 背景 | `window` / `grouped` / `surface` / `elevated` / `sidebar` | 窗口 / 分组列表 / 内容卡 / 浮层 / 侧栏 |
| 分隔 | `separator` | 分割线、输入框描边 |
| 文字 | `label` / `label-secondary` / `label-tertiary` | 主 / 次 / 弱 |
| 品牌 | `accent` / `accent-soft` | 主按钮与选中态（浅蓝底） |
| 状态 | `success` / `warning` / `danger` / `organization` / `info` | 语义色 |
| 字阶 | `text-display` / `title` / `headline` / `body` / `footnote` | 34 / 22 / 17 / 15 / 13 |
| 圆角 | `rounded-xs` `md` `lg` `xl` `2xl` | 6 / 10 / 14 / 20 / 20 |
| 投影 | `shadow-card` / `shadow-popover` | 卡片与浮层两个高度 |

**踩坑提醒**：旧 shadcn 的 `accent` 是"浅灰 hover 底"，新系统里 `accent` 是**品牌蓝**。
写 `bg-accent` 前先想清楚要的是品牌强调还是 hover 底——后者应该用 `bg-grouped`。

知识库封面渐变由 `features/notes/lib/cover-gradient.ts` 按 **id 取模**选组
（`.kb-cover-0..4` 定义在 `globals.css`）：后端 `cover` 字段是一张全站默认图，
一屏卡片会长得一模一样。改色组要同时改 CSS 与 `KB_COVER_VARIANTS`。

---

## 加载体系（设计稿 P12-P16）

全部加载态收敛为 **5 套组件 × 浅/深 2 主题**，按「形态」而不是按页面切分。
**新写加载态一律先在这里选形态，不要就地写 `animate-pulse` 或裸文字。**

| 形态 | 组件 | 用在哪 |
|------|------|--------|
| 骨架屏 | `components/loading/skeletons.tsx` 的 6 个预设 | 首屏 / 列表 / 表格 / 编辑器 / 文档 |
| 转圈 | `components/loading/spinner.tsx` | **算不出总量**的行内等待：按钮提交、下拉加载、局部刷新 |
| 进度 | `components/loading/progress.tsx` | **算得出总量**的任务：PDF 上传、图片分片、批量导入 |
| AI 流式 | `features/ai/components/stream-states.tsx` | AI 对话与笔记内 AI 续写（共用一套） |
| 品牌启动 | `components/layout/brand-boot.tsx` | 全屏初始化；站内路由切换用 `RouteProgressBar` |

### 选哪个骨架预设

| 预设 | 宿主 |
|------|------|
| `CardGridSkeleton` | 知识库列表 / 慕课列表 / 协同文档库（卡片网格） |
| `ListRowsSkeleton` | 笔记列表 / 成员列表 / 资料列表（行 + 缩略图） |
| `TableSkeleton` | 任务（表格行） |
| `DocumentSkeleton` | PDF 预览（A4 竖版纸面） |
| `EditorSkeleton` | 笔记 / 协作文档 / Wikis（标题 + 参差段落） |
| `PanelSkeleton` | 协同工作区 / 设置面板（一整块） |

**形状必须对得上宿主**：选错了加载完成时整页跳一下，比不显示骨架更糟。
反例记在 `mooc-detail.tsx`（16:9 视频位**不用** `DocumentSkeleton`，那是 A4 竖版）
与侧栏（40px 紧凑行**不用** `ListRowsSkeleton`，那是 `min-h-14` 卡片壳）。

**加载态一律不占布局高度**，与上一条同源：它出现与消失各引发一次重排，等于"页面抖两下"。
`RouteProgressBar` 是这条约束最容易被违反的地方——可见的 2px 由绝对定位子元素画，
外层定位容器是 `h-0`，**不是为了省事**：原来外层自己就是 `h-0.5`，
一亮就把 `#workspace-content` 往下推 2px。配套的三条别动：容器不加 `overflow-hidden`
（会把绝对定位的条裁没）、整条 `pointer-events-none`（条浮在内容上沿，别吃掉那 2px 的点击）、
可见性判定要查内层 `[data-slot="boot-bar"]`（零高度元素在 Playwright 眼里永远不可见）。

### 加载体系的 Token 与动效

| 名字 | 值 / 时长 | 说明 |
|------|-----------|------|
| `--skeleton-base` | 浅 `#E5E5EA` / 深 `#2C2C2E` | 骨架底色。**必须比承载它的那一层高一档**——用 `bg-grouped` 在浅色分组底上等于隐形 |
| `--skeleton-sheen` | 浅 `#F7F7F9` / 深 `#3A3A3C` | 扫光那道亮带 |
| `--animate-shimmer` | 1.4s ease-in-out infinite | 骨架扫光，highlight 从 -30% 扫到 130% |
| `--animate-spin-loading` | 0.8s linear infinite | 转圈。只有"转/停"两态，**不要加缓动** |
| `--animate-think-dot` | 1.2s ease-in-out infinite | AI 思考三点，错峰 0.15s |
| `--animate-caret-blink` | 1s step-end infinite | 流式光标。`step-end` 是刻意的——光标应当"跳" |
| `--animate-logo-{page-1,page-2,spine}` | 1.6s ease-in-out infinite | 品牌 Logo 三段描边，相位写在同一份 keyframes 里（用 `animation-delay` 第二轮会漂移） |
| `--animate-boot-bar` | 3s ease-out forwards | 路由进度条，渐进制到 90% 就停（真实完成由路由接管） |

`keyframes` 刻意写在 `@theme` **外面**：Tailwind v4 只把被工具类引用到的 keyframes
打进产物，而 `skeleton-breathe`（reduced-motion 用）不出现在任何工具类里。

**`prefers-reduced-motion` 降级不等于静止**（设计稿明确要求）：扫光→呼吸、
转圈弧→呼吸、Logo→常显完整形状、光标→常亮。静止处理会让加载态与
"加载完但内容为空"无从区分。

### 无障碍约定

- 文案**必须进 DOM**：只有视觉动效不算状态可见。容器用 `<output>`（隐式 `role=status`），与
  `components/note/save-status.tsx` 同一套写法。
- 转圈的 `label` **只在它独自承载状态时才传**：紧邻已有文字（如「索引构建中」）时传了
  会让读屏念两遍。
- 进度条必须有真实的 `aria-valuenow`；**不确定型**进度（路由进度条）用 `<output>` 而不是
  `role="progressbar"`——挂 progressbar 却不给数值，读屏会说"进度条 0%"或干脆沉默。

### 改动时的门禁

```bash
pnpm --filter web test              # 骨架形状、动画名、aria 语义的单元测试
pnpm --filter web bundle:budget     # 加载组件在首屏包里，注意 300KB 预算
pnpm --filter web test:e2e          # e2e/loading-system.spec.ts：动效真的在跑 / 主题不断层
```

UI 还原度对比（人眼验收，非门禁）：

```bash
node apps/web/scripts/extract-design-reference.mjs   # 设计稿 → e2e/reference/（仅设计稿更新时跑）
node apps/web/scripts/ui-capture.mjs                 # 真实页面截图 + 并排对比图 → e2e/.ui-capture/
```

---

## 目录结构

```
apps/web/
├── src/
│   ├── app/                  Next.js App Router 页面
│   │   ├── (auth)/           登录 / 注册 / CLI 授权
│   │   ├── (workspace)/      桌面工作区（notes 下是知识库画廊与二级 Tab）
│   │   ├── (mobile)/m/**     移动端（21 条 /m/* 路由）
│   │   ├── api/auth/*        BFF 认证路由（login / register / logout / refresh / me / collab-token / exchange / cli-*）
│   │   ├── api/proxy/[...]   带鉴权的网关代理（含 SSE 透传）
│   │   ├── layout.tsx        根布局（字体、Provider）
│   │   └── providers.tsx     Provider 树（QueryClient、Theme）
│   ├── components/           通用组件
│   │   ├── ui/               shadcn 原子组件（vendored，不改不测）
│   │   ├── loading/          加载体系原子件（Spinner / Progress / 骨架预设，**有单测**）
│   │   ├── editor/           TipTap 编辑器（core / extensions / presets）
│   │   ├── layout/           AppShell、侧栏（`sidebar-nav.tsx`）、顶栏、命令面板、`navigation.ts`、品牌启动
│   │   └── note/             笔记域共享组件
│   ├── features/             功能模块
│   │   └── <feature>/
│   │       ├── components/   模块内组件（`mobile/` 子目录放移动端变体）
│   │       ├── lib/          纯函数（如 `notes/lib/cover-gradient.ts`）
│   │       ├── use-*.ts      Query / Mutation hooks（**平铺，不建 hooks/ 子目录**）
│   │       ├── query-keys.ts key 工厂
│   │       └── schemas.ts    zod 校验
│   ├── lib/
│   │   ├── api/              openapi-fetch 实例、错误信封、DTO query 序列化
│   │   ├── auth/             BFF 侧 Cookie / 刷新 / 资料（server-only）
│   │   ├── collab/           协同房间命名、会话、索引文档
│   │   ├── desktop/          桌面壳桥接（令牌交换 + 本地保管）
│   │   ├── editor/           Markdown 桥接、Shiki、KaTeX、上传
│   │   ├── mobile/           移动端 UA 分流与搜索（纯函数，middleware 与单测共用）
│   │   ├── route-progress.ts 站内软导航的判定（纯函数，喂给顶栏进度条）
│   │   ├── format-time.ts    相对时间与卡片元信息行（纯函数）
│   │   └── utils.ts          cn()、格式化工具
│   ├── stores/               Zustand stores（仅 UI 状态）
│   └── types/                全局类型声明
├── e2e/                      Playwright 端到端用例
├── scripts/                  构建期脚本（产物预算、Lighthouse、资源同步）
├── integration/              真实链路的 vitest 用例（认证 / 代理）
├── public/
└── package.json
```

> `packages/api-client/src/` 是 `pnpm openapi:generate` 的产物（gitignored），
> 前端只从它引类型，不在 `src/lib` 下再放一份。

---

## 数据获取规范

### TanStack Query Hooks 命名

| 模式              | 用途                       | 示例                                 |
|-------------------|----------------------------|--------------------------------------|
| `use<X>Query`     | 读取数据（GET）             | `useNoteListQuery(params)`           |
| `use<X>Mutation`  | 写操作（POST/PUT/DELETE）   | `useCreateNoteMutation()`            |
| `use<X>Infinite`  | 无限滚动分页                | `useNoteListInfinite(kbId)`          |

### Query Key 约定

```typescript
// 工厂函数，确保 key 一致性
export const noteKeys = {
  all: ['notes'] as const,
  list: (params: NoteListParams) => ['notes', 'list', params] as const,
  detail: (id: number) => ['notes', 'detail', id] as const,
}
```

---

## API 客户端使用

```typescript
// 从自动生成的客户端导入
import { createNote, getNoteList } from '@/lib/api-client'

// 在 mutation hook 中使用
const mutation = useMutation({
  mutationFn: (dto: CreateNoteDto) => createNote({ body: dto }),
  onSuccess: () => queryClient.invalidateQueries({ queryKey: noteKeys.all }),
})
```

API 客户端由 `pnpm openapi:generate` 从后端 Swagger 自动生成，**不要手写**。

---

## 认证方案（BFF + httpOnly Cookie）

```
登录请求 → /api/auth/login（Next.js API Route）
  → 调用后端 auth 服务
  → 将 accessToken 写入 httpOnly Cookie（不暴露给 JS）
  → 服务端组件/API Route 从 Cookie 读取 token 后转发
```

客户端组件通过 `useMe()` hook 获取用户信息（从 `/api/auth/me`，无需直接持有 token）。
`/api/auth/me` 与 `/api/auth/collab-token` 共用 `lib/auth/profile.ts` 的 `loadSessionProfile`——
两者都需要「已验证的当前用户」，刷新与失效的处理必须完全一致。

### 两条派生凭据（M8 新增）

| 端点 | 产出 | 谁能拿到 | 守卫 |
|------|------|---------|------|
| `POST /api/auth/collab-token` | 5 分钟有效、**另一套密钥**签的协同令牌 | 任何已登录的同源页面 | Origin 校验 + 有效会话 |
| `POST /api/auth/exchange` | **真实 accessToken / refreshToken** | 仅 Tauri 桌面壳 | `DESKTOP_EXCHANGE_KEY` 未配置即整体关闭 + 密钥匹配 + Origin 在桌面白名单 |

协同令牌之所以要另签而不是复用 accessToken：浏览器的 `WebSocket` 构造函数不能自定义
请求头，凭据只能走查询串；那就必须是一枚泄露了也调不动网关业务接口的令牌。

`/api/auth/exchange` 是整个 BFF 里唯一会把真实 Token 交给 JS 的地方，**Web 部署必须
保持 `DESKTOP_EXCHANGE_KEY` 未配置**。

---

## 协同编辑（M8.1）

- 服务端：`apps/collab`（自建 y-websocket 协议服务，:1234），房间名 `index` 与 `doc:<id>`
- 前端：`features/collab/use-collab-room.ts` 管连接生命周期，`use-collab-index.ts` 管文档索引
- 文档库索引本身也是一个协同房间，**没有任何后端接口**参与 `/docs` 的读写
- 编辑器用 `preset="collaborative"`：关掉 StarterKit 的本地 undo/redo（会撤销掉别人的编辑），
  改用 Collaboration 的 Y.UndoManager；且**不设初始 content**，正文只由 Y.Doc 灌入
- `/docs` 与 `/docs/[id]` 走 `dynamic(..., { ssr: false })` 懒加载：
  yjs + y-websocket 静态引入会把首屏 JS 顶出 300KB 预算

---

## 组件规范

- 原子组件优先使用 `components/ui/`（shadcn/ui），不重复封装
- 业务逻辑放在 `features/<feature>/hooks/`，组件只做渲染
- 服务端组件（RSC）用于静态布局和初始数据；交互组件加 `'use client'`
- 样式只用 Tailwind CSS，禁止内联 style（动态值用 CSS 变量）

---

## 编辑器集成（TipTap，Phase 5 起）

新前端**统一 TipTap v3**，已废弃 Milkdown / Wangeditor / Vditor / Muya。入口：

```tsx
// 懒加载入口（dynamic ssr:false），业务侧只 import 这个
import { TiptapEditor } from "@/components/editor/TiptapEditor";

<TiptapEditor preset="full" value={markdown} onChange={setMarkdown} />
```

| 预设 | 用途 | 关键扩展 |
|------|------|---------|
| `full` | 笔记 / 文档编辑 | StarterKit（关 codeBlock/underline）+ 自定义节点 + Slash 菜单 + 气泡菜单 |
| `minimal` | 评论 / AI 输入框 | StarterKit + Placeholder |
| `readonly` | 预览 / AI 输出 / Wikis | 渲染型扩展，无交互扩展与工具栏 |

工具栏形态由 `toolbar` 属性决定（不传时按预设推导：`minimal` → minimal，
其余 → full）：

| 形态 | 用在哪 | 说明 |
|------|--------|------|
| `full` | playground | 全部 23 个命令，一行铺开 |
| `minimal` | 评论 / 输入框 | 只留基础排版 |
| `mobile` | 移动端笔记 / 协同文档 | 单行横滑 10 个常驻 + 「更多」底部弹层 |
| `none` | **桌面笔记 / 协同文档** | 不渲染常驻工具条——设计稿的桌面编辑器从标题直接进正文；格式化走气泡菜单、Slash 菜单与快捷键 |

自定义节点（`components/editor/extensions/`）：`anynote-callout`（`> [!INFO]`）、
`anynote-image`（分片直传）、`anynote-wikilink`（`[[双链]]`）、`anynote-ai-block`（```anynote-ai fence）、
`code-block-shiki`（Shiki 懒加载 NodeView）、`slash-command`（`/` 菜单）、`anynote-math`（KaTeX 懒加载）。

Markdown 约定（`tiptap-markdown`，`html:false`）：

| 语法 | 节点 / mark |
|------|------------|
| `==文本==` | highlight |
| `++文本++` | underline |
| `$latex$` / `$$latex$$` | inlineMath / blockMath |
| `[[目标\|别名]]` | wikilink |
| `> [!INFO\|TIP\|WARN\|DANGER]` | callout |

已知限制：`textAlign`、highlight 的颜色不写进 Markdown（编辑期保留、持久化丢失）；Color / TextStyle 未启用。

**性能约束**：编辑器整包走 `dynamic(..., { ssr: false })` 懒加载；KaTeX 与 Shiki 均为动态 import
（编辑器主 chunk 实测 211 KB gzip，预算 250 KB）。改动编辑器依赖后用
`node apps/web/scripts/bundle-report.mjs` 复测。

开发调试页：`/playground/editor`（仅 `NODE_ENV=development` 暴露，生产 404）。

### Markdown 序列化扩展点

自定义 Markdown 语法（callout / 双链 / 公式）通过 `lib/editor/markdown-it.ts` 的
`addInlineAtom` / `addInlineWrapper` / `registerMdPlugin` 注册到 markdown-it；每个自定义节点在
`addStorage().markdown` 里声明 `serialize` 与 `parse`，未声明的节点会退化成 `[nodeName]` 占位。

---

## 开发命令

```bash
# 开发服务器
pnpm --filter web dev

# 生产构建
pnpm --filter web build

# 类型检查
pnpm --filter web typecheck

# 重新生成 API 客户端（需后端运行）
pnpm openapi:generate

# 端到端与性能门禁（需生产构建 + 真实后端栈，细节见 README「测试」节）
pnpm --filter web test:e2e
pnpm --filter web bundle:budget
pnpm --filter web lighthouse:budget
```

---

## 环境变量

| 变量                       | 用途                          |
|----------------------------|-------------------------------|
| `NEXT_PUBLIC_APP_URL`      | 浏览器侧应用源（默认 `http://localhost:3000`） |
| `INTERNAL_API_URL`         | BFF 直连 Gateway 地址（默认 `http://localhost:8080`） |
| `NEXT_PUBLIC_COLLAB_WS_URL`| 协同服务地址（默认 `ws://localhost:1234`） |
| `COLLAB_TOKEN_SECRET`      | 协同令牌 HMAC 密钥，**必须与 `apps/collab` 一致** |
| `DESKTOP_EXCHANGE_KEY`     | 桌面令牌交换开关，**Web 部署不要配** |
| `DESKTOP_ALLOWED_ORIGINS`  | 允许交换令牌的桌面来源，仅在上一项配置后生效 |

> 不使用 `NEXTAUTH_SECRET`：认证走自研 BFF 透传后端 JWT，不做二次签名。
> 旧的 `NEXT_PUBLIC_API_URL` / `BACKEND_URL` 已废弃（M2 里 `BACKEND_URL` → `INTERNAL_API_URL`）。
