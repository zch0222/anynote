# UI 补稿还原度修复（按检查报告逐项落地）

> 日期：2026-09-16
> 分支：`feat/ui-supplement-fidelity`（从 `dev` 的 `63a52fa` 切出，完成后 `--no-ff` 合并回 `dev`）
> 依据：[`docs/ui/UI检查报告.md`](../ui/UI检查报告.md)（本次新增，逐屏实拍比对报告）
> 设计依据：[`UI补稿设计图.md`](../ui/UI补稿设计图.md) + [`UI补稿落地改造方案.md`](../ui/UI补稿落地改造方案.md)
> 相关 changelist：[`2026-09-16-ui-supplement.md`](./2026-09-16-ui-supplement.md)（M12 全量落地）、[`2026-09-16-kb-overview-d02.md`](./2026-09-16-kb-overview-d02.md)

## 概览

按检查报告的发现逐项修复。报告共记 21 高 / 24 中 / 11 低，**本轮全部处理**（3 项按拍板
维持现状，见「审计要点」第 5 条）。

| 类别 | 文件数 | 增 / 删行 |
|------|--------|-----------|
| 文档（`UI检查报告.md`） | 1 | +660 / −0 |
| 审计脚本 | 2 | +462 / −0 |
| 前端源码 | 36 | +1598 / −653 |
| 前端单元测试 | 7 | +309 / −54 |
| E2E 用例 | 3 | +49 / −14 |
| `CLAUDE.md` 口径同步 | 1 | +2 / −2 |
| `.gitignore` | 1 | +3 / −1 |
| **小计** | **51** | **+3083 / −724** |
| 本清单自身 | 1 | 见文件行数 |
| **合计** | **52** | **小计 + 本清单行数** |

新增文件 6 个：`docs/ui/UI检查报告.md`、`docs/changelist/2026-09-16-ui-audit-fixes.md`、
`apps/web/scripts/ui-audit-capture.mjs`、`apps/web/scripts/ui-audit-zoom.mjs`、
`apps/web/src/components/layout/page-search-action.tsx`、
`apps/web/src/features/notes/components/knowledge-base-page-header.tsx`。

数字口径（上方表格逐类相加，可用同样命令复核）：

```bash
git diff --numstat 63a52fa..HEAD                       # 逐文件 增/删
git ls-files --others --exclude-standard               # 新增未跟踪文件（本次为空，都已提交）
```

本清单自身的行数不进"小计"——它每改一次总数就变一次，写进去必然对不上；
所以小计口径是**除本文件外的全部改动**，合计再把它算回来。分 7 个 commit 提交，
随后 `--no-ff` 合并回 `dev`。

### 验证结果

| 命令 | 结果 |
|------|------|
| `npx tsc --noEmit`（apps/web） | **通过，无输出**。注：宿主机 `packages/api-client/src/` 停在 2026-09-10，比 `openapi/specs/` 旧，先按 `infra/Dockerfile.web` 的同一命令重新派生 6 份类型后才干净——详见「审计要点」第 6 条 |
| `npx vitest run`（apps/web） | **151 文件 / 1773 用例全部通过**（改前 151 / 1761；本批新增 12 条） |
| `npx playwright test`（全量，含移动端） | **126 / 126 通过**。跑 3 轮：2 轮出现偶发（`cli-authorize` 1 条、`collab` 1 条），**单跑均全过**（`collab.spec.ts cli-authorize.spec.ts` 合跑 7/7、8.7s），第 3 轮 126/126 全绿 |
| `pnpm --filter web bundle:budget` | 单条路由首屏 **302.8 KB / 预算 310 PASS**；编辑器 chunk 14.1 / 250 PASS；移动端 `/m/notes/[baseId]/[noteId]` **250.9 / 250 FAIL —— 既有问题，非本批引入**（用 `git stash` 回退到改前源码重建，产物同为 250.9 KB，逐字节相同） |
| `pnpm --filter web lighthouse:budget`（桌面） | **5 / 5 PASS**：login 100 · `/dashboard`→`/notes` 99 · `/notes` 99 · `/docs` 99 · `/ai/chat` 99，无障碍均 96（门槛 90 / 95） |
| `pnpm --filter web lighthouse:budget:mobile` | **5 / 5 PASS**：login 95 · `/m/dashboard` 89 · `/m/notes` 87 · `/m/docs` 85 · `/m/ai/chat` 89，无障碍均 96（门槛 85 / 95） |
| 真实浏览器逐屏比对 | `node apps/web/scripts/ui-audit-capture.mjs` 复拍 30 场景 × 浅深 2 主题 = 60 张，与画板同几何并排；本批改动的 13 屏逐屏目视确认 |
| `pnpm check`（Biome） | 通过 |

