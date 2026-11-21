# AI 对话页面 UI 重构

## 概览

本次仅重构桌面与移动端 AI 对话列表、详情页，参考 `deepseek-harness` 的会话栏、居中消息列、空态输入卡片和贴底输入区；PDF 问答、AI 工作流、设置与其他页面不改，后端与 SQL 无改动。

| 范围 | 文件数 | 行数 |
|---|---:|---:|
| 已跟踪文件修改 | 18 | +525 / -192 |
| 新增 `chat-page.test.tsx` | 1 | +37 / -0 |
| 新增本清单 | 1 | +86 / -0 |
| 合计 | 20（新增 2、修改 18、删除 0） | +648 / -192 |

目录分布：`apps/web/` 19 个文件，`docs/changelist/` 1 个文件。所有改动均留在当前 `dev` 工作区，`git diff --stat origin/dev...HEAD` 为空，没有本次新增提交。

### 验证结果

| 命令或检查 | 实际结果 |
|---|---|
| 修复前定向 Vitest（3 文件） | 34 条中 4 条失败，复现固定减高、历史状态叠加空态及缺少“回到最新” |
| `pnpm --filter web test` | 183 文件中 181 通过；2158 条中 2155 通过，3 条失败均在未改动的任务日期时间组件 |
| 两个失败任务测试文件单独复跑 | 45/45 通过，确认为全量并发运行中的波动，未修改任务代码 |
| `pnpm --filter web typecheck` | 通过 |
| Biome 检查本批 19 个代码/测试文件 | 通过，无待修复项；`git diff --check` 通过 |
| `pnpm --filter web build` | 编译、类型检查与 37 个静态页面生成成功，Windows standalone 符号链接复制因 `EPERM` 失败 |
| Docker Compose 构建并启动 `anynote-web` | 两次构建均成功；第二次以 localhost 公开地址运行，容器健康检查通过 |
| `pnpm --filter web bundle:budget` | 通过；`/ai/chat` 与 `/ai/chat/[id]` 均为 308.7 KB / 310 KB，移动与编辑器预算通过 |
| 定向 Playwright 五文件 | 60 条中 56 通过、1 失败、3 条因串行失败未运行；失败与补跑明细见下 |
| 内置浏览器人工验收 | 桌面/移动、浅色/深色、空态/消息态、历史失败、20 行草稿、长会话上翻及“回到最新”均已实际操作 |

E2E 未闭环项：

- `loading-system.spec.ts:521` 仍断言“思考中”，实际为“正在准备”；`git show HEAD` 确认基线消息组件与流式 store 已使用该文案，本次未改文案或测试。
- `loading-system.spec.ts:556` 单独补跑时等待流式光标超时，本次未改流式协议，未把该用例记为通过。
- `loading-system.spec.ts:626` 单独补跑时找不到 `kb-gallery-grid`，未把该用例记为通过。
- `loading-system.spec.ts:645` 单独补跑 1/1 通过。

## AI 对话组件

桌面与共享面板按 `conversation` / `document` 场景隔离样式，保留既有发送、停止、重试、引用与运行过程行为。

