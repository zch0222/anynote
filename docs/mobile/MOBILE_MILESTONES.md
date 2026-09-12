# Anynote 移动端可执行里程碑（M10.0 – M10.5）

> 文档版本：v1.1 | 创建 2026-09-12 | 最近更新 2026-09-12 | 状态：**决策已拍板，实施中**
> 2026-09-12 决策 1、2 取备选（见 [方案 §11](./MOBILE_PLAN.md)）：原 **M10.6（入口策略）整体并入 M10.1**，
> 移动端工作台从 M10.2 提到 M10.1（它是 UA 分流的落点）。序列重排为 M10.0 – M10.5，总工期不变。
> 关联文档：[MOBILE_PLAN.md](./MOBILE_PLAN.md)（技术方案，本文的 §D / §N 引用都指向它） · [UI_INVENTORY.md](./UI_INVENTORY.md)（现状证据） · [README.md](./README.md)
> 编号说明：**M10.x 是移动端自己的里程碑序列**，接在 CLI 的 M9.x 之后编号只为避免歧义，移动端不属于 Phase 5。
> **移动端不阻塞 Phase 5 发版**（合并 `main` + 打 tag `v0.6.0`），两条线可并行。
> 分支：每个里程碑从 `dev` 切 `feat/mobile-<描述>`，完成后 `--no-ff` 合并回 `dev`（规约见 [`README.md` Git 工作流](../../README.md#git-工作流)）。

---

## 0. 总览

| ID | 名称 | 前置 | 估算 | 状态 | 分支 |
|----|------|------|------|------|------|
| **M10.0** | 地基与决策 | [方案 §11 决策](./MOBILE_PLAN.md) | 1 天 | ✅ 已完成 | `feat/mobile-foundation` |
| **M10.1** | 移动端外壳 + 工作台 + 入口分流 | M10.0 | 2 天 | ⬜ | `feat/mobile-shell` |
| **M10.2** | 列表与详情页 | M10.1 | 2.5 天 | ⬜ | `feat/mobile-pages` |
| **M10.3** | 移动端编辑器 | M10.1 | 2 天 | ⬜ | `feat/mobile-editor` |
| **M10.4** | AI 对话与 PDF 问答 | M10.1 | 1.5 天 | ⬜ | `feat/mobile-ai` |
| **M10.5** | 门禁与真机验收 | M10.2 / M10.3 / M10.4 | 1.5 天 | ⬜ | `feat/mobile-gates` |

```
M10.0 ──▶ M10.1 ──┬──▶ M10.2 ──┐
                  ├──▶ M10.3 ──┼──▶ M10.5
                  └──▶ M10.4 ──┘
```

M10.2 / M10.3 / M10.4 互不依赖，可并行或按优先级取舍（若要缩范围，先砍 M10.4）。

**硬性约束（每个里程碑都适用）**

- 任何改动必须附带单元测试（`CLAUDE.md` 测试要求），且**桌面既有 619 个前端单测必须仍全绿**。
- 修 bug 先写复现用例（本方案里 M10.0 的 `/ai/pdf` 溢出就是这一条的适用对象）。
- 不得改变 `app/(workspace)/**` 的桌面版式（例外已在 [方案 D7](./MOBILE_PLAN.md) 列明）。
- 不新增重依赖；重依赖一律 `dynamic(..., { ssr: false })`，改完跑 `pnpm --filter web bundle:budget`。
- commit 用中文描述，scope 为 `web`（脚本 / 配置类用 `web` 或 `chore`）。

---

## M10.0 地基与决策 ⬜

**目标**：把方案落成可执行状态，并清掉一个与移动端同域的既有 bug。

### 任务

- [ ] **T0.1 拍板 [方案 §11](./MOBILE_PLAN.md) 的 7 个决策点**，把结论回写到方案表格（状态列改成"已定"）。
- [ ] **T0.2 OpenSpec 提案** —— `.claude/openspec/changes/2026-XX-XX-mobile-route-segment.md`：
      记录"移动端落在 `apps/web` 的 `(mobile)` 路由段、不新开应用"这一决策及其认证理由（Cookie host-only + 进程级刷新锁），
      以及 M10.6 将引入的非 httpOnly 版式偏好 Cookie `anynote_view`（**明确它不含身份信息**，避免与 `CLAUDE.md` 禁止清单的"token 不得进 document.cookie"混淆）。
- [ ] **T0.3 修 `/ai/pdf` 窄屏横向溢出**（[UI_INVENTORY P0-1](./UI_INVENTORY.md)）：
      `pdf-page.tsx` 的右侧问答容器去掉 `shrink-0`/`w-full` 组合，`< lg` 时单栏显示文档列表 + 问答切换。
      **先写失败用例**：断言 375px 视口下 `scrollWidth <= clientWidth`。
- [ ] **T0.4 hover-only 入口限定到桌面**：`conversation-list.tsx:108`、`pdf-page.tsx:236` 的 `opacity-0 group-hover:opacity-100`
      改为 `md:opacity-0 md:group-hover:opacity-100`（参照 `ui/sidebar.tsx:546` 的既有写法），触摸端常显。
- [ ] **T0.5 门禁脚手架（只加能力，不加用例）**：
      - `scripts/lib/bundle.mjs` 加 `mobileInitialJs: 250 * 1024` 与按路径段分桶的判定函数（**含 `/mooc` 不被误判**的单测）
      - `scripts/lib/lighthouse.mjs` 加 `--mobile` 解析与移动阈值（Performance 0.85 / Accessibility 0.95）
      - `scripts/lighthouse.mjs` 在 `--mobile` 时不加载 `desktop-config`
      - `package.json` 加 `lighthouse:budget:mobile`
      - `playwright.config.ts` 加 `{ name: "mobile", use: devices["Pixel 5"] }`
- [ ] **T0.6 文档登记**：`CLAUDE.md` 上下文文档导航加 `docs/mobile/`；`README.md` 的「端到端与性能门禁」加移动端命令。

### 验收标准

```bash
pnpm --filter web test                    # 全绿，且新增脚本判定逻辑有用例
pnpm --filter web typecheck
pnpm check
# 真实栈下（场景 A），375px 视口手动核对 /ai/pdf 无横向滚动
pnpm --filter web test:e2e -- --project=mobile   # 此时只有 T0.3 的回归用例
```

- [ ] `/ai/pdf` 在 375 / 414 / 768px 三个宽度下均无 body 级横向滚动
- [ ] `pnpm --filter web bundle:budget` 行为与改动前一致（桌面阈值未变）

---

## M10.1 移动端外壳 + 工作台 + 入口分流 ⬜

**目标**：`/m/*` 可访问、可导航；手机 UA 访问 `/` 自动落 `/m/dashboard`，且工作台有真实内容。
（合并了原 M10.6 的入口策略 —— 决策 1 取备选；工作台从 M10.2 提前 —— 决策 2 取备选。）

### 任务

- [ ] **T1.1 路由段** —— `app/(mobile)/layout.tsx`：`MobileShell` + `export const viewport`（`interactiveWidget: "resizes-content"`、`themeColor` 双色）。
- [ ] **T1.2 `navigation.ts` 扩展** —— `mobileTabs`（5 项：工作台 / 笔记 / 文档 / AI / 我的）、`toMobileHref`、`toDesktopHref`、`isImmersiveMobileRoute`。**纯函数单测必须覆盖 `/ai/workflow → null`、带参数路由、未知路径回退、`/m/tasks` 不高亮任何 tab。**
- [ ] **T1.3 `MobileShell`** —— 内容区 + 底部 tab；CSS 变量 `--mobile-header-h` / `--mobile-tabbar-h` / `--mobile-content-h`；`safe-area-inset-bottom`；沉浸式路由隐藏 tab bar（由 T1.2 的纯函数判定，不用 `:has()`）。
- [ ] **T1.4 `MobileTitleBar` / `MobileScreen`** —— 返回键（`router.back()`，无历史时回 tab 根）、标题、右侧动作插槽；`MobileScreen` 是每个页面的统一外框。
- [ ] **T1.5 `MobileTabBar`** —— 5 tab、`isRouteActive` 高亮（去 `/m` 前缀后复用既有函数）、触摸目标 ≥ 44px。
- [ ] **T1.6 `MobileActionSheet`** —— 基于已有 `ui/sheet.tsx` 的 `side="bottom"`，替代桌面 `DropdownMenu`；destructive 项二次确认。
- [ ] **T1.7 `ViewSwitch`** —— 桌面头部加"手机版"入口、移动端"我的"页加"切换到桌面版"，用 T1.2 的映射函数，并带 `?desktop=1` / `?mobile=1` 让偏好落库。
- [ ] **T1.8 `styles/mobile.css`** —— 只放 safe-area、高度变量、工具条横滑三类规则，不放业务样式。
- [ ] **T1.9 移动端工作台** —— `/m/dashboard`：问候语（`useMe`）、快捷操作、最近笔记（首个知识库 5 条）、待办（未提交前 3 条）、我的知识库（前 4 个）。**全部复用既有 hooks，不新增后端调用**；协同索引不进此页（要连 WS）。
- [ ] **T1.10 入口分流（原 M10.6）** —— `isMobileUserAgent(ua)` 与 `resolveViewRedirect()` 两个纯函数 + `middleware.ts` 接线：只在 `/`、`/dashboard` 做一次 307；`?desktop=1` / `?mobile=1` 逃生口；偏好 Cookie `anynote_view=desktop|mobile`（非 httpOnly、`sameSite=lax`，**只存版式偏好、不含身份信息**，已在 T0.2 的 OpenSpec 提案中记录）。
- [ ] **T1.11 占位页** —— 其余 tab 根路由各渲染一个最小页面，保证 M10.2/3/4 可并行开工。

### 验收标准

```bash
pnpm --filter web test        # 新增 T1.2–T1.10 的单测全绿
pnpm --filter web build
pnpm --filter web bundle:budget   # /m/* 路由首屏 ≤ 250KB gzip
```

- [ ] 5 个 tab 互相可达、高亮正确（含子路由，如 `/m/notes/3/7` 高亮"笔记"）
- [ ] 沉浸式路由不显示 tab bar
- [ ] DevTools 375×812 与 414×896 下无横向滚动
- [ ] `ViewSwitch` 双向跳转落在对应页面，并把偏好写进 Cookie
- [ ] 手机 UA 访问 `/` → `/m/dashboard`；`?desktop=1` 留在桌面版且下次仍是桌面版；桌面 UA 行为与现在完全一致
- [ ] 工作台在无知识库 / 无任务时有正确空态，不报错

---

## M10.2 列表与详情页 ⬜

**目标**：除编辑器与 AI 以外的全部页面在移动端可用。

### 任务

- [ ] **T2.1 笔记** —— `/m/notes`（知识库单列）、`/m/notes/[baseId]`（笔记列表 + 分页）、`/m/notes/new`（单列表单）。复用 `useKnowledgeBasesQuery` / `useNotesQuery` / `useCreateNote`，**不新写 hook**。
- [ ] **T2.2 文档库** —— `/m/docs` 单列列表；重依赖沿用 `collab-loader.tsx` 的 `dynamic(..., { ssr: false })` 模式。
- [ ] **T2.3 知识库（wikis）** —— 三级 URL 路由取代组件内 `useState`：`/m/wikis` → `/m/wikis/[baseId]` → `/m/wikis/[baseId]/[noteId]`（只读 `preset="readonly"`）。
- [ ] **T2.4 任务** —— `/m/tasks`：卡片列表替代 `@tanstack/react-table`（**不在移动端引入 react-table**），状态筛选走 `MobileActionSheet`，提交对话框复用既有 `SubmitTaskDialog`（确认宽度在窄屏正常）。
- [ ] **T2.5 课程** —— `/m/mooc` 单列卡片；`/m/mooc/[id]` 播放器在上 + 章节树在下（`Tabs`），DPlayer 保持懒加载。
- [ ] **T2.6 设置** —— `/m/me` 分组列表（资料 / 外观 / AI / 集成 / 退出登录 / 切换桌面版 / 更多入口）→ `/m/settings/[section]` 子页。
- [ ] **T2.7 搜索** —— `/m/search` 全屏搜索页，替代 ⌘K；复用命令面板的数据源，不引入 `cmdk`。
- [ ] **T2.8 "更多"入口** —— `/m/me` 里给 `/ai/workflow` 一条说明 + 桌面版链接（按 [方案 §11 决策 4](./MOBILE_PLAN.md)）。

### 验收标准

```bash
pnpm --filter web test
pnpm --filter web bundle:budget
pnpm --filter web test:e2e -- --project=mobile
```

- [ ] 每个新增路由都有对应单测（列表渲染 / 空态 / 错误态 / 关键交互）
- [ ] 所有 `/m/*` 路由在 375px 下 `scrollWidth <= clientWidth`（E2E 断言）
- [ ] `/m/tasks` 不在产物里引入 `@tanstack/react-table`（`bundle:report` 核对）
- [ ] `/m/settings` 资料保存路径的失败提示正确（M7.6 缺口 5，**与桌面同步阻塞，不算未完成**）

---

## M10.3 移动端编辑器 ⬜

**目标**：在手机上能正常写笔记——这是整个移动端最关键的一页。

### 任务

- [ ] **T3.1 `ToolbarVariant` 扩为三值** —— `"full" | "minimal" | "mobile"`；`TiptapEditorProps` 增加可选 `toolbar` 覆写（不传时行为与现在完全一致）。**桌面两个 variant 的既有用例必须仍绿。**
- [ ] **T3.2 `mobile-toolbar-groups.ts`** —— 常驻 10 个命令 + overflow 分组；单测断言与 `Toolbar` 实际注册命令一一对应、不重不漏。
- [ ] **T3.3 移动工具条样式** —— `flex-nowrap` + `overflow-x-auto`，按钮 ≥ 40px，`sticky bottom-0`；只改 `mobile.css` 与 `variant="mobile"` 分支，不动 `tiptap.css` 既有的桌面规则。
- [ ] **T3.4 气泡菜单在移动端关闭** —— `variant="mobile"` 时不挂 `BubbleMenuPortal`；格式化入口改为工具条的"格式"态。
- [ ] **T3.5 软键盘** —— `interactiveWidget` 生效性检测 + `VisualViewport` 兜底（监听 `resize`/`scroll` 调整 `--mobile-content-h`）；抽成 `hooks/use-visual-viewport.ts` 并单测（打桩 `window.visualViewport`）。
- [ ] **T3.6 `/m/notes/[baseId]/[noteId]`** —— `note-editor-mobile.tsx`：全屏编辑器；保存状态进顶栏；"移动到…"走 `MobileActionSheet` + `useMoveNote`；删除二次确认。复用 `useSaveNote` 的自动保存与冲突处理，**一行不改**。
- [ ] **T3.7 `/m/docs/[id]`** —— 协同文档全屏编辑；在线状态与协同指示收进顶栏；沿用 `CollabDocWorkspace` 的懒加载入口。
- [ ] **T3.8 图片插入** —— 复用 `lib/editor/upload.ts`；`accept="image/*"` 让系统出"拍照 / 相册"。⚠️ 该链路受 M7.6 缺口 3 阻塞，只验收错误提示与降级。

### 验收标准

```bash
pnpm --filter web test
pnpm --filter web bundle:budget      # 编辑器整包仍 ≤ 250KB gzip
pnpm --filter web test:e2e -- --project=mobile
```

- [ ] E2E：输入 → 自动保存变 `saved` → 返回列表 → 重进内容仍在
- [ ] E2E：工具条不换行、可横滑、"更多"Sheet 可开、按钮高度 ≥ 40px
- [ ] **真机（iOS Safari + Android Chrome）**：软键盘弹出后工具条可见且不被遮挡；收起后无残留空白 ——
      **这一条不接受仅 DevTools 验证**，未通过则 M10.3 不算完成

---

## M10.4 AI 对话与 PDF 问答 ⬜

**目标**：AI 两页在移动端有正确形态（功能受后端阻塞，验收错误路径）。

### 任务

- [ ] **T4.1 `/m/ai/chat`** —— 会话列表独立成页（原桌面左栏）；重命名 / 删除走 `MobileActionSheet`，**不依赖 hover**。
- [ ] **T4.2 `/m/ai/chat/[id]`** —— 全屏消息流 + 贴底输入框；键盘弹出时输入框随之上移；流式进行中切页不丢消息（复用 `use-chat-stream` 的进程级 store，逻辑不改）。
- [ ] **T4.3 `/m/ai/pdf`** —— 文档列表页；上传入口用系统文件选择器。
- [ ] **T4.4 `/m/ai/pdf/[docId]`** —— `Tabs` 切"预览 / 问答"；`react-pdf` 保持 `dynamic ssr:false`，移动端默认按宽度缩放。
- [ ] **T4.5 错误路径验收** —— M7.6 缺口 1（SSE 登录上下文）与缺口 4（PDF 转存）导致成功路径不可达；断言提示文案、重试入口与降级渲染。

### 验收标准

```bash
pnpm --filter web test
pnpm --filter web bundle:budget      # /m/ai/* 首屏 ≤ 250KB（pdfjs 不得进首屏）
pnpm --filter web test:e2e -- --project=mobile
```

- [ ] 会话列表 → 对话页 → 返回，滚动位置与消息不丢
- [ ] 键盘弹出时输入框与最后一条消息均可见
- [ ] PDF 预览在 375px 下按宽度适配，无横向滚动
- [ ] 后端阻塞路径的失败提示与桌面一致（文案可复用）

---

## M10.5 门禁与真机验收 ⬜

**目标**：把"适配完了"变成可判定、可回归的状态。

### 任务

- [ ] **T5.1 E2E 补全** —— `e2e/mobile-core.spec.ts`：tab 导航、笔记三级导航、编辑器写入、工具条横滑、**每个 `/m/*` 路由的无横向滚动断言**、AI 列表→详情、触摸目标尺寸抽样。
- [ ] **T5.2 Lighthouse 移动模式跑通** —— `pnpm --filter web lighthouse:budget:mobile`，4 条路由（`/login`、`/m/notes`、`/m/docs`、`/m/ai/chat`）达标；若波动大，决定是否改为多次取中位数。
- [ ] **T5.3 产物预算** —— 确认 `/m/*` 全部落在 250KB 桶内且判定逻辑有单测；把实测数字记进本文"验收记录"。
- [ ] **T5.4 真机验收清单** —— 逐条签字（见 [方案 §8.3](./MOBILE_PLAN.md)，8 条）。
- [ ] **T5.5 文档同步** —— 本目录三份文档状态更新；`README.md` 端到端门禁节补移动端命令；`CLAUDE.md` 导航核对；新增 `docs/changelist/YYYY-MM-DD-mobile-adaptation.md` 逐文件审计清单（格式见 `docs/changelist/README.md`）。

### 验收标准

```bash
pnpm --filter web test                          # 全量单测（桌面 619 + 移动端新增）全绿
pnpm --filter web typecheck && pnpm check
pnpm --filter web build
pnpm --filter web bundle:budget
pnpm --filter web lighthouse:budget:mobile
pnpm --filter web lighthouse:budget             # 桌面门禁未退化
pnpm --filter web test:e2e                      # 两个 project 全绿
```

- [ ] 真机清单 8 条全部通过并签字（设备型号 / 系统版本写进验收记录）
- [ ] 桌面 Lighthouse 分数与移动端工作前相比未下降
- [ ] changelist 文档覆盖所有改动文件

---

## 验收记录

> 每个里程碑完成后在此追加：日期、分支与合并 commit、实测数字（产物体积 / Lighthouse 分数 / 单测条数）、与方案的偏差、未做项及原因。
> 格式参照 [`docs/cli/CLI_MILESTONES.md`](../cli/CLI_MILESTONES.md) 的"与方案的偏差"两张表。

（暂无）

---

## 与方案的偏差

> 实施期若与 [MOBILE_PLAN.md](./MOBILE_PLAN.md) 不一致，**以本节为准**，并在此逐条记录原因，不回改方案正文。

（暂无）
