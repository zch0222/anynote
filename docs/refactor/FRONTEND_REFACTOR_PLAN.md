# Anynote 前端重构技术方案（TipTap 版）

> 文档版本：v1.0 | 生成日期：2026-05-13
> 适用范围：`apps/web-legacy/` → `apps/web/` 全量重写
> 关联文档：[REFACTOR_PLAN.md](./REFACTOR_PLAN.md) Phase 5
> 关键变更：Markdown 编辑器统一替换为 **TipTap**（基于 ProseMirror），废弃 Milkdown / Wangeditor / Vditor / Muya

---

## 一、设计目标

### 1.1 必须达成的硬指标

| # | 指标 | 当前 | 目标 |
|---|------|------|------|
| 1 | **JWT 安全** | 写入 `document.cookie`，XSS 可读 | httpOnly Cookie，前端 JS 完全不可见 |
| 2 | **API 类型** | 手写 `src/types/*.ts`，与后端漂移 | `openapi-typescript` 自动生成，CI 校验 |
| 3 | **状态管理** | Redux(4 slice) + SWR + 散落 useState | TanStack Query（服务端） + Zustand（客户端 UI） |
| 4 | **UI 体系** | NextUI + AntD + Tailwind 三重叠加 | shadcn/ui + Tailwind 单一体系 |
| 5 | **编辑器** | Milkdown / Wangeditor / Vditor / Muya 四套并存 | **TipTap 一套**，按场景配置不同扩展 |
| 6 | **Token 刷新** | 客户端并发竞争（`client-request.ts:38-95`） | BFF 单点串行刷新，前端无感 |
| 7 | **包体积** | 初始 JS > 1.2MB（含双 UI 库 + 多编辑器） | 初始 JS < 300KB，编辑器按需切片懒加载 |
| 8 | **构建** | Next 13 + Webpack | Next 15 + Turbopack |

### 1.2 不做什么

- 不做 i18n（当前无多语言需求，留出 `next-intl` 接入点即可）
- 不做 PWA / Service Worker（桌面靠 Tauri 包装）
- 不引入 GraphQL（REST + OpenAPI 已经足够）
- 不写自定义 SSR 缓存层（依赖 Next 15 `cacheLife` / `cacheTag`）

---

## 二、技术栈终态

```
运行时          Next.js 15 (App Router) + React 19 + Node 20 LTS
语言            TypeScript 5.6（strict + noUncheckedIndexedAccess + exactOptionalPropertyTypes）
样式            Tailwind CSS 4 + CSS Variables（统一 light/dark token）
UI 基础         shadcn/ui（Radix UI primitives + 源码内嵌）
图标            lucide-react
表单            react-hook-form + zod + @hookform/resolvers
服务端状态      @tanstack/react-query v5 + @tanstack/react-query-devtools
客户端状态      zustand v5（slice 分片：ui / editor / playback）
HTTP 客户端     ky（fetch-based，支持 hooks/重试）
API 类型        openapi-typescript（生成）+ openapi-fetch（运行时调用）
认证            httpOnly Cookie + Next Route Handler (BFF) + jose（JWT 解析仅在服务端）
SSE / 流式      @microsoft/fetch-event-source（保留，TipTap AI 节点消费）
编辑器          @tiptap/react v2 + ProseMirror（详见第六章）
PDF             react-pdf v9（pdfjs-dist v4）
代码高亮        @shikijs/rehype + shiki（Twoslash 可选）
图表            echarts-for-react（保留）+ reactflow（AI Workflow）
日期            date-fns v4（替换原 moment）
工具            class-variance-authority + clsx + tailwind-merge
测试            Vitest + @testing-library/react + Playwright（E2E）
桌面            Tauri 2（继续保留 apps/desktop）
代码规范        Biome（lint + format，替代 ESLint + Prettier）
```

---

## 三、目录结构

