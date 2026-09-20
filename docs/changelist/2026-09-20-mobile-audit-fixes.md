# 2026-09-20 移动端还原度修复（V01–V22）

> 依据：[2026-09-19-移动端设计还原度核对报告](../ui/2026-09-19-移动端设计还原度核对报告.md) 的差异清单 V01–V22，
> 视觉数值以 [UI补稿设计图](../ui/UI补稿设计图.md) 画板图例为准。
> 本批 = 该报告发现的全量修复 + 浏览器复验中追加的 2 处修复（见 §追加修复）。

## 概览

- **修改 35 个已跟踪文件**（+823 / −274），**新增 1 个文件**（60 行）；全部集中在 `apps/web` 移动端 + `CLAUDE.md` 一处指针同步。
- 修复范围：分组底/纸面双语义（V01）、大标题 34/41（V02）、工作台完成态收缩（V03）、历史版本页顶栏与贴底恢复（V04）、
  tab bar 350×64 全圆浮岛（V05）、44×44 返回命中区（V06）、「我的」彩色图标块（V07）、库头统一口径（V08）、
  课程简介占位（V09）、资料图标与索引说明（V10）、标题计数入框（V11）、业务按钮圆角 12（V12）、
  协同标题 N/60 计数（V13）、动作表抓手+可见取消+右置勾选（V14）、协同标题字阶（V15）、搜索高亮（V16）、
  搜索语义图标与范围说明（V17）、密码行表单与禁用（V18）、主题图标与当前值（V19）、历史标题去重与行尾箭头（V20）、
  工作台/协同库冗余项与顺序（V21）、集成分节去重与虚线空态（V22）。
- 追加修复（核对清单外、复验时对照画板发现）：移动端 `Segmented` 全圆胶囊化（画板 M-04/M-06 口径，
  桌面端维持小圆角）；搜索页「设置」行图标映射键从 `/m/settings` 改为真实地址 `/m/settings/profile`。

### 验证结果

| 命令 | 结果 |
|---|---|
| `npx vitest run`（apps/web 全量） | **154 文件 / 1825 条全绿**（基线 1814，本批 +11） |
| `npx playwright test --project=mobile`（生产构建 + 真实 Docker 栈） | **41 / 41 全绿**（35.5s） |
| `npx playwright test --project=chromium` | **94 / 95**；唯一失败 `cli-authorize` 为用例间状态干扰的 flaky，单独重跑 5/5 全绿，且该 spec 不涉及本批任何文件 |
| `npx biome check <本批全部改动路径>` | 73 文件全净（仓库根 `pnpm check` 失败源自**已存在**的 gitignored `.pnpm-store/` 大 JSON 超 Biome 1MB 上限，与本批无关） |
| `pnpm typecheck` | 5 任务全绿 |
| 浏览器真实比对 | 应用内浏览器 390×844 逐页核验 V01–V22（浅/深两态），关键数值以 DOM 计算样式复核：标题 34px/700/41、顶栏 88、tab 岛 350×64 全圆、选中胶囊 48 高 accent、返回键 44×44 accent 色、分段控件全圆、恢复按钮 sticky bottom-0 等 |

生产构建说明：本机 Windows 无软链权限，`next build` 在 standalone 追踪步报 EPERM symlink（Docker Hub 又被 DNS 污染拉不动镜像），
因此 `next.config.ts` 增加 `NEXT_DISABLE_STANDALONE=1` 逃生开关（默认行为不变），E2E 用 `next start` 起普通 `.next` 产物完成。

## apps/web — 布局外壳（components/layout/mobile + ui + styles）

移动外壳是这批的共享样式层：分组底/纸面、大标题、tab 浮岛、动作表形态都在这里改一次、全站生效。

| 文件 | 状态 | 作用与原因 |
|---|---|---|
| `src/components/layout/mobile/mobile-screen.tsx` | 修改 | V01/V02/V04/V06：新增 `tone`（grouped=分组底+白卡 / paper=整页纸面）与 `onBack`（版本页返回同路由列表态）；大标题态升为 34/41 Bold、顶栏 88 不带分隔线；返回键 `size-10`→`size-11`（44×44 命中区）且改 accent 色、Chevron 26 |
| `src/components/layout/mobile/mobile-shell.tsx` | 修改 | V01：外壳兜底底色从 `bg-surface` 改 `bg-grouped`——纸面页由 `MobileScreen tone="paper"` 自声明，shell 不再猜 |
| `src/components/layout/mobile/mobile-tab-bar.tsx` | 修改 | V05：浮岛改为 350×64 全圆（`max-w-[350px] mx-auto rounded-full p-2`），选中格 48 高 accent 胶囊 |
| `src/components/layout/mobile/mobile-action-sheet.tsx` | 修改 | V14：顶部补 36×5 抓手；动作列表下**永远**渲染可见「取消」卡（Escape 可关不等于触摸端有取消）；新增 `checked` 让单选类勾选落在行**最右** |
| `src/components/ui/segmented.tsx` | 修改 | 追加修复：新增 `shape` 变体（default=桌面小圆角 / pill=移动端全圆胶囊），5 处移动端用法切换为 pill（画板 M-04/M-06 的轨道与选中格都是全圆） |
| `src/components/shared/__tests__/segmented.test.tsx` | 新增 | 上述形状变体的单测（ui 目录被 vitest exclude，按惯例放 shared）：两种口径的圆角断言 + 形状不影响单选回调 |
| `src/styles/mobile.css` | 修改 | V05 配套：`--mobile-tabbar-h` 改为 64+8 让位；外壳 padding-bottom 移交 `MobileScreen`（按 tone 决定）；新增大标题态顶栏左右 16、去分隔线规则 |

