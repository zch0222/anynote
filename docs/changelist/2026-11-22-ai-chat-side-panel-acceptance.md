# AI 对话右侧栏：补做与验收进度

日期：2026-11-22
方案：[`docs/ai-refactor/AI_CHAT_SIDE_PANEL_PLAN.md`](../ai-refactor/AI_CHAT_SIDE_PANEL_PLAN.md)
范围：`apps/web`（含 E2E 支撑文件）；不改后端、OpenAPI、SQL、Nacos 配置的最终状态。
状态：**代码与单元测试完成，真实栈 E2E 通过；Lighthouse 桌面通过、移动端仅无关路由未达门槛；视觉截图已生成待人工确认；改动随本批提交到 `dev`。**

## 概览

| 项 | 数量 |
|---|---|
| 修改文件 | 14（11 个代码/测试 + 3 个文档） |
| 新增文件 | 1（本 changelist） |
| 删除文件 | 0 |
| 已跟踪文件增删行 | +493 / −25 |

代码改动集中在 `apps/web/src/features/side-panel/**`、`apps/web/src/features/ai/components/mobile/chat-mobile.tsx`、
`apps/web/src/features/auth/__tests__/use-logout-mutation.test.ts` 与 `apps/web/e2e/support/agent-retrieval.ts`。

验证结果：

| 命令 | 结果 |
|---|---|
| `pnpm exec vitest run`（本批 3 个测试文件） | **3 files / 18 tests passed** |
| `pnpm test`（全量） | 196 files / 2250 tests，**2247 passed / 3 failed**；失败为既有任务日期控件 5s 超时（`date-time-field.test.tsx` 2 条、`task-form-page.test.tsx` 1 条），本次未修改相关代码 |
| `pnpm typecheck` | passed |
| `pnpm exec biome check`（本批 11 个文件） | passed |
| `NEXT_DISABLE_STANDALONE=1 NEXT_PUBLIC_APP_URL=http://localhost:3107 pnpm build` | 编译与静态页生成成功 |
| `pnpm bundle:budget` | **FAIL**：`/ai/chat` **310.5 KB / 310.0 KB**；移动端 247.3 / 250 通过；编辑器 18.0 / 250 通过 |
| `python tmp/m19-side-panel/run_e2e.py` | **16 passed / 6 skipped，约 1.4 分钟**；`playwrightPassed=true`，`agentMainRestored=true`，`providerDeleted=true`，`containerRemoved=true` |
| `lighthouse:budget`（桌面，`E2E_BASE_URL=http://localhost:3107`） | 五条路由全部通过；`/ai/chat` Performance 99 / Accessibility 96 |
| `lighthouse:budget:mobile` | `/m/ai/chat` 88 / 96 通过；`/m/dashboard` 79、`/m/notes` 83 未达 85；改用 Docker web `:3000` 复跑同样失败（79 / 82），判定与本批无关 |
| 视觉验收截图 | `tmp/m19-side-panel/visual/` 下 10 张：桌面 1920/1440/1280/1024 × 深浅，移动 390×844 × 深浅；待人工确认 |

## 侧栏容器与桌面宿主

| 文件 | 状态 | 作用与原因 |
|---|---|---|
| `apps/web/src/features/side-panel/desktop/host.tsx` | 修改 | 覆盖呈现下，焦点在标签条或标签头上按 Esc 收起；收起后把焦点交回「展开右侧栏」按钮；在 store 展开状态变化与持久化恢复时维护全局展开标记 |
| `apps/web/src/features/side-panel/desktop/tab-bar.tsx` | 修改 | 标签条根节点增加 `data-side-panel-bar` 供 Esc 作用域判断；关闭活动标签后把焦点移到新的活动标签 |
| `apps/web/src/features/side-panel/desktop/tab-header.tsx` | 修改 | 标签头根节点增加 `data-side-panel-header`，使覆盖态 Esc 在标签头生效、在正文内不生效 |
| `apps/web/src/features/side-panel/launcher.tsx` | 修改 | 新增 `restoreOpen` 开关；桌面首屏读取并消费全局展开标记，刷新后重新挂载宿主并恢复展开；移动端传 `false` 时保持关闭 |
| `apps/web/src/features/side-panel/storage-keys.ts` | 修改 | 新增全局展开标记与标签数量标记的读写；两者都使用 `anynote-ai-side-panel:` 前缀，登出时随现有前缀清理一起删除 |

## 移动端

| 文件 | 状态 | 作用与原因 |
|---|---|---|
| `apps/web/src/features/side-panel/mobile/host.tsx` | 修改 | 标签数量变化时写入全局数量标记，供刷新后首屏显示「已打开的内容（n）」 |
| `apps/web/src/features/ai/components/mobile/chat-mobile.tsx` | 修改 | 移动端 provider 传 `restoreOpen={false}`，覆盖层始终从关闭开始；首屏在客户端读取上次标签数量，刷新后入口仍可重新展开并恢复标签 |

## 测试

