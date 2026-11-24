# AI 对话 Harness 全宽风格 changelist

## 概览

- 文件：新增 1 个、修改 9 个、删除 0 个，共 10 个（含本文件）。
- 行数：新增 259、删除 67 行（含本文件）。
- 分布：`apps/web` 修改 9 个文件，新增 206、删除 67 行；`docs/changelist` 新增 53 行（本文件）。
- 范围：按 DeepSeek Harness 当前实现去掉 AI 回答外层卡片，保留用户中性气泡，并统一表格、引用和运行过程的轻量样式；不新增展示文案或后端契约。
- 未纳入：既有未跟踪文件 `docs/ai-refactor/AI_CHAT_SIDE_PANEL_CODE_REVIEW_ROUND_3.md` 保持不动；上一份 `2026-11-24-ai-chat-ui-redesign.md` 按归档约定不修改。

### 验证结果

| 命令或检查 | 结果 |
|---|---|
| `pnpm --filter web typecheck` | 通过 |
| `pnpm exec biome check <本次改动文件>` | 通过 |
| 相关组件 Vitest 用例 | 通过，4 个测试文件、41 条用例 |
| `pnpm --filter web exec vitest run src/features/ai` | 通过，21 个测试文件、167 条用例 |
| `pnpm --filter web check:css-tokens` | 通过，70 个被引用自定义属性均有定义 |
| `docker compose --env-file infra/.env.dev.local -f infra/docker-compose.yaml -f infra/docker-compose.dev.yaml up -d --build anynote-web` | 通过，最终样式已更新至 `http://localhost:3000` |
| `pnpm --filter web exec playwright test e2e/ai-chat-ui.spec.ts e2e/mobile-ai-chat-ui.spec.ts` | 通过，桌面与移动端各 1 条 Harness 全宽消息、表格、引用与操作用例 |
| `pnpm --filter web exec playwright test e2e/ai-conversation-groups.spec.ts e2e/ai-stream.spec.ts e2e/mobile-core.spec.ts` | 通过，29 条既有相关回归用例 |
| 真实浏览器视觉检查 | 已核对桌面和移动端深浅色完整消息截图，并用独立浏览器复核真实会话的全宽回答、轻量过程行和中性用户气泡 |

## `apps/web`

本批只调整对话展示与对应测试，`presentation="document"` 的 PDF 问答路径保持原有容器样式。

| 文件 | 状态 | 作用与原因 |
|---|---|---|
| `apps/web/src/features/ai/components/message-item.tsx` | 修改 | 去掉 AI 回答的卡片边框、背景、阴影和内边距，并将用户气泡改为 Harness 使用的中性填充。 |
| `apps/web/src/features/ai/components/chat-panel.tsx` | 修改 | 对话主区恢复内容基础背景，配合全宽正文而不是再靠卡片色差区分消息。 |
| `apps/web/src/features/ai/components/citation-answer.tsx` | 修改 | 引用改为无边框浅色内容块，链接使用中等字重和点状悬停下划线，片段去掉左侧竖线以贴合 Harness。 |
| `apps/web/src/features/ai/components/process/process-area.tsx` | 修改 | 对话运行过程去掉卡片容器并收紧为轻量文字行，文档问答继续保留原容器。 |
| `apps/web/src/styles/tiptap.css` | 修改 | 表格去掉外框、表头底色和行悬停填充，改为自然列宽、横向分隔线及窄屏横向滚动。 |
| `apps/web/src/features/ai/components/__tests__/message-item.test.tsx` | 修改 | 断言 AI 正文不再携带气泡卡片类，并验证用户气泡和文档问答样式隔离。 |
| `apps/web/src/features/ai/components/__tests__/citation-answer.test.tsx` | 修改 | 新增 Harness 引用浅色块、无边框和无片段竖线的回归断言。 |
| `apps/web/src/features/ai/components/process/__tests__/process-area.test.tsx` | 修改 | 新增对话轻量过程行与文档问答原容器的场景隔离断言。 |
| `apps/web/e2e/support/chat-ui.ts` | 修改 | 在真实会话中加入合法引用和过程数据，检查全宽消息、横向表格线、无边框引用及操作链路，并保存完整消息实拍。 |

## `docs/changelist`

| 文件 | 状态 | 作用与原因 |
|---|---|---|
| `docs/changelist/2026-11-24-ai-chat-harness-style.md` | 新增 | 独立记录本批 Harness 风格调整、验证结果和评审重点，避免改写上一批已归档清单。 |

## 审计要点

- Harness 当前用户消息仍是右侧气泡，因此本批只移除 AI 外层卡片；用户气泡去掉品牌蓝描边和底色，不是把双方消息都改成无气泡。
- 少于四列的表格填满正文列，四列及以上使用自然宽度；移动端只在表格自身容器横向滚动，页面本身不出现横向溢出。
- 引用与过程数据通过真实 Java 接口读取后再做浏览器断言；测试 SQL 必须使用 UTF-8 JSON 文本，`CAST(hex AS JSON)` 会形成后端无法解析的 Base64 BLOB。
- 复制原始 Markdown、末条回答重新提问、会话重命名和删除行为未改变，本批也没有新增或修改任何面向用户的提示文案。
- 没有 Java 后端、OpenAPI 或数据库契约改动；E2E 中的 SQL 仅用于准备临时测试会话，不属于后端新增查询。