```
apps/web/
├── public/
│   ├── icons/                  # favicon、PWA icons
│   └── locales/                # 预留 i18n
│
├── src/
│   ├── app/                                  # Next.js App Router
│   │   ├── (auth)/                           # 无主布局
│   │   │   ├── login/page.tsx
│   │   │   ├── register/page.tsx
│   │   │   └── layout.tsx
│   │   ├── (workspace)/                      # 主工作区布局
│   │   │   ├── layout.tsx                    # AppShell（侧边栏 + 顶栏 + 命令面板）
│   │   │   ├── dashboard/page.tsx
│   │   │   ├── notes/
│   │   │   │   ├── page.tsx                  # 笔记仓库
│   │   │   │   ├── [baseId]/page.tsx         # 知识库视图
│   │   │   │   └── [baseId]/[noteId]/page.tsx  # 编辑/阅读
│   │   │   ├── docs/[id]/page.tsx            # 协同文档
│   │   │   ├── ai/
│   │   │   │   ├── chat/page.tsx
│   │   │   │   ├── workflow/page.tsx         # ReactFlow
│   │   │   │   └── pdf/page.tsx              # chat-pdf
│   │   │   ├── mooc/page.tsx
│   │   │   ├── tasks/page.tsx
│   │   │   ├── wikis/page.tsx
│   │   │   └── settings/[...slug]/page.tsx
│   │   ├── api/                              # Next Route Handlers = BFF 层
│   │   │   ├── auth/
│   │   │   │   ├── login/route.ts
│   │   │   │   ├── logout/route.ts
│   │   │   │   ├── refresh/route.ts
│   │   │   │   └── me/route.ts
│   │   │   ├── upload/
│   │   │   │   └── route.ts                  # 直传 MinIO 预签名 / 转发文件
│   │   │   └── proxy/[...path]/route.ts      # 通用代理（携带 httpOnly token）
│   │   ├── layout.tsx                        # RootLayout
│   │   ├── providers.tsx                     # QueryClient + Theme + Toaster + Tooltip
│   │   ├── error.tsx
│   │   ├── not-found.tsx
│   │   └── global-error.tsx
│   │
│   ├── components/
│   │   ├── ui/                               # shadcn/ui 生成的源码组件
│   │   ├── layout/
│   │   │   ├── app-sidebar.tsx
│   │   │   ├── app-header.tsx
│   │   │   ├── command-palette.tsx           # cmdk 全局搜索
│   │   │   └── user-menu.tsx
│   │   ├── editor/                           # TipTap 封装（第六章详述）
│   │   │   ├── core/                         # TiptapProvider、Toolbar、BubbleMenu
│   │   │   ├── extensions/                   # 自定义扩展
│   │   │   ├── presets/                      # full / minimal / readonly 三种预设
│   │   │   ├── nodes/                        # AI、Embed、Callout 等自定义节点
│   │   │   └── serializer/                   # markdown 序列化/反序列化
│   │   ├── note/
│   │   │   ├── note-list.tsx
│   │   │   ├── note-card.tsx
│   │   │   ├── note-tree.tsx
│   │   │   └── note-share-dialog.tsx
│   │   ├── ai/
│   │   │   ├── chat-panel.tsx
│   │   │   ├── chat-message.tsx              # 内部用 TipTap readonly 渲染
│   │   │   ├── workflow-canvas.tsx
│   │   │   └── inline-completion.tsx
│   │   ├── pdf/
│   │   │   ├── pdf-viewer.tsx
│   │   │   └── pdf-chat.tsx
│   │   └── common/
│   │       ├── back-button.tsx
│   │       ├── empty-state.tsx
│   │       └── error-boundary.tsx
│   │
│   ├── features/                             # 业务 hooks（TanStack Query 集中地）
│   │   ├── auth/
│   │   │   ├── use-me.ts
│   │   │   ├── use-login.ts
│   │   │   └── use-logout.ts
│   │   ├── notes/
│   │   │   ├── use-notes.ts
│   │   │   ├── use-note.ts
│   │   │   ├── use-save-note.ts              # 含 debounce + 乐观更新
│   │   │   └── query-keys.ts
│   │   ├── ai/
│   │   │   ├── use-chat-stream.ts            # SSE
│   │   │   ├── use-workflow.ts
│   │   │   └── use-inline-completion.ts
│   │   ├── files/
│   │   │   └── use-upload.ts                 # 直传预签名 URL
│   │   └── ...
│   │
│   ├── lib/
│   │   ├── api/
│   │   │   ├── client.ts                     # ky 实例 + 拦截器
│   │   │   ├── openapi.ts                    # openapi-fetch 实例（类型安全）
│   │   │   └── errors.ts                     # 统一错误转换
│   │   ├── auth/
│   │   │   ├── cookies.ts                    # httpOnly cookie 读写（服务端）
│   │   │   └── jwt.ts                        # jose 校验（仅 BFF 用）
│   │   ├── editor/
│   │   │   ├── markdown.ts                   # marked / remark 桥
│   │   │   └── upload.ts                     # 编辑器图片粘贴/拖拽上传
│   │   ├── sse.ts                            # fetch-event-source 封装
│   │   ├── env.ts                            # zod 校验环境变量
│   │   └── utils.ts                          # cn() 等
│   │
│   ├── stores/                               # Zustand
│   │   ├── ui-store.ts                       # sidebar、commandPalette、theme(本地偏好)
│   │   ├── editor-store.ts                   # 当前编辑器偏好（字号、字体、阅读模式）
│   │   └── playback-store.ts                 # 视频播放器（mooc）
│   │
│   ├── hooks/                                # 通用、非业务 hooks
│   │   ├── use-debounce.ts
│   │   ├── use-media-query.ts
│   │   ├── use-hotkey.ts
│   │   └── use-mounted.ts
│   │
│   ├── types/
│   │   ├── api/                              # openapi-typescript 生成（gitignore）
│   │   │   └── schema.d.ts
│   │   ├── editor.ts
│   │   └── index.ts                          # 业务 DTO 重导出
│   │
│   ├── styles/
│   │   ├── globals.css                       # Tailwind base + CSS variables
│   │   ├── tiptap.css                        # 编辑器排版（typography 扩展样式）
│   │   └── shiki.css                         # 代码高亮主题切换
│   │
│   ├── constants/
│   │   ├── routes.ts
│   │   ├── editor.ts                         # 编辑器节点 name、attrs 常量
│   │   └── ai-models.ts
│   │
│   └── middleware.ts                         # Next 中间件：未登录跳转、路由保护
│
├── biome.json
├── tailwind.config.ts
├── postcss.config.js
├── next.config.ts
├── tsconfig.json
└── package.json
```