> **关于 Lighthouse 的一个真实陷阱（本轮实测）**：`/docs` 与 `/m/docs` 起初分别量到
> **75 / 83**（门槛 90 / 85），根因是**协同文档索引里累积了 74 份历次 E2E 建的文档**——
> 页面高度被撑到 3739px，CLS 0.731。清空 `collab` 容器的 `/data/*.ydoc` 后两者分别回到
> **99 / 85**。这不是代码问题，而是"共享索引 + 反复跑 E2E"的数据污染；
> 本轮用**同一 74 份数据下只回退列宽改动**的对照实验排除了自己改动的嫌疑（CLS 同为 0.731）。
> 后续跑 `/docs` 的 Lighthouse 前需先清索引，否则会稳定假红。

## 一、审计工具与报告（`docs/ui/`、`apps/web/scripts/`）

本次检查的方法是"真实浏览器逐屏实拍 + 与画板同几何裁剪后并排"，为此新增两个可复用脚本。
过程中发现仓库原有比对脚本有一个会让验收**永远假绿**的缺陷。

| 文件 | 状态 | 作用与原因 |
|------|------|------------|
| `docs/ui/UI检查报告.md` | 新增 | 逐屏还原度与操作逻辑检查报告：31 块屏幕画板全部实拍比对，含 21 高 / 24 中 / 11 低的发现清单、路由与动作走查结果、以及本次检查自身的局限表 |
| `apps/web/scripts/ui-audit-capture.mjs` | 新增 | 逐屏截图 + 与画板同几何并排。**修掉了 `ui-supplement-compare.mjs` 的一个硬缺陷**：那个脚本定义了 `setTheme()` 却从未调用，30 个场景中 24 个的 `-dark` 截图与浅色**字节级相同**——"深色还原度"这一项因此永远假绿。本脚本按 `next-themes` 的 `theme` key 写 `localStorage` 再导航（登录页无顶栏菜单，改用 `prefers-color-scheme`），并逐场景断言 `html.dark` 是否真挂上（实测 30/30 生效） |
| `apps/web/scripts/ui-audit-zoom.mjs` | 新增 | 取参考图与实拍图的**同一横带**上下拼接并放大（设计在上、实现在下），用于细看字号、圆角、间距这类单看整屏看不出的差异。两侧先对齐到同一尺寸，所以同一 y 坐标在两图上指同一位置 |
| `.gitignore` | 修改 | 加 `apps/web/e2e/.ui-audit/`。审计产物（实拍、并排图、`report.json`）是验收证据不是源码，与既有的 `.ui-capture/`、`.ui-supplement/` 同一处理 |

## 二、布局外壳与页头（`components/layout/`、`features/notes/components/knowledge-base-page-header.tsx`）

**这一节是本批影响面最大的改动**：一处判定改动同时覆盖 6 个页面的顶栏，一个共享组件
同时收敛了 5 个页面各写一遍的页头（H1 字阶 / 内容列宽 / 动作行）。

