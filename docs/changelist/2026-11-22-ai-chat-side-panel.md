# AI 对话右侧栏（M19.1–M19.6）

日期：2026-11-22
方案：[`docs/ai-refactor/AI_CHAT_SIDE_PANEL_PLAN.md`](../ai-refactor/AI_CHAT_SIDE_PANEL_PLAN.md)
范围：`apps/web`（含 E2E 支撑文件），不改后端、OpenAPI、SQL、Nacos。

## 概览

| 项 | 数量 |
|---|---|
| 修改文件 | 30 |
| 新增文件 | 47 |
| 删除文件 | 0 |
| 已跟踪文件增删行 | +906 / −206 |

按目录分布：`apps/web/src/features/side-panel/**`（新增 42 个文件，容器、状态、持久化、六类标签与测试）、`apps/web/src/lib/ai/**`（资源模型与首屏引用逻辑）、`apps/web/src/features/ai/**`（对话页接入与点击策略）、`apps/web/src/features/notes/**`（会话定位、外部改动同步、移动端正文层）、`apps/web/e2e/support/agent-retrieval.ts`（E2E 断言）。

验证结果：

| 命令 | 结果 |
|---|---|
| `pnpm --filter web exec vitest run <本批 22 个测试文件>` | **22 files / 176 tests passed** |
| `pnpm --filter web test`（全量） | 196 files / 2245 tests，**2242 passed / 3 failed**；失败为既有任务日期控件 5s 超时（`date-time-field.test.tsx` 2 条、`task-form-page.test.tsx` 1 条），未修改相关代码 |
| `pnpm --filter web typecheck` | passed |
| `pnpm exec biome check <本批文件>` | passed（自动修复格式与 import 顺序） |
| `pnpm --filter web build` | 编译与静态页生成成功；末尾 standalone 符号链接复制在 Windows 报 `EPERM`（环境问题，未改代码） |
| `pnpm --filter web bundle:budget` | **FAIL**：`/ai/chat` **310.3 KB / 310.0 KB**，超 0.3 KB；移动端 247.3 / 250 通过；编辑器 18.0 / 250 通过。2026-11-22 用户确认接受该超预算，不调整预算，门禁记录为未通过 |

## 资源模型与首屏引用

| 文件 | 状态 | 作用与原因 |
|---|---|---|
| `apps/web/src/lib/ai/resource-target.ts` | 新增 | 资源目标、身份与完整页面地址的唯一实现；六类实体的解析、必需字段、子类型与定位规则集中在这里，供懒加载宿主与标签正文复用 |
| `apps/web/src/lib/ai/__tests__/resource-target.test.ts` | 新增 | 覆盖六类地址与旧实现逐字节一致、缺 kbId / moocId、非法与越界 id、身份不受定位与子类型影响、工具条目解析 |
| `apps/web/src/lib/ai/citations.ts` | 修改 | 首屏保留生成地址与引用文案的直接实现；资源目标解析移到懒加载宿主，避免解析逻辑进入 `/ai/chat` 首屏 |
| `apps/web/src/lib/ai/note-location.ts` | 修改 | `scrollToNoteCitation` 改为接收 `{ section, line }`；新增 `locateFromSearch` 与 `isNewerUpdateTime`，供完整页面与侧栏共用 |
| `apps/web/src/lib/ai/__tests__/citation-editor.test.ts` | 修改 | 跟随 `scrollToNoteCitation` 新签名 |

## 右侧栏容器

