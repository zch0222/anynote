# AI 对话右侧栏：第二轮评估报告修复

日期：2026-11-24
依据：[`docs/ai-refactor/AI_CHAT_SIDE_PANEL_CODE_REVIEW_ROUND_2.md`](../ai-refactor/AI_CHAT_SIDE_PANEL_CODE_REVIEW_ROUND_2.md)
方案：[`docs/ai-refactor/AI_CHAT_SIDE_PANEL_PLAN.md`](../ai-refactor/AI_CHAT_SIDE_PANEL_PLAN.md) §5.7、§16
范围：`apps/web`；不改后端、OpenAPI、SQL、Nacos。
状态：**R2-01、R2-02、R2-03 与报告 §4.1、§4.2 已修复，同批修复 PDF 页知识库下拉点击无效；单测与真实栈 E2E 通过；首屏预算仍失败（310.8 / 310.0 KB），M19.7 未关闭。**

## 概览

| 项 | 数量 |
|---|---|
| 修改（已跟踪） | 18 个文件，+583 / −148 |
| 新增（未跟踪） | 3 个文件，335 行 |
| 删除 | 0 |
| 新增文件 | 1 个测试文件 + 1 份评估报告 + 本清单 |

代码与测试集中在 `apps/web/src/features/side-panel/**`、`apps/web/src/features/ai/**` 与 `apps/web/e2e/support/agent-retrieval.ts`；
文档改动在 `docs/ai-refactor/` 与本目录。

验证结果：

| 命令 | 结果 |
|---|---|
| `pnpm exec vitest run <本批相关范围>`（`src/features/side-panel`、`use-conversations`、`conversation-list`、`chat-page`、`pdf-page`、`use-logout-mutation`、`use-leave-guard`） | **21 files / 151 tests passed**；复现用例改前失败、改后通过 |
| `pnpm --filter web test`（全量） | 201 files / **2320 tests，2317 passed / 3 failed**；失败为既有任务日期控件（`date-time-field.test.tsx` 2 条、`task-form-page.test.tsx` 1 条），未改相关代码 |
| `pnpm --filter web typecheck` | passed |
| `pnpm exec biome check`（本批文件） | passed |
| `NEXT_DISABLE_STANDALONE=1 NEXT_PUBLIC_APP_URL=http://localhost:3107 pnpm --filter web build` | 成功（含 PDF 修复的最终构建） |
| `pnpm --filter web bundle:budget` | **FAIL**：`/ai/chat` 与 `/ai/chat/[id]` **310.8 / 310.0 KB**（构建前对已有产物复算 310.7 KB）；`/ai/pdf` 309.2 / 310.0 KB 通过；移动端 `/m/ai/pdf/[docId]` 247.3 / 250 通过；编辑器 18.0 / 250 通过 |
| `python tmp/m19-side-panel/run_e2e.py`（宿主机 `next start -p 3107`） | 第 1 次 20 passed / 12 skipped / 2 failed（移动端测试代码问题）；修正后第 2 次 **22 passed / 12 skipped**；最终构建上第 3 次 **22 passed / 12 skipped**，编排脚本（不在仓库）恢复校验改为轮询后各项恢复标记均为 true，只读查询 Nacos 为 `prefetch-enabled: false` |
| 临时浏览器脚本 `tmp/r2-fixes/pdf-base-select-check.mjs`（不在仓库） | `/ai/pdf` 知识库下拉：修复前点选其他库后仍显示原库（`changed: false`），修复后切到所选库（`changed: true`） |

## 侧栏容器

| 文件 | 状态 | 作用与原因 |
|---|---|---|
| `apps/web/src/features/side-panel/surface-events.ts` | 修改 | 处理器合并为 `remove` / `rename` / `requestLeave` 一组，由侧栏状态模块登记且不再随宿主卸载清空；新增 `requestSidePanelLeave`，供首屏会话列表在程序化导航前走侧栏守卫而不引入懒加载的 store |
| `apps/web/src/features/side-panel/store.ts` | 修改 | 模块加载时登记移除、迁移与离开检查处理器，修复宿主卸载后删除会话只清磁盘、内存分区被后续保存写回（R2-02） |
| `apps/web/src/features/side-panel/desktop/host.tsx` | 修改 | 删除宿主内的处理器登记，避免卸载时把 store 级登记清掉 |
| `apps/web/src/features/side-panel/mobile/host.tsx` | 修改 | 同上；「打开完整页面」继续用 store 的 `requestLeave` |

## AI 对话页

| 文件 | 状态 | 作用与原因 |
|---|---|---|
| `apps/web/src/features/ai/components/conversation-list.tsx` | 修改 | 新增 `surface`；切换会话、「新对话」先走侧栏守卫（目标与当前地址相同时不询问），删除当前会话在删除确认之后、请求之前询问（R2-01）；「重命名」「删除」由 Base UI 不处理的 `onSelect` 改为 `onClick`，修复点击无效 |
| `apps/web/src/features/ai/components/chat-page.tsx` | 修改 | 分区键只算一次，同时传给侧栏宿主与会话列表，保证守卫检查的是正在显示的分区 |
| `apps/web/src/features/ai/use-conversations.ts` | 修改 | 只更新注释：notify 在侧栏状态模块未加载时才是空操作 |
| `apps/web/src/features/ai/components/pdf/pdf-page.tsx` | 修改 | 知识库下拉菜单项的 `onSelect` 改为 `onClick`，修复选择其他知识库无效（与会话菜单同一缺陷，确认后同批修复） |