**关键命名约定**

- `features/<domain>/` 放 TanStack Query hooks 和 mutation，文件名 `use-xxx.ts`
- `query-keys.ts` 集中维护 query key 工厂，避免拼写漂移
- 自定义 TipTap 扩展前缀统一为 `anynote-*`（如 `anynote-callout`、`anynote-ai-block`），防止与官方扩展冲突
- BFF 路由 `app/api/**/route.ts` 永远不直接暴露 token，仅返回业务数据

---

## 四、认证与 BFF 设计

### 4.1 数据流

```
┌───────────┐                ┌──────────────┐                ┌──────────────┐
│  Browser  │  /api/auth/*   │ Next BFF     │  /api/v1/*    │  Gateway     │
│  (JS)     │──────────────▶ │ Route        │ ─────────────▶│  + Auth      │
│           │ (no token)     │ Handler      │  Bearer JWT   │  Service     │
└───────────┘                └──────────────┘                └──────────────┘
       ▲                            │
       │  Set-Cookie:               │  cookies().set('at', ..., {httpOnly,secure,sameSite})
       │  access_token (httpOnly)   │  cookies().set('rt', ..., {httpOnly,secure,sameSite,path:'/api/auth/refresh'})
       └────────────────────────────┘
```

**Cookie 设计**

| Cookie | 内容 | 属性 | 用途 |
|--------|------|------|------|
| `at` | access token（短期，30 min） | httpOnly, secure, sameSite=lax, path=/ | 业务请求 |
| `rt` | refresh token（长期，7 day） | httpOnly, secure, sameSite=strict, path=/api/auth/refresh | 仅用于刷新 |
| `sid` | 会话指纹（UA+IP hash） | httpOnly | 防 token 劫持 |

**前端 JS 永远不直接读取这些 Cookie**。需要展示的用户资料（昵称、头像）通过 `GET /api/auth/me` 拿到，前端只持有非敏感信息。

### 4.2 Token 刷新的竞争条件解决

旧方案问题（`utils/client-request.ts:38-95`）：多个并发 401 会发起多次刷新请求。

新方案：刷新动作完全在 BFF 内串行化。

```ts
// app/api/proxy/[...path]/route.ts （示意）
const refreshLock = new Map<string, Promise<void>>(); // 进程内锁，按 rt 分组

async function ensureFreshToken(req: NextRequest) {
  const at = req.cookies.get('at');
  if (!isExpiringSoon(at)) return;
  const rt = req.cookies.get('rt')!.value;
  if (!refreshLock.has(rt)) {
    refreshLock.set(rt, refreshOnce(rt).finally(() => refreshLock.delete(rt)));
  }
  await refreshLock.get(rt);
}
```

并发请求共享同一个刷新 Promise，单进程内零竞争。前端 ky 拦截器只看 401 重试一次，不再触发刷新逻辑。

### 4.3 中间件路由保护

```ts
// middleware.ts
export const config = { matcher: ['/((?!api|_next|login|register|.*\\..*).*)'] };
export function middleware(req: NextRequest) {
  const at = req.cookies.get('at');
  if (!at) return NextResponse.redirect(new URL('/login', req.url));
  return NextResponse.next();
}
```

Server Component 内通过 `cookies()` 直接读 token 调用后端，无需暴露给客户端。

---

## 五、API 客户端与状态管理

### 5.1 类型生成

```bash
# pnpm scripts
"openapi:fetch": "tsx scripts/fetch-openapi.ts",   # 从 Gateway 拉聚合 OpenAPI
"openapi:gen":   "openapi-typescript ./openapi/specs/aggregate.json -o ./src/types/api/schema.d.ts",
"openapi":       "pnpm openapi:fetch && pnpm openapi:gen"
```

CI 在 PR 阶段校验：本地生成结果与提交的差异为 0，避免后端 API 改动后前端没同步。`src/types/api/` 不入仓（已 gitignore），但 CI 必须生成成功。

### 5.2 类型安全的请求层

```ts
// lib/api/openapi.ts
import createClient from 'openapi-fetch';
import type { paths } from '@/types/api/schema';

export const api = createClient<paths>({
  baseUrl: '/api/proxy',           // 走 BFF 代理，浏览器侧永远只看到同源 /api/proxy/*
  credentials: 'include',
});
```

调用示例：

```ts
// features/notes/use-notes.ts
export function useNotes(baseId: string, page: number) {
  return useQuery({
    queryKey: noteKeys.list({ baseId, page }),
    queryFn: async ({ signal }) => {
      const { data, error } = await api.GET('/api/v1/knowledge-bases/{id}/notes', {
        params: { path: { id: baseId }, query: { page, size: 20 } },
        signal,
      });
      if (error) throw new ApiError(error);
      return data!;
    },
    staleTime: 5 * 60_000,
  });
}
```

`paths` 是从后端 OpenAPI 生成的精确类型，路径、参数、响应全部 IDE 校验。