| 文件 | 状态 | 作用与原因 |
|---|---|---|
| `apps/web/src/features/side-panel/types.ts` | 新增 | 标签记录、分区状态、标签定义与正文属性的类型；容器与业务的分界 |
| `apps/web/src/features/side-panel/link-context.tsx` | 新增 | 首屏链接上下文与点击策略；只传原始引用/工具条目，宿主懒加载后解析 |
| `apps/web/src/features/side-panel/launcher.tsx` | 新增 | 首屏常驻的 provider、展开按钮与桌面宿主 `dynamic()` 入口；provider 只持有展开/挂载/待处理打开状态 |
| `apps/web/src/features/side-panel/mobile-launcher.tsx` | 新增 | 移动端覆盖层的独立 `dynamic()` 入口，避免进入桌面路由首屏 |
| `apps/web/src/features/side-panel/store.ts` | 新增 | 按宿主分区的标签状态与动作：去重、导航版本、10 标签淘汰、守卫、页面类标签、迁移与移除 |
| `apps/web/src/features/side-panel/persistence.ts` | 新增 | 按用户 id 的 localStorage 读写、zod 校验、50 分区淘汰、300ms 防抖、只存资源标识 |
| `apps/web/src/features/side-panel/storage-keys.ts` | 新增 | 存储键与登出清理，保持首屏可引用且不依赖懒加载模块 |
| `apps/web/src/features/side-panel/surface-events.ts` | 新增 | 会话删除与 key 迁移在侧栏宿主之外的桥 |
| `apps/web/src/features/side-panel/layout.ts` | 新增 | 桌面宽度规则纯函数：三列 / 临时收起会话列表 / 覆盖、最大化与上下限 |
| `apps/web/src/features/side-panel/panel-width.ts` | 新增 | 拖动宽度偏好的本地读写；只被懒加载宿主引用，避免进入首屏 |
| `apps/web/src/features/side-panel/registry.ts` | 新增 | 静态注册表：六类资源定义汇总、kind 唯一、资源类型齐全校验 |
| `apps/web/src/features/side-panel/resource-labels.ts` | 新增 | 资源类型中文名，只被懒加载宿主与正文引用 |
| `apps/web/src/features/side-panel/tab-panel.tsx` | 新增 | 活动标签正文的懒加载与 `Suspense` 骨架，切换标签强制重挂载 |
| `apps/web/src/features/side-panel/desktop/host.tsx` | 新增 | 桌面宿主：推入/覆盖、容器宽度测量、标签条、正文、拖拽条、空态与播报 |
| `apps/web/src/features/side-panel/desktop/tab-bar.tsx` | 新增 | 标签条：标题 hook、键盘左右移动焦点、中键关闭、关闭按钮、最大化/还原、收起 |
| `apps/web/src/features/side-panel/desktop/tab-header.tsx` | 新增 | 每类正文统一标签头：标题、元信息、状态、新窗口与「更多」 |
| `apps/web/src/features/side-panel/desktop/resize-handle.tsx` | 新增 | 左缘拖拽条：指针拖动、方向键 16px、Home/End、双击复位、ARIA 值 |
| `apps/web/src/features/side-panel/desktop/ids.ts` | 新增 | 标签与正文面板的 DOM id，供 `aria-controls` / `aria-labelledby` |
| `apps/web/src/features/side-panel/mobile/host.tsx` | 新增 | 移动端全屏覆盖层：关闭、标题、新窗口、更多、标签胶囊、`pushState` / `popstate` 返回手势 |
| `apps/web/src/features/side-panel/tabs/shared.tsx` | 新增 | 六类正文共用的不可读、加载失败、重试、元信息与地址工具 |
| `apps/web/src/features/side-panel/tabs/{kb,note,doc,mooc,mooc-item,task}/definition.ts` | 新增 | 每类资源的图标、类型名、标题 hook、完整页面地址与正文加载器；笔记额外提供「历史版本」菜单 |
| `apps/web/src/features/side-panel/tabs/{kb,note,doc,mooc,mooc-item,task}/body.tsx` | 新增 | 六类正文：笔记可编辑并复用保存/冲突/协同；其余只读；资料页码、视频秒数随导航版本定位；知识库正文可打开条目 |

## 对话页接入