## 测试

| 文件 | 状态 | 作用与原因 |
|---|---|---|
| `apps/web/src/features/ai/components/__tests__/conversation-list.test.tsx` | 修改 | 用真实 store 守卫覆盖切换/新建的拒绝、允许与同地址不询问；删除当前会话的允许、拒绝、取消删除确认与删除非当前会话；重命名打开对话框；路由与删除 mutation 改为稳定打桩 |
| `apps/web/src/features/side-panel/__tests__/surface-events.test.ts` | 新增 | 覆盖状态模块未加载时放行与空操作、加载后不挂宿主也能走守卫、迁移与移除 |
| `apps/web/src/features/side-panel/__tests__/persistence-hook.test.ts` | 修改 | 补「卸载后跨账号重新挂载」（含 `chat:new` 分区，且不写入旧账号键）与「同账号重新挂载保留内存」用例（R2-03 单测部分） |
| `apps/web/src/features/ai/__tests__/use-conversations.test.tsx` | 修改 | 新增「挂载过 → 卸载 → 删除 → 再挂载并保存」复现用例，断言内存与磁盘都不再出现被删分区（R2-02） |
| `apps/web/src/features/side-panel/__tests__/launcher.test.tsx` | 修改 | 删除「宿主挂载时登记迁移与移除」用例及无用导入，登记已不在宿主，改由 `surface-events.test.ts` 覆盖 |
| `apps/web/src/features/side-panel/__tests__/mobile-host.test.tsx` | 修改 | 同上 |
| `apps/web/src/features/ai/components/pdf/__tests__/pdf-page.test.tsx` | 修改 | 新增切换知识库复现用例：点击另一库的菜单项后触发器与文档查询都切到新库 |

## E2E

| 文件 | 状态 | 作用与原因 |
|---|---|---|
| `apps/web/e2e/support/agent-retrieval.ts` | 修改 | 新增桌面「切换会话与新建对话」「删除当前会话」守卫用例（保存失败草稿下取消不导航、不发删除请求、正文不变，允许后正常跳转）；账号切换用例改为同一文档全程站内跳转并断言哨兵与存储键（R2-03）；「打开完整页面」改为普通点击并删除 DOM 观察者辅助函数（§4.1）；收尾逐项输出清理结果（§4.2） |

## 文档

| 文件 | 状态 | 作用与原因 |
|---|---|---|
| `docs/ai-refactor/AI_CHAT_SIDE_PANEL_CODE_REVIEW_ROUND_2.md` | 新增 | 第二轮评估报告原文，作为本轮修复依据一并入库 |
| `docs/ai-refactor/AI_CHAT_SIDE_PANEL_PLAN.md` | 修改 | 订正 §5.7 第 3 条「切换会话是站内链接」的假设；状态头、风险表、A9 与 §16 回写本轮修复、偏差与验证结果 |
| `docs/ai-refactor/AI_MILESTONES.md` | 修改 | 追加 M19 第二轮评估修复记录与门禁结论 |
| `docs/ai-refactor/README.md` | 修改 | 更新右侧栏方案索引状态，新增第二轮评估报告条目 |
| `docs/changelist/2026-11-24-ai-chat-side-panel-review-round-2-fixes.md` | 新增 | 本清单 |

## 审计要点

1. **处理器登记位置改变**：`store.ts` 加载即登记且不注销，宿主卸载不再影响删除与迁移；附带宿主未挂载期间的新会话分区迁移也会生效（此前为空操作），已确认接受。新增宿主或入口时不要再在组件里登记处理器。
2. **会话列表不能静态引入 store**：守卫经 `requestSidePanelLeave` 桥接，store 未加载时放行；直接引入会把懒加载块拉进 `/ai/chat` 首屏。
3. **删除当前会话的顺序**：先删除确认、再草稿确认、最后才发删除请求；删除成功后 `notifyConversationRemoved` 会立即移除分区并卸载编辑器，所以守卫必须放在请求之前。
4. **`onSelect` → `onClick`**：Base UI `Menu.Item` 没有 `onSelect`，该属性会落到 DOM，React 只在文本输入或可编辑区域获得焦点时触发；本批改了会话列表两处与 PDF 页知识库下拉一处，其他组件的 `onSelect`（如慕课目录行）是自定义组件属性，不属于此问题。
5. **E2E 使用 Next 调试全局**：账号切换用例的 `/m/me`、`/ai/chat` 与 A 的会话三步经 `window.next.router.push`（Next 15.5.18 生产构建存在）站内跳转；桌面没有渲染用户菜单、移动端 UA 登录后落在 `/m/dashboard`，没有可点的界面入口。升级 Next 时需复核该全局是否仍在。
6. **首屏预算仍红**：`/ai/chat` 310.8 / 310.0 KB，比此前接受的 310.7 KB 多 0.1 KB（会话列表接入守卫）；预算未调整，门禁保持失败。mobile 项目 E2E 夹具因默认会话已登出而清理失败（`A0311`），本轮第 2、3 次运行的残留已按确认删除。
