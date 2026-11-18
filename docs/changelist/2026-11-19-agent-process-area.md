# Agent 运行过程展示对话界面变更清单（M17.4）

## 概览

本批实施 [AGENT_TRACE_VIEW_PLAN.md](../ai-refactor/AGENT_TRACE_VIEW_PLAN.md) 的 M17.4 对话过程区：
事件归并纯函数、过程区组件（整轮控件、思考行、工具行、过程说明、重试行）、落库过程视图回放（含撤权隐藏），
并补齐 Python 投影的结果计数口径（`kb_read` 按「读取 {n} 字」、`kb_grep` 按「命中 {n} 处」等，与已确认文案对齐）。
M17.0–M17.3（提案、接入层、投影、Java 白名单/落库/复核/管理端点）已在各自提交完成，本批是前端消费侧与跨栈口径对齐。

共 **11 个文件：新增 4、修改 7、删除 0**；已跟踪文件**新增 359 行、删除 1 行**，另有 4 个新增未跟踪文件共 805 行
（`process-area.tsx` 262、`process-area.test.tsx` 143、`process.ts` 279、`process.test.ts` 121）。目录分布：`apps/web` 9、`ai-service` 2。

### 验证结果

| 命令 / 操作 | 实际结果 |
|---|---|
| `cd ai-service && PYTHONPATH=. venv/Scripts/python.exe -m pytest -p no:warnings` | 多轮全量结果在 **455 passed、20 skipped** 与 **1 failed、454 passed、20 skipped** 之间抖动；失败均为既有用例（`test_models.py::test_first_idle_and_total_timeouts[TOTAL]` 或 `test_indexing_pipeline.py::test_incremental_store_failure_preserves_cursor_success_time_and_doc_status`），**干净树上同样复现**，与本批改动无关，未修改；失败用例单独复跑均通过 |
| `cd apps/web && pnpm vitest run src/features/ai src/lib/ai` | **23 个测试文件、140 项全部通过**（含新增 `process.test.ts` 7 例、`process-area.test.tsx` 8 例、`use-chat-stream` 新增 2 例） |
| `cd apps/web && npx tsc --noEmit -p tsconfig.json` | 通过（`exactOptionalPropertyTypes` 下修正后零报错） |
| `pnpm exec biome check`（7 个本批前端文件） | 通过，无 diff |
| `pnpm --filter web bundle:budget` | 通过：桌面 **304.3/310 KB**、移动端 **246.6/250 KB**、编辑器 **16.9/250 KB** |
| Playwright（桌面 + 移动端）与真实栈验收 | **未执行**，留待 M17.6（主密钥恢复后），已在 OpenSpec 登记为遗留项 |

## Python 投影

| 文件 | 状态 | 作用与原因 |
|---|---|---|
| `ai-service/harness/view/events.py` | 修改 | `ToolCallRecord` 增加 `diagnostics` 字段，让投影能取到工具声明的结果计数（如 `kb_read` 的字数）而不是只能数证据条数 |
| `ai-service/harness/view/middleware.py` | 修改 | `AFTER_ACT` 记录观察诊断；`_result_summary` 按工具名从诊断取计数（`kb_list→knowledgeBases`、`kb_outline→nodes`、`kb_grep→hits`、`kb_read→chars`、`kb_query→rows`、`kb_related→related`），取不到时回退证据条数；`kb_search` 无诊断键，维持证据条数（命中数） |
| `ai-service/tests/test_harness_loop.py` | 修改 | 新增 `test_tool_result_count_uses_diagnostics`：`kb_read` 的 `chars` 优先作为 count，无诊断键的 `kb_search` 回退证据条数 |

## 前端过程区与回放

| 文件 | 状态 | 作用与原因 |
|---|---|---|
| `apps/web/src/lib/ai/process.ts` | 新增 | 事件到过程状态的归并纯函数（思考块合并、工具行 started/finished 补全、重试与说明行），并集中已确认的动作与结果摘要文案；`kb_read` 使用确认文案 `读取 {n} 字` |
| `apps/web/src/lib/ai/__tests__/process.test.ts` | 新增 | 覆盖思考合并/中断、工具行补全、说明与重试行、非过程事件不改状态、已确认文案与活动摘要只统计检索/阅读/查找 |
| `apps/web/src/features/ai/components/process/process-area.tsx` | 新增 | 过程区组件：整轮控件（思考中计时/已完成用时/失败/已停止 + 活动摘要）、思考行默认收起且结束后 `aiAnswer` 渲染、工具行可展开结果条目、失败与取消保持展开、自动收起有键盘焦点守卫 |
| `apps/web/src/features/ai/components/process/__tests__/process-area.test.tsx` | 新增 | 覆盖计时推进、完成后收起与展开、失败/取消不收起、思考 aiAnswer 渲染、工具条目展开与不可展开分支 |
| `apps/web/src/features/ai/use-chat-stream.ts` | 修改 | `StreamMessage` 增加 `process/durationMs/processHiddenNotice`；事件流经 `applyRunEvent` 归并进过程状态，`run.finished` 记录总耗时；`hydrate` 从落库 `process` 恢复（含 `durationMs`、结果条目），`hidden=true` 时丢弃空文本行并显示已确认隐藏提示 |
| `apps/web/src/features/ai/__tests__/use-chat-stream.test.tsx` | 修改 | 新增落库过程视图恢复（耗时、工具结果条目）与隐藏视图（空行丢弃、提示文案）两条用例 |
| `apps/web/src/features/ai/components/message-item.tsx` | 修改 | 助手消息渲染过程区与隐藏提示，落库回放与实时流共用同一组件 |
| `apps/web/src/features/ai/schemas.ts` | 修改 | 会话消息 schema 增加 `process` 字段（对象透传，由 hydrate 纯函数校验） |

## 审计要点

1. **计数口径对齐**：`middleware.py` 的 `TOOL_RESULT_COUNT_KEYS` 是 `kb_read` 显示「读取 {n} 字」的数据来源；核对各工具 `diagnostics` 键名与 `_result_summary` 的映射是否一致，`kb_search` 故意不在映射内（命中数=证据条数）。
2. **撤权回放**：`hydrateProcess` 在 `hidden=true` 时丢弃空文本行；核对 Java `ProcessViewRecheck.hiddenView` 产出的 `text=null` 行确实被前端丢弃，不能渲染出空行。
3. **文案边界**：所有用户可见文案均为 2026-11-18 已确认清单（含 `读取 {n} 字`）；确认清单之外的「已中断」徽标已从组件中移除，如需展示中断状态需另行确认文案。
4. **失败/取消不收起**：`collapsedByDefault` 只在非流式、非失败、非取消时生效；自动收起前检查 `root.contains(activeElement)`，防止藏住键盘焦点。
5. **包体预算**：`process-area.tsx` 引入 `TiptapEditor`（dynamic 组件）用于思考块结束后的 Markdown；预算验证通过，桌面 304.3/310 KB 无超限。
6. **遗留项**：移动端「运行中只显示整轮控件和最新一行」与 Playwright 桌面/移动端用例未在本批实现（方案 §5.7 移动端行），登记在 M17.6 真实栈验收时一并处理。