| 文件 | 状态 | 作用与原因 |
|---|---|---|
| `apps/web/src/features/ai/components/chat-page.tsx` | 修改 | 接入 provider、展开按钮与桌面宿主；会话列表按宿主回报的布局临时收起；新会话 id 回填时同步迁移侧栏分区 |
| `apps/web/src/features/ai/components/chat-panel.tsx` | 修改 | 页头新增 `headerActions`；有宿主时给消息列表加 `data-side-panel-links`，供离开保护识别 |
| `apps/web/src/features/ai/components/citation-answer.tsx` | 修改 | 引用正文与来源列表左键单击交给侧栏；修饰键/中键保持原生；有宿主时增加「在新窗口打开」图标 |
| `apps/web/src/features/ai/components/process/process-area.tsx` | 修改 | 工具结果条目单击进侧栏；增加「在新窗口打开」图标；无宿主时保持原链接 |
| `apps/web/src/features/ai/components/mobile/chat-mobile.tsx` | 修改 | 接入 provider 与移动覆盖层；覆盖层关闭后显示「已打开的内容（n）」入口；新会话 id 迁移分区 |
| `apps/web/src/features/ai/use-conversations.ts` | 修改 | 删除会话成功后移除对应侧栏分区 |
| `apps/web/src/features/auth/use-logout-mutation.ts` | 修改 | 登出时删除全部 `anynote-ai-side-panel:` 键 |

## 笔记会话与移动端正文

| 文件 | 状态 | 作用与原因 |
|---|---|---|
| `apps/web/src/features/notes/use-note-editor-session.ts` | 修改 | 新增 `locate`（按导航版本重新定位）与 `syncOnVisible`（窗口可见且保存空闲时用服务端新版本替换正文与基线） |
| `apps/web/src/features/notes/use-save-note.ts` | 修改 | 新增 `applyServerVersion`：只在空闲时替换正文、标题与版本基线 |
| `apps/web/src/features/notes/use-leave-guard.ts` | 修改 | 跳过 `[data-side-panel-links]` 内的链接，避免侧栏资源链接触发整页离开确认 |
| `apps/web/src/features/notes/components/note-editor.tsx` | 修改 | 完整页面把地址参数解析成 `locate` 传入会话 |
| `apps/web/src/features/notes/components/mobile/note-editor-mobile.tsx` | 修改 | 拆出正文层，外壳只保留 `MobileScreen`、动作表与保存状态 |
| `apps/web/src/features/notes/components/mobile/note-editor-mobile-body.tsx` | 新增 | 移动端正文层：元信息、协同提示、编辑器与冲突对话框；完整页与覆盖层共用 |
| `apps/web/src/features/tasks/use-task-detail.ts` | 修改 | 新增 `useMemberTaskByIdQuery`（`GET /noteTasks/{id}`）；管理员查询支持 `enabled`，供侧栏按权限分流 |
| `apps/web/src/features/tasks/query-keys.ts` | 修改 | 新增成员单任务查询键 |
| `apps/web/src/features/mooc/components/video-player.tsx` | 修改 | 新增 `navigationKey`：换时间点时原地 `seek`，不销毁重建；不传时保持旧行为 |

## 测试

