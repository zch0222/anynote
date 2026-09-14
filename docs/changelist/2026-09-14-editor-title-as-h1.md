# 笔记编辑器去掉独立标题行（标题改为正文首个 H1）

- **日期**：2026-09-14
- **分支**：`feat/editor-title-as-h1` → `dev`
- **设计依据**：`docs/ui/Anynote 新前端 UI 重设计.pdf`（**本批同时更新**：p04/p06 桌面、p09/p11 移动端把元信息行与分隔线移到 H1 之上，并删掉顶栏里重复的笔记名）
- **上一批**：`docs/changelist/2026-09-14-loading-system.md`（加载体系与品牌启动）

## 概览

设计稿的编辑器**从来没有独立标题行**——标题一直是正文里那个一级标题。是**实现多加了一个
`<input aria-label="笔记标题">`，于是同一句话在一屏里出现两次（输入框一次、正文里再写一次 H1），
而且分不清哪个才是"真的"。本批删掉那个输入框，把标题的**唯一来源**收敛为正文首个 H1。

**为什么不能只删输入框**：库里绝大多数历史笔记是「有 `n_note.title`、正文里没有 H1」的形态
（标题从前是单独的输入框）。不补齐的话，打开这些笔记标题会直接在编辑器里消失。
所以新增 `ensureLeadingHeading`，在**打开时**把已存标题补成顶部 H1——只改喂给编辑器的初始值、
不单独发写请求，用户第一次编辑会连同它一起进自动保存队列，落库后再次打开即为幂等。

统计范围为本批改动，相对 `dc0828d`（`dev` 当前 HEAD）。按 `git status --porcelain`、
`git diff --stat`、`git diff --numstat` 与 `git ls-files --others --exclude-standard` 逐条核对，
**已排除**工作区里既有的、与本批无关的未提交改动：`infra/docker-compose.yaml` 与两份
`docs/changelist/2026-09-13-*.md`（上一次内网入口 / Nginx TLS 的改动）。

| 项目 | 数量 |
|------|------|
| 新增文件 | 9（4 个源码 / 测试、4 张入库参考图、本清单） |
| 修改文件 | 15（含设计稿 PDF） |
| 删除文件 | 0 |
| 增 / 删行数 | +605 / −104（其中 4 张 PNG 与 PDF 为二进制，不计行数） |

按目录分布：`apps/web/src/features/notes/**`（7 个，含 3 个新增）、
`apps/web/scripts/**`（4 个，含 2 个新增）、`apps/web/e2e/**`（9 个，含 4 张入库参考图）、
根 `README.md`（1 个）、`docs/ui/`（设计稿 PDF 更新）、`docs/changelist/`（本清单）。

### 验证结果

全部在**本机 Docker 全栈 + 生产构建**上实跑（`docker compose --env-file <空文件>
-f infra/docker-compose.yaml -f infra/docker-compose.dev.yaml`），前端镜像按
`NEXT_PUBLIC_APP_URL=https://192.168.3.90:3000` 重建后验证：

| 命令 | 结果 |
|------|------|
| `vitest run`（`apps/web` 全量） | **117 文件 / 1206 用例全绿**（本批起点 1197，新增 9 条） |
| `vitest run src/features/notes` | 19 文件 / 140 用例通过 |
| `vitest run scripts/lib` | 4 文件 / 77 用例通过 |
| `tsc --noEmit` | 0 error |
| `biome check apps/web/scripts apps/web/src/features/notes apps/web/e2e` | 81 文件 clean |
| `NODE_EXTRA_CA_CERTS=<本地 CA> E2E_BASE_URL=https://192.168.3.90:3000 playwright test` | **90 passed / 1 skipped / 0 failed**（跳过的是 `pdf-upload.spec.ts` 里既有的条件跳过） |
| `docker compose build anynote-web` | 成功——这条同时是 lockfile 漂移的唯一门禁 |
| `node apps/web/scripts/ui-capture.mjs --only editor` | 桌面/移动 × 深浅 4 张真实截图 + 4 张并排对比图，产物见 `.ui-capture/index.html` |

