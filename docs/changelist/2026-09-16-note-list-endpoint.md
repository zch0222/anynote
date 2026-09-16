# 新建笔记在知识库列表不可见（端点选错）修复

- **日期**：2026-09-16
- **分支**：`dev`（工作区直接修复）
- **上一批**：`docs/changelist/2026-09-16-ui-supplement.md`（UI 补稿落地）
- **触发问题**：用户报障「新建笔记接口有问题，新建完成之后知识库里没有」
- **相关批次**：`docs/changelist/2026-09-14-ui-redesign.md`（该批已发现此现象，但**归因错误**并挂起，见下）

## 概览

用户报障的现象是「新建笔记成功后，知识库里看不到这篇笔记」。根因不是后端写入失败
——笔记**确实创建成功**，单条详情也能读到——而是**前端列表查错了端点**。

`apps/web` 的知识库笔记列表一直用的是 `GET /notes`，这个端点的 SQL
（`NoteMapper.xml` 的 `selectNoteList`）是 `FROM n_note_operation_log LEFT JOIN n_note`，
**只有产生过操作日志的笔记才会出现**；而操作日志由 RocketMQ 消费者
（`NoteMessageListener.generateNoteEditLog`）在**内容 diff 非空**时才写。
`createNote` 只投递 `GENERATOR_NOTE_INDEX`、不写日志，于是「新建后没编辑过」的笔记
在这条查询下恒不可见——用户建完就走，看到的必然是空列表。

修法是让列表改走 `POST /notes/bases/{baseId}`（`selectNoteInfoList`，`FROM n_note`）。
这与 legacy 前端、CLI 的既有做法一致：

| 调用方 | 知识库内列表 | 「我最近操作过的」 |
|--------|--------------|-------------------|
| `apps/web-legacy` | `POST /notes/bases/{id}`（`getNoteInfoList`） | `GET /notes`（`getNoteList`，仅首页小部件） |
| `apps/cli` | `POST /notes/bases/{id}`（`note list --base`） | `GET /notes`（`note recent`） |
| `apps/web`（改前） | **`GET /notes`（错）** | 无 |
| `apps/web`（改后） | `POST /notes/bases/{id}` | 无（不提供该语义） |

两条端点分工是有意的、不是重复实现：`GET /notes` 的语义是「我最近操作过的笔记」，
CLI 的 `note recent` 正是靠它。新前端当初把两者合并成一条，才丢掉了新建即可见的能力。

> **对 `2026-09-14-ui-redesign.md` 的更正**：该批把这现象记为「发现的既有后端缺陷（本批不修，单独跟）」，
> 并写「后端修复另开工单」。这个归因是错的——**后端没有缺陷**，`GET /notes` 的行为
> 与设计一致，是前端选错了端点；而且那个「工单」从未建立，问题就此静默留在了 `dev` 上。
> 本批同时把该文档的结论改正，避免后人继续按「等后端修」的思路处理。

| 项目 | 数量 |
|------|------|
| 新增文件 | 1（本清单） |
| 修改文件 | 12 |
| 删除文件 | 0 |
| 增 / 删行数 | 已跟踪文件 +194 / −74；含新增文件共 +347 / −74 |

按目录分布：`apps/web/src/features/notes/**`（3 个）、`apps/web/src/features/ai/**`（2 个）、
`apps/web/e2e/**`（5 个）、`biome.json`（1 个）、`docs/changelist/**`（2 个，含本清单）。

> 复核命令（编写时以输出为准）：`git status --porcelain | sort`、`git diff --stat`、
> `git ls-files --others --exclude-standard`。

## 笔记列表端点

| 文件 | 状态 | 作用与原因 |
|------|------|-----------|
| `apps/web/src/features/notes/use-notes.ts` | 修改 | `useNotesQuery` 由 `GET /notes?knowledgeBaseId=` 改为 `POST /notes/bases/{baseId}`，请求体只带 `page`/`pageSize`（知识库以路径为准，后端 `setKnowledgeBaseId` 会覆盖请求体，避免两处 id 不一致时不知道该信哪个）。注释写明「为什么必须用这个端点」——这是正确性问题，以后有人「顺手统一成 GET /notes」就会把 bug 带回来。6 个调用方（列表页 / 侧栏目录 / 移动端列表 / 工作台 / 两个提交任务入口）共用这一个 hook，一处修全修好 |

## 回归用例

先写复现用例再改代码（仓库强制约定），两个用例都验证过「改前失败、改后通过」。