| 文件 | 状态 | 作用与原因 |
|---|---|---|
| `apps/web/src/features/ai/components/chat-panel.tsx` | 修改 | 重构空态与消息态布局、修复历史状态叠加空态，并增加跟随最新与“回到最新”控制。 |
| `apps/web/src/features/ai/components/chat-input.tsx` | 修改 | 新增对话卡片布局与底部控件插槽，同时保留文档问答的原有输入结构。 |
| `apps/web/src/features/ai/components/chat-page.tsx` | 修改 | 改用 Flex 剩余高度并接入 288px 会话栏和会话标题，消除固定视口减高。 |
| `apps/web/src/features/ai/components/chat-scope-select.tsx` | 修改 | 将检索范围改为输入卡片内的紧凑控件，减少顶部工具条占用。 |
| `apps/web/src/features/ai/components/message-item.tsx` | 修改 | 对话场景采用中性用户气泡与无头像助手正文，文档场景保留原展示。 |
| `apps/web/src/features/ai/components/citation-answer.tsx` | 修改 | 仅对话场景取消 AI 正文的 320px 默认最小高度，避免短回答后出现大块空白。 |
| `apps/web/src/features/ai/components/conversation-list.tsx` | 修改 | 重排会话栏头部、新建入口和选中/键盘焦点样式，保持重命名与删除能力。 |
| `apps/web/src/features/ai/components/mobile/chat-mobile.tsx` | 修改 | 使用纸面底色并补齐 Flex 高度链，使移动输入区贴底、消息区内部滚动。 |
| `apps/web/src/features/ai/components/mobile/conversation-list-mobile.tsx` | 修改 | 将移动会话卡片列表改为轻量行列表，保留常显操作按钮和底部动作表。 |
| `apps/web/src/app/(workspace)/ai/chat/loading.tsx` | 修改 | 让加载骨架匹配新的会话栏、页头与消息区，减少加载完成时的布局跳动。 |

## 工作区布局

| 文件 | 状态 | 作用与原因 |
|---|---|---|
| `apps/web/src/components/layout/navigation.ts` | 修改 | 只把 `/ai/chat` 与数字会话详情纳入满幅路由，其他 AI 页面仍走文档流。 |
| `apps/web/src/components/layout/app-shell.tsx` | 修改 | 更新满幅页面注释以覆盖对话页，不改变共享外壳行为。 |

## 单元测试

| 文件 | 状态 | 作用与原因 |
|---|---|---|
| `apps/web/src/features/ai/components/__tests__/chat-page.test.tsx` | 新增 | 固定对话页使用 Flex 剩余高度且不再读取固定 `100svh` 减高。 |
| `apps/web/src/features/ai/components/__tests__/chat-panel.test.tsx` | 修改 | 覆盖历史状态互斥、上翻回到底部、发送参数及 PDF 布局隔离。 |
| `apps/web/src/features/ai/components/__tests__/chat-input.test.tsx` | 修改 | 覆盖新输入卡片底部控件，并保留发送、IME 与停止行为验证。 |
| `apps/web/src/features/ai/components/__tests__/citation-answer.test.tsx` | 修改 | 验证只有对话正文取消默认最小高度，文档回答不受影响。 |
| `apps/web/src/features/ai/components/__tests__/message-item.test.tsx` | 修改 | 验证对话与文档场景的用户气泡样式隔离。 |
| `apps/web/src/features/ai/components/mobile/__tests__/chat-mobile.test.tsx` | 修改 | 固定移动对话容器的 Flex 高度链，防止输入区跟随短内容而非贴底。 |
| `apps/web/src/components/layout/__tests__/navigation.test.ts` | 修改 | 覆盖聊天满幅路由及相似路径、非数字 id 和其他 AI 页面的排除条件。 |

## 文档

| 文件 | 状态 | 作用与原因 |
|---|---|---|
| `docs/changelist/2026-11-21-ai-chat-ui-refactor.md` | 新增 | 按实际 Git 差异记录本批文件、验证结果与未闭环项，供评审审计。 |

## 审计要点

1. `ChatPanel`、`ChatInput`、`MessageItem` 与 `CitationAnswer` 的默认 `document` 分支必须保持 PDF 现状，新视觉只能由 `conversation` 分支启用。
2. 桌面满幅路由与移动端 `mobile-chat` 高度链共同保证内部滚动，需重点检查长消息、软键盘和短内容贴底。
3. 滚动跟随同时维护“用户上翻不被强拉”和“回到最新后恢复跟随”，需检查平滑滚动期间按钮不反复闪现。
4. 对话正文的 `min-h-0!` 只覆盖会话中的 ProseMirror，避免全局编辑器或其他页面被改动。
5. 除已确认的“回到最新”外未新增或改写用户提示；现有 E2E 文案/SSE 不匹配保留并如实上报，没有通过改测试掩盖。
