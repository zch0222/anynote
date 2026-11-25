# 表格复制退化为 `[table]` 修复 changelist

## 概览

- 文件：新增 3 个、修改 2 个、删除 0 个，共 5 个（含本文件）。
- 行数：新增 543、删除 3 行（含本文件）。
- 分布：`packages/editor-core` 全部改动；`docs/changelist` 新增本文件。
- 范围：重写表格的 Markdown 序列化，修复复制/剪切时 `text/plain` 退化为 `[table]` 的数据丢失；不改 schema、不改解析规则、不改任何界面代码。
- 未纳入：既有未跟踪文件 `docs/ai-refactor/AI_CHAT_SIDE_PANEL_CODE_REVIEW_ROUND_3.md` 保持不动。
- 背景：AI 对话（`aiAnswer` 预设）与笔记编辑器复制时经 `tiptap-markdown` 把选区序列化成 Markdown 写入剪贴板纯文本。其内置表格实现只在「首行全为表头单元格、无合并单元格、每个单元格只有一个块」时输出管道表格，否则整体退化为 `[table]` 占位——用户从表头之后拖选、表格无表头、单元格带 colspan/rowspan 或多段落时全部命中，粘贴后只剩 `[table]` 一个字。

### 验证结果

| 命令或检查 | 结果 |
|---|---|
| `pnpm --filter @anynote/editor-core test` | 通过，4 个测试文件、50 条用例（含新增表格序列化 11 条与 schema 版本锁） |
| `pnpm --filter @anynote/editor-core typecheck` | 通过 |
| `pnpm exec biome check packages/editor-core/src` | 通过 |
| `pnpm typecheck`（turbo 全仓 6 个包） | 通过 |
| `pnpm --filter @anynote/collab test` | 通过，13 个测试文件、182 条用例 |
| `pnpm --filter web exec vitest run src/components/editor` | 通过，15 个测试文件、182 条用例（含 Markdown 往返对拍） |
| `pnpm --filter web exec vitest run src/features/ai` | 通过，21 个测试文件、167 条用例 |
| `pnpm test`（turbo 全仓） | web 有 2-4 条超时失败（`date-time-field` / `task-form-page` 日期浮层用例），与本次改动无关：**stash 本改动后的干净基线全量运行失败相同**，且同一批用例无论有无本改动隔离运行均 45/45 通过，失败形态为并发 contention 下的 5s 超时；其余包全部通过 |

## `packages/editor-core`

序列化规则改动集中在新增的 `extensions/table.ts`；两处接线把全仓所有编辑器预设（web 的 `full` / `readonly` / `aiAnswer`、协同服务的无界面转换器）统一换到新实现。

| 文件 | 状态 | 作用与原因 |
|---|---|---|
| `packages/editor-core/src/extensions/table.ts` | 新增 | 重写表格 Markdown 序列化：任何结构都输出 GFM 管道表格而不是 `[table]` 占位。切片缺表头或无表头表格先补空表头行再写分隔行，数据行不被提拔成假表头；合并单元格与多块单元格的内容压平进单元格不丢文本；单元格内 `|` 统一转义为 `\|`（markdown-it 拆单元格时会把 `\|` 还原为 `|` 再做行内解析，纯文本、双链 `[[a\|b]]`、行内代码、公式里的管道符都能精确往返）；hardBreak 与换行压平为空格；行内单元格数不一致按最大列数补齐。捕获单元格前显式 `state.write()` 冲刷前块惰性收尾，否则代码块等前块与表格粘连（往返对拍曾因此失败）。 |
| `packages/editor-core/src/core-extensions.ts` | 修改 | `coreExtensions()` 改用 `CoreTable` 替换直接来自 `@tiptap/extension-table` 的 `Table`，web `full` 预设与协同服务转换器随之生效。 |
| `packages/editor-core/src/index.ts` | 修改 | 导出 `CoreTable`，并把对外再导出的 `Table` 指向 `CoreTable`（扩展名仍为 `table`，schema 不变），`aiAnswer` / `readonly` 预设经此引用自动生效。 |
| `packages/editor-core/src/__tests__/table-serialize.test.ts` | 新增 | 11 条行为测试：标准表格字节兼容、全选/整表复制、缺表头切片补空表头且重解析后数据完整、无表头表格、合并单元格、多段单元格、hardBreak 压平、纯文本与双链内管道符转义及重解析。选区用例用 `TextSelection` 落在「笔记」到「报告.pdf」文本之间，复现用户从表头后拖选的路径。 |

## `docs/changelist`

| 文件 | 状态 | 作用与原因 |
|---|---|---|
| `docs/changelist/2026-11-26-table-copy-serialization.md` | 新增 | 记录本批修复的改动面、验证结果与评审重点。 |

## 审计要点

- **schema 未变，`EDITOR_SCHEMA_VERSION` 不递增**：`CoreTable` 由 `@tiptap/extension-table` 的 `Table` `.extend()` 而来，节点名、属性、content 表达式全部不变，`schema-lock.json` 摘要只覆盖 schema 结构（不含 Markdown 序列化规则），版本锁测试通过即证明无漂移；且同一摘要不能登记在两个版本号下，纯序列化规则改动在机制上也无法递增。解析侧仍由 markdown-it 内置管道表格规则处理，序列化合法输出格式未变，web 与协同服务转换方向不受影响。
- **标准表格输出与原实现逐字节一致**：`|` 包裹、单元格间 ` | `、分隔行 `| --- | --- |` 的格式都对拍了精确往返；行为变化只发生在原先退化为 `[table]` 的场景。唯一的输出差异是单元格内 `|` 现在转义为 `\|`（原先不转义、重解析会把单元格拆散），属 fidelity 修正。
- **空表头行的取舍**：GFM 管道表格强制要求表头行，缺表头切片/无表头表格补 `|  |  |` 空表头而非把第一行数据提拔成表头——后者重解析后数据行的语义会被篡改。纯文本阅读时空表头行略噪，但数据零丢失且重解析后仍是表格。
- **`state.write()` 前置冲刷不能省**：prosemirror-markdown 的块间空行是惰性的（`flushClose`），单元格捕获缓冲区会吞掉前块收尾换行导致表格与前块粘连；往返对拍（`03-code-and-table.md`）曾精确暴露这一点，勿在精简代码时删掉。
- **粘贴侧无需改动**：AI 对话输入框是纯 `textarea`，粘贴逐字采用剪贴板 `text/plain`，修复复制侧序列化后粘贴即得到完整管道表格。