| 文件 | 状态 | 作用与原因 |
|---|---|---|
| `apps/web/src/features/side-panel/__tests__/layout.test.ts` | 新增 | 方案表格每一行、1087/1088 与 799/800 边界、最大化、偏好夹取 |
| `apps/web/src/features/side-panel/__tests__/store.test.ts` | 新增 | 打开/去重/导航版本/右侧插入/淘汰/关闭/守卫/页面类/迁移/移除/恢复 |
| `apps/web/src/features/side-panel/__tests__/persistence.test.ts` | 新增 | 键与往返、JSON 不含标题/定位/最大化、损坏与版本不符删键、50 分区、写入失败、登出清理 |
| `apps/web/src/features/side-panel/__tests__/registry.test.ts` | 新增 | kind 重复、资源类型缺失/重复、页面标签误声明资源类型 |
| `apps/web/src/features/side-panel/__tests__/launcher.test.tsx` | 新增 | 展开/收起、空态、打开资源、播报、键盘焦点、同一资源去重 |
| `apps/web/src/features/side-panel/__tests__/tab-bar.test.tsx` | 新增 | 标题与关闭、点击激活、中键关闭、方向键焦点、最大化/还原 |
| `apps/web/src/features/side-panel/__tests__/resize-handle.test.tsx` | 新增 | 方向键、Home/End、双击复位、ARIA 值 |
| `apps/web/src/features/side-panel/__tests__/mobile-host.test.tsx` | 新增 | 关闭回退历史、Esc 只在标签头生效 |
| `apps/web/src/features/side-panel/__tests__/tabs.test.tsx` | 新增 | 资料页码/导航版本/新窗口地址、不可读与重试、知识库条目与空态、任务权限分流、视频秒数、文档只读 |
| `apps/web/src/features/side-panel/__tests__/note-body.test.tsx` | 新增 | 守卫与新窗口处理器登记、先保存后打开、无改动原生链接、移动端正文层 |
| `apps/web/src/features/notes/__tests__/use-note-editor-session.test.tsx` | 新增 | 定位与导航版本、可见同步、待保存/协同/版本不新时不替换 |
| `apps/web/src/features/notes/__tests__/use-save-note.test.tsx` | 修改 | 新增 `applyServerVersion` 的空闲替换与有待保存不替换 |
| `apps/web/src/features/notes/__tests__/use-leave-guard.test.tsx` | 修改 | 新增标记区域内的链接不拦截 |
| `apps/web/src/features/mooc/components/__tests__/video-player.test.tsx` | 修改 | 新增 `navigationKey` 原地 seek 与不传时重建 |
| `apps/web/src/features/ai/components/__tests__/citation-answer.test.tsx` | 修改 | 新增宿主点击、修饰键/中键、新窗口图标、`onCitation` 优先 |
| `apps/web/src/features/ai/components/process/__tests__/process-area.test.tsx` | 修改 | 新增宿主点击与修饰键不拦截 |
| `apps/web/src/features/ai/components/__tests__/chat-panel.test.tsx` | 修改 | 新增有宿主时的 `data-side-panel-links` 标记 |

## E2E

| 文件 | 状态 | 作用与原因 |
|---|---|---|
| `apps/web/e2e/support/agent-retrieval.ts` | 修改 | 「定位笔记小节」改为断言侧栏/覆盖层内标题进入视口；新增修饰键新标签页断言；新增桌面去重/刷新恢复与 1280/1024 布局用例。**本次未执行**（Q3-A） |

## 审计要点

1. **首屏预算仍差 0.3 KB**：`/ai/chat` 310.3 / 310.0。已把 `store`、注册表、全部正文、宽度偏好、布局计算与资源解析移入懒加载块；未上调预算。2026-11-22 用户确认接受该超预算，不调整预算；`bundle:budget` 门禁记录为未通过。
2. **引用解析改为宿主懒加载**：首屏只传原始引用/工具条目，宿主再解析成 `ResourceTarget`。与方案 §5.2 的 `citationHref` 薄封装、§5.3 的 `open(target)` 有内部偏差，行为与测试保持一致。
3. **笔记侧栏编辑的离开保护**：`useNoteEditorSession` 的 `confirmLeave` 登记为侧栏守卫；`useLeaveGuard` 跳过 `[data-side-panel-links]`，避免一次点击弹两次确认。
4. **新窗口先保存**：笔记有待保存改动时同步打开 `about:blank`，`flush()` 后 `location.replace`；无改动时保留原生 `<a target="_blank">`。
5. **持久化只存标识**：序列化结果不含标题、知识库名、定位、最大化；登出清理全部前缀键；损坏或版本不符只删该用户键。
6. **移动返回手势未实测**：`pushState` / `popstate` 已实现并有单测，但 Next 15 集成与软键盘贴底（V2/V4）需真实浏览器 E2E，本次未执行。