## apps/web — 功能页（features）

各页按画板图例逐条对齐；测试文件与被测文件同目录同步更新。

| 文件 | 状态 | 作用与原因 |
|---|---|---|
| `src/features/dashboard/components/mobile-dashboard.tsx` | 修改 | V03/V21：三段内容区的固定 min-h 只在**加载期**生效（完成态按内容收缩，「我的知识库」从 y≈867 回到首屏内）；删除页尾「查看全部知识库」重复入口（图例 14 只留段头「全部 ›」） |
| `src/features/collab/components/mobile/doc-library-mobile.tsx` | 修改 | V13/V21/V12：范围说明移到新建按钮**上方**；新建标题框内补 N/60 实时计数（maxLength 60）；主按钮圆角 12 |
| `src/features/collab/components/mobile/doc-workspace-mobile.tsx` | 修改 | V15：标题 20px→22/28、行高 60（原 52.7）；声明 `tone="paper"` |
| `src/features/mooc/components/mobile/mooc-list-mobile.tsx` | 修改 | V09/V08：无简介课程保留「还没有填写简介」占位行（行高不随数据跳）；封面圆角 12；库头数量口径统一 |
| `src/features/mooc/components/mobile/mooc-detail-mobile.tsx` | 修改 | `tone="paper"` + 分段控件 `shape="pill"` |
| `src/features/notes/components/mobile/base-section-tabs.tsx` | 修改 | V08：库头封面 48→36（圆角 9）；副标题统一报**笔记数**（pageSize=1 只取 total），三个子 Tab 来回切换不再变字 |
| `src/features/notes/components/mobile/base-docs-mobile.tsx` | 修改 | V10：资料行行首补 36 文件图标块；列表尾补「只有已索引的资料才能被 AI 问答检索到。」说明 |
| `src/features/notes/components/mobile/create-note-mobile.tsx` | 修改 | V11/V12：0/15 计数移入输入框内右侧（错误态转 danger）；框下补「标题会作为正文的第一个标题（H1）。」说明；库名 footnote→16px；主按钮圆角 12 |
| `src/features/notes/components/mobile/note-history-mobile.tsx` | 修改 | V04/V20：版本页返回键回到左侧统一 44×44、顶栏标题居中（原挂在右侧动作区）；「恢复此版本」sticky 贴底；正文标题只渲染一次（去掉外层 h2，`ensureLeadingHeading` 已含 H1）；可进入版本行补行尾 ›；头像按人名哈希取系统色板（原全灰）；分段控件 pill |
| `src/features/notes/components/mobile/note-editor-mobile.tsx` | 修改 | 声明 `tone="paper"`（编辑器是纸面语义） |
| `src/features/notes/components/mobile/note-bases-mobile.tsx` | 修改 | 分段控件 `shape="pill"` |
| `src/features/notes/components/mobile/note-list-mobile.tsx` | 修改 | 分组底适配（列表卡坐在 grouped 底上） |
| `src/features/search/components/mobile-search.tsx` | 修改 | V16/V17/追加修复：命中片段 `<mark>` 高亮（accent-soft 底 + accent 字）；页面入口按地址配语义图标与色块（原六行同款蓝星）；空查询补范围说明；无结果态补搜索图标；「设置」图标键改 `/m/settings/profile`（真实候选地址） |
| `src/features/settings/components/mobile-me.tsx` | 修改 | V07：设置四行 + 更多组 + 仅桌面组全部补 28 彩色图标块（iOS 系统色板）；外观行右侧显示当前主题值（跟随系统/浅色/深色）；行高与分组标题对齐画板 |
| `src/features/settings/components/mobile-settings.tsx` | 修改 | V18/V19/V22：密码区还原「标签左、值右」两行表单（原两个占位输入框堆叠），显隐切换 44 命中区；规则未全过或原密码为空时「修改密码」禁用；主题色块内落太阳/月亮/显示器图标、选中行写「当前正在使用」（跟随系统补实际解析主题）；集成页去掉与顶栏重复的分组标题、空态恢复虚线外框；性别动作表勾选改 `checked` 右置；业务按钮圆角 12 |
| `src/features/tasks/components/mobile/task-cards-mobile.tsx` | 修改 | `tone="paper"`、库头口径统一、分段控件 pill |
| `src/features/tasks/components/mobile/task-detail-mobile.tsx` | 修改 | 分段控件 `shape="pill"` |
| `src/lib/mobile/search.ts` | 修改 | V16：新增 `splitTitleMatch`（大小写不敏感的标题命中切分，与 `rank` 匹配口径一致——否则会「搜得到但看不到亮在哪」） |