## 一、笔记编辑器（影响面最大）

标题与正文合并成一个数据源：标题不再单独 `setTitle`，而是每次正文变化时从文档首节点取。

| 文件 | 状态 | 作用与原因 |
|------|------|------|
| `src/features/notes/lib/leading-heading.ts` | **新增** | `ensureLeadingHeading(markdown, title)` 补齐顶部 H1、`stripLeadingHeading(markdown)` 剥掉它。判据用 CommonMark 的 ATX 规则（`#` 后必须跟空格），所以 `#话题` 不算标题；**已经有 H1 时连前导空行都不动**——打开一篇笔记不该产生一次无谓的内容差异 |
| `src/features/notes/components/note-editor.tsx` | 修改 | 删掉标题 `<input>` 与 `handleTitleChange`；打开时用 `ensureLeadingHeading` 算初始内容；元信息行移到正文**之上**（正文首节点已是 H1，"标题与正文之间"这个位置不复存在）；字数改 `stripLeadingHeading(...).length`——标题如今躺在正文第一行，直接量 `content.length` 会把标题和换行一起算进去 |
| `src/features/notes/components/mobile/note-editor-mobile.tsx` | 修改 | 与桌面同一处改动。`title` 仍被动作表复用（`MobileActionSheet` 的标题），所以仍从 hook 取 |
| `src/features/notes/use-note-title.ts` | 修改 | 只改注释与措辞：标题的**唯一来源**是正文顶部 H1，不再有"手动命名"这条路径。逻辑本身上一批已就位（`leadingHeading` + `getTitleForContent`），本批只是把调用方对齐 |

## 二、单元测试与端到端用例

| 文件 | 状态 | 作用与原因 |
|------|------|------|
| `src/features/notes/lib/__tests__/leading-heading.test.ts` | **新增** | 12 条：已有 H1 原样返回、缺失时补齐、空标题退回占位、`#话题` 不算标题、代码围栏不误判、补齐幂等、字数剥离标题。**`#话题` 与代码围栏两条是重点**——判错会让补齐逻辑往正文里再塞一个标题 |
| `src/features/notes/components/__tests__/note-editor.test.tsx` | 修改 | 断言从"标题输入框有值"改为"没有输入框 + 编辑器初始值带 H1"；新增"已有 H1 不重复补"与"元信息行是正文容器第一个子元素"两条 |
| `src/features/notes/components/mobile/__tests__/note-editor-mobile.test.tsx` | 修改 | 同上；"改标题进保存队列"改为"只改正文沿用原标题"——后者才是新的不变式 |
| `src/features/notes/__tests__/use-note-title.test.tsx` | 修改 | 用例名与注释对齐新语义（库里标题与正文 H1 不一致时的行为），断言未变 |
| `e2e/notes-title.spec.ts` | 修改 | 断言从"标题输入框有值"改为"H1 有文本 + `getByLabel("笔记标题")` 计数为 0"；删掉"手动命名后只改正文不改标题"那段（手动命名这条路径已不存在），改为验证"只改正文不动标题" |
| `e2e/mobile-notes-title.spec.ts` | 修改 | 同上（移动端口径） |
| `e2e/notes.spec.ts`、`e2e/mobile-core.spec.ts`、`e2e/ui-redesign.spec.ts` | 修改 | 创建笔记后的断言改为等正文里出现 H1；`ui-redesign` 额外断言没有标题输入框 |

## 三、UI 还原度对比工具

编辑器这两屏此前没有对比场景，"像不像设计稿"只能靠人眼对着 PDF 看。

