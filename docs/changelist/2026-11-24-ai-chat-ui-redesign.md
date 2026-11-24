# AI 对话 UI 重设计 changelist

## 概览

- 文件：新增 6 个、修改 11 个、删除 0 个，共 17 个（含本文件）。
- 行数：新增 703、删除 74 行（含本文件）。
- 分布：`apps/web/src` 新增 400、删除 74 行（新增 2 个、修改 11 个文件）；`apps/web/e2e` 新增 232 行（新增 3 个文件）；`docs/changelist` 新增 71 行（本文件）。
- 范围：桌面与移动端 AI 对话的消息层级、Markdown 表格、会话操作、消息复制和末条回答重新提问；PDF 问答、后端接口和数据库契约不变。
- 未纳入：开工前已有的 `docs/ai-refactor/AI_CHAT_SIDE_PANEL_CODE_REVIEW_ROUND_3.md` 保持未跟踪且未修改。

### 验证结果

| 命令或检查 | 结果 |
|---|---|
| `pnpm --filter web exec vitest run src/features/ai` | 通过，21 个测试文件、164 条用例 |
| `pnpm --filter web test` | 2324 条通过、3 条任务日期/时间用例超时；未改动任务模块 |
| 单独复跑 `date-time-field.test.tsx` 与 `task-form-page.test.tsx` | 通过，2 个文件、45 条用例，确认全量并发运行波动 |
| `pnpm --filter web typecheck` | 通过 |
| `pnpm exec biome check <本次改动文件>` | 通过 |
| `pnpm --filter web check:css-tokens` | 通过，70 个被引用自定义属性均有定义 |
| `pnpm --filter web bundle:budget` | 初次 `/ai/chat` 312.0 KB 超限；会话列表懒加载后复测通过，`/ai/chat` 304.7 KB、最重桌面路由 309.8 KB、移动端 248.1 KB、编辑器 18.0 KB |
| `pnpm --filter web build` | 编译、类型检查和 37 个静态页面生成通过；Windows standalone 复制依赖时因 `EPERM: operation not permitted, symlink` 失败 |
| `docker compose --env-file infra/.env.dev.local -f infra/docker-compose.yaml -f infra/docker-compose.dev.yaml up -d --build anynote-web` | 通过，最终代码已在 Linux Docker 中构建并更新至 `http://localhost:3000` |
| `pnpm --filter web exec playwright test e2e/ai-chat-ui.spec.ts e2e/mobile-ai-chat-ui.spec.ts` | 通过，桌面与移动端各 1 条；首轮 Windows 剪贴板 CRLF 断言差异已统一换行后复测 |
| `pnpm --filter web exec playwright test e2e/ai-conversation-groups.spec.ts e2e/ai-stream.spec.ts e2e/mobile-core.spec.ts` | 通过，29 条既有相关回归用例 |
| 真实浏览器视觉检查 | 已核对桌面和移动端深浅色截图；另用独立浏览器检查真实会话的过程卡片、消息操作及会话悬停操作 |

## `apps/web/src`

对话页按展示场景隔离视觉和交互，消息操作复用原始 Markdown，首屏共享包不引入新依赖。

