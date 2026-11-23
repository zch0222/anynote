# AI 对话右侧栏：评估报告修复

日期：2026-11-23
依据：[`docs/ai-refactor/AI_CHAT_SIDE_PANEL_CODE_REVIEW.md`](../ai-refactor/AI_CHAT_SIDE_PANEL_CODE_REVIEW.md)
方案：[`docs/ai-refactor/AI_CHAT_SIDE_PANEL_PLAN.md`](../ai-refactor/AI_CHAT_SIDE_PANEL_PLAN.md)
范围：`apps/web`；不改后端、OpenAPI、SQL、Nacos。
状态：**高 3、中 4、低 4 共 11 项已修复；单测与真实栈 E2E 通过；首屏预算仍失败（310.7 / 310.0 KB），M19.7 未关闭。**

## 概览

| 项 | 数量 |
|---|---|
| 修改（已跟踪） | 22 个文件，+1215 / −324 |
| 新增（未跟踪） | 7 个文件，598 行 |
| 删除 | 0 |
| 新增文件 | 5 个代码/测试文件 + 1 份评估报告 + 本清单 |

代码与测试集中在 `apps/web/src/features/side-panel/**`、`apps/web/src/features/ai/**`、
`apps/web/src/features/auth/**`、`apps/web/src/lib/ai/__tests__/**` 与 `apps/web/e2e/support/agent-retrieval.ts`；
文档改动在 `docs/ai-refactor/`。

验证结果：

| 命令 | 结果 |
|---|---|
| `pnpm --filter web test`（全量） | 200 files / **2308 tests，2305 passed / 3 failed**；失败为既有任务日期控件 5s 超时（`date-time-field.test.tsx` 2 条、`task-form-page.test.tsx` 1 条），未改相关代码 |
| `pnpm --filter web test -- <本批相关文件>` | **17 files / 131 tests passed** |
| `pnpm --filter web typecheck` | passed |
| `pnpm exec biome check`（本批文件） | passed |
| `NEXT_DISABLE_STANDALONE=1 NEXT_PUBLIC_APP_URL=http://localhost:3107 pnpm --filter web build` | 编译、类型检查与 37 个静态页生成成功 |
| `pnpm --filter web bundle:budget` | **FAIL**：`/ai/chat` 与 `/ai/chat/[id]` **310.7 / 310.0 KB**；移动端 247.3 / 250 通过；编辑器 18.0 / 250 通过 |
| `python tmp/m19-side-panel/run_e2e.py` | **20 passed / 10 skipped，约 1.8 分钟**；`playwrightPassed=true`、`agentMainRestored=true`、`providerDeleted=true`、`containerRemoved=true` |

## 侧栏容器与持久化

| 文件 | 状态 | 作用与原因 |
|---|---|---|
| `apps/web/src/features/side-panel/store.ts` | 修改 | 新增 `requestLeave` 供程序化导航复用活动正文守卫；登出通过 `SIDE_PANEL_RESET_EVENT` 清空内存；`openPage` 在调用方未传参时读取定义里的 `multiple`，让注册表字段真正生效 |
| `apps/web/src/features/side-panel/persistence.ts` | 修改 | 只写/只读 `chat:c<正整数>`，忽略历史 `chat:new*`；恢复时校验 `kind` 已注册、`kind` 与 `ref.type` 一致、标签 id 唯一；模块级 `activeUserId` 识别宿主重新挂载后的账号切换并清空旧分区 |
| `apps/web/src/features/side-panel/storage-keys.ts` | 修改 | 新增登出重置事件名；store 懒加载时自行监听，避免把重置注册表放进首屏 |
| `apps/web/src/features/side-panel/persisted-surfaces.ts` | 新增 | 按需加载的分区清理：删除会话后遍历当前浏览器所有用户键移除 `chat:c<id>`，不依赖侧栏宿主是否挂载 |
| `apps/web/src/features/side-panel/desktop/host.tsx` | 修改 | 宿主挂载时登记 `renameSurface` / `removeSurface`，修复新会话迁移与删除会话在内存里是空操作的问题 |
| `apps/web/src/features/side-panel/mobile/host.tsx` | 修改 | `popstate` 守卫拒绝时补回历史标记并保持覆盖层；「打开完整页面」先走 `requestLeave`；消费 `mobile` 定义（为 `false` 时整页跳转）；标题 `<h2>` 使用 `tabDomId` 供 `aria-labelledby` 指向；登记迁移/移除处理器 |
| `apps/web/src/features/side-panel/tabs/note/body.tsx` | 修改 | 桌面「打开完整页面」先调用 `confirmLeave()`，取消时不导航，修复程序化导航绕过离开保护 |
| `apps/web/src/features/side-panel/types.ts` | 修改 | 补充 `multiple` 的调用方覆盖语义与 `keepMounted` 暂未消费的说明 |
| `apps/web/src/features/auth/use-logout-mutation.ts` | 修改 | 登出时派发侧栏重置事件，与删除 localStorage 一起清空内存分区 |
| `apps/web/src/features/ai/use-conversations.ts` | 修改 | 删除会话成功后按需加载分区清理模块，宿主未挂载时也能移除本地标签 |

## 测试