### 5.3 Query Keys 集中管理

```ts
// features/notes/query-keys.ts
export const noteKeys = {
  all: ['notes'] as const,
  lists: () => [...noteKeys.all, 'list'] as const,
  list: (p: ListParams) => [...noteKeys.lists(), p] as const,
  details: () => [...noteKeys.all, 'detail'] as const,
  detail: (id: string) => [...noteKeys.details(), id] as const,
};
```

`invalidateQueries({ queryKey: noteKeys.lists() })` 可一键失效所有列表查询。

### 5.4 Zustand 切片

```ts
// stores/ui-store.ts
type UISlice = {
  sidebarOpen: boolean;
  commandPaletteOpen: boolean;
  setSidebar: (open: boolean) => void;
  toggleCommandPalette: () => void;
};
export const useUIStore = create<UISlice>()(persist(
  (set) => ({
    sidebarOpen: true,
    commandPaletteOpen: false,
    setSidebar: (open) => set({ sidebarOpen: open }),
    toggleCommandPalette: () => set((s) => ({ commandPaletteOpen: !s.commandPaletteOpen })),
  }),
  { name: 'anynote-ui', partialize: (s) => ({ sidebarOpen: s.sidebarOpen }) },
));
```

主题保留 `next-themes`（专门解决 SSR flash），不放进 Zustand。

---

## 六、编辑器架构（TipTap 核心方案）

> 这是本次重构的最大变更点。下面详述选型理由、扩展矩阵、序列化方案、性能策略。

### 6.1 为什么选 TipTap 而非保留 Milkdown / 其他

| 维度 | Milkdown | Wangeditor | Vditor | **TipTap** |
|------|----------|-----------|--------|-----------|
| 底层 | ProseMirror | 自研 | 自研 | **ProseMirror** |
| React 集成 | `@milkdown/react`（adapter） | `editor-for-react`（适配层） | 命令式 | **`@tiptap/react` 一等公民** |
| 扩展生态 | 官方 + 少量第三方 | 闭环、扩展少 | 主题/插件少 | **官方 + 数百第三方** |
| TypeScript | 部分 any | 弱 | 弱 | **端到端类型，扩展 Options 有泛型** |
| 协同编辑 | 需手动接 Yjs | 不支持 | 不支持 | **官方 `@tiptap/extension-collaboration` + Yjs** |
| AI 集成 | 自己写节点 | 不支持 | 不支持 | **`@tiptap-pro/extension-ai`（可选商业） / 自研容易** |
| Markdown 序列化 | preset-gfm（受限） | HTML 为主 | 原生 MD | **`tiptap-markdown` + 自定义 schema** |
| 主题 / 样式 | `theme-nord` 固化 | 自带 | 自带 | **完全 headless，靠 Tailwind / shadcn 主题** |
| Bundle Size | ~180KB（含主题） | ~250KB | ~200KB | **~80KB core + 按需扩展** |
| 维护活跃度 | 中 | 中 | 低 | **高（每周发版）** |

**结论**：TipTap 在生态、TypeScript、可扩展性、bundle 大小、未来 AI/协同需求上全面优于其他三者；且 Milkdown 与 TipTap 同样底层 ProseMirror，迁移成本可控（schema 概念相通）。

### 6.2 扩展矩阵

按"预设"组织，避免每个页面单独装配。

**preset: `full`**（笔记编辑、文档编辑）

| 分类 | 扩展 | 来源 |
|------|------|------|
| 基础 | StarterKit（关闭 codeBlock、history） | @tiptap/starter-kit |
| 历史 | History | @tiptap/extension-history |
| 排版 | Typography、Underline、Subscript、Superscript、TextAlign、Color、Highlight、FontFamily | @tiptap/extension-* |
| 标题 | Heading（含 anchor ID 生成器，自定义扩展） | StarterKit + anynote-heading-id |
| 列表 | TaskList + TaskItem | @tiptap/extension-task-list |
| 表格 | Table + Row + Cell + HeaderCell | @tiptap/extension-table |
| 链接 | Link（含粘贴 URL 自动识别） | @tiptap/extension-link |
| 图片 | Image（替换为 anynote-image，集成上传） | 自定义节点 |
| 代码块 | CodeBlockShiki（基于 lowlight 替换，使用 Shiki 高亮） | @tiptap/extension-code-block + shiki adapter |
| 数学 | Mathematics（KaTeX，行内 + 块） | @tiptap/extension-mathematics |
| Mention | Mention（@用户 / #笔记） | @tiptap/extension-mention |
| 反向链接 | anynote-wikilink（[[note-id]] 内链） | 自定义 |
| 拖拽 | DragHandle、Block 拖动 | @tiptap-pro/extension-drag-handle（或自研） |
| 占位符 | Placeholder | @tiptap/extension-placeholder |
| Slash | anynote-slash-menu（基于 @tiptap/suggestion 自研） | 自定义 |
| Bubble | BubbleMenu | @tiptap/extension-bubble-menu |
| Floating | FloatingMenu | @tiptap/extension-floating-menu |
| 字数 | CharacterCount | @tiptap/extension-character-count |
| 协同 | Collaboration + CollaborationCursor（Phase 5.5 启用） | @tiptap/extension-collaboration |
| AI 块 | anynote-ai-block（嵌入 AI 对话/补全节点） | 自定义 |
| Callout | anynote-callout（info/warn/danger） | 自定义 |
| Embed | anynote-embed（YouTube、Bilibili、Iframe 白名单） | 自定义 |
| Diagram | anynote-mermaid（mermaid.js 懒加载） | 自定义 |
| 历史浮层 | anynote-history-popover（版本对比 UI） | 自定义 |

