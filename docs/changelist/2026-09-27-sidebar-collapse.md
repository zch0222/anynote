# 改动清单：桌面侧栏可收起

> 日期：2026-09-27 · 分支：`dev`
> 起因：新前端（`apps/web`）的桌面侧栏不能收起。M4 时侧栏本可折叠，`df4bf53`（按知识库为中心重构导航）
> 为贴合设计稿把它换成了固定宽度的原生 `aside`，但收起偏好（`ui-store` 的 `sidebarOpen`）与 ⌘B 快捷键都还在，
> 只是 `aside` 不再响应——偏好照常翻转、照常落盘，界面上什么也不发生。

## 概览

- **收起方式**：整个收起（没有图标窄轨），内容区占满整宽；偏好照旧存 localStorage，刷新后保持。
- **入口**：收起按钮在侧栏头部右端（品牌右侧）；展开按钮在顶栏最左侧。知识库内的 Tab 页（概览 / 笔记 / 慕课 / 任务 / 资料 / 成员）
  没有顶栏，展开按钮由 `AppShell` 补在内容区左上，收起时内容区左侧让出 72px，不压住页头标题。
- **快捷键**：`Cmd/Ctrl+B` 切换；已被处理的（编辑器加粗）或发生在 input / textarea / contenteditable 里的不接。
- **偏好迁移**：`anynote-ui` 的 persist 版本 0 → 1，v0 的值一律作废、回到展开（见审计要点 2）。
- **窄屏（< 768px，抽屉形态）**：顶栏按钮打开抽屉、抽屉里的收起按钮关上它，不改桌面偏好。
  顺带补上一个缺口：库内 Tab 页此前在窄屏下没有任何打开抽屉的入口。

**展开态的桌面版式不变**：侧栏宽度（272 / 296）、内容区左右留白（32px）与改前一致，展开按钮在桌面展开态隐藏。

### 改动面

| 类别 | 文件 | 行数（`git diff --numstat` / `wc -l`） |
|------|------|------|
| 新增 | 2 | `sidebar-toggle.tsx` 52、`e2e/sidebar-collapse.spec.ts` 76 |
| 修改（代码） | 5 | `app-sidebar.tsx` +18 / −2、`app-shell.tsx` +10 / −1、`app-header.tsx` +5 / −12、`ui/sidebar.tsx` +17 / −1、`ui-store.ts` +6 |
| 修改（测试） | 2 | `app-shell.test.tsx` +134 / −1、`ui-store.test.ts` +16 / −3 |
| 修改（文档） | 2 | `CLAUDE.md` +1 / −1、`.claude/context/frontend.md` +6 |

### 验证结果

| 命令 / 动作 | 结果 | 备注 |
|------|------|------|
| 新增 / 改写的单测先在**未改的代码**上跑 | ❌ 13 条失败 | 侧栏无收起态、顶栏无展开入口、⌘B 在编辑区内照样翻转偏好、v0 偏好照单全收。证明用例能复现问题 |
| `npx vitest run`（`apps/web` 全量） | ✅ 162 文件 / 1998 用例 | 修复后 |
| `npx tsc --noEmit`（`apps/web`，含 `e2e/`） | ✅ 0 错误 | |
| `npx @biomejs/biome check apps/web/src apps/web/e2e` | ✅ 486 文件 0 error | |
| 重建 `anynote-web` 容器（协同关闭）后跑 `e2e/sidebar-collapse.spec.ts` | ✅ 3 passed | 含真实编辑器里 ⌘B 加粗不收起侧栏、编辑区外 ⌘B 才收起 |
| 同一构建跑 `ui-supplement`、`ui-redesign`、`theme`、`notes`、`notes-single-user` | ⚠️ 55 passed / 1 failed | 失败的是 D-02「5 格计数…卡片 190x98」：失败截图里「成员」格仍是加载骨架，卡片高 105。单独 `--repeat-each=4` 为 2/4 通过；前几批清单均记为已知偶发，与侧栏无关（该页侧栏宽度与内容区留白未变） |
| 1440 / 900 宽实拍（展开、收起后的画廊、知识库页、编辑器） | ✅ | 收起后内容区占满；库内 Tab 页的展开按钮与顶栏按钮同一横坐标，不压标题 |
| `playwright test --list` | 168 条（chromium 121） | E2E 用例数 165 → **168** |

**未做**：`bundle:budget`（需主机上的生产构建；本批只多了两个 lucide 图标）；全量 E2E。

---

## 一、`apps/web/src/components/layout`——收起态与入口

