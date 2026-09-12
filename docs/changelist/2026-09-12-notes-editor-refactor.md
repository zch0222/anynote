# 2026-09-12 笔记 / 知识库模块重构（编辑器高度 · 误报冲突 · 代码块样式）

修掉用户报的三个 bug，并把端到端覆盖补到能挡住它们复发的程度：

1. **编辑器高度没占满** —— 编辑区是内容高度（`min-height: 320px`），页头之下大片留白，长文把整页顶长；
2. **正常编辑也弹冲突弹窗** —— 前端手里的乐观并发版本号会过期，A0409 被无差别当成真冲突；
3. **代码块样式异常** —— 「透明文字 + 绝对定位高亮层」两层对不齐，且 `prose` 给 `pre` / `code` 加了深色底和反引号。

顺带修了两个在排查过程中撞到的问题：笔记里插图一直没接上上传实现；
`infra/Dockerfile.web` 漏拷 `packages/api-core`，导致 `dev` 分支的前端**根本构建不出镜像**。

## 概览

| 项 | 数量 |
|----|------|
| 修改文件 | 15 |
| 新增文件 | 3（2 个单测 + 本清单） |
| 行数 | +905 / −178（`git diff --stat`），新增单测 204 行 |

按目录分布：`apps/web/src` 10 个文件、`apps/web/e2e` 1 个、`infra/` 2 个、仓库根文档 2 个、`docs/changelist/` 1 个。

### 验证结果

| 命令 | 结果 |
|------|------|
| `pnpm test`（Turborepo 全仓） | ✅ 5 个 package 全绿；`web` 67 文件 **619 tests**（改前 595） |
| `pnpm --filter web typecheck` | ✅ 无输出 |
| `pnpm check`（Biome） | ✅ Checked 347 files，No fixes applied |
| `docker compose ... build anynote-web` | ✅ 修 Dockerfile 前失败（`Can't resolve '@anynote/api-core/*'`），修后成功 |
| `pnpm --filter web test:e2e`（真实 Docker 栈） | ✅ **20 passed**（改前 15，本轮 +5） |
| `pnpm --filter web bundle:budget` | ✅ `/notes/[baseId]/[noteId]` **293.1 KB** / 预算 300 KB；编辑器 chunk 10.9 KB / 250 KB |
| `pnpm --filter web lighthouse:budget` | ✅ 5 条路由 Performance 97–100、Accessibility 100 |
| 回归有效性抽查 | 把 `use-save-note.ts` 切回旧版跑单测：新增的 5 条冲突/版本号用例**全部失败**，改回后全绿 |

E2E 跑在已在运行的 Docker 全栈上（web 容器重新构建后替换）。
执行期间为让浏览器处于 secure context（`crypto.randomUUID` 需要），
临时把 web 构建参数与 collab 的允许来源切到 `localhost:3000`，**跑完已还原成原来的
`http://192.168.3.90:3000` / `ws://192.168.3.90:3000/collab`**，容器现处于 healthy。

## apps/web —— 笔记数据层

冲突误报的根因在这一层：版本号来源不对，且 A0409 没有区分「真被人改了」和「令牌过期了」。

| 文件 | 状态 | 作用与原因 |
|------|------|-----------|
| `src/features/notes/use-save-note.ts` | 修改 | 版本号改为**只由保存响应推进**（原来跟随 `initialVersion`，而它由详情缓存的 `updateTime` 派生，卸载时的 keepalive 落盘不会刷新缓存，于是过期令牌被固化）；新增 `baseRef` 记录「上次已知的服务端内容」，收到 A0409 先回读服务端与基线比对，内容一致就静默换号重发、不一致才弹冲突；`flushOnUnload` 追加把草稿写回详情缓存 + 失效详情查询（否则 SPA 返回时编辑器拿旧正文当初值，等于凭空回滚一次编辑）；修复请求进行中到期的 debounce 被 `inFlight` 吞掉、改动一直挂着没人发的问题 |
| `src/features/notes/__tests__/use-save-note.test.tsx` | 修改 | 新增 7 条：版本号不被 `initialVersion` 顶回、只 seed 一次、飞行中改动自动补发、令牌漂移静默重发、换号仍失败退回 error、真冲突才弹窗、卸载 flush 的缓存写回与失效。其中 5 条在旧实现上必挂 |