**preset: `minimal`**（评论、AI 聊天输入框）

仅 StarterKit + Placeholder + Mention + Link。

**preset: `readonly`**（笔记预览、AI 输出渲染）

`editable: false`，去掉所有交互扩展，保留 Typography + Mathematics + CodeBlockShiki + Image。

### 6.3 编辑器封装层次

```
┌──────────────────────────────────────────────────────────────┐
│ <NoteEditor noteId={...} />            ← 业务组件             │
│   └─ <TiptapEditor preset="full" />    ← 预设包装             │
│        └─ useEditor() + EditorContent  ← @tiptap/react        │
│            └─ extensions: [...]        ← 注入扩展             │
└──────────────────────────────────────────────────────────────┘
```

**`components/editor/core/TiptapEditor.tsx`**（核心组件）

```tsx
'use client';
import { EditorContent, useEditor, type Editor } from '@tiptap/react';
import { useEffect } from 'react';
import { presets, type PresetName } from './presets';

export type TiptapEditorProps = {
  preset: PresetName;
  value: string;             // markdown 字符串
  onChange?: (markdown: string) => void;
  editable?: boolean;
  placeholder?: string;
  uploadFn?: (file: File) => Promise<string>;
  collab?: { docId: string; user: { id: string; name: string; color: string } };
  onReady?: (editor: Editor) => void;
};

export function TiptapEditor(props: TiptapEditorProps) {
  const editor = useEditor({
    extensions: presets[props.preset]({ uploadFn: props.uploadFn, collab: props.collab }),
    content: deserializeMarkdown(props.value),
    editable: props.editable ?? true,
    immediatelyRender: false,           // ✅ Next 15 SSR 必须
    onUpdate: ({ editor }) => props.onChange?.(serializeMarkdown(editor)),
    editorProps: {
      attributes: {
        class: 'prose prose-neutral dark:prose-invert max-w-none focus:outline-none',
      },
    },
  });

  useEffect(() => { if (editor) props.onReady?.(editor); }, [editor]);
  useEffect(() => { editor?.setEditable(props.editable ?? true); }, [editor, props.editable]);

  return (
    <div className="anynote-editor">
      <Toolbar editor={editor} />
      <BubbleMenuPortal editor={editor} />
      <SlashMenu editor={editor} />
      <EditorContent editor={editor} />
    </div>
  );
}
```

**`components/editor/presets/full.ts`**（预设工厂）

```ts
import StarterKit from '@tiptap/starter-kit';
import { TextAlign } from '@tiptap/extension-text-align';
// ... 其他扩展导入
import { CodeBlockShiki } from '../extensions/code-block-shiki';
import { SlashCommand } from '../extensions/slash-command';
import { AnynoteImage } from '../extensions/image';
import { AnynoteCallout } from '../extensions/callout';

export function full(ctx: PresetCtx) {
  return [
    StarterKit.configure({ codeBlock: false, history: !ctx.collab }),
    TextAlign.configure({ types: ['heading', 'paragraph'] }),
    CodeBlockShiki,
    AnynoteImage.configure({ upload: ctx.uploadFn }),
    AnynoteCallout,
    SlashCommand,
    // ...
    ...(ctx.collab ? [Collaboration.configure({ document: ctx.collab.ydoc }),
                     CollaborationCursor.configure({ provider: ctx.collab.provider, user: ctx.collab.user })] : []),
  ];
}
```

### 6.4 Markdown 序列化

**方案**：`tiptap-markdown` 作为基础，自定义节点（callout、ai-block、embed、wikilink）需要手写 `parseMarkdown` / `toMarkdown` 桥接。

```ts
// lib/editor/markdown.ts
import { Markdown } from 'tiptap-markdown';

export const MarkdownBridge = Markdown.configure({
  html: false,                  // 不允许 HTML，避免 XSS
  tightLists: true,
  bulletListMarker: '-',
  linkify: true,
  breaks: false,
  transformPastedText: true,
});

// 自定义节点序列化注册
// 见 extensions/callout.ts 中的 addStorage / addMarkdown
```

**自定义节点序列化示例（Callout）**

```ts
// extensions/callout.ts
export const AnynoteCallout = Node.create({
  name: 'callout',
  group: 'block',
  content: 'block+',
  defining: true,
  addAttributes() { return { level: { default: 'info' } }; },
  parseHTML() { return [{ tag: 'div[data-callout]' }]; },
  renderHTML({ HTMLAttributes }) { return ['div', { 'data-callout': true, ...HTMLAttributes }, 0]; },
  // Markdown 输出：> [!INFO] / > [!WARN] / > [!DANGER]（GFM Obsidian 风格）
  addStorage() {
    return {
      markdown: {
        serialize(state: MarkdownSerializerState, node: Node) {
          state.write(`> [!${node.attrs.level.toUpperCase()}]\n`);
          state.wrapBlock('> ', null, node, () => state.renderContent(node));
        },
        parse: { /* remark-callout 桥接 */ },
      },
    };
  },
});
```

