# 原生下拉框深色主题修复变更清单

## 概览

本批排查当前前端 `apps/web` 的全部 TSX 原生 `<select>`，修复 AI 检索范围、逻辑模型设置与代码块语言选择共 6 处原生弹层在深色主题下可能出现白底白字的问题，统一改用项目现有 Base UI/shadcn `Select` 与语义 Token。
AI 检索范围控件改为按会话布局懒加载，避免新引入的弹层运行时进入文档问答首屏共享包并突破体积预算。

共 **10 个文件：新增 2、修改 8、删除 0**；**新增 298 行、删除 122 行**（含本文件与新增测试工具，按未提交工作区统计）。
目录分布：`apps/web` 9 个文件，`docs/changelist` 1 个文件。

### 验证结果

| 命令 / 操作 | 实际结果 |
|---|---|
| 修复前运行 3 个相关测试文件 | **5 失败、7 通过**：失败点均为找不到带 `bg-popover text-popover-foreground` 的组件弹层，复现有效 |
| 修复后运行相同 3 个测试文件 | **3 文件、12 条全部通过** |
| 最终运行上述 3 文件及 `chat-panel.test.tsx` | **4 文件、17 条全部通过** |
| `pnpm --filter web test` | 首轮 **2156 通过、3 失败**；失败均在未改动的任务日期/时间用例，单独复跑这 2 个文件 **45 条全部通过**，未修改相关任务代码 |
| `pnpm --filter web typecheck` | 通过，无 TypeScript 错误 |
| `pnpm exec biome check`（本批 9 个前端改动文件） | 通过；全量 `pnpm --filter web lint` 另报 15 个未改动文件中的既有格式/导入顺序问题，本批未扩大重排范围 |
| `pnpm --filter web check:css-tokens` | 通过，68 个被引用自定义属性全部有定义 |
| `NEXT_DISABLE_STANDALONE=1 pnpm --filter web build` | 通过，37 个页面生成完成；默认 standalone 构建在本机仍因 Windows symlink 权限于追踪拷贝阶段报 EPERM |
| `pnpm --filter web bundle:budget` | 最终三项全通过：桌面 **307.7/310 KB**、移动端 **246.5/250 KB**、编辑器 **18.0/250 KB**；懒加载前曾为 320.2 KB 与 269.9 KB，已在交付前修正 |
| 最终生产构建的真实浏览器检查（`localhost:3100/ai/chat`，深色） | 懒加载后的检索范围 combobox 可见，展开项以蓝底白字正常显示，不再出现原生白色弹层；当前账号无知识库，临时建库未提交且未产生数据，多知识库场景由组件测试覆盖 |
| 模型设置与代码块真实浏览器检查 | 未逐页执行：当前账号无模型供应商管理权限且没有可编辑笔记；两处均由真实组件渲染、指针选择与主题类断言覆盖 |
| Playwright E2E | 未运行；真实 AI 检索用例需要脚本化供应商配置，本批仅同步自定义 combobox 的断言并由 TypeScript/构建检查覆盖 |

## apps/web — AI 对话

| 文件 | 状态 | 作用与原因 |
|---|---|---|
| `apps/web/src/features/ai/components/chat-scope-select.tsx` | 修改 | 检索范围改用带语义弹层色的 `Select`，保留全部/单库切换、未知已选库回显、加载与流式禁用行为 |
| `apps/web/src/features/ai/components/chat-panel.tsx` | 修改 | 检索范围按会话布局懒加载，避免 Select 运行时进入文档问答首屏共享包并造成体积回归 |
| `apps/web/src/features/ai/components/__tests__/chat-scope-select.test.tsx` | 修改 | 用真实指针事件验证主题弹层、单库/全部范围回调与禁用状态 |

## apps/web — 逻辑模型设置

| 文件 | 状态 | 作用与原因 |
|---|---|---|
| `apps/web/src/features/model-providers/components/logical-model-settings.tsx` | 修改 | 供应商、推理输出格式、模型和推理回传方式 4 个下拉框统一改用 `Select`，保留空供应商、未列出供应商与手动模型名口径 |
| `apps/web/src/features/model-providers/__tests__/logical-model-settings.test.tsx` | 修改 | 覆盖四类下拉框的主题弹层与选择行为，并继续校验保存 payload、手动输入和出境警告 |

## apps/web — 编辑器

| 文件 | 状态 | 作用与原因 |
|---|---|---|
| `apps/web/src/components/editor/extensions/code-block-shiki.tsx` | 修改 | 代码块语言选择改用 `Select`，弹层不再受系统原生配色影响，选择纯文本仍写回 `language: null` |
| `apps/web/src/components/editor/extensions/__tests__/code-block-shiki.test.tsx` | 修改 | 新增语言弹层主题与清除语言属性回归用例，保留只读编辑器不渲染选择器的检查 |

## apps/web — 测试工具与 E2E

| 文件 | 状态 | 作用与原因 |
|---|---|---|
| `apps/web/src/test/select.ts` | 新增 | 共用 Base UI 指针选择序列，并强制断言选项位于使用语义前景/背景色的组件弹层中，防止退回原生实现 |
| `apps/web/e2e/support/agent-retrieval.ts` | 修改 | 原生 select 的 value 断言改为自定义 combobox 的知识库名称断言，覆盖进入会话与刷新后的范围恢复 |

## 文档

| 文件 | 状态 | 作用与原因 |
|---|---|---|
| `docs/changelist/2026-11-22-select-dark-theme-fixes.md` | 新增 | 记录排查范围、逐文件改动、体积回归处理、验证结果与未执行项，供评审审计 |

## 审计要点

1. 修复后 `apps/web/src` 已没有实际原生 `<select>/<option>` JSX；搜索命中的两处仅为注册和账号设置页解释为何使用组件 `Select` 的注释。
2. `chat-panel.tsx` 的懒加载是体积门禁的一部分，不应为简化代码改回静态引入；最终桌面与移动端首屏均已回到预算内。
3. 行为兼容重点在空供应商与未列出供应商回显、手动模型输入、纯文本映射 `null`、流式禁用和只读编辑器，相关测试均在最终代码上通过。
4. 测试工具不仅检查回调，还检查弹层的 `bg-popover text-popover-foreground`，因此能覆盖本次白底白字的结构根因；真实浏览器已确认 AI 深色弹层可读。
5. 全量单测首轮有 3 条任务日期/时间抖动、全量 lint 有 15 条未改动文件的既有问题，均如实保留并单独复核，没有混入本批修复。