| 文件 | 状态 | 作用与原因 |
|------|------|-----------|
| `apps/web/src/features/notes/__tests__/use-notes.test.tsx` | 修改 | 新增用例断言 `useNotesQuery` 必须打 `POST /notes/bases/{baseId}` 且**不得**调用 `GET /notes`，把端点选择本身锁死。原 4 条用例的桩从 `GET` 改为 `POST` |
| `apps/web/src/features/notes/components/__tests__/note-list.test.tsx` | 修改 | 列表页组件用例的桩按端点分发（`routeGet` 去掉 `/notes`，新增 `routePost`）。**这条用例原本掩盖 bug**：它给 `GET /notes` 打桩返回数据，所以端点错也能通过 |
| `apps/web/e2e/notes.spec.ts` | 修改 | 新增独立 `describe`「新建笔记：未编辑也必须在库里可见」：建库 → 库内新建笔记 → **一个字都不输入** → 回列表断言 `note-row-<id>` 可见 → 刷新后仍在。刻意放在独立 describe，因为它必须**不经过编辑器输入**；原先那条「新建的笔记出现在列表里」之所以一直是绿的，是因为同一 serial 组的上一条用例先往编辑器里敲了字，产生了操作日志——即旧用例**只在有日志时才成立** |

## 顺带修掉的 E2E 顺序脆性

新增用例会被 `pdf-upload.spec.ts` 的失败牵出来：它多建了一个知识库，而它「最近更新」
（`/bases` 按 `update_time desc` 排序），PDF 页默认自动选中第一个库，于是那个文件里
`getByRole("button", { name: /选择知识库|E2E 知识库/ })` 按库名匹配的定位失效——
**该文件单独跑 3/3 通过，与 `notes.spec.ts` 同跑必挂 2 条**。

| 文件 | 状态 | 作用与原因 |
|------|------|-----------|
| `apps/web/src/features/ai/components/pdf/pdf-page.tsx` | 修改 | 知识库选择器的 `DropdownMenuTrigger` 加 `data-testid="pdf-base-select"`。它的可访问名是**当前选中库的名字**，而「当前选中」默认是最近更新的那个库——按名字定位必然随执行顺序漂移 |
| `apps/web/e2e/pdf-upload.spec.ts` | 修改 | `selectKnowledgeBase` 改用 testid 定位触发器，不再按库名匹配；注释写明原因 |
| `apps/web/src/features/ai/components/pdf/__tests__/pdf-page.test.tsx` | 修改 | 断言该 testid 存在，防止以后有人删掉它、让 E2E 又退回按名匹配 |

## 工具链

| 文件 | 状态 | 作用与原因 |
|------|------|-----------|
| `biome.json` | 修改 | `files.ignore` 补 `apps/web/e2e/.auth`。该目录是 Playwright 的生成态（已在 `apps/web/e2e/.gitignore` 里），但没进 Biome 忽略表，于是 `biome check apps/web/e2e` 会**直接报 2 个 format 错误**（顶层 `pnpm check` 因为带 `--write` 会顺手改掉它，所以此前没暴露）。补上之后 `biome check`（不带 `--write`，即 CI 口径）也干净 |

## 清除沿用错误归因的注释

错误归因一旦写进代码注释就会自我复制——本次在三个 E2E 文件里都发现了它，
不清理的话下一个读代码的人仍会按「后端缺陷」理解。这些是纯注释改动，
**不断言、不改行为**，改完重跑了受影响的 6 个 spec（51 passed）。

| 文件 | 状态 | 作用与原因 |
|------|------|-----------|
| `apps/web/e2e/ui-redesign.spec.ts` | 修改 | 原注释写「当前后端只有写过内容才会让笔记出现在列表里……这是既有的后端缺陷」，改为说明「根因是前端选错端点，已修」；并点明保留那次输入只为贴合真实用法，「新建未编辑即可见」由 `notes.spec.ts` 的独立用例守着 |
| `apps/web/e2e/loading-system.spec.ts` | 修改 | 两处：①「建完必须写正文，否则不会进列表」的注释更正为「保留写正文是因为要验纸面限宽」；②**删掉保存后对 `GET /notes` 的轮询**——那层等待纯粹是为绕开 MQ 写操作日志的时序（全量跑偶发失败），改用 `FROM n_note` 的端点后该依赖消失，只等 `[data-status="saved"]` 即可，「确实出现在列表里」由紧随其后的 `firstRow` 断言负责 |
| `apps/web/e2e/mobile-core.spec.ts` | 修改 | 原注释写「列表走 `selectNoteList`，只有写过正文的笔记才会出现（既有后端缺陷）」，更正为「补第二篇是为了凑够两行验分隔线」。该用例的 `toHaveCount(2)` 仍然成立——它依赖的是本文件自己先后创建两篇，与端点口径无关 |

## 审计要点

1. **根因是端点选错，不是后端写入失败**。排查时先看到的是「创建返回 00000、但列表 0 行」，
   很容易往「事务没提交 / 数据范围过滤吃掉了」方向查。决定性证据是**单条详情能读到
   （`GET /notes/{id}` → 00000）但列表读不到**，以及 `n_note_operation_log` 里没有该笔记的行。
   本次实测：新建后 `POST /notes/bases/{id}` 有 1 行、`GET /notes` 0 行；编辑一次之后
   `GET /notes` 才出现该笔记。