| 文件 | 状态 | 作用与原因 |
|---|---|---|
| `apps/web/src/features/ai/components/message-actions.tsx` | 新增 | 提供复制原文与可选重新提问按钮，并处理复制成功态和已确认的失败提示，使用户与助手消息共享一致操作。 |
| `apps/web/src/features/ai/components/message-item.tsx` | 修改 | 为 AI 对话加入独立助手卡片、品牌浅色用户气泡和消息操作栏，同时保留文档问答原有布局。 |
| `apps/web/src/features/ai/components/chat-panel.tsx` | 修改 | 拉开对话区与卡片背景层级，并只给末条已完成助手回答注入重新提问回调，避免覆盖旧回答或重复发送历史问题。 |
| `apps/web/src/features/ai/components/conversation-list.tsx` | 修改 | 将重命名和删除从隐藏下拉菜单改为会话行图标按钮，保留现有确认、离开守卫和删除接口。 |
| `apps/web/src/features/ai/components/citation-answer.tsx` | 修改 | 移除对话卡片内编辑器的重复留白并强化引用容器层级，避免正文和引用来源融入页面背景。 |
| `apps/web/src/features/ai/components/process/process-area.tsx` | 修改 | 让对话运行过程使用与助手卡片不同的背景，文档问答继续沿用原样式。 |
| `apps/web/src/features/ai/components/chat-page.tsx` | 修改 | 懒加载桌面会话列表并保留行骨架，将会话首屏 gzip 从超限的 312.0 KB 降至 304.7 KB。 |
| `apps/web/src/styles/tiptap.css` | 修改 | 限定 AI 消息容器的表格边框、表头、行分隔、悬停态和横向滚动，避免影响笔记编辑器及 PDF 问答。 |
| `apps/web/src/features/ai/components/__tests__/message-actions.test.tsx` | 新增 | 覆盖原始 Markdown 复制、剪贴板拒绝或缺失时的提示，以及重新提问回调。 |
| `apps/web/src/features/ai/components/__tests__/message-item.test.tsx` | 修改 | 验证对话与文档问答的消息操作和气泡样式隔离，防止共享组件误改 PDF 场景。 |
| `apps/web/src/features/ai/components/__tests__/chat-panel.test.tsx` | 修改 | 验证只复制当前消息、末条回答重新发送最后一问，以及流式和取消状态不提供重新提问。 |
| `apps/web/src/features/ai/components/__tests__/conversation-list.test.tsx` | 修改 | 将会话操作断言改为直接按钮并继续覆盖重命名、删除确认、离开守卫和导航行为。 |
| `apps/web/src/features/ai/components/__tests__/chat-page.test.tsx` | 修改 | 等待懒加载会话列表就绪，继续验证首条消息后的会话 key 与路由状态同步。 |

## `apps/web/e2e`

新增真实栈验收使用临时账号和临时会话，覆盖实际 Markdown 表格及完整操作链路。

| 文件 | 状态 | 作用与原因 |
|---|---|---|
| `apps/web/e2e/support/chat-ui.ts` | 新增 | 准备含表格的真实会话并检查深浅色层级、移动端表格滚动、原文复制、重新提问及桌面会话删除，兼容 Windows 剪贴板换行规范化。 |
| `apps/web/e2e/ai-chat-ui.spec.ts` | 新增 | 注册桌面 AI 对话 UI 的真实浏览器验收入口。 |
| `apps/web/e2e/mobile-ai-chat-ui.spec.ts` | 新增 | 注册移动端 AI 对话 UI 的真实浏览器验收入口。 |

## `docs/changelist`

| 文件 | 状态 | 作用与原因 |
|---|---|---|
| `docs/changelist/2026-11-24-ai-chat-ui-redesign.md` | 新增 | 按实际 Git 差异记录本次逐文件改动、验证结果和评审重点，便于审计 UI 与交互范围。 |

## 审计要点

- 复制写入的是消息原始文本/Markdown；Windows 系统剪贴板读取可能把 LF 转为 CRLF，E2E 只规范化换行后比较，不改动产品原文。
- “重新提问”只出现在末条已完成且有内容的助手回答上，复用最后一轮用户输入并追加新运行，不覆盖历史问答；流式、失败和取消状态不出现。
- 消息卡片与操作栏由 `presentation="conversation"` 隔离，文档问答保持默认 `document` 路径，PDF 相关既有单测和移动端回归均通过。
- 会话删除仍调用既有整会话 DELETE 接口；本批没有新增后端代码、API 契约、Java SQL 或 `resultMap`。
- 会话列表懒加载是为满足既有首屏预算而增加，评审应同时检查列表骨架、加载后的会话状态与体积报告，不能只核对静态截图。
- 宿主机 `next build` 的 standalone 阶段仍受 Windows 符号链接权限限制；最终可运行产物以项目规定的 Linux Docker 构建和真实浏览器结果为准。