| 文件 | 状态 | 作用与原因 |
|------|------|------|
| `scripts/ui-capture.mjs` | 修改 | 新增 `editor-note` / `editor-note-mobile` 两个场景：先经 BFF **真的建一篇与设计稿同构的笔记**再截图（空笔记看不出元信息行与正文的层级）。新增 `seed`、`viewport` / `isMobile` 支持；对比图改为**按主题各出一张**（深浅在设计稿里是两页，混用会把主题差异读成还原度差距） |
| `scripts/lib/ui-capture.mjs` | **新增** | 把不需要浏览器的判定逻辑拆出来：`resolveReference`（字符串=两态共用拼版，对象=各取各页）、`comparisonFileName`（**带主题后缀**，否则两张拼图互相覆盖）、`buildNoteBody`（与设计稿同构的种子正文） |
| `scripts/lib/__tests__/ui-capture.test.mjs` | **新增** | 9 条。这类逻辑错了会产出"看着正常其实对错页"的图，比脚本直接崩更难发现 |
| `scripts/extract-design-reference.mjs` | 修改 | 导出页从"P12-P16 加载体系"扩为**只导 `ui-capture.mjs` 真的会拿去对比的页**（新增 p04/p06/p09/p11 编辑器四页），两处清单必须同步 |
| `e2e/reference/p04-editor-light.png` 等 4 张 | **新增** | 编辑器参考图（**入库**；跑出来的截图落在已 gitignore 的 `.ui-capture/`） |
| `README.md` | 修改 | 还原度对比一节补上编辑器场景与"种子笔记"的说明，标题从「加载体系的 UI 还原度对比」改为「UI 还原度对比」 |

## 四、设计稿

| 文件 | 状态 | 作用与原因 |
|------|------|----------|
| `docs/ui/Anynote 新前端 UI 重设计.pdf` | 修改 | 由 11 页扩到 16 页：p04/p06（桌面编辑器深浅）与 p09/p11（移动编辑器深浅）改为**元信息行在 H1 之上、无独立标题行**，并删掉顶栏里重复的笔记名；p12-p16 为加载体系（上一批新增） |

## 审计要点

1. **`ensureLeadingHeading` 只在打开时补齐、不单独发写请求**——这是刻意的。补齐若立刻落库，
   打开一篇老笔记就会产生一次静默写入（用户没改任何东西，`updateTime` 却变了）。
   现在的行为：装载后进编辑器，用户第一次编辑连同 H1 一起进自动保存队列；落库后再次打开幂等。
   **代价**：打开一篇老笔记后什么都不做就离开，库里那条仍然没有 H1——这是可接受的，
   下一次编辑就会被修正。
2. **`#话题` 与代码围栏两条边界必须有测试盯着**。判据若退化成"以 `#` 开头"，
   一篇以 `#话题` 开头的笔记会被认为"已经有标题"而跳过补齐，标题重新变得不可见。
3. **字数用 `stripLeadingHeading` 而不是 `content.length`**。标题现在就在正文第一行，
   直接量长度会把标题与换行算进"这篇多长"。移动端同一处也改了，两边别漂移。
4. **对比图的参考图是分主题的**。`resolveReference` 支持字符串（两态共用一张拼版）
   与对象（各取各页）两种写法；把编辑器那两屏写成字符串会让深色截图去对浅色页。
5. **`apps/web/e2e/reference/` 的 4 张新图必须与 `extract-design-reference.mjs` 的页号一致**。
   设计稿再更新时先重跑该脚本，再跑 `ui-capture.mjs`；页号写错会静默对错页。
6. **发现一个与本批无关的后端缺陷（已复现，未修）**：网关的 `XSSFilter`
   （`services/gateway/.../filter/XSSFilter.java`）对**整个 JSON body** 调
   `EscapeUtil.clean`，把 `>` 转义成 `&gt;`。真实用户输入 `> 引用文字` 保存后，
   服务端存的是 `&gt; 引用文字`；**刷新页面**引用块就退化成普通段落，
   正文里直接显示 `>` 字面量。同源的 `<` 与 `&` 一并被转义。
   本批的截图对比正好把它照了出来（设计稿那块灰底引文在我们的实现里成了一行纯文本）。
   影响面是**所有走网关的写请求**，与新旧前端无关。修法与排期建议另开工单——
   它属于后端安全过滤的范畴，改它要单独评估 XSS 防护口径。