| 文件 | 状态 | 作用与原因 |
|---|---|---|
| `apps/web/src/features/side-panel/__tests__/launcher.test.tsx` | 修改 | 新增覆盖态 Esc 生效范围、收起后焦点回到展开按钮、刷新前展开标记恢复、`restoreOpen=false` 不自动展开 |
| `apps/web/src/features/side-panel/__tests__/tab-bar.test.tsx` | 修改 | 新增关闭活动标签后焦点移到新的活动标签 |
| `apps/web/src/features/auth/__tests__/use-logout-mutation.test.ts` | 修改 | 新增登出只删除 `anynote-ai-side-panel:` 前缀键、保留其它本地数据的断言 |

## E2E

| 文件 | 状态 | 作用与原因 |
|---|---|---|
| `apps/web/e2e/support/agent-retrieval.ts` | 修改 | 按 M19.7 补齐：资料引用在侧栏/覆盖层定位第 2 页；移动端返回手势关闭覆盖层且消息保留；移动端覆盖层内编辑笔记并保存；移动端去重、刷新恢复与「已打开的内容（1）」入口；移动端登出清理侧栏本地键；桌面去重用例增加引用列表去重与刷新后不恢复定位的断言；新增桌面四档宽度深浅两色与移动 390×844 深浅两色的视觉截图用例；同时修正两处既有测试脆弱点（自定义 combobox 用 `toContainText`、会话列表用 `aside.w-72` 定位） |

E2E 使用 `tmp/m19-side-panel/run_e2e.py` 编排：临时启动 M16.6 本地脚本模型容器、新增临时供应商、把 `a_logical_model.agent_main` 指向它，并在 Nacos `anynote-ai-harness.yml` 临时打开 `prefetch-enabled`；同时设置 `E2E_SIDE_PANEL_VISUAL=1` 生成视觉截图。结束后恢复 `agent_main`、删除供应商与容器、恢复 Nacos。原始日志与报告在 `tmp/m19-side-panel/e2e.log`、`tmp/m19-side-panel/e2e-report.json`，截图为 `tmp/m19-side-panel/visual/`。

## 文档

| 文件 | 状态 | 作用与原因 |
|---|---|---|
| `docs/ai-refactor/AI_CHAT_SIDE_PANEL_PLAN.md` | 修改 | 状态头与 §16 回写第二批补做、E2E/Lighthouse/视觉结果与预算待确认项 |
| `docs/ai-refactor/AI_MILESTONES.md` | 修改 | M19.3/M19.7 与门禁段落更新为实际执行结果 |
| `docs/ai-refactor/README.md` | 修改 | 方案索引中的 M19 状态更新 |
| `docs/changelist/2026-11-22-ai-chat-side-panel-acceptance.md` | 新增 | 本清单 |

## 审计要点

1. **刷新恢复使用全局展开标记，不是每用户状态**：`anynote-ai-side-panel:open` 只表示「刷新前是否展开」，不包含标题、资源标识或定位；每个用户的标签仍由 `anynote-ai-side-panel:v1:<userId>` 隔离。共享电脑上最多出现一次空侧栏，不会显示上一位用户的资源。移动端通过 `restoreOpen={false}` 不自动展开。
2. **移动端入口数量也是全局标记**：`anynote-ai-side-panel:tabs` 只存数量，用于刷新后显示「已打开的内容（n）」；点击后宿主挂载并按当前用户持久化状态恢复标签。
3. **Esc 的作用域**：只在 `layout.mode === "overlay"` 且事件目标位于 `[data-side-panel-bar]` 或 `[data-side-panel-header]` 时收起；焦点在编辑器、PDF 等正文内不处理，避免与编辑器菜单冲突。
4. **焦点规则**：收起侧栏后由宿主在下一帧聚焦 `[aria-label="展开右侧栏"]`；关闭活动标签时只有焦点原本在标签内才迁移，避免鼠标中键关闭时抢焦点。
5. **首屏预算仍差 0.5 KB**：`/ai/chat` 310.5 / 310.0。此前用户接受的是 310.3（超 0.3 KB）；本次刷新恢复修复又增加 0.2 KB，**超出此前接受值**，需用户决定是否接受或继续压缩。
6. **两处 E2E 断言修正属于测试侧**：自定义 combobox 的触发器文本包含下拉箭头，`toHaveText` 改为 `toContainText`；应用侧栏本身也是 `<aside>`，会话列表改用 `aside.w-72` 定位。产品行为未改。

## 未完成 / 待确认

- **首屏预算**：310.5 / 310.0，超 0.5 KB，比此前接受的 0.3 KB 多 0.2 KB。未调整预算，待确认是否接受或继续压缩。
- **Lighthouse 移动端**：`/m/ai/chat` 通过；`/m/dashboard` 79、`/m/notes` 83 未达 85，改用 Docker web `:3000` 复跑同样失败（79 / 82），与本批无关。
- **视觉验收**：10 张截图已生成，待人工确认；未做自动化视觉判定。
- **协同构建**：`NEXT_PUBLIC_COLLAB_NOTES=1` 下侧栏与新标签页同时编辑未验证。
- **全量单测**：3 条既有任务日期控件失败，未修改相关代码。
- **Nacos 恢复核对**：编排报告里的 `harnessConfigRestored` / `harnessPrefetchRestored` 为 `false`，原因是发布后立即读取存在时序；运行结束后直接查询 Nacos，`harness.prefetch-enabled` 已为 `false`，配置已恢复。
- **提交状态**：本批改动随提交进入 `dev`，提交哈希见 `git log`。
