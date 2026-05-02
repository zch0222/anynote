# 前端架构速查

> 框架：Next.js 15 · React 19 · TypeScript 5 · Tailwind CSS 4 · shadcn/ui

---

## 目录结构

```
apps/web/
├── src/
│   ├── app/                  Next.js App Router 页面
│   │   ├── (auth)/           登录/注册路由组
│   │   ├── (dashboard)/      主工作区路由组
│   │   ├── layout.tsx        根布局（字体、Provider）
│   │   └── providers.tsx     Provider 树（QueryClient、Theme、Auth）
│   ├── components/           通用组件（shadcn/ui 扩展 + 业务组件）
│   │   └── ui/               shadcn 原子组件（Button、Dialog、...）
│   ├── features/             功能模块（note、kb、ai、auth 等）
│   │   └── <feature>/
│   │       ├── components/   模块内组件
│   │       ├── hooks/        模块内 Query hooks
│   │       └── types.ts      模块类型
│   ├── hooks/                全局 hooks（useAuth、useTheme 等）
│   ├── lib/
│   │   ├── api-client/       自动生成的类型化 API 客户端
│   │   └── utils.ts          cn()、格式化工具
│   ├── store/                Zustand stores（仅 UI 状态）
│   └── types/                全局类型声明
├── public/
└── package.json
```

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

客户端组件通过 `useAuth()` hook 获取用户信息（从 /api/auth/me 接口，无需直接持有 token）。

---

## 组件规范

- 原子组件优先使用 `components/ui/`（shadcn/ui），不重复封装
- 业务逻辑放在 `features/<feature>/hooks/`，组件只做渲染
- 服务端组件（RSC）用于静态布局和初始数据；交互组件加 `'use client'`
- 样式只用 Tailwind CSS，禁止内联 style（动态值用 CSS 变量）

---

## 编辑器集成

Milkdown（主编辑器）配合以下插件：

| 插件              | 用途              |
|-------------------|-------------------|
| `@milkdown/preset-gfm` | GFM Markdown  |
| `@milkdown/plugin-math` | LaTeX 数学公式 |
| `@milkdown/plugin-prism` | 代码高亮        |
| `@milkdown/plugin-slash` | 斜杠命令        |

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
```

---

## 环境变量

| 变量                       | 用途                          |
|----------------------------|-------------------------------|
| `NEXT_PUBLIC_API_URL`      | 网关地址（客户端侧）          |
| `INTERNAL_API_URL`         | 服务端直连网关地址            |
| `NEXTAUTH_SECRET`          | Cookie 签名密钥               |