## apps/web —— 编辑器与代码块

代码块从「叠两层 DOM」改成「给正文贴 ProseMirror 装饰」，两层对齐问题从根上消失。

| 文件 | 状态 | 作用与原因 |
|------|------|-----------|
| `src/lib/editor/shiki.ts` | 修改 | 用同步的 `tokenize()` + 异步的 `prepareHighlight()` 取代 `highlightToHtml()`——装饰必须和 `EditorState` 在同一拍算出来，异步高亮拿不到；新增 LRU 分词缓存（每次按键都会重新请求同一段代码）；`SUPPORTED_LANGUAGES` 去掉 `plaintext`/`txt` 等会被归一化成 `text` 的重复项；导出 `resetHighlighterForTest` 供用例隔离 |
| `src/components/editor/extensions/code-block-shiki.tsx` | 修改 | 删掉绝对定位的高亮层与 `color: transparent` 的可编辑层，改为 ProseMirror 插件按代码块产出行内装饰；语法未加载时先渲染纯文本、加载完用 meta 事务重画；NodeView 只保留语言下拉框，且只读编辑器不再渲染它（原来只读预览里也能改语言） |
| `src/components/editor/extensions/__tests__/code-block-shiki.test.tsx` | **新增** | 装饰位置落在代码块范围内、语法未就绪时报告待加载语言、无代码块不产装饰、渲染出的是单层可见文本（旧的 `__preview` / `__body` 已消失）、只读不渲染下拉框 |
| `src/lib/editor/__tests__/shiki.test.ts` | 修改 | 补同步分词的契约：未就绪返回 `null`、就绪后 token 带 `--shiki-light/dark` 且不含写死的 `color`、offset 跨行连续累计（装饰位置换算的前提）、缓存命中返回同一数组 |
| `src/styles/tiptap.css` | 修改 | 代码块重写为单层 `pre`；用「祖先类 + 自身类」把特异度抬到 `prose` 之上，复位 `code::before/::after` 的反引号和 `pre` 的深色底（`@tailwindcss/typography` 与自定义代码块冲突，谁先加载都不能赌）；`__surface` 加 `overflow-y: auto`，否则容器的 `overflow: hidden` 会把超长正文直接裁掉 |
| `src/components/editor/core/tiptap-editor.tsx` | 修改 | 新增 `fill` 属性 → `data-fill`，声明「外层已给定高度」，配合 CSS 让正文撑满可滚动区，正文下方空白处点击也能聚焦 |
| `src/components/editor/__tests__/editor.test.tsx` | 修改 | 补 `fill` 的两条：默认不带 `data-fill`；`fill` 时标记属性且 `className` 原样落到根节点（否则 `flex-1` 撑不起来） |

## apps/web —— 笔记页面

| 文件 | 状态 | 作用与原因 |
|------|------|-----------|
| `src/features/notes/components/note-editor.tsx` | 修改 | 布局改成 `h-[calc(100svh-9rem)]` + flex 列（与 `/ai/chat`、`/ai/pdf`、`/ai/workflow` 同一套），编辑器 `fill` + `flex-1 min-h-0` 吃满剩余高度；目录侧栏从写死的 `100vh-9rem` 改成 `h-full`；接上图片上传（此前没传 `uploadFn`，笔记里插图一直提示未配置），实现用动态 `import` 拉取，避免把分片上传压进首屏 JS |
| `src/features/notes/components/__tests__/note-editor.test.tsx` | **新增** | 外层容器带视口高度与 `min-h-0`、编辑器声明 `fill` 且占剩余高度、`uploadFn` 已接上、加载失败展示错误而不是空编辑器 |
| `src/features/collab/components/doc-workspace.tsx` | 修改 | 协同文档页同样传 `fill` + `min-h-0`：它本来就把编辑器放在 `h-full` 容器里，但编辑区没有内部滚动，长文会被容器的 `overflow: hidden` 裁掉 |

## apps/web —— 端到端