| 文件 | 状态 | 作用与原因 |
|------|------|------------|
| `components/layout/navigation.ts` | 修改 | `isKnowledgeBaseOverviewRoute` → **`isKnowledgeBaseTabRoute`**。补稿画板实测：知识库内**所有** Tab 页（库根 `/notes/:id` + 概览 / 慕课 / 任务 / 资料 / 成员）顶部都没有 56 高的栏，而原判定只认概览页。判定用完整段匹配并**排除**编辑器、历史版本（满幅路由，顶栏属于它们自己）与各详情页（自带返回键与页头） |
| `components/layout/app-shell.tsx` | 修改 | 跟随上面的判定，`hideHeader` 覆盖库内全部 Tab 页并补 `pt-7`（画板实测页头内容从 y=27 起，常规页面那 56 高的顶栏本身就相当于留白） |
| `components/layout/page-search-action.tsx` | 新增 | 页头动作行里的搜索入口（34 高圆形图标按钮）。库内页不再有顶栏，命令面板若不在这里给一个鼠标入口就**只剩 ⌘K**。与 `app-header.tsx` 的 `SearchButton` 同职责不同形态（那个带「搜索」文字、且 `hidden sm:inline-flex`），故不合并 |
| `components/layout/mobile/mobile-screen.tsx` | 修改 | **H-5**：标题排版改为按**有没有返回键**推导——有返回键即详情页，17/22 SemiBold 居中截断（画板原文，M-03/M-05/M-06/M-08/M-09/M-11/M-12/M-13 一致）；没有则是 tab 根页面（M-01/M-02），左侧大标题。原来一律 `text-base` 左对齐，8–9 屏都偏。居中态两侧各补 `size-10` 占位，否则标题不在屏幕正中。导出纯函数 `resolveTitleVariant` 供单测 |
| `features/notes/components/knowledge-base-page-header.tsx` | 新增 | 库内 Tab 页的统一页头，一次收敛三件"各写一遍就会漂移"的事：**H1 用 Display 34/41**（四个页面曾用 `text-title` 22/28，只有 D-07 与概览页用了 Display）、**页头动作行**（搜索 + 主题 + 主按钮）、**内容列统一 1000px**（曾 896 / 1080 / 1000 三种并存）。同时导出 `KB_CONTENT_COLUMN` 常量给 D-10 复用 |

## 三、知识库内各 Tab（`features/notes/components/`、`features/mooc/`、`features/tasks/`）

逐页补齐画板有、附录 A 没收录的元素。**报告 §6 指出这类"无编号元素"是系统性盲区**
（卡片外壳、H1 字阶、列宽、表格列数、列表列头、计数位置都不在 162 条清单里），
所以下面每一处都在代码注释里写明了依据。

| 文件 | 状态 | 作用与原因 |
|------|------|------------|
| `features/notes/components/note-list.tsx` | 修改 | **H-16** 补 40 高列头「标题 / 最近更新」（图例 18 原文规格：12/16 Medium、label/tertiary、底部 1px separator）——原来完全没列头，`thead th` 为空、全仓搜不到「最近更新」；**H-7** 列表并入一张卡（列头必须在卡**内部**，否则卡片顶部会多一条灰底缝隙）；副标题改为画板口径的真实统计（`128 篇笔记 · 最近更新于 2 小时前`），原来那句固定文案在空库与满库时一模一样 |
| `features/notes/components/knowledge-base-detail.tsx` | 修改 | **D-08** 补「文件名 / 上传者 / 上传时间 / AI 索引」表头行与四列网格，行尾补 chevron；概览预览块**不画表头**（那里只有一个 3 行小预览）。索引状态由绝对定位改为按列落点，`right-14` 的偏移按同一套网格算出来以与列头对齐——`<a>` 里不能嵌 `<button>` 的约束仍然保留（索引按钮在 `Link` 外面） |
| `features/notes/components/knowledge-base-members.tsx` | 修改 | **D-09** 副标题改为 `12 位成员 · 我的权限：管理员`（"我的权限"是进这一页最想确认的事）；搜索行右侧补「共 N 位」计数 |
| `features/mooc/components/mooc-page.tsx` | 修改 | **D-05** 副标题改为 `6 门课程 · 最近更新于 2 小时前`；接入统一页头（H1 字阶 + 列宽 + 动作行） |
| `features/tasks/components/tasks-page.tsx` | 修改 | **D-07** 接入统一页头；筛选行把「任务由知识库管理员发布」改为**恒在**并移到右端（它解释的是"这些任务从哪来"，对管理员同样有效——管理员看到的列表里也有别人发的任务） |
| `features/tasks/components/task-table.tsx` | 修改 | **H-4**：三列 → **六列**「任务名称 / 描述 / 时间窗口 / 我的状态 / 提交时间 / 操作」。原表看不出"什么时候截止""要交什么""我什么时候交的"，只剩一个状态徽标。描述 `line-clamp-2`（画板原文"最多两行"）；提交时间为空显示 `—` 而不是留空（空白会被以为这一列坏了） |

## 四、任务详情与表单（`features/tasks/`）