**为什么不直接存 ProseMirror JSON？**

后端 Note 表当前是 Markdown 字段，迁移成本高；Markdown 还能保持与 AI 服务、外部分享、纯文本搜索的兼容性。如未来需要协同精确光标，再补 JSON 字段。

### 6.5 图片 / 文件上传

**直传 MinIO 预签名 URL**，前端 → BFF 获取签名 → 直接 PUT 到 MinIO，避免业务服务转发大文件。

```ts
// lib/editor/upload.ts
export async function uploadImage(file: File): Promise<string> {
  const { data } = await api.POST('/api/v1/files/presign', {
    body: { filename: file.name, contentType: file.type, size: file.size },
  });
  await fetch(data!.uploadUrl, { method: 'PUT', body: file, headers: { 'Content-Type': file.type } });
  return data!.publicUrl;
}
```

TipTap 的 `AnynoteImage` 扩展接 `uploadFn`，粘贴 / 拖拽 / 工具栏插入统一走这条路径。

### 6.6 AI 增强

#### 6.6.1 Slash 菜单 AI 项

`/ai 写一段关于 X 的介绍` → 触发 SSE 流式补全 → 边到达边插入文本。

```ts
// extensions/slash-command/items.ts
{
  title: 'AI 续写',
  icon: 'sparkles',
  command: async ({ editor, range }) => {
    editor.chain().focus().deleteRange(range).run();
    await streamCompletion({
      context: editor.getText().slice(-2000),
      onToken: (token) => editor.commands.insertContent(token),
    });
  },
}
```

#### 6.6.2 行内 AI 补全

类 GitHub Copilot 体验：用户停顿 500ms 后，灰色 ghost text 显示建议，Tab 接受。基于 `@tiptap/extension-mention` 模式 + 自定义 Decoration。

#### 6.6.3 AI Block 节点

在文档中嵌入"AI 对话框"作为节点，可保存对话历史与上下文。Markdown 序列化为代码块 fence：

````
```anynote-ai
{ "model": "gpt-4o-mini", "messages": [...] }
```
````

阅读模式下渲染为只读卡片。

### 6.7 协同编辑（Phase 5.5 / 后续）

- `Collaboration` 扩展 + Yjs（`y-websocket` 或 `y-webrtc`）
- BFF 提供 WebSocket 升级端点 `/api/collab/[docId]` 转发到后端协同服务（如需要可后置）
- 暂时只在 `/docs/*` 路由启用；普通笔记仍是单人编辑

### 6.8 性能策略

| 问题 | 方案 |
|------|------|
| TipTap 总包体积 | 编辑器整体 `dynamic(() => import(...), { ssr: false })` 懒加载；首屏笔记预览走 readonly preset |
| Shiki 高亮 | 使用 `createHighlighterCore` + `getSingletonHighlighter`，按需加载语言；服务端预渲染代码块 HTML，编辑器接管时再 hydrate |
| Mermaid | 仅在 `anynote-mermaid` NodeView 内动态 import，避免主 bundle 增大 |
| KaTeX 字体 | 自托管 woff2，preload 关键字重，避免公式跳动 |
| 大文档（>5000 节点） | 使用 `prosemirror-virtual-cursor` + 分页加载（Phase 后期再做） |
| 频繁 onChange | `useDebouncedCallback(onChange, 300)`，配合 `useSaveNote` 内部再 debounce 2s 入库 |
| SSR hydration | `immediatelyRender: false` + `EditorContent` 在 `'use client'` 子组件中；服务端只渲染 readonly markdown 转 HTML 的静态版本 |

### 6.9 与旧编辑器的迁移映射

| 旧用法位置 | 现状组件 | 新方案 |
|----------|---------|--------|
| `note/[id]` 编辑页 | `MilkdownEditorNew` | `<TiptapEditor preset="full" />` |
| `doc/[id]` 协同文档 | `MilkdownEditor` | `<TiptapEditor preset="full" collab={...} />` |
| `MarkDownEditor` | Wangeditor 包装 | 删除，统一 TipTap |
| `MarkDownViewer` | react-markdown | `<TiptapEditor preset="readonly" />`（或保留 react-markdown 渲染纯静态预览） |
| `VditorEditor` | Vditor | 删除 |
| `MuyaMarkDownEditor` | Muya | 删除 |
| AI 对话气泡渲染 | react-markdown | `<TiptapEditor preset="readonly" />`（统一公式/代码体验） |

依赖清理（package.json）：移除 `@milkdown/*`、`@muyajs/core`、`@wangeditor/*`、`vditor`、`@prosemirror-adapter/react`、`milkdown-plugin-shiki`、`react-markdown`（保留 1 个用于轻量场景如可）。

---