| 文件 | 状态 | 作用与原因 |
|------|------|-----------|
| `e2e/notes.spec.ts` | 修改 | 原 3 条保留，新增 5 条盯住这次修的行为：编辑区占满视口且长文在编辑器内滚动（整页无纵向溢出）、离开笔记再走客户端路由回来继续编辑不弹冲突（必须走 SPA 导航才能保留 query 缓存、复现过期令牌）、连续多轮编辑都能落盘、代码块有高亮且正文本身可见（断言 `color` 不是 `transparent`、旧高亮层不存在）、行内代码没有 prose 的反引号 |

> 「离开再回来」那条第一次跑就抓到了本轮改动没覆盖到的一半问题——
> 服务端版本对上了，但缓存里的**正文**还是落盘前的旧值，回来后编辑等于回滚一次。
> `flushOnUnload` 的缓存写回就是这条用例逼出来的。

## infra —— 前端镜像构建

`b19a649`（数据层改引用 `@anynote/api-core`）之后没同步过镜像构建上下文，
`dev` 分支的前端在容器里构不出来；这次跑 Docker E2E 时撞上，一并修掉。

| 文件 | 状态 | 作用与原因 |
|------|------|-----------|
| `infra/Dockerfile.web` | 修改 | dependencies 阶段补 `packages/api-core/package.json`（缺清单 pnpm 装不出 workspace 链接），source 阶段补整个 `packages/api-core`（它有运行时代码，由 Next 的 `transpilePackages` 一起编译） |
| `infra/Dockerfile.web.dockerignore` | 修改 | 放行 `packages/api-core/**`，否则上面的 `COPY` 拷不到东西 |

## 文档

| 文件 | 状态 | 作用与原因 |
|------|------|-----------|
| `README.md` | 修改 | 「测试」节的 E2E 条数 6→20，并说明新增的是笔记编辑器回归 |
| `CLAUDE.md` | 修改 | Phase 5 状态行的用例数（Playwright 15→20、前端单测 586→619、Lighthouse 区间 99-100→97-100）、常用命令与 legacy 删除前置条件里的条数同步 |
| `docs/changelist/2026-09-12-notes-editor-refactor.md` | **新增** | 本清单 |

## 审计要点

1. **`use-save-note.ts` 的 A0409 分支**（`runSave` 的 catch）——这是本次唯一会「自动覆盖服务端数据」的路径。
   判定条件是「回读到的服务端内容 === `baseRef`」，只在完全相等时才换号重发；`baseRef` 为空（详情缓存没数据）
   一律按真冲突处理。重发上限由 `save()` 的两拍循环兜住，第二拍仍失败会退回 `error` 走固定间隔重试，不会静默死循环。
2. **`flushOnUnload` 把草稿写进详情缓存**——这是"我们已经把这份内容交给服务端了"的乐观断言。
   keepalive 请求失败时缓存会短暂领先于服务端；后果是下次保存用本地内容覆盖（等同用户选「用我的改动覆盖」），
   不会丢数据，但值得确认这个取舍可接受。
3. **`buildShikiDecorations` 的位置换算**（`start = pos + 1` + token offset）——装饰贴错位会把颜色涂到相邻字符上。
   shiki 的 `offset` 是相对整段代码（含换行）的绝对偏移，单测里专门断言了跨行累计这一点。
4. **`tiptap.css` 里针对 `prose` 的复位**——用 `.anynote-editor .anynote-editor__content pre` 这类两级选择器
   把特异度抬到 `.prose :where(pre)` 之上，是因为两个样式表的加载顺序不由我们决定。改动这段前先看特异度而不是只看行为。
5. **`infra/Dockerfile.web` 的两处 COPY**——漏一个就是「本地 `pnpm build` 过、镜像构不出来」，
   而 CI 不构建前端镜像，不会替我们发现。新增 workspace 包时需要同步这里和 dockerignore。
6. **E2E 的 secure context 依赖**——`/docs` 的新建文档用 `crypto.randomUUID()`，它只在 HTTPS 或
   localhost 下存在。当前 web 容器构建参数是 `http://192.168.3.90:3000`（LAN 明文），
   在这个地址下协同建档必失败。这不是本次改动引入的，但会让 `e2e/collab.spec.ts` 在该配置下挂，
   跑 E2E 前需要把构建参数切到 `localhost:3000`。