| 文件 | 状态 | 作用与原因 |
|------|------|------------|
| `features/tasks/components/task-detail-page.tsx` | 修改 | **D-17**：三张统计卡由"一张卡切三格"拆回**三张独立白卡**（画板中间有间隙）；数值补「**人**」单位（任务面向成员，裸数字会被读成"12 个任务"）；完成率按画板把 `67%` 与 `8 / 12` 放**同一行**、进度条通栏 |
| `features/tasks/lib/task-window.ts` | 修改 | **`completionRate` 在 `need === 0` 时由返回 `1` 改为 `null`**。原实现刻意避免除零，但"空任务显示完成率 100%"会被读成"全都交了"——一件没有任何人需要交的任务没有完成率可言。新增 `formatRate` 把 `null` 渲染成 `—`（与 `0%` 语义区分：前者"没人需要交"，后者"有人要交但一个都没交"）。另新增 `formatTaskWindowShort` 给移动端列表用 `09-10 ~ 09-18` |
| `features/tasks/components/task-form-page.tsx` | 修改 | **H-13**：整张表单进白卡 + 卡内页脚（1px 分隔 + `bg-fill-footer`），页脚按钮顺序按画板改为**取消在左、发布任务在右**（原来相反且左对齐）。时间窗口由两行竖排改为**一行** `开始 [2026-09-16 09:00] → 截止 [...]`；「发布到」改 28 高胶囊 + 彩色库色块（原来 36 高灰底 + 中性图标，看不出是哪个库）；描述工具条改 `toolbar="taskDescribe"` |
| `features/tasks/components/date-time-field.tsx` | 修改 | 触发器日期**补上年份**（`2026-09-16 09:00`）。任务窗口常常跨年，"12-28 截止"到底是今年还是明年，缺年份只能靠猜。刻意不引 `lib/format-time.ts`——那个模块会连带进相对时间文案，而本组件在表单首屏（预算最紧的路由之一） |
| `features/tasks/components/mobile/task-cards-mobile.tsx` | 修改 | **H-10**：补**描述（最多两行）**与**发布人**。原来只有时间窗口，"这个任务要我交什么""我该去问谁"都看不到；两个字段列表端点都已返回，不是造数差异 |
| `features/tasks/components/mobile/task-detail-mobile.tsx` | 修改 | 跟随 `completionRate` 返回类型变更，`null` 时进度条按 0 渲染 |

## 五、设置页（`features/settings/components/`）

**H-13 是一处系统性回归**：三个画板都把内容包在白卡里，实现把这些卡片整个丢了——
内容直接铺在 `bg-grouped` 灰底上。像素实测同一区域"近白占比"：

| 页面 | 画板 | 实现（改前） |
|---|---|---|
| D-12 设置 · 账号 | 71.4% | **0.0%** |
| D-18 任务表单 | 82.0% | 11.1% |
| D-13 设置 · 外观 | 38.4% | 6.0% |

| 文件 | 状态 | 作用与原因 |
|------|------|------------|
| `features/settings/components/account-settings.tsx` | 修改 | **H-13**：账号资料与修改密码各还原成一张白卡，卡内页脚放主按钮。**D-12 其余**：卡片头部补 40 头像 + 昵称 + `🔒 用户名 xxx · 不可修改`（这是附录 A D-12 表明列的图例元素，不是风格偏好）；昵称计数 `2 / 30` 移入输入框**内**右侧（原来在框外下方，把昵称列撑高、与右侧性别列错行）；密码规则由纵向四行改为一行四项；说明文案改回画板原文「8–15 位，需包含大小写字母和数字。」 |
| `features/settings/components/appearance-settings.tsx` | 修改 | **H-13**：主题选择还原成白卡。区块标题改回「**主题**」、说明改回画板原文「选择界面主题，跟随系统会随操作系统自动切换明暗。」——原来的「外观 / 点了立即生效」没说清这个页面最需要解释的一件事：**跟随系统是什么意思** |
| `features/settings/components/mobile-settings.tsx` | 修改 | **H-3**：账号资料卡开头补 40 头像 + 昵称 + 用户名不可修改说明（原来直接从「昵称」行开始）；密码规则由 `space-y-1` 纵向四行改为 `flex-wrap` 一行 chip |

## 六、移动端（`features/dashboard/`、`features/search/`、`features/mooc/`、`features/collab/`）