## apps/web — 测试（与被测文件同目录）

| 文件 | 状态 | 作用与原因 |
|---|---|---|
| `src/components/layout/mobile/__tests__/mobile-action-sheet.test.tsx` | 修改 | V14 回归：取消按钮永远可见、点它只关闭不执行动作 |
| `src/components/layout/mobile/__tests__/mobile-screen.test.tsx` | 修改 | 大标题断言升为 `text-display`；44 占位断言；新增 tone 双语义与 `onBack` 覆盖行为 |
| `src/features/dashboard/components/__tests__/mobile-dashboard.test.tsx` | 修改 | V03 回归拆两态：pending 有 min-h、loaded 无 min-h |
| `src/features/mooc/components/mobile/__tests__/mooc-mobile.test.tsx` | 修改 | V09 回归：空白简介显示占位行 |
| `src/features/notes/components/mobile/__tests__/base-docs-mobile.test.tsx` | 修改 | V10 回归：行首图标块 + 索引能力说明 |
| `src/features/notes/components/mobile/__tests__/note-history-mobile.test.tsx` | 修改 | 返回键 testid 从右置专用键改为统一 `mobile-back` |
| `src/features/notes/components/mobile/__tests__/note-lists-mobile.test.tsx` | 修改 | 库头引入 pageSize=1 笔记数查询后，换页断言不再能用 `mock.lastCall`（库头调用排在列表之后） |
| `src/features/settings/components/__tests__/mobile-settings.test.tsx` | 修改 | V18 回归：密码行显隐按钮语义名、规则未满足/原密码为空的禁用链路 |
| `src/lib/mobile/__tests__/search.test.ts` | 修改 | `splitTitleMatch` 四条：切分回拼、大小写、首尾命中、空查询/未命中返回 null |

## apps/web — 构建

| 文件 | 状态 | 作用与原因 |
|---|---|---|
| `next.config.ts` | 修改 | `output: "standalone"` 包一层 `NEXT_DISABLE_STANDALONE` 逃生开关：宿主机 Windows 无软链权限时 `next build` 在 standalone 追踪步 EPERM，本机 E2E 需要能出普通 `.next` 产物。默认不设该变量时行为与原先完全一致（Docker 镜像仍出 standalone） |

## 文档

| 文件 | 状态 | 作用与原因 |
|---|---|---|
| `CLAUDE.md` | 修改 | docs/ui 导航里移动端核对报告的「该批发现尚未修复」改为已修复并指向本清单（文档维护约定：指针不悬空） |

## 审计要点

1. **`mobile-screen.tsx` 的 tone 语义**：底色从 shell 全局猜测改为每页声明。新增沉浸式/纸面页面时若忘声明 `tone="paper"` 会落在 grouped 底上——评审看每个新页面的 `MobileScreen` 调用是否带对 tone。
2. **`base-section-tabs.tsx` 的 pageSize=1 查询**：为拿笔记总数多发一次列表请求，所有挂 `MobileBaseHeader` 的页面都会多这一笔；若后续出现 N+1 式放大（列表页自身也拉全量），考虑换专用计数端点。
3. **`note-history-mobile.tsx` 的 sticky 恢复按钮**：`-mx-4 + mt-auto + sticky bottom-0` 组合依赖内容容器 padding 对齐，改动该页布局时注意长文滚动中按钮始终可达（V04 的验收口径）。
4. **`segmented.tsx` 的 shape 分叉**：桌面默认小圆角、移动端 pill 是**两个画板口径**，不是待统一的技术债；不要「顺手统一」任何一侧。
5. **`next.config.ts` 逃生开关**：只在宿主机出 `.next` 产物时用；`infra/Dockerfile.web` 构建路径不受影响（不设该变量）。CI 与镜像行为不变。
6. **flaky 说明**：chromium 全量中 `cli-authorize` 一条失败为登录态串扰（单跑 5/5 绿），与本批无关；若要根治应从该 spec 的独立 storageState 入手，不在本批范围。