2. **两条端点的语义差别是设计，不是冗余**。`GET /notes` = 「我最近操作过的笔记」，
   CLI 的 `note recent` 依赖它。评审时不要因为「看起来重复」就把它们合并。
3. **旧 E2E 用例为什么会漏掉这个 bug**，值得单独看：`notes.spec.ts` 是 `serial` 模式，
   「新建的笔记出现在列表里」跑在同组「输入会自动保存」之后，而输入会产生操作日志。
   换句话说**它验证的是「编辑过的笔记可见」，而不是它标题声称的「新建的笔记可见」**。
   新用例用独立 describe + 不输入来切断这个耦合——这类「被前序用例的副作用喂绿」的用例
   在评审时值得专门找一找。
4. **`2026-09-14-ui-redesign.md` 的归因需要一起读**。那批把同一现象判成后端缺陷并挂起，
   导致问题在 `dev` 上留了两天。教训是：**跨端问题时先确认「失败的那一端是否真的该失败」**，
   `GET /notes` 的行为完全符合它自己的语义。
5. **数据侧遗留**：全库仍有 230 篇笔记没有操作日志（本次修前实测 `n_note` 386 篇中 230 篇无日志）。
   这些笔记此前在列表里不可见，修复后一并可见——这是预期的、也是本次修法的直接结果。
   它们的历史版本面板仍会是空的（历史版本本就依赖操作日志），那是另一件事，不属于本批。

## 验证结果

| 命令 | 结果 |
|------|------|
| `pnpm --filter web test` | **148 文件 / 1700 用例全绿**（本批起点 1699，新增 1 条 testid 用例） |
| `pnpm --filter web test:e2e` | **119 passed / 0 failed / 0 skipped**（本批起点 118，新增 1 条回归用例） |
| `pnpm exec tsc --noEmit`（apps/web） | 0 error |
| `pnpm check` | Checked 602 files，No fixes applied |
| `biome check apps/web/src apps/web/e2e`（不带 `--write`，CI 口径） | Checked 462 files，No fixes applied |
| `pnpm --filter web bundle:budget` | PASS（300.4 / 310 KB；移动端 250.0 / 250；编辑器 14.1 / 250） |

### 真实浏览器走查（按用户要求，Chrome + 真实 Docker 全栈）

用 Playwright 驱动真实 Chrome 走完整用户流程，**控制台错误 0**：

| 步骤 | 结果 |
|------|------|
| 真实 UI 登录 | 落到 `/dashboard` |
| 新建知识库 | `baseId=548` |
| 库内「新建笔记」→ **建完一个字都不输入** | `noteId=2966`，跳进编辑器 |
| **回列表（关键）** | ✓ 可见，行内容「走查笔记140123 刚刚」 |
| 刷新 | ✓ 仍在 |
| 再建第二篇（列表页入口） | ✓ 可见，列表 2 行 |
| 编辑并保存 | ✓ 已保存；刷新后正文含标记 |
| 双端点对照（同一账号同一时刻） | `POST /notes/bases/{id}` → total=2 `[2966, 2967]`（含两篇未编辑的）；`GET /notes` → `[2966]`（只有编辑过的那篇） |
| 侧栏目录 | ✓ 命中该笔记链接 |

双端点对照这一行的意义：它同时证明了「修复生效」（KB 端点含未编辑笔记）和
「根因判断正确」（旧端点只含编辑过的）。

### 复现用例的有效性（改前失败 / 改后通过）

| 用例 | 改前 | 改后 |
|------|------|------|
| `use-notes.test.tsx`（端点断言） | ✗ 4 failed / 1 passed | ✓ 5 passed |
| `notes.spec.ts`「未编辑也必须在库里可见」（真实浏览器） | ✗ 1 failed（`note-row-*` 不可见） | ✓ 1 passed |
| `use-notes.test.tsx` 改前失败**原因** | 断言 `POST /notes/bases/{baseId}` 被调用，实际调用的是 `GET /notes` | — |

## 未完成项与偏差

1. **未做真机验收**：本次走查全部在桌面 Chrome（真实栈）。移动端 `/m/notes/[baseId]`
   复用同一个 `useNotesQuery`，单测与 E2E（`mobile-*` 41 条）均通过，但没有在真机上点过。
2. **未处理历史版本空态**：上面审计要点 5 提到的 230 篇无日志笔记，其「历史版本」面板仍会是空的。
   这属于历史版本功能的既有语义（依赖操作日志），不在本次报障范围内。
3. **未新增后端端点、未改 OpenAPI**：本次只改前端调用的端点，`openapi/specs/*.json` 无变化，
   因此不需要跑 `pnpm openapi:generate`。
4. **E2E 数据累积问题依旧**：与上一批相同，`ensureKnowledgeBase` 用固定库名，
   多轮运行会在同一账号下堆积知识库；本次新增的用例改用**带时间戳的库名**避免撞名，
   但既有用例未动（改动面超出本次范围）。