| 文件 | 状态 | 作用与原因 |
|------|------|------------|
| `features/dashboard/components/mobile-dashboard.tsx` | 修改 | **H-2**：补全宽搜索伪输入框（M-01 图例 3，358×36、圆角 10），快捷操作由 **2×2 四格**改回**一行三格**——搜索在画板里是独立的全宽入口，不是快捷格子之一，它占掉一格后三个高频入口被挤成两行；**H-7**：最近笔记 / 待办 / 我的知识库三段由"分离小卡"改为"**一整卡 + 内部 1px 分隔线**"（分离卡片把每行的上下留白叠起来，4 行多吃近 40px）；**H-11**：待办行补「截止 09-18 周四」——只有任务名与状态的话看不出这件事急不急 |
| `features/search/components/mobile-search.tsx` | 修改 | **H-6**：30px 色块由 `rounded-lg` 改为显式 **`rounded-[8px]`**。根因很隐蔽——本仓库 `--radius-lg` 是 **0.875rem = 14px**（不是 Tailwind 默认值），30px 方块加 14px 圆角**视觉上就是一个正圆**，而画板要求圆角 8 的方形。「创建笔记」的图标由 `Sparkles` 换成笔形 `PenLine`（Sparkles 在本仓库是"AI / 智能"语义，用在"新建一篇空白笔记"上会让人以为点进去会生成内容） |
| `features/mooc/components/mobile/mooc-list-mobile.tsx` | 修改 | **H-9**：课程行补**封面色块**与行尾箭头（原来整列纯文字，一行课程与一行笔记长得一样）；列表**最末**补「新建课程请使用桌面版」——原来这句只在空态出现，而"想再建一门课"恰恰发生在看着列表的时候 |
| `features/collab/components/mobile/doc-library-mobile.tsx` | 修改 | **M-08**：行图标改蓝色圆角块（同 H-6 的 `rounded-[8px]` 理由）；页脚补「文档库全站共享，不按知识库划分」——侧栏把「协同文档」画在知识库分组**之外**，从知识库进来的人容易以为它属于当前库 |

## 七、协同文档库、认证页与编辑器（`features/collab/`、`features/auth/`、`components/editor/`）

| 文件 | 状态 | 作用与原因 |
|------|------|------------|
| `features/collab/components/doc-library.tsx` | 修改 | **D-10**：内容列由 1104 收敛到画板的 **1000**（与库内各 Tab 用同一个 `KB_CONTENT_COLUMN`）；网格下方补图例 13 的范围说明行 |
| `features/auth/components/account-badge.tsx` | 修改 | **D-15**：「将以以下账号授权」标签移到**框外上方**，框内改为头像 + 昵称 + @用户名两行（原来标签塞在框里当第一行，与画板形态不符） |
| `features/auth/components/cli-authorize.tsx` | 修改 | **D-15**：主按钮补 `ShieldCheck` 图标、高度 42，与次按钮等高。盾牌图标不是装饰——这一屏是"把账号凭据交给一个本机进程"，图标是用户扫一眼能认出的风险提示 |
| `components/editor/core/toolbar-commands.ts` | 修改 | 新增 `TASK_DESCRIBE_LAYOUT`（`B I H2 ≡ ⋮≡ 🔗` 六项）给 D-18 的任务描述用。不复用 `MINIMAL_LAYOUT`：那 13 项里有 7 项（撤销/重做/下划线/删除线/行内代码/高亮/清除格式）在"写一段任务要求"里几乎不会被用到，而它**又不含 H2**——与画板恰好相反 |
| `components/editor/core/toolbar.tsx` | 修改 | `ToolbarVariant` 加 `"taskDescribe"`，`renderSlots` 按变体选表 |
| `components/editor/core/mobile-toolbar-groups.ts` | 修改 | **H-8**：常驻命令由 10 个收成画板的 **8 个**（`B I H2 •列表 1.列表 ☑列表 🔗 🖼`）。去掉 `codeBlock` 与 `undo`——它们在 390 宽下把画板末位的「⋯」直接挤出右缘；两者移入「更多」弹层，仍然可达 |

## 八、UI 原子组件与时间工具