| 文件 | 状态 | 作用与原因 |
|------|------|-----------|
| `sidebar-toggle.tsx` | 新增 | 「收起侧边栏」「展开侧边栏」两个按钮，都走 `useSidebar().toggleSidebar`（桌面改偏好、窄屏开关抽屉）。展开按钮的显隐用 `md:hidden` 而不是 `useIsMobile`：后者首帧恒为 false，窄屏下服务端渲染那一帧会把按钮藏起来 |
| `app-sidebar.tsx` | 修改 | 桌面 `aside` 读 `useSidebar().state`：收起时加 `hidden` 属性（读屏与 Tab 键都不再进入；Tailwind v4 预置样式对 `[hidden]` 是 `display:none !important`，压得过 `md:flex`），并带 `data-state`；节点不卸载，展开时目录滚动位置与查询都在。头部改为横排，右端放收起按钮 |
| `app-header.tsx` | 修改 | 原来只在窄屏出现的「切换侧边栏」换成 `SidebarExpandButton`：窄屏照旧、桌面在收起时出现 |
| `app-shell.tsx` | 修改 | 没有顶栏的库内 Tab 页在内容区左上补展开按钮（`left-6` 与顶栏按钮同一横坐标）；按钮出现时内容区左留白 72px，桌面展开态回到 32px |
| `__tests__/app-shell.test.tsx` | 修改 | 收起 / 展开与偏好写入；顶栏入口只在收起时出现在桌面；库内 Tab 页的入口与让位；⌘B 在编辑区外切换、编辑器已处理时不切换、input / textarea / contenteditable 里不切换；窄屏抽屉开关不改桌面偏好。「挂载时恢复侧栏」用例的存储版本改为 1 |

## 二、`apps/web/src/components/ui`——⌘B 与加粗的冲突

| 文件 | 状态 | 作用与原因 |
|------|------|-----------|
| `sidebar.tsx` | 修改 | `SidebarProvider` 的 ⌘B 监听跳过已被处理（`defaultPrevented`）与可编辑区域里的事件。改前编辑器里每加粗一次就翻转一次侧栏偏好——侧栏不响应时看不出，能收起之后就是「一加粗侧栏就收起」。本文件是 shadcn 原件，在排除单测的目录里，行为由 `app-shell.test.tsx` 与 E2E 覆盖 |

## 三、`apps/web/src/stores`

| 文件 | 状态 | 作用与原因 |
|------|------|-----------|
| `ui-store.ts` | 修改 | persist 加 `version: 1` 与 `migrate`：v0 存下的 `sidebarOpen` 一律作废、回到展开 |
| `ui-store.test.ts` | 修改 | 既有用例的存储版本改为 1；新增 v0 偏好作废 |

## 四、`apps/web/e2e`

| 文件 | 状态 | 作用与原因 |
|------|------|-----------|
| `sidebar-collapse.spec.ts` | 新增 | 三条：收起后内容区宽出 ≥ 272px、刷新保持、顶栏展开；库内 Tab 页从内容区左上展开且按钮右缘不越过标题左缘；真实编辑器里 ⌘B 加粗（出现 `strong`）不收起侧栏，失焦后 ⌘B 才收起 |

## 五、文档

| 文件 | 状态 | 作用与原因 |
|------|------|-----------|
| `CLAUDE.md` | 修改 | E2E 用例数 165 → 168（桌面 118 → 121） |
| `.claude/context/frontend.md` | 修改 | 信息架构一节补侧栏收起的入口、偏好存储与快捷键规则 |

## 审计要点

1. **收起用 `hidden` 属性**：依赖 Tailwind v4 预置样式里 `[hidden]` 的 `!important`，否则 `md:flex` 会把它重新显示出来。E2E 已在真实构建上确认收起后不可见。
2. **偏好迁移会重置所有人一次**：v0 的值里混着编辑器加粗造成的翻转，照单全收的话一部分用户上线后打开页面就是收起的、且不知道为什么。代价是 M4 时期真心选了收起的用户需要再点一次。
3. **首屏闪现**：偏好在客户端挂载后才恢复（M4 起如此，服务端渲染不读 localStorage），选了收起的用户整页刷新时侧栏会先展开一帧再收起。没有加动画，避免每次刷新都看到一次滑出。
4. **库内 Tab 页窄屏留白变化**：< 768px 时这些页的内容区左留白从 20 / 32px 变为 72px，给常驻的抽屉按钮让位。真实手机走 `/m/*`，这里只影响缩窄的桌面窗口。
5. **改了 shadcn 原件 `ui/sidebar.tsx`**：只动了 ⌘B 监听的判定与一个本地辅助函数；该目录不进单测与 Biome，评审时请单独看这一处。