## 七、样式与主题

### 7.1 Tailwind 4 + CSS Variables

```css
/* styles/globals.css */
@import "tailwindcss";

@theme {
  --color-background: hsl(0 0% 100%);
  --color-foreground: hsl(0 0% 7%);
  --color-primary: hsl(220 91% 55%);
  --color-muted: hsl(0 0% 96%);
  /* shadcn 完整 token 集合 */
}

.dark {
  --color-background: hsl(0 0% 7%);
  --color-foreground: hsl(0 0% 95%);
  --color-primary: hsl(220 91% 65%);
  --color-muted: hsl(0 0% 15%);
}

/* tiptap 排版 */
.anynote-editor .ProseMirror {
  @apply prose prose-neutral dark:prose-invert max-w-none;
}
.anynote-editor .ProseMirror :where(h1, h2, h3) {
  @apply scroll-mt-20;
}
```

### 7.2 暗色模式

- `next-themes` 提供 `<ThemeProvider attribute="class" enableSystem>`
- 用户偏好持久化在 localStorage，由 next-themes 注入 `<html class="dark">`
- Shiki 主题双份编译：`github-light` + `github-dark`，通过 CSS Variables 切换
- AntD 不再使用，无需 `theme={{ algorithm }}` 切换

### 7.3 数据密集型组件的取舍

- **表格**：用 `@tanstack/react-table`（headless）+ shadcn `Table`，比 AntD Table 更可控
- **DatePicker**：`react-day-picker` + shadcn `Calendar`
- **Select / Combobox**：shadcn `Select` + `Command`（cmdk）
- **Tree（笔记目录）**：自研 + Radix `Collapsible`，配合 `@dnd-kit` 实现拖拽排序
- **保留 ECharts**：Mooc 模块图表，懒加载
- **保留 ReactFlow**：AI Workflow 模块

**完全不引入 AntD**。彻底切割双 UI 库局面。

---

## 八、关键页面与功能映射

| 旧路由 | 新路由 | 关键组件 | 改造要点 |
|--------|--------|---------|---------|
| `/login` | `(auth)/login` | `LoginForm` (react-hook-form + zod) | 提交到 `/api/auth/login`，登录后 router.push 跳 dashboard |
| `/dashboard` | `(workspace)/dashboard` | `DashboardOverview` | 服务端渲染初始统计（RSC） |
| `/note/{id}` | `(workspace)/notes/[baseId]/[noteId]` | `NoteEditorPage` | TipTap full + 自动保存 + 版本历史 |
| `/doc/{id}` | `(workspace)/docs/[id]` | `DocEditorPage` | TipTap + Collaboration |
| `/pdf` | `(workspace)/ai/pdf` | `PdfChatPage` | react-pdf + 右侧 chat panel |
| `/wikis` | `(workspace)/wikis` | `WikiBrowser` | 树 + TipTap readonly |
| `/mooc` | `(workspace)/mooc` | `MoocPage` | 保留视频播放，DPlayer 懒加载 |
| `/workflow` | `(workspace)/ai/workflow` | `WorkflowCanvas` | ReactFlow |
| `/task` | `(workspace)/tasks` | `TasksPage` | tanstack-table |
| `/settings` | `(workspace)/settings/[...slug]` | `SettingsLayout` | 嵌套子路由 |

---

## 九、可观测性与错误处理

| 维度 | 方案 |
|------|------|
| 错误边界 | `app/error.tsx` + `global-error.tsx` + 组件级 `<ErrorBoundary>` |
| API 错误 | `lib/api/errors.ts` 转换为 `ApiError({ code, message, traceId })`，全局 `<Toaster>` 统一展示 |
| 日志 | 客户端 Sentry（可选，默认关闭）；BFF 用 `pino` 输出 JSON |
| Trace | BFF 注入 `X-Request-Id`，转发至后端，前端在错误 toast 显示便于排查 |
| 编辑器异常 | TipTap `editorProps.handleDOMEvents.error` 捕获，降级为 readonly + 警告 |

---

## 十、测试策略

| 层 | 工具 | 范围 |
|----|------|------|
| 单元 | Vitest | utils、stores、format/parse markdown |
| 组件 | Vitest + Testing Library | UI 组件、表单校验 |
| 编辑器 | Vitest + `prosemirror-test-builder` | 节点序列化、Slash 命令、复制粘贴 |
| Hook | Vitest + `@testing-library/react` `renderHook` | TanStack Query mock |
| E2E | Playwright | 登录、创建笔记、编辑保存、AI 流式回复、PDF 上传 |
| 合约 | `openapi-typescript` CI diff | 阻止后端漂移合并 |

CI 流水线：`pnpm lint && pnpm typecheck && pnpm test && pnpm test:e2e --shard`。

---

## 十一、迁移路线与里程碑

> 严格在 REFACTOR_PLAN.md Phase 5 框架内，细化为 7 个迭代。