| 文件 | 状态 | 作用与原因 |
|------|------|------------|
| `components/ui/command.tsx` | 修改 | **D-04 ③18 / ③20**：搜索框由 `h-8!`（32 高）· `rounded-lg!`（14）· `bg-fill-hover` 改为画板的 **50 高 · 圆角 10 · `bg-grouped`**（三项原来全不符）；命令项由 `py-1.5`+`text-sm`（实测约 30 高）· `rounded-sm` 改为 **`h-9` 固定 36 高 · `rounded-md`**。单条之差看不出，一列 8 项就是 48px 的累积差 |
| `components/ui/input.tsx` | 修改 | **D-14**：去掉 `dark:bg-fill-hover`，只留禁用态的填充。画板里深色输入框与卡片**同底**（`rgb(28,28,30)`）、只有 1px 边框；原来在深色卡片上叠出一层 `rgb(44,44,45)` 的浅灰。浅色下两边都是纯白，**看不出差别**——所以这条只在深色专项里才暴露 |
| `lib/format-time.ts` | 修改 | 新增四个纯函数：`formatDateTime`（含年份，给"用户要照着做事的绝对时刻"用）、`formatDate`、`formatMonthDayTime`、`formatDateRange`（`~` 连接，画板原文是波浪号不是 en dash）、`formatDueLine`（`截止 09-18 周四`，带星期因为待办的心理刻度是"周几"）。与 `formatRelativeTime` 的分工写进了注释 |

## 九、测试

**新增 12 条用例**，都针对"画板上有、图例没编号、附录 A 也没收"的元素——这类元素
没有用例守着下次还会丢，所以逐条钉住而不只测渲染不报错。

| 文件 | 状态 | 作用与原因 |
|------|------|------------|
| `components/layout/__tests__/navigation.test.ts` | 修改 | `isKnowledgeBaseTabRoute` 的三组边界：六个 Tab 与库根命中、编辑器/历史版本/详情页**不**命中、尾随段与前缀（`overviewX`、`/notes/new`、`abc`）不接受 |
| `components/layout/__tests__/app-shell.test.tsx` | 修改 | 库内 5 个 Tab 逐个断言不渲染顶栏；库外与库内详情页断言**仍然保留**顶栏（两个方向都测，否则"整站都不渲染"也会通过） |
| `components/layout/mobile/__tests__/mobile-screen.test.tsx` | 修改 | H-5：有返回键时标题 `data-title-variant="center"` + `text-center`，无返回键时为 `large` + `text-title`；`resolveTitleVariant` 的纯函数边界；居中态两侧占位各一个 |
| `features/dashboard/components/__tests__/mobile-dashboard.test.tsx` | 修改 | H-2：快捷操作恰好 3 格且**不含搜索**、搜索是独立的 `/m/search` 入口；H-7：笔记与待办各是单一 `<ul>`，且行本身不带 `rounded-*`/`shadow-*`（那正是"分离小卡"的特征）；H-11：待办显示 `截止 09-18 `，缺 `endTime` 时不多渲染一行 |
| `features/notes/components/__tests__/create-note-page.test.tsx` | 修改 | 新增三条 D-03 元素：归属提示、库卡「类型 · 更新时间」副标题、标题计数在输入框**父容器**内 + H1 提示行。另两条既有用例改用正则匹配库名——加了副标题后卡片可访问名从「甲库」变成「甲库 普通知识库」，精确匹配会把"副标题有没有渲染"与"能不能选中这个库"耦合成一条断言 |
| `features/tasks/lib/__tests__/task-window.test.ts` | 修改 | `need === 0` 返回 `null` 的回归用例（含 `null` / `undefined` / 负数三种输入）；`formatRate` 区分 `null`→`—` 与 `0`→`0%` |
| `components/editor/__tests__/mobile-toolbar-groups.test.ts` | 修改 | H-8：常驻命令改为断言**精确集合**（不只是长度 8），并断言 `codeBlock` / `undo` 不再常驻但仍在「更多」里可达 |

### E2E 用例同步

| 文件 | 状态 | 作用与原因 |
|------|------|------------|
| `e2e/ui-redesign.spec.ts` | 修改 | 原「顶栏在知识库内只给切换器」对的是 PDF 原稿（p01–p16），与补稿画板口径冲突。按 2026-09-16 拍板改为断言库内**整条顶栏都不渲染**（`app-header` 0 个、`kb-switcher` 0 个），并断言页头动作行里的搜索入口确实在。另一条新建库用例改用侧栏卡片断言"进了新建的那个库" |
| `e2e/mobile-core.spec.ts` | 修改 | 原断言工具条**必须溢出**（`scrollWidth > clientWidth`）——那在 10 个命令时成立，收到 8 个后 9 个 40px 按钮在 390 宽下**正好放得下**。但"装得下所以不滚"是更好的结果，不该判失败；改为按几何逐个核对每个按钮的右边界都在可视区内，这才是 H-8 真正要守的事（画板末位的「⋯」不能被挤出右缘） |
| `e2e/notes.spec.ts` | 修改 | 补注释说明编辑器（满幅路由）**不在** `isKnowledgeBaseTabRoute` 之内、仍保留顶栏与知识库切换器——避免下次有人照"库内不渲染顶栏"把这条也改掉 |

