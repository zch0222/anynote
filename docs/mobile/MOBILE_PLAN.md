# Anynote 移动端适配技术方案

> 文档版本：v1.2 | 创建 2026-09-12 | 最近更新 2026-09-12 | 状态：**决策已拍板（§11）；M10.0 - M10.4 已实现，实施期偏差见里程碑「与方案的偏差」**
> 关联文档：[README.md](./README.md) · [UI_INVENTORY.md](./UI_INVENTORY.md)（现状证据） · [MOBILE_MILESTONES.md](./MOBILE_MILESTONES.md)（执行顺序与验收）
> 上游约束：[`CLAUDE.md`](../../CLAUDE.md)、[`README.md` 测试节](../../README.md#测试)、[`docs/refactor/FRONTEND_MILESTONES.md`](../refactor/FRONTEND_MILESTONES.md)（M7.6 后端缺口）、[`docs/deployment-network.md`](../deployment-network.md)
> 本文是**方案 + 代码骨架**。执行顺序与验收标准在 [MOBILE_MILESTONES.md](./MOBILE_MILESTONES.md)。
> **2026-09-12 决策 1、2 取备选，其余取默认**（见 §11）：入口从一开始就做 UA 分流，登录后落 `/m/dashboard`
> 并为它做一个有真实内容的移动端工作台。两条改动把原 M10.6 并进了 M10.1，里程碑重排为 M10.0 – M10.5。

---

## 1. 目标与非目标

### 1.1 目标

1. 让 Anynote 的**核心路径在手机浏览器上完整可用**：笔记的读写、文档阅读、AI 对话、任务查看、设置。
2. **不新开应用**：在 `apps/web` 内新增移动端路由段，逻辑层（query hooks / BFF / 认证）零复制。
3. 移动端有**自己的门禁**：Playwright 移动 project、移动 form factor 的 Lighthouse、独立的首屏预算分桶。
4. 服从仓库既有约束：contract-first（只用 `@anynote/api-client`）、改动必带单测、中文 commit、不碰 Nacos 以外的运行时配置。
5. 桌面版**行为不变**：移动端工作不得改动 `(workspace)` 路由组的既有版式（`/ai/pdf` 的溢出 bug 例外，见 §10 的 M10.0）。

### 1.2 非目标（明确不做）

| 不做 | 原因 |
|------|------|
| 原生 App（React Native / Flutter） | 要重写编辑器（TipTap 是 DOM 方案）、要给后端新增一套面向 native 的 Bearer 直连与刷新；M7.6 的 5 个后端缺口还没关，不具备开新端的前提 |
| Tauri 2 移动端壳 | 技术上可行（桌面壳已是 `WebviewUrl::External` 加载远端 URL，`apps/desktop/README.md`），但它依赖本方案先产出可用的 `/m/*`。列为本方案完成后的可选后续 |
| PWA / 离线（Service Worker、安装到桌面） | 独立议题：SW 缓存策略会与 BFF 的 `sameSite=strict` Cookie 和 SSR 页面交互，需要单独的方案与威胁评估 |
| AI 工作流画布（`/ai/workflow`） | `@xyflow/react` 在手机上没有可接受的交互方案；移动端不提供入口，引导到桌面版 |
| `apps/web-legacy` 的移动端适配 | 它的删除条件已定义，不追加投入（[UI_INVENTORY §7](./UI_INVENTORY.md)） |
| 修 M7.6 的后端缺口 | 不在本方案范围；移动端与桌面同步受阻，验收标准里显式标注 |
| 平板（768–1024px）专门版式 | 现有断点已让平板落在"桌面版窄屏"形态且可用；移动端只针对 `< 768px`。平板若后续要做，按本方案的 `md` 档补 |

---

## 2. 既有事实盘点（方案的地基，均已核对）

> 完整逐页证据见 [UI_INVENTORY.md](./UI_INVENTORY.md)。本节只列**决定方案形状**的 5 条。

### 2.1 认证与同源强绑定 —— 这是"不新开应用"的决定性理由

- Token 只存在 httpOnly Cookie，属性写死 `sameSite: "strict"` + `path: "/"`，**不设 `domain`**（`apps/web/src/lib/auth/cookies.ts:7-17`）。host-only Cookie → 换 origin（含子域）都拿不到。
- 刷新单飞锁是**进程级** `Map`，挂在 `globalThis.__anynoteRefreshInflight` 上（`apps/web/src/lib/auth/refresh.ts:22-29`）。注释已写明"必须挂在进程级对象上，才能保证同一 rt 的并发刷新在进程内只打一次后端"。
- 推论：**两个 Next 进程 = 两把互不可见的锁**，同一个 `rt` 会被并发刷两次。这正是 M2.1 解决掉的问题，新开应用等于把它重新引入，除非把锁搬到 Redis（后端改造，范围外）。

### 2.2 逻辑层与 UI 层已经分离

| 层 | 规模 | 移动端 |
|----|------|-------|
| `src/features/**/*.ts` + `src/lib/**` | 4096 行 | 一行不改 |
| `src/app/api/**`（BFF） + `src/middleware.ts` | 345 + 15 行 | 复用 |
| `src/**/*.tsx`（版式） | 8195 行 | 约 30% 可用，master-detail 需重写 |

移动端复用掉的正是贵的那一半。这是"路由段方案"成立的前提。

### 2.3 编辑器已有扩展点，不需要改内核

- 预设 4 套：`PresetName = "full" | "minimal" | "readonly" | "collaborative"`（`src/components/editor/presets/types.ts:5`）。
- 工具栏已有 variant 机制：`ToolbarVariant = "full" | "minimal"`（`src/components/editor/core/toolbar.tsx:32`），在 `tiptap-editor.tsx:139` 按 preset 选择。
- 已有 `fill` 属性处理"外层给定高度、正文内部滚动"（`tiptap-editor.tsx` 的 props 注释）。
- 整包已是 `dynamic(..., { ssr: false })`（`src/components/editor/TiptapEditor.tsx`）。

→ 移动端编辑器 = **加第三个 toolbar variant + 一个移动端容器**，内核与 Markdown 往返逻辑不动。

### 2.4 部署拓扑只发布两个端口

生产外部 Nginx 只发布 `web:3000`（`/` 与 `/api/*`，保留路径）与 `collab:1234`（`/collab/*`，去前缀），Gateway 与业务服务无宿主机端口（`docs/deployment-network.md:34-42`）。
→ `/m/*` 作为 `web:3000` 的路由，**Nginx、Compose、Dockerfile 全部零改动**。新开应用则要加镜像、加 upstream、重写部署文档。

### 2.5 门禁全是桌面口径

Playwright 只有 `Desktop Chrome` 一个 project（`playwright.config.ts:37`）；Lighthouse 显式加载桌面预设（`scripts/lighthouse.mjs:15`）；产物预算全路由同一阈值（`scripts/lib/bundle.mjs:5-11`）。
→ 移动端必须**自带门禁**，否则"适配完了"没有判定依据。

---

## 3. 架构决策

### D1 落点：`apps/web` 内新增路由段，不新开应用

**决定**：移动端 UI 放在 `apps/web/src/app/(mobile)/m/**`，与 `(workspace)` 并列。

**理由**（按权重）：

1. 认证同源（§2.1）——换 origin 要复制 BFF 并引入双刷新锁竞争。
2. 逻辑层零复制（§2.2）——4096 行 `.ts` 直接 import。
3. 部署零改动（§2.4）。
4. 门禁复用一套工具链（§2.5）：Playwright 加一个 project、Lighthouse 加一个模式、预算加一个分桶，而不是四份配置。
5. Tauri 桌面壳加载远端 URL，同源即生效；未来 Tauri 移动端同理。

### D2 路由形状：`/m/*` 显式前缀 + 独立 route group

```
app/(workspace)/…     桌面版，保持不动
app/(mobile)/m/…      移动端，独立 layout
```

**为什么不是"同一路由内 `useIsMobile()` 选组件"**：两套 shell 会打进同一个入口 chunk，直接顶破 `CLAUDE.md` 写死的首屏 300KB 预算（`scripts/lib/bundle.mjs:7`）。`/m/*` 独立路由天然享受 Next 的按路由分包。

**为什么不是 `m.example.com` 子域**：`cookieOptions()` 不设 `domain`，Cookie 是 host-only，子域拿不到（§2.1）。要改就得动认证，收益为零。

**为什么前缀是 `/m` 而不是只靠 route group**：route group `(mobile)` 不出现在 URL 里，桌面与移动端路由会撞。`/m` 前缀让两套 URL 共存、可互相跳转、可分享。

**入口策略：一开始就做 UA 分流**（§11 决策 1 取备选，2026-09-12 拍板）：

- `middleware.ts` 加 UA 判定，仅在**入口路径**（`/`、`/dashboard`）做一次 307 到 `/m/dashboard`，深层桌面路由（`/notes/3/7` 这类）不动——它们通常来自分享链接，改写会让分享语义变坏。
- 逃生口 `?desktop=1`：带上它访问入口路径不跳转，并把偏好 Cookie 写成 `desktop`；`?mobile=1` 反之。
- 偏好 Cookie `anynote_view=desktop|mobile`：非 httpOnly、`sameSite=lax`、一年有效，**只存版式选择，不含任何身份信息**，因此不违反 `CLAUDE.md` 禁止清单里的"token 不得进 document.cookie"。偏好存在时它**优先于 UA**（桌面浏览器可以主动留在移动版，反之亦然）。
- 判定与跳转目标的计算抽成纯函数 `resolveViewDecision()`（实现时改的名，见里程碑「与方案的偏差」1），单测覆盖 UA / 偏好 / 逃生口 / 非入口路径四类输入。

**风险与缓解**：备选项的已知风险是"跳转逻辑未经真机验证就上线"。缓解是把它压在纯函数 + 单测里，
并在 M10.5 的真机清单中把"iOS / Android 首次访问 `/` 落到 `/m/dashboard`、`?desktop=1` 能逃生"列为签字项（E2E 也有对应两条用例）。

### D3 导航范式：底部 tab bar + 顶部 title bar，不用侧边栏抽屉

桌面侧边栏有 3 组 9 个入口 + 设置（`src/components/layout/navigation.ts`）。移动端收敛为 **5 个 tab**：

| Tab | 路由 | 说明 |
|-----|------|------|
| 工作台 | `/m/dashboard` | 登录后的落地页；**移动端自己的工作台**，不是桌面那个占位页（§11 决策 2 取备选） |
| 笔记 | `/m/notes` | 知识库 → 笔记 → 编辑器三级 |
| 文档 | `/m/docs` | 协同文档库 |
| AI | `/m/ai/chat` | AI 对话 |
| 我的 | `/m/me` | 设置、主题、更多入口（知识库 / 课程 / 任务 / PDF 问答）、退出登录、切换桌面版 |

**5 个 tab 是硬上限**（再多在 375px 下每格不足 72px，图标+文字会挤）。决策 2 取备选后工作台必须占一格——
落地页没有 tab 入口会让"从别处点回首页"无路可走——于是**"待办"从 tab 降级**：`/m/tasks` 路由保留，
入口改为工作台的待办卡片（带"全部任务"链接）+ `/m/me` 的更多列表。这是决策 2 的派生结果，
不是对 D3 的独立改动；若后续实测发现任务是高频入口，按同样上限换掉"文档"而不是加第 6 格。

**移动端工作台放什么**（决策 2 的"有内容"要求，全部复用既有 hooks，不新增后端）：

| 区块 | 数据来源 |
|------|---------|
| 问候语 + 昵称 | `useMe()` |
| 快捷操作（新建笔记 / AI 对话 / 搜索 / 文档） | 纯路由跳转 |
| 「最近笔记」（首个知识库最近 5 篇） | `useKnowledgeBasesQuery()` + `useNotesQuery()` |
| 「待办」（首个知识库未提交任务前 3 条） | `useTasksQuery()` + `submissionStatusText()` |
| 「我的知识库」（前 4 个） | `useKnowledgeBasesQuery()` |

协同文档索引**不进工作台**：它要连 WebSocket 并加载 yjs（`collab-loader.tsx` 的 `dynamic` 包），
落地页为此建连接不值得——文档从 tab 进。

**实现约束**：

- tab 定义从 `navigation.ts` **派生**，不写第二份真相：新增 `mobileTabs` 导出，引用同一批 `title` / `icon` / `href`，用 `desktopHref → mobileHref` 映射函数转换。
- 底部条必须垫 `env(safe-area-inset-bottom)`；内容区相应补 `padding-bottom`。
- tab 高亮复用既有 `isRouteActive()`（`navigation.ts:97`），只是传入去掉 `/m` 前缀后的 pathname。

### D4 master-detail 一律拆成独立路由

桌面的"并排双栏"在移动端必须是"列表路由 → 详情路由 + 返回"。完整映射见 §7。核心三处：

| 桌面 | 移动端 |
|------|--------|
| `/notes/[baseId]/[noteId]`：左目录树 + 右编辑器 | `/m/notes`（知识库）→ `/m/notes/[baseId]`（笔记列表）→ `/m/notes/[baseId]/[noteId]`（全屏编辑器 + 返回） |
| `/ai/chat/[id]`：左会话列表 + 右消息流 | `/m/ai/chat`（会话列表）→ `/m/ai/chat/[id]`（全屏对话） |
| `/ai/pdf`：三栏（文件库 / 预览 / 问答） | `/m/ai/pdf`（文档列表）→ `/m/ai/pdf/[docId]`（`Tabs` 切换"预览 / 问答"） |

`/wikis` 现在用组件内 `useState` 做三级导航（`features/wikis/components/wikis-page.tsx`），移动端改为 URL 驱动的三级路由，这样系统返回键语义正确。

### D5 编辑器的移动端形态

| 项 | 桌面现状 | 移动端 |
|----|---------|--------|
| 工具栏 | 23 按钮 `flex-wrap`，28×28px（`tiptap.css:59/72`） | **新增 `ToolbarVariant = "mobile"`**：`flex-nowrap` + `overflow-x-auto` 单行横滑，按钮 ≥ 40px，常驻 10 个高频命令，其余进"更多"底部 `Sheet` |
| 工具栏位置 | `position: sticky; top: 0` | 贴在编辑区**底部**（贴近软键盘），`sticky bottom-0` |
| 软键盘 | 未处理 | `app/(mobile)/layout.tsx` 导出 `viewport: { interactiveWidget: "resizes-content" }`；另以 `VisualViewport` 监听兜底（Android WebView 对该字段支持不一） |
| 气泡菜单 | `BubbleMenuPortal`（`tiptap-editor.tsx:141`） | **移动端禁用**：触摸选区会与系统选择菜单（复制 / 粘贴）打架。格式化走底部工具条的"格式"态 |
| slash 菜单 | 输入 `/` 触发 | 保留，不依赖 hover |
| 图片插入 | `lib/editor/upload.ts` 分片直传 | 复用同一实现；`<input type="file" accept="image/*">` 在移动端自然出现"拍照 / 相册"。⚠️ 该链路受 M7.6 缺口阻塞 |
| 正文高度 | `fill` + `h-[calc(100svh-9rem)]` | `fill` 不变，高度换成移动端外壳的可用高度变量（见 D6 的 `--mobile-content-h`） |

**实现方式**：`Toolbar` 的 `variant` 加一个取值，`TiptapEditorProps` 加 `toolbar?: ToolbarVariant` 覆写（不传时沿用按 preset 推导的现有行为），移动端编辑器页显式传 `toolbar="mobile"`。**不新建第二个编辑器组件**。

### D6 交互替换表（桌面范式 → 移动端范式）

| 桌面 | 移动端 | 涉及位置 |
|------|--------|---------|
| hover 显示删除按钮 | 常显图标按钮 + 确认 `Sheet` | `conversation-list.tsx:108`、`pdf-page.tsx:236` |
| dnd-kit 拖拽移动笔记 | "移动到…"底部 `Sheet`（复用 `use-move-note`） | `note-tree.tsx:44` |
| ⌘K 命令面板 | 顶栏搜索图标 → 全屏搜索页 `/m/search` | `command-palette.tsx` |
| 28px 按钮 | `min-h-10 min-w-10`（40px） | `tiptap.css`、移动端组件 |
| 侧边栏抽屉 | 底部 tab bar | `app-shell.tsx` / `sidebar.tsx` |
| `@tanstack/react-table` 表格 | 卡片列表（不引入 react-table） | `task-table.tsx` |
| 桌面 `DropdownMenu` 菜单 | 底部 `Sheet` 动作表 | 各列表页 |

**高度约定**：移动端 shell 用一个 CSS 变量统一可用高度，避免各页重复算 `calc`：

```css
/* (mobile)/layout 的根元素 */
--mobile-header-h: 3.5rem;   /* 56px title bar */
--mobile-tabbar-h: calc(3.25rem + env(safe-area-inset-bottom));
--mobile-content-h: calc(100svh - var(--mobile-header-h) - var(--mobile-tabbar-h));
```

### D7 复用边界（写代码时照这张表判断）

| 分类 | 内容 | 规则 |
|------|------|------|
| **零改动复用** | `features/**/*.ts`、`lib/**`、`app/api/**`、`packages/api-core`、`packages/api-client` | 移动端组件直接 import；**禁止**为移动端新写一份 hook 或 fetch |
| **扩展（向后兼容）** | `components/ui/*`、`components/editor/core/toolbar.tsx`、`components/layout/navigation.ts`、`middleware.ts`、`scripts/lib/bundle.mjs`、`scripts/lib/lighthouse.mjs`、`playwright.config.ts` | 只加分支 / 新导出，**不得改变桌面既有行为**；改完桌面单测必须仍全绿 |
| **移动端独有** | `app/(mobile)/**`、`components/layout/mobile/**`、`features/*/components/mobile/**` | 新建 |
| **不碰** | `app/(workspace)/**`、`features/*/components/*.tsx`（桌面版式） | 例外：M10.0 修 `/ai/pdf` 溢出、D6 表里把 hover-only 改为 `md:` 限定 |

### D8 性能预算与门禁（新增，必须可执行）

| 门禁 | 现状 | 新增 |
|------|------|------|
| 首屏 JS | 全路由 300KB gzip | `/m/*` 路由单独分桶 **≤ 250KB**（移动端 shell 更轻：无 sidebar / cmdk / react-table / xyflow）。实现：`scripts/lib/bundle.mjs` 的 `DEFAULT_BUDGETS` 加 `mobileInitialJs`，按 `toRoutePath()` 结果是否以 `/m` 开头选桶；判定逻辑**必须带单测**（`CLAUDE.md` 测试要求表已含"构建期脚本里的判定逻辑"） |
| 编辑器整包 | 250KB | 不变（同一个 chunk） |
| Lighthouse | 桌面预设，Performance ≥ 0.9 / Accessibility ≥ 0.95 | 新增 `--mobile` 模式：不加载 `desktop-config`，用 Lighthouse 默认移动 form factor（Moto G Power 级节流 + 4× CPU 降速）。门槛 **Performance ≥ 0.85 / Accessibility ≥ 0.95**，默认路由 `/login`、`/m/dashboard`、`/m/notes`、`/m/docs`、`/m/ai/chat` |
| E2E | `Desktop Chrome` 1 个 project | 新增 `{ name: "mobile", use: devices["Pixel 5"] }`，新建 `e2e/mobile-*.spec.ts`。⚠️ `fullyParallel: false` + `workers: 1`，新 project 会让全量 E2E 时间翻倍 → 默认用 `--project` 分开跑，与现有"E2E 不进 CI"的约定一致 |

> **移动端 Performance 门槛为什么是 0.85 而不是 0.9**：Lighthouse 移动预设带 4× CPU 降速与 150ms RTT 节流（`scripts/lighthouse.mjs:12-14` 的注释已记录这个坑）。同一份产物在移动口径下必然低于桌面分数，沿用 0.9 会让门禁在"性能没有退化"的情况下红灯。0.85 是可守住的基线；若 M10.5 实测轻松过 0.9，再把阈值提上去。

---

## 4. 被否方案

| 方案 | 否决理由 |
|------|---------|
| **新开 `apps/mobile`（独立 Next 应用）** | ①Cookie 是 host-only + `sameSite=strict`，换 origin 拿不到身份（`cookies.ts:7-17`）；②要复制 BFF 345 行 + `lib/auth` 317 行，且两个进程的 `refreshWithLock` 互不可见，同一 `rt` 会被并发刷两次（`refresh.ts:22-29`）；③部署要加镜像 / upstream / 构建参数，`docs/deployment-network.md` 需重写；④门禁四套配置要复制 |
| **React Native / Flutter 原生 App** | TipTap 是 DOM 方案，编辑器要整体重写；后端没有面向 native 的鉴权路径（无 Cookie，需新增 Bearer 直连 + 刷新端点约定）；M7.6 的 5 个后端缺口未关，不具备开新端前提 |
| **只加断点做纯响应式（不新增路由）** | master-detail 三页靠断点无解（[UI_INVENTORY §3 P0-2](./UI_INVENTORY.md)）；且移动端组件会打进桌面入口，顶破 300KB 预算 |
| **`m.anynote.xxx` 子域** | Cookie 不设 `domain`，子域拿不到身份；要改认证换取零收益 |
| **UA 在服务端 rewrite 到同一路由的不同组件** | Next 的 UA rewrite 会让同一 URL 产出两种 HTML，缓存与分享链接语义都变坏；且仍解决不了 bundle 分包 |
| **Tauri 2 移动端壳先行** | 壳加载的就是 `/m/*`，没有本方案的产出就没有可加载的内容。列为后续可选 |

---

## 5. 目录结构（新增部分）

```
apps/web/src/
  app/
    (mobile)/
      layout.tsx                      # MobileShell + viewport(interactiveWidget) + themeColor
      m/
        dashboard/page.tsx            # 移动端工作台（登录后的落地页）
        notes/page.tsx                # 知识库列表
        notes/[baseId]/page.tsx       # 笔记列表
        notes/[baseId]/[noteId]/page.tsx   # 全屏编辑器
        notes/new/page.tsx
        docs/page.tsx
        docs/[id]/page.tsx
        ai/chat/page.tsx              # 会话列表
        ai/chat/[id]/page.tsx         # 全屏对话
        ai/pdf/page.tsx               # 文档列表
        ai/pdf/[docId]/page.tsx       # Tabs: 预览 / 问答
        wikis/page.tsx
        wikis/[baseId]/page.tsx
        wikis/[baseId]/[noteId]/page.tsx
        mooc/page.tsx
        mooc/[id]/page.tsx
        tasks/page.tsx
        search/page.tsx               # 替代 ⌘K
        me/page.tsx                   # 设置入口聚合 + 更多 + 切换桌面版
        settings/[section]/page.tsx
  components/
    layout/
      mobile/
        mobile-shell.tsx              # 顶栏 + 内容区 + 底部 tab
        mobile-title-bar.tsx          # 返回键 / 标题 / 右侧动作
        mobile-tab-bar.tsx            # 5 tab + safe-area
        mobile-action-sheet.tsx       # DropdownMenu 的移动端替代（基于 Sheet side=bottom）
        view-switch.tsx               # 桌面 / 移动互切链接
      navigation.ts                   # ← 扩展：新增 mobileTabs / toMobileHref
  components/editor/
    core/toolbar.tsx                  # ← 扩展：variant "mobile"
    core/mobile-toolbar-groups.ts     # 移动端命令分组（常驻 10 个 + 更多）
  features/
    notes/components/mobile/note-editor-mobile.tsx
    notes/components/mobile/note-list-mobile.tsx
    ai/components/mobile/chat-mobile.tsx
    tasks/components/mobile/task-cards.tsx
    …
  styles/
    mobile.css                        # 仅放 safe-area / 高度变量 / 工具条横滑
```

**命名约定**：移动端组件统一放 `components/mobile/` 子目录并以 `-mobile` 结尾，便于 `bundle:report` 里一眼识别归属，也便于将来整体替换。

---

## 6. 关键代码骨架

> 仅给**决定架构**的 6 处。其余页面是这些骨架的套用。

### 6.1 `app/(mobile)/layout.tsx`

```tsx
import type { Viewport } from "next";
import { MobileShell } from "@/components/layout/mobile/mobile-shell";
import "@/styles/mobile.css";

// 软键盘弹出时压缩布局高度而不是盖住内容——编辑器底部工具条依赖这个行为。
// Android WebView 对该字段支持不一致，mobile-shell 内另有 VisualViewport 兜底。
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  interactiveWidget: "resizes-content",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0a" },
  ],
};

export default function MobileLayout({ children }: { children: React.ReactNode }) {
  return <MobileShell>{children}</MobileShell>;
}
```

### 6.2 `components/layout/navigation.ts`（扩展，不改既有导出）

```ts
/** 移动端底部 tab：从桌面注册表派生，避免两份真相。 */
export const mobileTabs = [
  { title: "工作台", href: "/m/dashboard", icon: LayoutDashboard },
  { title: "笔记", href: "/m/notes", icon: NotebookPen },
  { title: "文档", href: "/m/docs", icon: FileText },
  { title: "AI", href: "/m/ai/chat", icon: MessageSquare },
  { title: "我的", href: "/m/me", icon: UserRound },
] as const;

/** 桌面路由 → 移动端路由；没有移动端对应页时返回 null（如 /ai/workflow）。 */
export function toMobileHref(desktopHref: string): string | null { /* … */ }
/** 移动端路由 → 桌面路由，用于"切换到桌面版"。 */
export function toDesktopHref(mobileHref: string): string { /* … */ }
```

> `toMobileHref` / `toDesktopHref` 是纯函数，**必须带单测**（含 `/ai/workflow → null`、带参数路由、未知路径回退）。

### 6.3 `components/layout/mobile/mobile-shell.tsx`

```tsx
"use client";
/**
 * 移动端外壳：顶栏（返回 / 标题 / 动作）+ 内容区 + 底部 tab。
 *
 * 与桌面 AppShell 的区别：
 * - 不挂 SidebarProvider / CommandPalette（省首屏 JS，见 MOBILE_PLAN D8 预算分桶）
 * - 高度统一走 CSS 变量 --mobile-content-h，页面内不再各算 calc
 * - 全屏页（编辑器、对话）通过 data-fullscreen 隐藏 tab bar
 */
export function MobileShell({ children }: { children: React.ReactNode }) { /* … */ }
```

### 6.4 `components/editor/core/toolbar.tsx`（扩展 variant）

```ts
// 从 "full" | "minimal" 扩为三值；移动端单行横滑 + ≥40px 触摸目标 + 更多命令进 Sheet。
export type ToolbarVariant = "full" | "minimal" | "mobile";
```

配套 `core/mobile-toolbar-groups.ts`：

```ts
/** 常驻（单行横滑可见）：按移动端写作频率排序。 */
export const MOBILE_PRIMARY = [
  "bold", "italic", "heading2", "bulletList", "orderedList",
  "taskList", "link", "image", "codeBlock", "undo",
] as const;
/** 其余命令进"更多"底部 Sheet，按组展示。 */
export const MOBILE_OVERFLOW_GROUPS = [ /* … */ ];
```

### 6.5 `features/notes/components/mobile/note-editor-mobile.tsx`

```tsx
"use client";
/**
 * 移动端笔记编辑器：全屏，无目录树。
 *
 * 复用桌面的全部逻辑，一行不改：
 *   useNoteQuery / useSaveNote（自动保存 + 冲突）/ useMoveNote / lib/editor/upload
 * 差异只有三点：
 *   1. 目录树换成顶栏返回 + "移动到…"底部 Sheet
 *   2. TiptapEditor 传 toolbar="mobile"，工具条贴底
 *   3. 保存状态显示在顶栏，不占正文空间
 */
```

### 6.6 `middleware.ts`（M10.1 就加，判定抽成纯函数以便单测）

```ts
/** 是否判定为手机 UA。纯函数，单测覆盖 iOS / Android / 平板 / 桌面 / 空 UA。 */
export function isMobileUserAgent(ua: string | null): boolean { /* … */ }

/**
 * 入口分流：只在 `/`、`/dashboard` 上做一次 307，深层路由不动。
 * 优先级：?desktop=1 / ?mobile=1 逃生口 > anynote_view 偏好 Cookie > UA 判定。
 * 恒返回一个决策对象：redirectTo 为 null 表示留在当前路由，setView 非 null 时
 * 由 middleware 负责写偏好 Cookie（两者可以同时出现，也可以都不出现）。
 */
export function resolveViewDecision(input: {
  pathname: string;
  search: string;
  userAgent: string | null | undefined;
  viewCookie: string | null | undefined;
}): { redirectTo: string | null; setView: "mobile" | "desktop" | null } { /* … */ }

// 偏好 Cookie 只存版式选择（anynote_view=desktop|mobile），非 httpOnly、sameSite=lax，不含身份信息。
```

---

## 7. 桌面 → 移动端路由映射表（实现清单）

| 桌面路由 | 移动端路由 | 形态变化 | 里程碑 |
|---------|-----------|---------|--------|
| `/dashboard` | `/m/dashboard` | 桌面是占位页，移动端**重做**成有内容的工作台（最近笔记 / 待办 / 知识库 / 快捷操作）；也是 UA 分流的落点 | M10.1 |
| `/notes` | `/m/notes` | 知识库单列列表 + 右上"新建" | M10.2 |
| `/notes/[baseId]` | `/m/notes/[baseId]` | 笔记单列列表 + 下拉刷新式分页 | M10.2 |
| `/notes/[baseId]/[noteId]` | `/m/notes/[baseId]/[noteId]` | 全屏编辑器；目录树 → 返回键；拖拽移动 → 底部 Sheet | M10.3 |
| `/notes/new` | `/m/notes/new` | 表单单列 | M10.2 |
| `/docs` | `/m/docs` | 单列列表 | M10.2 |
| `/docs/[id]` | `/m/docs/[id]` | 全屏协同编辑器 + 在线状态收进顶栏 | M10.3 |
| `/wikis` | `/m/wikis` → `/m/wikis/[baseId]` → `/m/wikis/[baseId]/[noteId]` | 组件内 `useState` 三级 → URL 三级路由（返回键语义正确） | M10.2 |
| `/tasks` | `/m/tasks` | react-table 表格 → 卡片列表 + 状态筛选 Sheet；**入口在工作台与"我的"，不占 tab** | M10.2 |
| `/mooc` | `/m/mooc` | 单列卡片 | M10.2 |
| `/mooc/[id]` | `/m/mooc/[id]` | `lg:grid-cols-[20rem_1fr]` → 播放器在上、章节树在下（Tabs） | M10.2 |
| `/ai/chat` | `/m/ai/chat` | 会话列表页（原左栏独立成页） | M10.4 |
| `/ai/chat/[id]` | `/m/ai/chat/[id]` | 全屏消息流 + 贴底输入框（键盘压缩布局） | M10.4 |
| `/ai/pdf` | `/m/ai/pdf` | 文档列表页 | M10.4 |
| `/ai/pdf/[docId]` | `/m/ai/pdf/[docId]` | 三栏 → `Tabs`（预览 / 问答） | M10.4 |
| `/ai/workflow` | —（不提供） | `/m/me` 的"更多"里给一条说明 + 桌面版链接 | M10.1 |
| `/settings/[section]` | `/m/settings/[section]` | 横向分区 tabs → `/m/me` 的分组列表 → 子页 | M10.2 |
| `/login`、`/register` | 复用现有 `(auth)` 路由 | 已适配（`max-w-sm` + `px-4`），不新建 | — |
| ⌘K 命令面板 | `/m/search` | 全屏搜索页 | M10.2 |

---

## 8. 测试计划

> `CLAUDE.md` 的"测试要求"是强制的：**没有测试的改动不算完成**。下表是本方案新增代码的最小覆盖面。

### 8.1 单元测试（Vitest + Testing Library，进默认 `pnpm test`）

| 被测 | 必须覆盖 |
|------|---------|
| `navigation.ts` 的 `toMobileHref` / `toDesktopHref` | 每条映射、带参数路由、`/ai/workflow → null`、未知路径回退 |
| `mobileTabs` 与 `isRouteActive` 的联动 | 每个 tab 在其子路由下高亮（如 `/m/notes/3/7` 高亮"笔记"）；`/m/tasks` 不高亮任何 tab |
| `resolveViewDecision` | 入口路径跳 / 深层路径不跳 / `?desktop=1` 逃生 / 偏好 Cookie 优先于 UA / 已在 `/m/*` 不再跳 |
| `isImmersiveMobileRoute` | 编辑器、对话、文档详情隐藏 tab bar；列表页不隐藏 |
| `MobileShell` | 全屏页隐藏 tab bar；返回键调用 `router.back()`；安全区变量写入 |
| `mobile-toolbar-groups.ts` | 常驻命令集与 overflow 集不重不漏、与 `Toolbar` 实际注册的命令一一对应 |
| `Toolbar` variant="mobile" | 渲染常驻按钮 + "更多"触发器；**桌面两个 variant 的既有用例必须仍绿** |
| `MobileActionSheet` | 打开 / 选中 / 关闭；destructive 项二次确认 |
| `note-editor-mobile` | 保存状态渲染、"移动到…"调用 `useMoveNote`、冲突态提示（复用桌面 hook 的打桩方式） |
| `task-cards` | 状态徽章映射、筛选、空态 |
| `isMobileUserAgent`（M10.1） | iOS / Android / iPad / Windows / 空 UA / 伪造 UA |
| `MobileDashboard` | 问候语、空态、最近笔记与待办的渲染与跳转（hooks 打桩） |
| `scripts/lib/bundle.mjs` 的预算分桶 | `/m/*` 走 `mobileInitialJs`、其余走 `initialJs`、边界（`/m` 自身、`/mooc` **不得**被误判为移动端） |
| `scripts/lib/lighthouse.mjs` 的移动阈值解析 | `--mobile` 解析、阈值选择、评分判定 |

> ⚠️ `/mooc` 以 `/m` 开头但不是移动端路由——预算分桶必须按**路径段**匹配（`/m` 或 `/m/...`），不能用 `startsWith("/m")`。这条必须有用例。

### 8.2 端到端（Playwright，不进默认 `pnpm test`、不进 CI）

```ts
// playwright.config.ts 扩展
projects: [
  { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  { name: "mobile", use: { ...devices["Pixel 5"] } },
],
```

新增 `e2e/mobile-core.spec.ts`（复用 `global-setup` 已有的 `storageState`）：

| 用例 | 断言 |
|------|------|
| tab 导航 | 5 个 tab 可达，当前 tab 高亮 |
| 笔记三级导航 | 知识库 → 笔记列表 → 编辑器，返回键逐级回退 |
| 移动端编辑器写入 | 输入 → 自动保存状态变 `saved` → 返回列表 → 重进内容仍在 |
| 工具条横滑 | 工具条不换行、可横向滚动、"更多"Sheet 可开 |
| **无横向滚动** | 每个 `/m/*` 路由断言 `document.documentElement.scrollWidth <= clientWidth`（这条直接守住 P0-1 那类 bug） |
| AI 会话列表 → 对话页 | 列表可点进、返回不丢流（复用桌面 `ai-stream.spec.ts` 的等待策略，错误路径断言，因 M7.6 缺口） |
| 触摸目标尺寸 | 抽样断言主要按钮 `boundingBox().height >= 40` |

### 8.3 真机验收清单（不可自动化，M10.5 必做）

至少一台 iOS Safari + 一台 Android Chrome，逐条签字：

- [ ] 软键盘弹出后，编辑器底部工具条可见且不被遮挡
- [ ] 软键盘收起后布局不残留空白
- [ ] 刘海屏顶栏、底部 home 条不被 tab bar 压住
- [ ] 长文编辑滚动流畅，工具条不抖
- [ ] 文本选择时系统菜单与应用 UI 不重叠
- [ ] 地址栏伸缩时 `100svh` 布局不跳
- [ ] 系统返回手势（Android 侧滑 / iOS 边缘滑）与应用返回一致
- [ ] 深浅色跟随系统切换正确（`themeColor` 生效）

---

## 9. CI 与命令

**默认 `pnpm test` 与 CI 的边界不变**：移动端单测进默认流程；E2E / Lighthouse / bundle 预算仍属"需要真实栈"的一类，不进 CI（与 `test:integration:auth` 同类，见 `CLAUDE.md` 端到端门禁节）。

新增 / 变更的命令：

```bash
pnpm --filter web test                              # 含全部移动端单测（默认流程）
pnpm --filter web test:e2e -- --project=mobile      # 只跑移动端 E2E
pnpm --filter web lighthouse:budget:mobile          # 新增脚本：移动 form factor 门禁
pnpm --filter web bundle:budget                     # 同一命令，内部按 /m/* 分桶判定
```

`package.json` 新增一条 script：`"lighthouse:budget:mobile": "node scripts/lighthouse.mjs --budget --mobile"`。

文档同步义务（`CLAUDE.md` 文档维护约定）：本目录三份文档 + `CLAUDE.md` 导航 + `README.md` 的「端到端与性能门禁」节需在 M10.5 一并更新。

---

## 10. 风险与缓解

| 风险 | 影响 | 缓解 |
|------|------|------|
| 软键盘遮挡底部工具条 | 编辑器在手机上不可用（核心功能） | `interactiveWidget: "resizes-content"` + `VisualViewport` 兜底；**M10.3 必须真机验证**，不接受仅 DevTools 验证 |
| 两套 UI 漂移：新功能只做了桌面 | 移动端逐渐残缺 | 逻辑层单一来源（`features/**/*.ts`）；新功能的 PR 自检项加一条"移动端是否需要对应入口 / 为什么不需要" |
| 移动端 shell 顶破产物预算 | `bundle:budget` 红灯 | 预算分桶（D8）+ 硬约束：移动端**不引入** `cmdk` / `@tanstack/react-table` / `@xyflow/react`；重依赖一律 `dynamic(..., { ssr: false })`（`CLAUDE.md` 禁止清单已有此条） |
| `/m/*` 与桌面路由的登录态跳转互相打架 | 登录后落错页 | `middleware.ts` 的跳转只在入口路径做一次；`(auth)` 路由不加 `/m` 变体，登录后仍跳 `/dashboard`，由同一段分流逻辑决定最终落点；这段逻辑抽纯函数 + 单测 |
| UA 分流误判（决策 1 取备选带来的新风险） | 桌面用户被推进移动版、或手机用户留在桌面版 | 偏好 Cookie 优先于 UA + `?desktop=1` / `?mobile=1` 逃生口 + 只在入口路径跳转（深链不动）；`resolveViewRedirect` 六类输入均有单测；真机签字项覆盖首次访问与逃生 |
| E2E 时间翻倍（`workers: 1`） | 本地验收变慢 | 默认按 `--project` 分开跑；移动端 spec 只覆盖核心路径，不复制全部桌面用例 |
| Lighthouse 移动分数不稳 | 门禁假红 | 阈值 0.85 + 单次运行多路由取各自分数（现有脚本已是逐 URL 判定）；若波动大，M10.5 决定是否改为取 3 次中位数 |
| 触摸 DnD 与滚动抢手势 | 误触发拖拽 | 移动端不启用 dnd-kit，改底部 Sheet |
| M7.6 后端缺口 | 移动端 AI / 上传 / 资料保存路径走不通 | 验收标准显式标注"与桌面同步阻塞"；这些路径只验收错误提示与降级，不作为移动端未完成项 |
| 无真机可测 | 只在 DevTools 验证不可靠 | M10.5 是硬门禁：没有真机签字不算完成 |

---

## 11. 决策点（2026-09-12 已拍板）

> 全部 7 项已定，无待决事项。**决策 1、2 取备选，3-7 取默认**。

| # | 决策 | 结论 | 状态 |
|---|------|------|------|
| 1 | 移动端入口策略 | **取备选：一开始就 UA 跳转**。入口路径 `/`、`/dashboard` 做一次 307；`?desktop=1` 逃生口 + `anynote_view` 偏好 Cookie 优先于 UA。判定抽纯函数 + 单测，真机签字项见 §8.3 | 已定 |
| 2 | 登录后移动端落地页 | **取备选：`/m/dashboard`**，并为它做一个有真实内容的移动端工作台（区块表见 D3）。派生结果：工作台占一个 tab，"待办"降级到工作台卡片与"我的" | 已定 |
| 3 | Lighthouse 移动 Performance 门槛 | **取默认：0.85**（Accessibility 仍 0.95）。M10.5 实测若稳过 0.9 再上调 | 已定 |
| 4 | `/ai/workflow` 移动端 | **取默认：完全不提供**，`/m/me` 给说明 + 桌面版链接 | 已定 |
| 5 | `/wikis` 是否进首版 | **取默认：进**，三级 URL 路由 | 已定 |
| 6 | PWA（可安装 + 离线） | **取默认：不做**，留独立方案 | 已定 |
| 7 | 平板（768–1024px） | **取默认：不专门做**，落桌面窄屏形态 | 已定 |

决策 1 与 2 对里程碑的影响：原 M10.6（入口策略）整体并入 M10.1，工作台页从 M10.2 提到 M10.1
（它是跳转落点，不能晚于分流上线）。里程碑重排为 **M10.0 – M10.5**，总工期不变。

---

## 12. 工期估算

| 里程碑 | 内容 | 估算 |
|--------|------|------|
| M10.0 | 地基：决策、OpenSpec 提案、修 `/ai/pdf` 溢出、门禁脚手架 | 1 天 |
| M10.1 | 移动端外壳 + 工作台 + 入口分流：路由段、MobileShell、tab bar、title bar、action sheet、互切、UA 分流与偏好 Cookie | 2 天 |
| M10.2 | 列表与详情：笔记 / 文档 / 知识库 / 任务 / 课程 / 设置 / 搜索 | 2.5 天 |
| M10.3 | 移动端编辑器：toolbar variant、软键盘、贴底工具条、上传、协同文档页 | 2 天 |
| M10.4 | AI：对话列表 / 全屏对话 / PDF 文档列表与 Tabs 详情 | 1.5 天 |
| M10.5 | 门禁与真机验收：E2E project、Lighthouse 移动模式、预算分桶、真机清单、文档同步 | 1.5 天 |
| **合计** | | **10.5 天** |

（原 M10.6 的 0.5 天并入 M10.1，合计不变。）

估算口径与 `docs/refactor/FRONTEND_MILESTONES.md` 一致（单人、含单测、不含等待后端缺口修复的时间）。