| 迭代 | 周 | 内容 | 产出 |
|------|----|------|------|
| **F1** 项目骨架 | W1 | 初始化 Next 15、Biome、Tailwind 4、shadcn、Providers | `pnpm dev` 可启动空壳应用 |
| **F2** 认证 BFF | W1-W2 | `/api/auth/*` Route Handlers、middleware、httpOnly cookie、登录/登出流程 | 安全登录可走通 |
| **F3** 类型与查询层 | W2 | `openapi-typescript` 生成、ky 封装、TanStack Query Providers、错误处理 | `useMe()` 等首批 hooks 可用 |
| **F4** AppShell | W2-W3 | 侧边栏、顶栏、命令面板、暗色主题、路由保护 | 主布局完成 |
| **F5** TipTap 核心 | W3-W4 | `TiptapEditor` 组件 + full / minimal / readonly preset + 自定义扩展（Callout / Slash / Image 上传 / CodeBlockShiki / Math） | `/notes/[baseId]/[noteId]` 可编辑可保存 |
| **F6** 业务页面迁移 | W4-W5 | Notes、Docs、PDF、Wikis、Tasks、Settings | 与旧前端功能对齐 |
| **F7** AI 与高级特性 | W5-W6 | AI 聊天 SSE、AI Block 节点、Slash AI 项、Workflow、行内补全 | AI 完整体验 |
| **F8**（可选） | W6+ | TipTap Collaboration + Yjs、版本历史 UI、桌面端 Tauri 调通 | 协同编辑可用 |

每个迭代结束跑一遍：lint、typecheck、单测、E2E 关键路径、bundle 体积报告。

---

## 十二、风险登记

| 风险 | 概率 | 影响 | 缓解 |
|------|------|------|------|
| TipTap 自定义节点 Markdown 双向序列化 bug | 高 | 数据损坏 | 单元测试覆盖每个节点 round-trip；导入前先 dry-run 比对 |
| BFF Cookie 跨子域问题 | 中 | 桌面端登录失败 | Tauri 用 Origin Header + `sameSite=lax`；提供"令牌交换"端点给 Tauri 客户端 |
| Shiki 首次加载慢 | 中 | 编辑体验卡 | RSC 预渲染只读代码块；客户端 `getSingletonHighlighter` 复用实例 |
| Markdown 与 ProseMirror schema 不对齐导致丢失格式 | 中 | 用户内容失真 | 定义"权威 schema"，建立 lint 工具检测旧笔记中无法表达的节点 |
| openapi-fetch 类型推断超时 | 低 | IDE 卡 | 拆分聚合 spec 为按服务 paths，按需 import |
| 协同 Yjs 与 Markdown 序列化冲突 | 中 | 协同断线丢失 | Yjs 文档为权威，定时增量持久化到后端；Markdown 只作导出快照 |
| 桌面 Tauri 与 Next 15 Server Components 不兼容 | 中 | 桌面端打不开 | Tauri 端使用 `output: 'export'` 静态导出 + 独立认证策略 |

---

## 十三、验收 Checklist（前端专项）

- [ ] `pnpm dev` 启动 ≤ 3s，HMR ≤ 200ms（Turbopack）
- [ ] 初始 JS bundle（gzipped）≤ 300KB，编辑器异步包 ≤ 250KB
- [ ] 登录后 DevTools → Application → Cookies：仅看到 `at` / `rt` / `sid`，且 HttpOnly 列全为 ✓
- [ ] DevTools → Application → Local Storage / Session Storage 无任何 token
- [ ] `pnpm openapi && git diff --exit-code src/types/api/` 通过
- [ ] 笔记编辑：常用 Markdown 语法（标题、列表、代码块、表格、公式、引用、Callout、图片、链接）全部能 round-trip
- [ ] 笔记自动保存：停止输入 2s 内入库，断网时本地降级到 IndexedDB（可选）
- [ ] 暗色模式切换：编辑器、代码高亮、公式、AI 对话全部正确响应
- [ ] AI 流式：100 token 内首字延迟 ≤ 1s（取决后端），UI 不卡顿
- [ ] PDF 上传：选择 50MB 文件，进度条平滑，完成后跳转聊天页
- [ ] Lighthouse Performance ≥ 90，Accessibility ≥ 95
- [ ] E2E 关键路径全部绿
- [ ] 旧 `apps/web-legacy` 保留为对照，新前端验收通过 1 周后再删除

---

## 十四、与 REFACTOR_PLAN.md 的差异说明

本方案在以下几点对 Phase 5 做了扩展或修订：

1. **编辑器**：原方案保留 Milkdown + Vditor，本方案统一为 **TipTap 单一栈**，新增 6.x 全章详述。
2. **API 客户端**：原方案用 ky + openapi-typescript，本方案进一步引入 `openapi-fetch` 获得端到端路径级类型推断。
3. **BFF 层**：原方案给出登录示例，本方案补充了**Token 刷新串行化锁**、**通用代理路由**、**Cookie 三件套**设计。
4. **目录结构**：在 `src/` 下新增 `features/`（业务 hooks 集中地）和 `stores/`（Zustand 切片），明确与 `hooks/`（通用 hooks）的分工。
5. **测试 / 可观测性 / 性能预算**：补充第九至十三章，便于验收对齐。

其他部分（认证、目录、TanStack Query、shadcn/ui 选型）与原方案一致，作为本方案的前置约定。