## 审计要点

1. **顶栏抑制的范围是本批唯一推翻既有断言的决定**。`isKnowledgeBaseTabRoute` 一次覆盖
   6 个页面，且与 `ui-redesign.spec.ts` 对 PDF 原稿的旧断言直接冲突。2026-09-16 拍板
   **以补稿画板为准**（库内整条不渲染）。要看的是 `navigation.ts` 的正则边界——
   编辑器与历史版本必须**排除**（它们是满幅路由，顶栏属于它们自己，且没有 Display 页头），
   写宽了会让编辑器丢掉顶部工具条。
2. **H-13 是"三处同一类回归"，不是三个独立 bug**。D-12 / D-13 / D-18 的卡片外壳同时消失，
   很可能是某次改动把 `bg-surface shadow-card rounded-lg` 一并去掉了。本轮按画板逐一还原，
   并用像素"近白占比"给出改前数字（0.0% / 6.0% / 11.1%）作为回归的量化证据。
3. **`--radius-lg` 是 14px 而不是 Tailwind 默认的 8px，这是本仓库的圆角陷阱**。
   H-6（M-10 圆角色块渲染成圆）与 M-08 的行图标都栽在同一处，修法都是写显式的
   `rounded-[8px]`。改动任何小尺寸方块的圆角前先看 `globals.css:140`。
4. **`completionRate` 的返回值类型变了**（`number` → `number | null`），是一个行为变更：
   `need === 0` 的任务从"完成率 100%"变成"—"。这条是报告里标为"建议"的边界态，
   但 100% 会被读成"全都交了"，语义上确实是错的，所以本轮一并修掉并补了回归用例。
   所有调用点（桌面任务详情、移动任务详情）都已同步。
5. **三项按拍板维持现状**，未改代码，仅在报告与本文中记录：
   - **D-11 纸面卡片**：画板要求协同工作区正文是白底卡片，而 `styles/tiptap.css:12-17`
     有一条明确注释「编辑器本身**不画卡片**……与设计稿『编辑器占满剩余所有空间』冲突」。
     这是设计稿与既有实现决策的直接冲突，**以 `tiptap.css` 既有决策为准**。
   - **D-01/D-05/D-07 等页面的表格密度与个别图标语义**属于画板风格偏好，未逐条对齐。
   - **AI 相关页面**按 2026-09-15 拍板暂不出稿，不在本轮范围。
6. **宿主机 `packages/api-client/src/` 与实际契约脱节，会让本地 typecheck 与 build 假红**。
   该目录 gitignored，宿主机那份停在 2026-09-10，比 `openapi/specs/`（09-13 / 09-16）旧，
   于是 `npx tsc --noEmit` 报 4 条"路径不存在"的错（`/cli/token`、`/user/mine/profile`、
   `/admin/noteTasks/{id}/editHeatmap`、`/notes/{noteId}/images/uploadTasks`），
   `next build` 也直接失败——**这四条与本批改动无关**。按 `infra/Dockerfile.web` 的同一命令
   重新派生 6 份类型后完全干净。Docker 构建不受影响（镜像内每次重新生成）。
   另外 `pnpm openapi:generate` 在本机跑不通（走 bash 且要连运行中的 Gateway 校验响应），
   本地修复方式是直接用锁定的生成器读入库 spec，见 `Dockerfile.web` L24-28。
7. **跑 `/docs` 的 Lighthouse 前必须清协同索引**。共享索引会被历次 E2E 累积到几十份，
   页面高度撑长后 CLS 飙升，`/docs` 与 `/m/docs` 会稳定假红（75 / 83）。
   清空容器 `/data/*.ydoc` 后回到 99 / 85。这条已写进上面的验证结果表，建议后续
   把它做成 Lighthouse 脚本的前置步骤，而不是每次靠人判断"是不是又脏了"。
