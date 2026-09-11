# 前端架构速查

> 框架：Next.js 15 · React 19 · TypeScript 5 · Tailwind CSS 4 · shadcn/ui

---

## 目录结构

```
apps/web/
├── src/
│   ├── app/                  Next.js App Router 页面
│   │   ├── (auth)/           登录 / 注册路由组
│   │   ├── (workspace)/      主工作区路由组（dashboard / notes / docs / ai / mooc / tasks / wikis / settings）
│   │   ├── api/auth/*        BFF 认证路由（login / register / logout / refresh / me / collab-token / exchange）
│   │   ├── api/proxy/[...]   带鉴权的网关代理（含 SSE 透传）
│   │   ├── layout.tsx        根布局（字体、Provider）
│   │   └── providers.tsx     Provider 树（QueryClient、Theme）
│   ├── components/           通用组件
│   │   ├── ui/               shadcn 原子组件（vendored，不改不测）
│   │   ├── editor/           TipTap 编辑器（core / extensions / presets）
│   │   ├── layout/           AppShell、侧栏、命令面板、主题切换
│   │   └── note/             笔记域共享组件
│   ├── features/             功能模块（auth / notes / collab / ai / mooc / tasks / wikis / settings）
│   │   └── <feature>/
│   │       ├── components/   模块内组件
│   │       ├── use-*.ts      Query / Mutation hooks（**平铺，不建 hooks/ 子目录**）
│   │       ├── query-keys.ts key 工厂
│   │       └── schemas.ts    zod 校验
│   ├── lib/
│   │   ├── api/              openapi-fetch 实例、错误信封、DTO query 序列化
│   │   ├── auth/             BFF 侧 Cookie / 刷新 / 资料（server-only）
│   │   ├── collab/           协同房间命名、会话、索引文档
│   │   ├── desktop/          桌面壳桥接（令牌交换 + 本地保管）
│   │   ├── editor/           Markdown 桥接、Shiki、KaTeX、上传
│   │   └── utils.ts          cn()、格式化工具
│   ├── stores/               Zustand stores（仅 UI 状态）
│   └── types/                全局类型声明
├── e2e/                      Playwright 端到端用例（M8.3）
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
| `full` | 笔记 / 文档编辑 | StarterKit（关 codeBlock/underline）+ 自定义节点 + Slash 菜单 + 工具栏 + 气泡菜单 |
| `minimal` | 评论 / AI 输入框 | StarterKit + Placeholder |
| `readonly` | 预览 / AI 输出 / Wikis | 渲染型扩展，无交互扩展与工具栏 |

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