| 文件 | 状态 | 作用与原因 |
|---|---|---|
| `apps/web/src/features/side-panel/__tests__/store.test.ts` | 修改 | 新增 `requestLeave` 守卫与 `resetSidePanelState` 重置用例 |
| `apps/web/src/features/side-panel/__tests__/persistence.test.ts` | 修改 | 新增只写 `chat:c<正整数>`、读取忽略 `chat:new*`、未知 `kind`/类型错配/重复 id 删除用户键的用例 |
| `apps/web/src/features/side-panel/__tests__/persistence-hook.test.ts` | 新增 | 覆盖账号 A→B 与用户 id 变为空时清空内存分区 |
| `apps/web/src/features/side-panel/__tests__/mobile-host.test.tsx` | 修改 | 新增 `popstate` 守卫拒绝/允许、完整页面取消、宿主登记迁移/移除用例 |
| `apps/web/src/features/side-panel/__tests__/mobile-host-a11y.test.tsx` | 新增 | 断言移动 `tabpanel` 的 `aria-labelledby` 指向存在的标题元素 |
| `apps/web/src/features/side-panel/__tests__/note-body.test.tsx` | 修改 | 新增完整页面取消不导航、保存失败时「更多」菜单仍可用用例 |
| `apps/web/src/features/side-panel/__tests__/launcher.test.tsx` | 修改 | 新增桌面宿主登记分区迁移/移除用例；懒加载宿主查询给足等待时间，避免全量并行下的偶发失败 |
| `apps/web/src/features/side-panel/__tests__/store-page-definition.test.ts` | 新增 | 覆盖 `openPage` 读取定义 `multiple` 与调用方显式覆盖 |
| `apps/web/src/features/side-panel/__tests__/mobile-flag.test.tsx` | 新增 | 覆盖 `mobile: false` 整页跳转与 `mobile: true` 打开覆盖层标签 |
| `apps/web/src/features/side-panel/__tests__/tabs.test.tsx` | 修改 | 去掉领域 hook 打桩，改为在 `noteApi` / `fileApi` 的 openapi-fetch 客户端层打桩；补齐五类正文加载/不可读/网络错误/重试/定位/侧栏内跳转与 `MoocTabBody` 目录展开、子条目打开、异常分支 |
| `apps/web/src/features/auth/__tests__/use-logout-mutation.test.ts` | 修改 | 新增登出清空侧栏内存状态断言 |
| `apps/web/src/features/ai/__tests__/use-conversations.test.tsx` | 修改 | 新增宿主未挂载时删除会话清理本地分区、保留其他分区并覆盖多个用户键的用例 |
| `apps/web/src/lib/ai/__tests__/resource-target.test.ts` | 修改 | 新增 `citationHref` 与 `resourceHref` 同一输入的参数化等价测试，覆盖六类、两端、可选字段与非法定位 |

## E2E

| 文件 | 状态 | 作用与原因 |
|---|---|---|
| `apps/web/e2e/support/agent-retrieval.ts` | 修改 | 新增移动返回取消保留草稿、桌面/移动完整页面取消、账号切换不残留上一位用户标签 4 条用例；新增保存失败拦截、侧栏笔记打开与草稿输入辅助；账号切换用例放到最后，避免撤销默认 E2E 会话影响其他用例；清理失败不阻断 |

## 文档

| 文件 | 状态 | 作用与原因 |
|---|---|---|
| `docs/ai-refactor/AI_CHAT_SIDE_PANEL_CODE_REVIEW.md` | 新增 | 评估报告原文，作为本轮修复依据一并入库 |
| `docs/ai-refactor/AI_CHAT_SIDE_PANEL_PLAN.md` | 修改 | 状态头与 §16 回写修复项、单测/E2E/构建/预算结果与未验证项 |
| `docs/ai-refactor/AI_MILESTONES.md` | 修改 | 追加 M19 评估报告修复记录与门禁结论 |
| `docs/ai-refactor/README.md` | 修改 | 更新右侧栏方案索引状态，新增评估报告条目 |
| `docs/changelist/2026-11-23-ai-chat-side-panel-review-fixes.md` | 新增 | 本清单 |

## 审计要点

1. **账号隔离靠“事件 + 模块级用户记录”两处兜底**：登出派发 `SIDE_PANEL_RESET_EVENT` 清内存；`persistence.ts` 的 `activeUserId` 能识别宿主卸载再挂载后的 A→B 切换。只改 localStorage 键不够，必须同时看进程内 store。
2. **移动返回守卫与历史标记成对处理**：`popstate` 后先读 store 确认是否真的关闭；守卫拒绝时必须 `pushState` 补回标记，否则下一次返回会直接离开页面。
3. **程序化导航统一走守卫**：桌面笔记用 `confirmLeave`，移动宿主用 `requestLeave`；以后新增「打开完整页面」类入口不要再直接 `router.push`。
4. **持久化只认严格会话键**：`chat:new*` 读取时忽略但不回写；恢复校验 `kind`/`ref.type` 与 id 唯一，避免旧数据让宿主渲染抛错。
5. **删除会话清理不依赖 UI 挂载**：`persisted-surfaces.ts` 按需加载并遍历所有用户键；会话 id 全局唯一，删除后任何用户都不应再恢复该标签。
6. **首屏预算仍红**：`/ai/chat` 310.7 / 310.0 KB，比此前接受的 310.6 多 0.1 KB；本轮没有上调预算，门禁保持失败。真实栈 E2E 编排报告里的 `harnessConfigRestored` / `harnessPrefetchRestored` 为 false（脚本比较口径），人工读取 Nacos 确认 `prefetch-enabled=false`。
