# UI 补稿落地改造方案

> 版本：v1.0（2026-09-16）
> 状态：**方案已确认，待开工**。2026-09-16 定稿：「按目前方案确定，AI 不画」。
> 设计依据：[`UI补稿设计图.md`](UI补稿设计图.md)，共 40 块画板、662 条图例。下文写「画板 D-17」的地方都链接到图集的对应锚点。
> 相关文档：
> - [`Anynote 新前端 UI 重设计.pdf`](Anynote%20新前端%20UI%20重设计.pdf)：原设计稿，本文按页码 p01–p16 引用
> - [`docs/refactor/FRONTEND_MILESTONES.md`](../refactor/FRONTEND_MILESTONES.md)：M7.6 记录了已知的后端缺口
> - [`docs/mobile/MOBILE_PLAN.md`](../mobile/MOBILE_PLAN.md)
>
> 里程碑编号：**M12**。前面已用到 M9 CLI、M10 移动端、M11 MinIO。

---

## 0. 怎么用这份文档

1. 本方案覆盖本轮前端改造的全部工作，以及它依赖的后端改动，按 [§8](#order) 的顺序执行。
2. 每个任务都写了五项：
   - 对应画板
   - 要改的文件
   - 实现要点
   - 测试
   - 验收

   任务的验收全部满足，这个任务才算完成。[§10](#acceptance) 的清单全部勾选，本轮才算完成。
3. **视觉数值以画板图例为准**，包括尺寸、字阶、颜色 Token 和文案。本文只写代码怎么落，只有要新建 Token 或组件时才写数值。
4. 附录有两份，逐条对照用：
   - **附录 A**：画板上 162 条「建议改 / 需后端 / 相对现实现的变化」图例，逐条对应到任务编号和落地处理。
   - **附录 B**：第 4 轮 5 块新页面画板的完整图例，都是新写的页面，没有现成实现可参照。
5. 代码约束沿用 `CLAUDE.md`，本文不再重复论证：
   - 数据走 TanStack Query 与 `@anynote/api-client` 的 typed client。
   - 样式只用 Tailwind。
   - 编辑器等重依赖用 `dynamic(..., { ssr: false })`。
   - 每个改动都带单测；修 bug 先写能复现的失败用例。
   - 后端改动先写 OpenSpec 提案，改完跑 `pnpm openapi:generate` 并提交 baseline。

---

## 1. 范围与决定

### 1.1 本轮交付

| 类别 | 内容 | 画板 |
|------|------|------|
| 基建 | 新增 3 个填充 Token 并替换组件底色；输入控件圆角 10；新增 Select、PasswordInput、ConfirmDialog；统一加载 / 空 / 错误 / 不存在 / 连接中断的状态组件；修正导航注册表 | [Q-01](UI补稿设计图.md#q-01) · [Q-02](UI补稿设计图.md#q-02) |
| 路由 | 新增 5 条桌面路由、3 条移动路由；旧地址重定向 6 条；删除 `/wikis` 与 `/m/wikis*` 共 4 个页面文件 | [F-01](UI补稿设计图.md#f-01) · [F-02](UI补稿设计图.md#f-02) |
| 桌面 | 知识库内 6 个 Tab / 详情、任务三页、笔记新建与历史、4 个浮层、协同文档两页、设置两页、认证两页 | D-01 – D-18 |
| 移动 | 工作台、我的、知识库内 3 个 Tab、慕课详情、任务详情、新建笔记、历史版本、协同文档两页、搜索、设置分节 | M-01 – M-13 |
| 后端 | 任务编辑热力图端点（B-1）、笔记历史查询健壮性（B-2）、个人资料对外更新端点（B-3）；成员侧单个任务查询（B-4，可选） | D-17 · D-16 · D-12 |

### 1.2 本轮不做

- **AI 页面内容**：`/ai/chat`、`/ai/chat/[id]`、`/ai/pdf`、`/ai/workflow`、`/settings/ai` 的内容区，以及 `/m/ai/*`。入口保留，版式不改。
  - 唯一例外：`/ai/pdf` 要读取 `?baseId&docId`，承接「资料」Tab 的跳转（任务 12.2.5）。移动端 `/m/ai/pdf/[docId]` 已经从路径取参，不用改。
- **后端缺字段、已决定不做或延后的元素**（2026-09-15 与需求方确认）：
  - 编辑器作者与阅读次数（p04）：后端没有返回，需要另立后端工单。阅读计数不应在 `GET` 详情里同步写库。
  - 画廊多维计数（p03）：没有跨知识库聚合端点，卡片副标题只显示单库已有字段，数字缺失时整段不渲染。
  - 笔记分组（p04 侧栏）：不做，后端不加 `group_id`，目录平铺。
  - 笔记列表摘要：不做，列表行固定为「图标 + 标题 + 相对时间」。
- **知识库「添加成员」入口**：只有管理后台端点 `/manage/bases/addUser`，画板 D-09 不画。
- **删除任务**：后端没有删除端点，画板 D-17 不画。
- **M7.6 已登记的后端缺口**：AI 流式、PDF 上传转存、慕课条目权限规则 `n:mooc:read`、`n_mooc.data_scope`。本轮不修，受影响的界面按 Q-02 的错误态处理。
- **`apps/web-legacy`**：不改。

### 1.3 决定记录

| 日期 | 决定 | 影响 |
|------|------|------|
| 2026-09-15 | 慕课、任务只属于知识库 | 跨库 `/mooc`、`/tasks`、`/m/mooc`、`/m/tasks` 改为重定向；「我的 › 更多」与搜索里去掉这两项 |
| 2026-09-15 | 删除 `/wikis`、`/m/wikis*` | 删页面、组件、测试与导航匹配规则 |
| 2026-09-15 | 输入框圆角 10 | `Input` / `Textarea` / `InputGroup` 从 `rounded-lg`（14）改为 `rounded-md`（10） |
| 2026-09-15 | AI 页面暂不出稿 | 见 §1.2 |
| 2026-09-15 | 笔记历史从笔记页进入；任务详情、新建与编辑放在任务 Tab 下 | 新路由见 §3.1 |
| 2026-09-16 | 按目前方案确定：画板上标「建议」的路由、重定向与橙字改动全部采纳 | 本方案的全部前端任务 |
| 2026-09-16 | 设计稿与后端事实冲突的 5 处，已在画布定稿版改正图例，按 §1.4 落地，**不改后端业务规则** | D-07 · D-16 · D-17 · M-04 · M-12 · M-13 · D-12 · M-11 |

<a id="conflicts"></a>

### 1.4 设计稿与后端事实的冲突及处理

写方案时逐条核对了后端代码，有 5 处图例的前提与后端实际行为不符。**画布定稿版已按下表改正这些图例**，第 2 列是改正前的说法，留作追溯。图集对应画板下有注明；附录 A 相关行的「落地处理」列也写了依据。

| # | 改正前的图例说法 | 核对结果（证据） | 落地处理（定稿图例已同步） |
|---|--------------|------------------|----------|
| 1 | 提交记录里没有知识库 id，拼不出笔记地址，需要后端补 `knowledgeBaseId`（D-17 `td-sub-row`、M-12 `ma-row`）；提交对话框里「知识库」可以切换（D-07 `s-base`、M-04 `sh-base`） | 提交时后端**强制笔记与任务同库**，否则报「提交失败，笔记和任务不属于一个知识库」（`services/note/.../NoteTaskServiceImpl.java:346-348`） | 提交的笔记一定在任务所在库里，直接用任务的 `knowledgeBaseId`（路由里的 `baseId`）拼 `/notes/:b/:n`，**不需要后端补字段**。提交对话框和面板里的「知识库」改成只读行，注明「任务所在库」 |
| 2 | 成员侧「已退回」是 2、管理侧是 3，两套枚举需要后端确认（D-17 `td-seg`） | 两个端点都读 `n_user_note_task.status`（`NoteTaskMapper.xml:98`、`NoteTaskSubmissionRecordMapper.xml:44`），枚举 `UserNoteTaskStatus` 为 0 未提交 / 1 已提交 / **2 无需提交（管理员）** / **3 已退回**。「2 = 已退回」是**前端写错了**（`apps/web/src/features/tasks/schemas.ts:28-29`） | 修前端枚举：`3 = 已退回`，`2 = 无需提交`。`submissionStatus === 2` 的行就是本库管理员，据此切到管理视角、不出提交按钮（任务 12.3.1） |
| 3 | 已提交且未截止时，行尾出「重新提交」（D-07 `t-resubmit-ghost`、M-04 `r-resubmit-ghost`） | 存在状态正常的提交记录时，后端拒绝再次提交：「提交失败，你已经提交过该任务」（`NoteTaskServiceImpl.java:373`）。提交后笔记权限也会被锁定 | 已提交的任务只出 accent 文字「查看」（进任务详情），不出任何提交类按钮；只有「已退回」且未截止才出「重新提交」。现在移动端对已提交任务显示「重新提交」（`task-cards-mobile.tsx:153`），点了必失败，一并删掉 |
| 4 | 后端没有回滚端点，恢复要走现有保存接口写回，需要确认（D-16 `h-restore` / `r4-desc`、M-13） | `PATCH /notes/{noteId}` 每次保存都会异步发 `GENERATE_NOTE_EDIT_LOG`。消费者只要正文有差异，就写一条操作日志和一份历史快照（`NoteMessageListener.java:91-116`）。恢复前的内容本来就是列表里最新的那个版本，所以画板文案「当前内容会先作为一个新版本保留」成立 | 恢复 = 用该版本的 `title` + `content`，带当前 `version` 调 `PATCH /notes/{noteId}`，**不新增回滚端点**。版本冲突沿用编辑器的冲突提示。快照是消息队列异步写的，恢复成功后历史列表延迟约 2 秒再刷新。「本次改动」本期按行比较、整行高亮，行内词级高亮留作后续 |
| 5 | 清空邮箱 / 手机号后保存不生效，需要后端支持置空（D-12 `a-email`、M-11） | 实际更严重：`PUT /user/{userId}` 标了 `@InnerAuth`（`SysUserController.java:110-116`），浏览器经网关调用一律被拒。**资料保存目前完全不可用**，M7.6 第 5 条已登记 | 后端新增对外端点 **B-3**，只收白名单字段，空串表示清空。前端改调新端点（任务 12.6.1）。B-3 上线前，「保存资料」保留按钮，失败时显示后端原因 |

另有 3 处不涉及画板说法、但影响实现的核对结果：

| # | 事实 | 处理 |
|---|------|------|
| 6 | 画板 D-17 热力图写的数据源 `GET /noteTasks/{id}/charts`，从提交笔记的**全部编辑历史**里取最早 / 最晚时间，按小时切段，**每个小时查一次 SQL**。没有任何提交时，`roundDownToHour(null)` 直接空指针（`NoteTaskServiceImpl.java:699-722`、`NoteTaskMapper.xml:164-193`） | 新增按天聚合的端点 **B-1**，一条 SQL，区间限定在任务时间窗口内。旧端点只补空数据防护，保持旧前端可用 |
| 7 | 移动端沉浸式判定 `/^\/m\/notes\/[^/]+\/[^/]+$/` 也会命中 `/m/notes/3/tasks` 这类知识库内 Tab，底部 tab bar 被隐藏，与画板 M-03 – M-05 不符（`navigation.ts:275`） | 改用数字段判定（任务 12.0.4），先写失败用例 |
| 8 | 管理员单个任务查询 `GET /admin/noteTasks/{id}` 需要知识库管理权限，成员侧没有单个任务查询端点 | 成员视角从 `GET /noteTasks?knowledgeBaseId=` 列表里按 id 查找（任务 12.3.1）。**B-4** 补成员侧单个任务查询，可选，不阻塞前端 |

---

## 2. 现状核对（其余证据）

§1.4 之外，画板「现实现」一栏和 Q-01 / Q-02 提到的问题，写方案时也逐条在代码里确认过。行号取自 2026-09-16 的 `dev`（`38289ec`）。

| 问题 | 证据 | 任务 |
|------|------|------|
| 桌面慕课详情里，点章节下的视频或文档会选中并收起父章节，子条目打不开 | `features/mooc/components/mooc-detail.tsx:142` 把父级 `onSelect` 原样传给 `ChapterChildren`，`:172` 子条目直接调它 | 12.2.4 |
| 深色下悬停 / 选中 / 菜单高亮用 `bg-grouped`，而深色 grouped 是纯黑 | `components/ui/button.tsx:16-18`、`table.tsx:48`、`dropdown-menu.tsx:91,116,165,210`、`command.tsx:147`、`badge.tsx:13-16`、`mobile-action-sheet.tsx:101`，另有 18 处布局与业务组件写了 `hover:bg-grouped` | 12.0.1 |
| 对话框、卡片、表格页脚用 `bg-grouped/60`，深色下是一条黑带 | `dialog.tsx:91`、`card.tsx:84`、`table.tsx:37` | 12.0.1 |
| 分段控件轨道在深色下与页面同为 `#000`，看不出边界 | `segmented.tsx:64`（轨道 `bg-grouped`）、`:87`（选中 `bg-surface`） | 12.0.1 |
| 输入框圆角 14，规范是 10 | `input.tsx:12`、`textarea.tsx:10`、`input-group.tsx:17` 均为 `rounded-lg`（`globals.css:114` 定义为 0.875rem） | 12.0.2 |
| 出错只有一行文案、没有重试 | `features/**` 与 `components/**` 共 32 处「…加载失败：{message}」「…获取失败」，全部没有重试按钮 | 12.0.3 |
| 提交对话框默认选第一个库；选中笔记时显示转圈图标 | `submit-task-dialog.tsx:41-46`、约 `:104` | 12.3.2 |
| 移动端「任务」「慕课」Tab 渲染跨库列表，带知识库选择器，不认路由里的 `baseId` | `app/(mobile)/m/notes/[baseId]/tasks/page.tsx` 渲染无参 `<MobileTaskCards />`；`mooc-list-mobile.tsx` 同理 | 12.7.2 · 12.7.3 |
| 「我的 › 更多」仍列出任务、慕课 | `navigation.ts:289-294` `mobileMoreRoutes` | 12.0.4 |
| 工作台「待办 · 全部」去跨库 `/m/tasks` | `mobile-dashboard.tsx:141` | 12.7.1 |
| 协同文档点删除立即生效，没有确认 | `doc-library.tsx:140` | 12.5.1 |
| CLI 授权说明里的 `**独立的**` 原样显示星号 | `cli-authorize.tsx:44` | 12.6.4 |
| 删除笔记用 `window.confirm` | `note-editor.tsx:115` | 12.4.2 |
| `/ai/pdf` 不读地址参数，资料 Tab 没法直达某份文档 | `pdf-page.tsx:45-46` 两个 `useState(null)` | 12.2.5 |
| 资料保存调的是内部端点 | `use-profile.ts:63-76` → `PUT /user/{userId}`（`@InnerAuth`） | B-3 · 12.6.1 |

---

## 3. 总体方案

<a id="routes"></a>

### 3.1 路由表

**新增**（全部在知识库上下文里，侧栏与 tab bar 的高亮规则见 12.0.4）：

| 地址 | 页面 | 画板 | 说明 |
|------|------|------|------|
| `/notes/[baseId]/mooc/[moocId]` | 慕课详情 | [D-06](UI补稿设计图.md#d-06) | 取代 `/mooc/[id]` |
| `/notes/[baseId]/tasks/[taskId]` | 任务详情 | [D-17](UI补稿设计图.md#d-17) | 新迁移；旧前端 `/dashboard/task/[id]` |
| `/notes/[baseId]/tasks/new` | 新建任务 | [D-18](UI补稿设计图.md#d-18) | 仅知识库管理员；静态段 `new` 优先于 `[taskId]` |
| `/notes/[baseId]/tasks/[taskId]/edit` | 编辑任务 | [D-18](UI补稿设计图.md#d-18) | 仅知识库管理员 |
| `/notes/[baseId]/[noteId]/history` | 笔记历史版本 | [D-16](UI补稿设计图.md#d-16) | 新迁移；旧前端 `/note/[id]/history` |
| `/m/notes/[baseId]/mooc/[moocId]` | 慕课详情（移动） | [M-06](UI补稿设计图.md#m-06) | 取代 `/m/mooc/[id]` |
| `/m/notes/[baseId]/tasks/[taskId]` | 任务详情（移动） | [M-12](UI补稿设计图.md#m-12) | 移动端不提供新建 / 编辑 |
| `/m/notes/[baseId]/[noteId]/history` | 笔记历史版本（移动） | [M-13](UI补稿设计图.md#m-13) | 沉浸式 |

**重定向**：

| 旧地址 | 去向 | 实现 |
|--------|------|------|
| `/mooc` | `/notes` | 服务端 `redirect()` |
| `/tasks` | `/notes` | 服务端 `redirect()` |
| `/mooc/[id]` | `/notes/{knowledgeBaseId}/mooc/{id}` | 客户端组件 `LegacyMoocRedirect`：`useMoocQuery(id)` 取 `knowledgeBaseId` 后 `router.replace`；取不到时显示「找不到这门课程」不存在态 |
| `/m/mooc` | `/m/notes` | 服务端 `redirect()` |
| `/m/tasks` | `/m/notes` | 服务端 `redirect()` |
| `/m/mooc/[id]` | `/m/notes/{knowledgeBaseId}/mooc/{id}` | 同 `/mooc/[id]`，`mobile` 形态 |

保留跨库重定向而不直接删掉，是因为旧书签和分享链接还会带进来。`/tasks`、`/mooc` 没有 id 可推导库，一律落到知识库列表。

**删除**：`/wikis`、`/m/wikis`、`/m/wikis/[baseId]`、`/m/wikis/[baseId]/[noteId]` 四个页面文件，连同 `features/wikis/**` 及其测试。F-01 / F-02 把它们标为「已拍板删除」，不留重定向：旧 IA 下没有需要保护的深链。

**不变**：其余页面路由地址不变，只改内容（现有 51 个 `page.tsx`）。

### 3.2 新增文件落点

```
apps/web/src/
├── app/(workspace)/notes/[baseId]/
│   ├── mooc/[moocId]/page.tsx                 # 12.1.1 → MoocDetailPage
│   ├── tasks/[taskId]/page.tsx                # 12.1.1 → TaskDetailPage
│   ├── tasks/[taskId]/edit/page.tsx           # 12.1.1 → TaskFormPage mode=edit
│   ├── tasks/new/page.tsx                     # 12.1.1 → TaskFormPage mode=new
│   └── [noteId]/history/page.tsx              # 12.1.1 → NoteHistoryPage
├── app/(mobile)/m/notes/[baseId]/
│   ├── mooc/[moocId]/page.tsx                 # 12.1.1
│   ├── tasks/[taskId]/page.tsx                # 12.1.1
│   └── [noteId]/history/page.tsx              # 12.1.1
├── components/ui/select.tsx                   # 12.0.2 shadcn（base-ui 版）原件
├── components/shared/
│   ├── password-input.tsx                     # 12.0.2
│   ├── confirm-dialog.tsx                     # 12.0.2
│   └── states.tsx                             # 12.0.3 QueryError / EmptyState / NotFoundState / ConnectionBanner
├── features/tasks/
│   ├── use-task-detail.ts                     # 12.3.1 管理员详情、提交记录、热力图、成员查找、时间线
│   ├── use-task-mutations.ts                  # 12.3.1 新建、编辑、退回
│   ├── lib/task-window.ts                     # 12.3.1 时间状态、剩余天数、快捷时长
│   ├── lib/heatmap.ts                         # 12.3.1 色阶分档、排序与折叠
│   └── components/
│       ├── task-detail-page.tsx               # 12.3.3
│       ├── task-heatmap.tsx                   # 12.3.3
│       ├── return-submission-dialog.tsx       # 12.3.3
│       ├── task-form-page.tsx                 # 12.3.4
│       ├── date-time-field.tsx                # 12.3.4
│       ├── mobile/task-detail-mobile.tsx      # 12.7.3
│       └── mobile/submit-task-sheet.tsx       # 12.7.3
├── features/notes/
│   ├── use-note-history.ts                    # 12.4.3 版本列表（无限滚动）、单版本、恢复
│   ├── lib/history-groups.ts                  # 12.4.3 今天 / 昨天 / MM-dd 周X 分组
│   └── components/
│       ├── note-history-page.tsx              # 12.4.3
│       ├── history-diff-view.tsx              # 12.4.3（桌面与移动共用）
│       ├── mobile/note-history-mobile.tsx     # 12.7.5
│       └── mobile/base-section-tabs.tsx       # 12.7.2 从 note-list-mobile.tsx 抽出
├── features/mooc/components/legacy-mooc-redirect.tsx   # 12.1.2
└── features/notes/components/knowledge-base-members.tsx # 12.2.6 从 knowledge-base-detail.tsx 拆出
```

### 3.3 数据层

**Query key**：新 key 必须挂在域前缀下，并补进 `features/_keys.test.ts`。

```ts
// features/tasks/query-keys.ts
export const taskQueryKeys = {
  all: ["tasks"] as const,
  list: (knowledgeBaseId: number, page: number) => ["tasks", "list", knowledgeBaseId, page] as const,
  adminDetail: (taskId: number) => ["tasks", "admin", "detail", taskId] as const,
  submissions: (taskId: number, status: SubmissionTab, page: number) =>
    ["tasks", "admin", "submissions", taskId, status, page] as const,
  heatmap: (taskId: number) => ["tasks", "admin", "heatmap", taskId] as const,
  timeline: (taskId: number) => ["tasks", "timeline", taskId] as const,
};

// features/notes/query-keys.ts 追加
historyList: (noteId: number) => ["notes", "history", "list", noteId] as const,
historyDetail: (operationId: number) => ["notes", "history", "detail", operationId] as const,

// features/mooc/query-keys.ts 追加
detail: (moocId: number) => ["mooc", "detail", moocId] as const,
```

**端点与 hook 一览**：

| hook | 端点 | 备注 |
|------|------|------|
| `useMoocQuery(moocId)` | `GET /moocs/{id}` | 取 `title`、`knowledgeBaseId`、`moocKnowledgeBaseName`；D-06 页头和重定向用 |
| `useAdminTaskQuery(taskId)` | `GET /admin/noteTasks/{id}` | 返回 A0301 / 业务错误时按「不存在或无权限」处理 |
| `useTaskSubmissionsQuery(taskId, tab, page)` | `GET /admin/noteTasks/submissions` | `tab` → `userTaskStatus`：已提交 1 / 未提交 0 / 已退回 3；每页 20 |
| `useTaskHeatmapQuery(taskId)` | `GET /admin/noteTasks/{id}/editHeatmap`（B-1） | B-1 未上线时整卡隐藏，不回退到旧 charts 端点 |
| `useMemberTaskQuery(baseId, taskId)` | `GET /noteTasks?knowledgeBaseId=`，逐页找到为止 | B-4 上线后换成单条端点，签名不变 |
| `useTaskTimelineQuery(taskId)` | `GET /noteTasks/{id}/history` | 只取类型 3 提交、4 退回；新的在上 |
| `useCreateTaskMutation` / `useUpdateTaskMutation` | `POST /admin/noteTasks` / `PATCH /admin/noteTasks/{id}` | 成功后失效 `taskQueryKeys.all` |
| `useReturnSubmissionMutation` | `POST /admin/noteTasks/submissions/return/{id}` | 成功后失效该任务的 submissions 与 adminDetail |
| `useNoteHistoryInfinite(noteId)` | `GET /notes/historyList` | `useInfiniteQuery`，每页 15 |
| `useNoteHistoryQuery(operationId)` | `GET /notes/history` | 取 title、content、historyTime |
| `useRestoreNoteVersionMutation` | `GET /notes/{noteId}` 取 version → `PATCH /notes/{noteId}` | 冲突码沿用 `VERSION_CONFLICT_CODE`；成功后写回详情缓存，历史列表 2 秒后失效 |
| `useRemoveMemberMutation` | `DELETE /bases/users` | 后端禁止移除自己，前端对自己那行不出菜单 |
| `useKnowledgeBaseMembersQuery(baseId, { username })` | `GET /bases/users` | 现有 hook 加 `username` 参数，key 带上它，输入 300ms 防抖 |
| `useIndexDocMutation` | `POST /docs/{id}/index` | 从 `features/ai/use-docs.ts` 的 `useUploadPdfMutation` 第 2 步抽出，上传链路改为调用它，避免两份实现 |
| `useUpdateMyProfileMutation` | `PUT /user/mine/profile`（B-3） | 替换 `useUpdateProfileMutation` |

**zod schema**：
- 新增 `adminTaskSchema`、`taskSubmissionSchema`、`taskHeatmapSchema`、`taskTimelineItemSchema`、`noteHistoryItemSchema`、`noteHistoryDetailSchema`、`moocDetailSchema`。
- 字段只取画板用到的，全部 `nullish()`，与现有 schema 的写法一致。

### 3.4 公共组件与 Token

| 名称 | 用途 | 任务 |
|------|------|------|
| `--fill-hover` → `bg-fill-hover` | 悬停、选中、菜单高亮 | 12.0.1 |
| `--fill-footer` → `bg-fill-footer` | 对话框、卡片、表格页脚 | 12.0.1 |
| `--segmented-track` / `--segmented-thumb` | 分段控件轨道与选中格 | 12.0.1 |
| `--heat-0` … `--heat-5` / `--heat-future` | 任务热力图色阶，深色另取一组 | 12.3.3 |
| `components/ui/select.tsx` | 取代原生 `<select>`：设置性别、注册性别 | 12.0.2 |
| `PasswordInput` | 登录、注册、改密码的显示 / 隐藏 | 12.0.2 |
| `ConfirmDialog` | 删除笔记、移除成员、移除协同文档、退回提交、恢复版本；取代 `window.confirm` | 12.0.2 |
| `QueryError` / `EmptyState` / `NotFoundState` / `ConnectionBanner` | Q-02 五种状态里后四种；加载态沿用 `components/loading/skeletons.tsx` | 12.0.3 |

---

<a id="backend"></a>

## 4. 后端改造（B 系列）

四项都要走 API 变更流程：

1. 在 `.claude/openspec/changes/` 写提案。
2. 改 Controller，写全 Springdoc 注解，不用旧的 `@Api`。
3. Service 写纯 Mockito 单测。
4. 跑 `pnpm openapi:generate`，提交 `openapi/specs/*.json`。

每项单独一个分支、单独提交（一个服务一个 commit）。前端在对应端点上线前按各任务里写的降级方式开发，不等后端。

<a id="b-1"></a>

### B-1 任务编辑热力图端点

- **画板**：[D-17](UI补稿设计图.md#d-17)「成员编辑活跃度」
- **提案**：`.claude/openspec/changes/2026-09-XX-note-task-edit-heatmap.md`
- **分支**：`feat/note-task-edit-heatmap`；scope `note`

**为什么不用现有 `/noteTasks/{id}/charts`**：见 §1.4 第 6 条。它按小时逐段查询，区间是提交笔记的全部编辑历史，没有提交时直接空指针。旧前端还在用这个端点，所以返回结构不改，只补空数据防护。

**契约**：

```
GET /admin/noteTasks/{id}/editHeatmap
权限：@RequiresNoteTaskPermissions(NoteTaskPermissions.MANAGE)（与 charts 相同）

ResData<NoteTaskEditHeatmapVO>
NoteTaskEditHeatmapVO {
  startDate: string        // yyyy-MM-dd，任务开始日
  endDate:   string        // yyyy-MM-dd，任务截止日
  today:     string        // yyyy-MM-dd，服务端当天；前端据此把之后的列画成「未到」
  days:      string[]      // startDate..endDate 逐日；超过 62 天时只取截至 min(endDate, today) 的最后 62 天
  members: [{
    userId: long, username: string, nickname: string, noteId: long,
    total:  int,           // 窗口内编辑总次数
    counts: int[]          // 与 days 等长，未编辑为 0
  }]                       // 只含状态正常的提交（record.status = 0），按 total 降序
}
```

**实现**：
- `AdminNoteTaskController` 新增方法，写 `@Operation(summary = "任务成员编辑热力图", description = "按天统计已提交成员在任务时间窗口内对提交笔记的编辑次数")`；VO 字段写 `@Schema`。
- `NoteTaskService#getNoteTaskEditHeatmap(Long noteTaskId)`：
  1. 查任务的 `startTime` / `endTime`；任务不存在时抛 `UserParamException("任务不存在", ResCode.INVALID_USER_INPUT_NOT_FOUND)`。
  2. 算出 `days`；实际查询区间 = `[days[0] 00:00, min(endTime, now) 次日 00:00)`。
  3. 执行下面的 SQL，在内存里铺成 `members × days` 矩阵。
- `NoteTaskMapper.xml` 新增 `selectNoteTaskEditHeatmap`，只查一次：

  ```sql
  SELECT r.user_id, u.username, u.nickname, r.note_id,
         DATE(l.operation_time) AS edit_date, COUNT(*) AS edit_count
  FROM n_note_task_submission_record r
  JOIN n_note_operation_log l ON l.note_id = r.note_id AND l.operation_type = 1   -- NoteOperationType.EDIT
  JOIN sys_user u ON u.id = r.user_id
  WHERE r.note_task_id = #{noteTaskId}
    AND r.status = 0 AND r.is_delete = 0
    AND l.operation_time >= #{rangeStart} AND l.operation_time < #{rangeEnd}
  GROUP BY r.user_id, u.username, u.nickname, r.note_id, DATE(l.operation_time)
  ```

  已提交但窗口内没编辑过的成员也要出现在 `members` 里，行上全是 0。另查一次 `r.status = 0` 的提交人列表，与上面的结果合并。
- `getNoteTaskChartsData` 的防护：`selectNoteTaskSubmissionTime` 的 `earliestTime` 为空时直接返回空列表。

**测试**：新建 `services/note/src/test/java/com/anynote/note/service/impl/NoteTaskServiceImplEditHeatmapTest.java`。

| 用例 | 断言 |
|------|------|
| 无提交 | `members` 为空，`days` 覆盖整个窗口 |
| 两名成员、跨三天编辑 | `counts` 按日期落位；按 `total` 降序 |
| 已提交但窗口内无编辑 | 该成员出现，`counts` 全 0 |
| 窗口 90 天、今天是第 80 天 | `days` 长 62，末尾是今天 |
| 任务未开始 | `today < startDate`，`days` 仍完整 |
| 任务不存在 | 抛 `UserParamException` |
| charts 无提交 | `getNoteTaskChartsData` 返回空列表，不抛异常 |

**验收**：
- `mvn test -pl note` 通过。
- `openapi/specs/note.json` 出现新路径，`pnpm openapi:check` 无漂移。
- 真实栈上，管理员访问有提交的任务返回矩阵，访问无提交的任务返回空 `members`，成员访问返回无权限。

<a id="b-2"></a>

### B-2 笔记历史查询健壮性

- **画板**：[D-16](UI补稿设计图.md#d-16) · [M-13](UI补稿设计图.md#m-13)
- **提案**：`.claude/openspec/changes/2026-09-XX-note-history-validation.md`
- **分支**：`fix/note-history-validation`；scope `note`

**现状**：
- `GET /notes/history?operationId=` 在 Controller 里 `selectById` 后直接 `getNoteId()`，id 不存在就空指针，返回 500（`NoteController.java:223-230`）。
- `historyList` 的三个参数没有任何校验。

**改动**：
- 查找逻辑挪进 `NoteHistoryService#getNoteHistoryByOperationId(Long operationId)`。操作日志不存在时抛 `UserParamException("历史版本不存在", ResCode.INVALID_USER_INPUT_NOT_FOUND)`。权限注解 `@RequiresNotePermissions(READ)` 保持不变。
- `historyList` 参数加校验：
  - `@NotNull noteId`
  - `@NotNull @Min(1) page`
  - `@NotNull @Min(1) @Max(50) pageSize`
- 两个方法补 `@Operation` 与 `@Parameter`。
- **不新增回滚端点**，理由见 §1.4 第 4 条。

**测试**：新建 `NoteHistoryServiceImplTest`，覆盖：
- 操作日志不存在时抛异常
- 正常返回 title / content / historyTime
- 分页参数透传

**验收**：
- 传不存在的 `operationId` 返回 `A0xxx` 业务错误，不再返回 500。
- `pnpm openapi:check` 通过。

<a id="b-3"></a>

### B-3 个人资料对外更新端点

- **画板**：[D-12](UI补稿设计图.md#d-12) · [M-11](UI补稿设计图.md#m-11)
- **提案**：`.claude/openspec/changes/2026-09-XX-system-update-my-profile.md`
- **分支**：`feat/system-update-my-profile`；scope `system`

**现状**：`PUT /user/{userId}` 是 `@InnerAuth` 内部端点，浏览器调用被拒；它收完整 `SysUser`，也不适合对外开放。

**契约**：

```
PUT /user/mine/profile
身份：从登录态取当前用户 id（tokenUtil.getLoginUser()），请求里不传 userId

UpdateMyProfileDTO {
  nickname:    string   @NotBlank @Size(max = 30)
  sex:         integer  @NotNull，只允许 0 男 / 1 女 / 2 未知（sys_user.sex 的定义，前端显示为「未设置」）
  email:       string   @Nullable，非空时 @Email @Size(max = 50)；"" 与 null 都表示清空
  phoneNumber: string   @Nullable，非空时 @Pattern("^1\\d{10}$")；"" 与 null 都表示清空
}

ResData<SysUser>   // 更新后的资料，字段白名单与 GET /user/mine 一致（不含 password）
```

**语义**：PUT 就是**整体替换这四个字段**。前端每次都把四个字段全部带上，所以不存在「没传就不改」的歧义，清空邮箱和手机号自然成立。

**实现**：
- `SysUserController` 新增方法。
- `SysUserService#updateMyProfile(UpdateMyProfileDTO)` 用 `LambdaUpdateWrapper<SysUser>` 显式 `set` 四个字段加 `update_by` / `update_time`，`where id = 当前用户`。清空写空串 `''`，因为 `sys_user.email` / `phone_number` 的默认值就是空串（`infra/sql/anynote.sql:1014-1015`），和注册时没填的账号保持一致。
- 返回 `getMyUserInfo()`。
- 原 `PUT /user/{userId}` 不动。
- 网关已放行 `/api/system/**` 的登录态请求，不改路由。

**测试**：新建 `services/system/src/test/java/com/anynote/system/service/impl/SysUserServiceImplUpdateMyProfileTest.java`。
- Mockito 捕获 `UpdateWrapper`，断言：
  - 只更新当前登录用户
  - null 与空串都写成 `''`
  - `sex = 2` 原样写入
- 另用 `jakarta.validation.Validator` 测 DTO：
  - 非法邮箱被拒
  - 空串邮箱通过
  - 超长昵称被拒
  - `sex = 3` 被拒

**验收**：
- 登录用户能改昵称、清空邮箱与手机号，把性别改回「未设置」（2）。
- 传别人的资料无从下手（端点没有 userId 参数）。
- `pnpm openapi:check` 通过。
- M7.6 第 5 条标记为已关闭。

<a id="b-4"></a>

### B-4（可选）成员侧单个任务查询

- **画板**：[D-17](UI补稿设计图.md#d-17) 成员视角 · [M-12](UI补稿设计图.md#m-12)
- **分支**：`feat/note-task-member-detail`；scope `note`
- **不阻塞前端**：前端先用列表查找，见 12.3.1。

**契约**：`GET /noteTasks/{id}`，权限为该任务所在知识库 `READ`，返回 `MemberNoteTaskDTO`（与列表行同结构）。不在任务成员里时返回无权限。

**测试**：`NoteTaskServiceImplMemberDetailTest`，覆盖三种情况：
- 本人是成员
- 本人是管理员（`submissionStatus = 2`）
- 不在知识库

---

<a id="frontend"></a>

## 5. 前端改造（M12 系列）

以下路径默认相对 `apps/web/src/`。每个任务的「附录 A」列出该任务要逐条核对的图例。

<a id="m12-0"></a>

### M12.0 基建

#### 12.0.1 填充 Token 与组件底色

- **画板**：[Q-01](UI补稿设计图.md#q-01) 问题 #1 – #3
- **附录 A**：无（Q 画板不带图例）
- **文件**：
  - `app/globals.css`
  - `components/ui/{button,badge,table,dropdown-menu,command,card,dialog,segmented,tabs}.tsx`
  - `components/layout/mobile/{mobile-action-sheet,mobile-screen,mobile-tab-bar,view-switch}.tsx`
  - 其余 `hover:bg-grouped` 所在的业务组件（先 `grep -rn "bg-grouped" src` 列全）

**要点**：

1. `globals.css` 新增 Token。在 `:root` / `.dark` 定义实体，在 `@theme inline` 映射成工具类：

   | Token | 浅色 | 深色 | 工具类 |
   |-------|------|------|--------|
   | `--fill-hover` | `#f2f2f7` | `rgb(255 255 255 / 0.07)` | `bg-fill-hover` |
   | `--fill-footer` | `rgb(242 242 247 / 0.6)` | `rgb(255 255 255 / 0.03)` | `bg-fill-footer` |
   | `--segmented-track` | `#e9e9ee` | `rgb(255 255 255 / 0.08)` | `bg-segmented-track` |
   | `--segmented-thumb` | `#ffffff` | `#48484a` | `bg-segmented-thumb` |

2. 替换规则：

   | 现写法 | 改为 |
   |--------|------|
   | `hover:bg-grouped`、`aria-expanded:bg-grouped`、`focus:bg-grouped`、`focus-visible:bg-grouped`、`data-selected:bg-grouped`、`data-[state=selected]:bg-grouped` | 同前缀 `bg-fill-hover` |
   | `hover:bg-grouped/60`、`has-aria-expanded:bg-grouped/60`（表格行） | `hover:bg-fill-hover`、`has-aria-expanded:bg-fill-hover` |
   | `bg-grouped/60`（对话框、卡片、表格页脚） | `bg-fill-footer` |
   | Button `secondary`：`bg-grouped hover:bg-grouped/70` | `bg-fill-hover hover:bg-fill-hover/70` |
   | Badge `secondary`：`bg-grouped` | `bg-fill-hover` |
   | Segmented 轨道 `bg-grouped`、选中 `bg-surface` | `bg-segmented-track`、`bg-segmented-thumb` |
   | Tabs `dark:data-active:bg-grouped/50` | `dark:data-active:bg-fill-hover` |

3. `bg-grouped` 只保留一种用法：页面底色（`body`、分组页背景）。

4. 加一道守卫：新建 `app/__tests__/token-usage.test.ts`，用 `fs` 遍历 `src/**/*.tsx`（排除 `__tests__`）。出现 `(hover|focus|focus-visible|aria-expanded|data-selected):bg-grouped` 或 `bg-grouped/60` 即失败，失败信息列出文件与行号。

**测试**：
- `token-usage.test.ts`
- 已有组件测试里断言类名的地方同步更新

**验收**：
- 守卫测试通过。
- 深色下对照 Q-01 缩略图逐屏看 D-01、D-04、D-07、D-16、D-17、M-04，悬停行、菜单高亮、对话框页脚、分段控件都不再发黑。
- `pnpm --filter web test:e2e -- theme.spec.ts` 通过。

#### 12.0.2 表单控件与确认对话框

- **画板**：[D-03](UI补稿设计图.md#d-03) · [D-12](UI补稿设计图.md#d-12) · [D-14](UI补稿设计图.md#d-14) · [D-04 ④](UI补稿设计图.md#d-04)
- **文件**：
  - `components/ui/{input,textarea,input-group}.tsx`
  - 新增 `components/ui/select.tsx`、`components/ui/popover.tsx`
  - 新增 `components/shared/password-input.tsx`、`components/shared/confirm-dialog.tsx`

**要点**：
1. 三个输入原件的 `rounded-lg` 改为 `rounded-md`（10）。默认高度不动，由页面按图例传 `h-9` / `h-10` / `h-12`。
2. **Select / Popover**：用 shadcn CLI 按仓库 `components.json` 的风格拉取，作为 vendored 原件入库，不手改结构。
   - Select 取代 `account-settings.tsx`、`register-form.tsx` 里的原生 `<select>`。
   - Popover 供 12.3.4 的日期时间选择使用。
3. **`PasswordInput`**：`InputGroup` + 右侧图标按钮。
   - 图标 Eye / EyeOff；按钮 `aria-label` 为「显示密码」/「隐藏密码」，带 `aria-pressed`。
   - 切换 `type`，不丢失焦点与光标位置。
4. **`ConfirmDialog`**：

   ```ts
   type ConfirmDialogProps = {
     open: boolean; onOpenChange(open: boolean): void;
     title: string; description: ReactNode;
     confirmLabel: string; pendingLabel?: string;
     tone?: "default" | "danger"; pending?: boolean;
     onConfirm(): void;
   };
   ```

   - 打开时焦点在「取消」。
   - `pending` 时两个按钮都禁用，确认键显示转圈与 `pendingLabel`。
   - 用它替换全部 `window.confirm`：`note-editor.tsx:115` 与后续新增的删除 / 移除 / 退回 / 恢复。

**测试**：
- `password-input.test.tsx`：点击切换 `type` 与 `aria-pressed`。
- `confirm-dialog.test.tsx`：默认焦点在取消；pending 禁用；确认只回调一次。

**验收**：
- 全站 `rounded-lg` 的输入框为 0。
- 全站 `window.confirm`（除 AI 页面外）为 0。

#### 12.0.3 状态组件与文案

- **画板**：[Q-02](UI补稿设计图.md#q-02)
- **文件**：
  - 新增 `components/shared/states.tsx`
  - `lib/api/errors.ts`
  - 下文列出的 24 处错误态

**要点**：

1. **`toUserMessage(error: unknown): string`**，写在 `lib/api/errors.ts`：
   - 超时（`TimeoutError`）或 `TypeError: Failed to fetch` → 「网络连接超时，请检查网络后重试」
   - `ApiError` → 后端 `msg`
   - 文本里出现 `collab`、`MinIO`、`OBS`、`B0400` 等实现细节 → 「服务暂时不可用，请稍后重试」，原文打到 `console.error`

2. 组件：

   | 组件 | 规格 |
   |------|------|
   | `QueryError({ object, error, onRetry, retrying, compact? })` | `role="alert"`；`bg-danger/6 dark:bg-danger/10`；文案「{object}加载失败：{toUserMessage(error)}」；「重试」次按钮，`retrying` 时转圈；`compact` 用于侧栏与对话框内 |
   | `EmptyState({ icon, title, hint, action? })` | 1px 虚线框；标题 15–17 SemiBold；说明 13 `label-secondary`；最多一个动作 |
   | `NotFoundState({ object, backHref, backLabel })` | 居中卡片：「找不到这个{object}」+「它可能已被删除，或者你还没有访问权限。」+ 返回次按钮 |
   | `ConnectionBanner({ onReconnect })` | 协同页用：「连接已断开，恢复后会自动同步你的改动」+「重新连接」 |

3. **替换 24 处错误态**，改成 `QueryError` 并接 `refetch` / `isRefetching`：
   - `mooc-page` · `mooc-detail`（2 处）· `mooc-list-mobile` · `mooc-detail-mobile`（2 处）
   - `mobile-dashboard` · `create-note-page` · `create-note-mobile`
   - `note-editor` · `note-editor-mobile` · `note-list` · `note-list-mobile`
   - `knowledge-base-gallery` · `knowledge-base-grid` · `note-bases-mobile`
   - `knowledge-base-detail`（资料、成员）· `base-docs-mobile`
   - `tasks-page` · `task-cards-mobile` · `submit-task-dialog`
   - `account-settings` · `sidebar-nav`（compact）

   AI 页面 6 处不改；`wikis` 3 处随 12.1.3 删除。

4. **空态、不存在态文案**按下表照抄（来自 Q-02 逐页文案总表）：

| 画板 | 空态 / 不存在 · 标题 | 说明 | 动作 | 错误文案 | 重试 |
|------|------|------|------|------|------|
| D-01 笔记 Tab | 这个知识库还没有笔记 | 新建一篇，开始记录。 | 新建笔记 | 笔记加载失败：{message} | 有 |
| D-02 概览 · 资料块 | 还没有资料。上传 PDF 后可以在「PDF 问答」里围绕它提问。 | — | 去上传 | 找不到这个知识库 | — |
| D-03 新建笔记 | 还没有知识库 | 笔记必须归属一个知识库，先创建一个。 | 新建知识库 | — | — |
| D-05 慕课 Tab | 这个知识库下还没有课程 | 新建一门课，把视频和资料整理进来。 | 新建课程 | 课程加载失败：{message} | 有 |
| D-06 慕课详情 | 这门课还没有章节内容 | 章节下暂无内容 | — | 视频地址获取失败，请稍后重试。 | 有 |
| D-07 任务 Tab | 这个知识库下还没有任务 | 任务由知识库管理员发布。 | （管理员）新建任务 | 任务加载失败：{message} | 有 |
| D-07 筛选 | 没有已退回的任务 | 换个筛选条件看看。 | 查看全部 | — | — |
| D-08 资料 Tab | 还没有资料 | 上传 PDF 后可以在「PDF 问答」里围绕它提问。 | 去上传 | 资料加载失败：{message} | 有 |
| D-09 成员 Tab | 这个知识库还没有其他成员。 | — | — | 成员加载失败：{message} | 有 |
| D-09 搜索 | 没有找到用户名包含「{q}」的成员 | — | 清除搜索 | — | — |
| D-10 协同文档库 | 还没有协同文档 | 新建一篇，把链接发给同伴就能一起写。 | 新建文档 | 协同服务暂时连不上，已写下的内容不会丢失。 | 有 |
| D-11 协同工作区 | 这篇文档已从文档库移除 | 可能被其他成员移除了。 | 回到文档库 | 协同服务暂时连不上，稍后重试。 | 有 |
| D-12 设置 · 账号 | — | — | — | 资料加载失败：{message} | 有 |
| D-13 设置 · 集成 | 暂无可用的集成 | 文件存储与 AI 服务由管理员在后台配置，这里暂时没有需要你连接的服务。 | — | — | — |
| D-15 CLI 授权 | 授权链接无效 | {原因}。请在终端重新执行 anynote auth login。 | — | 无法读取当前账号，请刷新页面重试。 | — |
| D-16 笔记历史版本 | 这篇笔记还没有历史版本 | 之后每次保存都会在这里留下一个版本。 | — | 这个版本加载失败：{message} | 有 |
| D-17 任务详情 | 找不到这个任务 | 它可能已被删除，或你不在这个知识库里。 | 回到任务 | — | — |
| M-01 工作台 | 还没有知识库 | 先建一个知识库，笔记会归到它下面。 | 去创建 | — | — |
| M-03 慕课 Tab | 这个知识库还没有课程 | 课程在桌面版创建。 | — | 课程加载失败：{message} | 有 |
| M-05 资料 Tab | 还没有资料 | 到「PDF 问答」上传 PDF，之后就能围绕它提问。 | 去上传 | 资料加载失败：{message} | — |
| M-10 搜索 | 没有找到「{查询词}」 | 搜索只覆盖页面与知识库名称，笔记正文暂不支持。 | 用「{查询词}」新建笔记 | — | — |

**测试**：
- `states.test.tsx`：重试回调、`retrying` 转圈、`compact` 形态。
- `errors.test.ts`：`toUserMessage` 的四类输入。
- 被替换的组件里至少各补一条「出错 → 点重试 → 重新请求」。

**验收**：
- `grep -rn "加载失败：{" src/features src/components` 只剩 AI 页面。
- 断网访问 D-01，看到带重试的错误态；恢复网络后点重试可以恢复。

#### 12.0.4 导航注册表与路由工具

- **画板**：[F-01](UI补稿设计图.md#f-01) · [F-02](UI补稿设计图.md#f-02)
- **文件**：
  - `components/layout/navigation.ts`
  - `components/layout/__tests__/navigation.test.ts`
  - `components/layout/app-sidebar.tsx`
  - `lib/mobile/search.ts`

**要点**（先写失败用例再改）：
1. 新增地址函数，桌面与移动各一组，页面里不再手拼字符串：
   - `moocDetailHref(baseId, moocId)`
   - `taskDetailHref(baseId, taskId)`
   - `taskNewHref(baseId)`
   - `taskEditHref(baseId, taskId)`
   - `noteHistoryHref(baseId, noteId)`
   - 以及对应的 `mobile*Href`
2. `IMMERSIVE_PATTERNS` 改为按数字段判定：
   - `/^\/m\/notes\/\d+\/\d+$/`（编辑器）
   - `/^\/m\/notes\/\d+\/\d+\/history$/`（历史版本）
   - 保留 docs / ai / search 三条
   - 删掉 wikis 一条
3. `isFullBleedRoute` 增加 `/^\/notes\/\d+\/\d+\/history$/`：D-16 与编辑器同为满幅。
4. `mobileTabs` 里「知识库」的 `match` 去掉 `/m/wikis`；`MOBILE_ROUTE_PREFIXES` 去掉 `/wikis`。
5. `mobileMoreRoutes` 删「任务」「慕课」两项；`lib/mobile/search.ts` 同步删除。
6. 确认侧栏高亮在嵌套路由下正确：
   - `/notes/7/tasks/3` 点亮「任务」
   - `/notes/7/42/history` 点亮「笔记」并高亮目录里的 42

   `sectionSegmentFromPath` 与 `parseNoteIdFromPath` 已支持，只补测试。

**测试**（`navigation.test.ts` 追加）：
- `isImmersiveMobileRoute("/m/notes/3/tasks") === false`：**现状为 true，先失败**
- `isImmersiveMobileRoute("/m/notes/3/7/history") === true`
- `activeMobileTab("/m/notes/3/tasks/9")?.title === "知识库"`
- `isFullBleedRoute("/notes/3/7/history") === true`
- `mobileMoreRoutes` 不含 `/m/tasks`、`/m/mooc`
- 各 `*Href` 函数的输出
- `app-sidebar` 的两个嵌套路径

**验收**：
- 移动端打开 `/m/notes/3/tasks` 能看到底部 tab bar。
- 「我的 › 更多」只剩协同文档与 PDF 问答。

<a id="m12-1"></a>

### M12.1 路由迁移

#### 12.1.1 新路由页面

- **画板**：[F-01](UI补稿设计图.md#f-01) · [F-02](UI补稿设计图.md#f-02)，以及各页对应画板
- **文件**：§3.2 列出的 8 个 `page.tsx`；新增 `app/(mobile)/m/notes/[baseId]/[noteId]/history/loading.tsx`

**要点**：
1. 页面文件只做两件事：
   - 解析参数，沿用现有写法 `Number.isSafeInteger(id) && id > 0`，否则 `notFound()`
   - 渲染对应的 feature 组件

   不在 RSC 里取数。
2. 移动端 `[noteId]/loading.tsx` 是编辑器骨架，嵌套的历史页会继承它。所以 `history/loading.tsx` 要单独放一份列表骨架。
3. 新建 / 编辑任务只允许知识库管理员（`useKnowledgeBaseQuery(baseId).data.permissions === 1`）。其他人访问时 `router.replace` 回任务 Tab，并提示「只有知识库管理员可以发布任务」。
4. 编辑器、只读正文、日期选择都走 `dynamic(..., { ssr: false })`。

**测试**：每个 `page.tsx` 不单测（纯参数解析，豁免）；feature 组件的测试在各自任务里写。

**验收**：
- 8 个地址都能直接打开（深链）。
- 非数字 id 返回 404。
- `pnpm --filter web bundle:budget` 通过：新增的 `/m/*` 首屏 JS 不超过 250KB，编辑器 chunk 不超过 250KB。

#### 12.1.2 旧地址重定向

- **画板**：[F-01](UI补稿设计图.md#f-01) 右侧「建议重定向」节点 · [F-02](UI补稿设计图.md#f-02) 规则 R
- **文件**：
  - `app/(workspace)/{mooc,tasks}/page.tsx`
  - `app/(workspace)/mooc/[id]/page.tsx`
  - `app/(mobile)/m/{mooc,tasks}/page.tsx`
  - `app/(mobile)/m/mooc/[id]/page.tsx`
  - 删除 `app/(workspace)/{mooc,tasks}/loading.tsx`
  - 新增 `features/mooc/components/legacy-mooc-redirect.tsx`
  - `features/mooc/components/mooc-page.tsx`
  - `features/tasks/components/tasks-page.tsx`
  - `features/mooc/components/mobile/mooc-list-mobile.tsx`
  - `features/tasks/components/mobile/task-cards-mobile.tsx`

**要点**：
1. 无 id 的四个地址用 `redirect("/notes")` / `redirect("/m/notes")`。
2. `LegacyMoocRedirect({ moocId, variant })`：
   - `useMoocQuery` 成功后 `router.replace(moocDetailHref(...))`
   - 加载中显示骨架
   - 失败显示 `NotFoundState({ object: "课程", backHref: "/notes" })`
3. 删掉 `MoocPage`、`TasksPage` 的跨库分支（`KnowledgeBaseSelect` 与「默认第一个库」的 `useEffect`），`baseId` 改为必填。
4. 两个移动端列表组件改为接收 `baseId` 参数，具体改动在 12.7.2 / 12.7.3。
5. `components/shared/knowledge-base-select.tsx` 仍被 `/ai/pdf` 使用，保留。

**测试**：`legacy-mooc-redirect.test.tsx`
- 拿到 `knowledgeBaseId` 后以正确地址 `replace`
- 查询失败显示不存在态

**验收**：
- 访问 `/mooc/12` 落到 `/notes/{库}/mooc/12`，访问 `/m/tasks` 落到 `/m/notes`，浏览器历史里不留旧地址。
- `e2e/mobile-core.spec.ts` 的路由清单同步更新。

#### 12.1.3 删除 wikis

- **画板**：[F-01](UI补稿设计图.md#f-01) · [F-02](UI补稿设计图.md#f-02)「已拍板删除」
- **文件**：删除以下内容，并同步引用方
  - `app/(workspace)/wikis/**`
  - `app/(mobile)/m/wikis/**`
  - `features/wikis/**`（含测试）

**要点**：
1. `note-lists-mobile.test.tsx` 里 `basePath="/m/wikis"` 的用例改成 `/m/notes`。
   - 如果 `MobileNoteBases` / `MobileNoteList` 的 `basePath` 参数只剩一个取值，删掉该参数。
2. `e2e/mobile-core.spec.ts` 删掉 `/m/wikis`。
3. 全仓 `grep -rn "wikis" apps/web docs/mobile` 收尾。文档里的引用改成「已删除（2026-09-15 拍板）」。

**验收**：
- `grep -rn "/wikis" apps/web/src` 为 0。
- `pnpm --filter web typecheck` 与 `test` 通过。

<a id="m12-2"></a>

### M12.2 桌面 · 知识库内

#### 12.2.1 笔记 Tab（D-01）

- **画板**：[D-01](UI补稿设计图.md#d-01)
- **附录 A**：D-01 表
- **文件**：`features/notes/components/note-list.tsx` 及其测试

**要点**：
1. **行操作「⋯」**：`DropdownMenu`，只在行 `:hover` / `:focus-within` 时显示（`opacity-0 group-hover:opacity-100 group-focus-within:opacity-100`），键盘仍可聚焦。
   - 菜单头「移动到知识库」，列出除当前库外的库，调 `useMoveNoteMutation`，成功 toast「已移动到 {库名}」，列表失效。
   - 「删除笔记」打开 `ConfirmDialog`（D-04 ④ 文案），调 `useDeleteNoteMutation`。
2. **空态**：`EmptyState` + 次按钮「新建笔记」，打开与页头相同的 `CreateNoteDialog`。
3. **错误态**：`QueryError`。

**测试**：
- 菜单只列其他库
- 删除走确认
- 空态按钮打开对话框
- 出错可重试

**验收**：鼠标与键盘都能完成移动和删除，删除后列表与侧栏目录同步减少一条。

#### 12.2.2 概览 Tab（D-02）

- **画板**：[D-02](UI补稿设计图.md#d-02)
- **文件**：`features/notes/components/knowledge-base-detail.tsx`（概览部分）

**要点**：
- 「新建笔记」主按钮在 `permissions > 2`（可阅读 / 无权限）时隐藏。
- 资料块空态与错误文案按 12.0.3 的表。

**测试**：权限 1 / 2 / 3 三种渲染。

**验收**：只读成员看不到「新建笔记」。

#### 12.2.3 慕课 Tab（D-05）

- **画板**：[D-05](UI补稿设计图.md#d-05)
- **附录 A**：D-05 表
- **文件**：`features/mooc/components/mooc-page.tsx`

**要点**：
1. 「新建课程」改为页头主按钮，`permissions > 2` 时隐藏。
2. 整张卡片是 `Link`，指向 `moocDetailHref(baseId, id)`，不再 `router.push("/mooc/…")`。
3. 空态带「新建课程」次按钮。
4. **新建对话框**：
   - 说明「课程会创建在「{库名}」下。」
   - 名称输入框：`rounded-md`、`N / 50` 计数、打开即聚焦、回车提交
   - 不足 2 字时内联报错（`aria-invalid` + 下方 12 号 danger 文案），不再弹 toast
   - 页脚补「取消」
5. 请求体沿用 `dataScope: 1`（M7.6 第 2 条的规避）。

**测试**：
- 权限隐藏按钮
- 卡片 href
- 内联校验
- 回车提交

**验收**：新建课程后停留在本页，新卡片出现在第一位。

#### 12.2.4 慕课详情（D-06，含缺陷修复）

- **画板**：[D-06](UI补稿设计图.md#d-06)
- **附录 A**：D-06 表
- **文件**：
  - `features/mooc/components/mooc-detail.tsx`
  - `features/mooc/use-moocs.ts`（新增 `useMoocQuery`）
  - `features/mooc/schemas.ts`
  - `features/mooc/query-keys.ts`

**要点**：
1. **先写失败用例**：展开章节后点子条目，断言右侧打开的是子条目、父章节仍展开。
   - 修法：`ChapterChildren` 改收 `onSelectItem(child: MoocItem)` 和 `selectedId`，子条目有自己的选中态。
2. **页头**：
   - 「‹ 慕课」指向 `/notes/:baseId/mooc`
   - 课程名用 Display 字阶，来自 `useMoocQuery`
   - 侧栏「慕课」保持高亮（路径天然满足）
3. **右侧内容**：
   - 标题下一行「视频 · 在「{章节}」中」
   - 进入页面时默认选中目录里的第一个视频
   - 底部「下一节」按目录顺序（章节内子条目按返回顺序展开）取下一个视频或文档，最后一节隐藏
     - 未加载的章节子条目用 `queryClient.fetchQuery(moocQueryKeys.items(...))` 按需取
   - 视频地址失败时「重新获取」调 `refetch`
4. 条目详情受 M7.6 第 3 条（`n:mooc:read` 权限规则缺失）影响时，走 `QueryError`，不做特殊处理。

**测试**：
- 缺陷用例
- 默认选中第一个视频
- 下一节顺序（跨章节）
- 最后一节隐藏
- 重新获取

**验收**：章节下的视频可以播放；从 `/mooc/12` 旧链接进入经重定向后，页头显示课程名。

#### 12.2.5 资料 Tab（D-08）

- **画板**：[D-08](UI补稿设计图.md#d-08)
- **附录 A**：D-08 表
- **文件**：
  - `features/notes/components/knowledge-base-detail.tsx`（`KnowledgeBaseDocs`）
  - `features/ai/use-docs.ts`
  - `features/ai/components/pdf/pdf-page.tsx`
  - `app/(workspace)/ai/pdf/page.tsx`

**要点**：
1. 页头「上传 PDF」主按钮 → `/ai/pdf?baseId=:baseId`。
2. 整行可点 → `/ai/pdf?baseId=:baseId&docId=:docId`。
3. **「建立索引」**：悬停或聚焦「未索引」行时，用按钮替换徽标。
   - 点击调 `useIndexDocMutation`，徽标变「索引中…」转圈。
   - 用现有 `useDocIndexStatus` 轮询，到 `indexStatus === 1` 变「已索引」。
   - `useIndexDocMutation` 从 `useUploadPdfMutation` 第 2 步抽出，上传链路改为调用它。
4. **`/ai/pdf` 读地址参数**：
   - `pdf-page.tsx` 用 `useSearchParams()` 读 `baseId`、`docId`（合法正整数才用），作为两个 `useState` 的初始值。
   - 页面外包 `<Suspense>`，Next 15 下 `useSearchParams` 需要它。
   - **只改取参，不动 AI 页版式**。

**测试**：
- 行 href
- 建立索引触发 mutation 并切到轮询态
- `pdf-page` 读取合法 / 非法参数

**验收**：从资料 Tab 点一份文档，`/ai/pdf` 直接选中该库和该文档。

#### 12.2.6 成员 Tab（D-09）

- **画板**：[D-09](UI补稿设计图.md#d-09)
- **附录 A**：D-09 表
- **文件**：
  - 新增 `features/notes/components/knowledge-base-members.tsx`（从 `knowledge-base-detail.tsx` 拆出）
  - `features/notes/use-knowledge-bases.ts`

**要点**：
1. 页头下方加三档权限说明卡：管理员 / 可编辑 / 可阅读，各一句话，文案见图例。
2. **搜索框**：
   - 300ms 防抖，`useKnowledgeBaseMembersQuery(baseId, { username })`，query key 带上 `username`
   - 无结果显示「没有找到用户名包含「{q}」的成员」+「清除搜索」
3. **行操作「⋯」**：只在「我是管理员」（本库 `permissions === 1`）且不是自己那行时出现。
   - 当前用户 id 取 `features/auth/use-me.ts`。
   - 「移除成员」打开 `ConfirmDialog`，确认后调 `useRemoveMemberMutation`，失效成员列表。

**测试**：
- 防抖（fake timers）
- 非管理员无菜单
- 自己那行无菜单
- 移除走确认并失效

**验收**：管理员能搜索并移除成员；普通成员页面只读。

<a id="m12-3"></a>

### M12.3 任务

#### 12.3.1 任务数据层

- **画板**：[D-07](UI补稿设计图.md#d-07) · [D-17](UI补稿设计图.md#d-17) · [D-18](UI补稿设计图.md#d-18) · [M-04](UI补稿设计图.md#m-04) · [M-12](UI补稿设计图.md#m-12)
- **文件**：
  - `features/tasks/{schemas,query-keys,use-tasks}.ts`
  - 新增 `features/tasks/{use-task-detail,use-task-mutations}.ts`
  - 新增 `features/tasks/lib/{task-window,heatmap}.ts`
  - `features/_keys.test.ts`

**要点**：

1. **修状态枚举**（§1.4 第 2 条，先写失败用例 `submissionStatusText(3) === "已退回"`）：

   ```ts
   export const TASK_STATUS = { NOT_SUBMITTED: 0, SUBMITTED: 1, NO_SUBMISSION_REQUIRED: 2, RETURNED: 3 } as const;
   // 文案：0 未提交 / 1 已提交 / 2 无需提交 / 3 已退回
   ```

2. **可操作判定**，写在 `task-window.ts`，全部接收 `now` 参数以便测试：

   | 函数 | 条件 |
   |------|------|
   | `taskPhase(start, end, now)` | 返回 `"upcoming"` / `"active"` / `"closed"` |
   | `daysLeft(end, now)` | 向上取整；≤ 3 天由调用方显示 warning |
   | `canSubmit(task, now)` | `status === 0 && phase === "active"` |
   | `canResubmit(task, now)` | `status === 3 && phase === "active"` |
   | `defaultStartTime(now)` | 下一个整点 |
   | `defaultEndTime(start)` | 开始 + 7 天的 23:59 |
   | `presetEndTime(start, "1w" \| "2w" \| "1m")` | 开始日 + 7 / 14 / 30 天的 23:59 |
   | `completionRate(needSubmitCount, submittedCount)` | `need === 0` 时为 1，否则 `submitted / need`。**不直接用后端 `submissionProgress`**：它在 `need === 0` 时是 `100.0`，其余时候是 0–1 的小数（`NoteTaskServiceImpl.java:513-519`），两套量纲 |

   后端对「任务尚未开始」也会拒绝提交（`NoteTaskServiceImpl.java:359-360`），所以 `canSubmit` 必须判断开始时间。

3. **`heatmap.ts`**：
   - `levelOf(count, max)`：0 次为 0 档，其余 `Math.max(1, Math.ceil(count / max * 5))`
   - `collapseMembers(rows, limit = 12)`：按 `total` 降序取前 12 行，其余合并为「其余 N 人」一行，`counts` 逐日相加
   - `isFutureDay(day, today)`

4. **hooks**：按 §3.3 的表实现。
   - `useMemberTaskQuery(baseId, taskId)` 以 `pageSize = 50` 逐页请求 `GET /noteTasks`，找到即停；翻完仍没有返回 `null`，页面据此显示不存在态。
   - 请求体里的时间用 `Date#toISOString()`，与旧前端 dayjs 的 JSON 序列化一致。

**测试**：
- `task-window.test.ts`：状态 × 时间窗口的真值表，含未开始、刚好截止
- `heatmap.test.ts`
- 每个 hook 一个 `renderHook` 用例，在 openapi-fetch 客户端层打桩：
  - 成功
  - 业务错误
  - `useMemberTaskQuery` 翻页找到 / 找不到
  - 退回成功后的失效范围

**验收**：`pnpm --filter web test -- features/tasks` 全绿；`_keys.test.ts` 覆盖新 key。

#### 12.3.2 任务 Tab 与提交对话框（D-07）

- **画板**：[D-07](UI补稿设计图.md#d-07)
- **附录 A**：D-07 表
- **文件**：`features/tasks/components/{tasks-page,task-table,submit-task-dialog}.tsx`

**要点**：

1. **页头**：
   - 副标题「N 个任务 · M 个待你提交」（M = `canSubmit || canResubmit` 的行数）；无任务时用画板文案。
   - 管理员（`permissions === 1`）显示「新建任务」主按钮 → `taskNewHref`。
   - 成员显示说明「任务由知识库管理员发布」。
2. **状态筛选**：
   - `Segmented`：全部 / 未提交 / 已退回 / 已提交，每项带计数，纯本地过滤。
   - 筛选无结果时显示 `EmptyState` +「查看全部」。
3. **表格行**：
   - 整行可点 → `taskDetailHref`。行内按钮 `stopPropagation`；行本身用 `Link` 包名称单元格，加 `after:absolute after:inset-0` 扩大命中区，保证键盘可达。
   - 名称下一行「{taskCreatorNickname} 发布」。
   - 状态徽标：未提交 `warning`、已提交 `success`、已退回 `danger`。
   - **`status === 2`**（本库管理员自己）不显示徽标与操作（图例 `t-status`），只计入「全部」。
   - 操作列：
     - `canSubmit` →「提交」
     - `canResubmit` →「重新提交」
     - `status === 1` → accent 文字「查看」→ `taskDetailHref`（图例 `t-view`，§1.4 第 3 条）
     - 截止后 → 灰字「已截止」
     - 其余情况留空
4. **提交对话框**：
   - 「知识库」改成只读行「▣ {库名} · 任务所在库」（§1.4 第 1 条），删掉 `KnowledgeBaseSelect` 与默认第一个库的逻辑。
   - 笔记列表按任务的 `knowledgeBaseId` 查。
   - 选中态：`bg-accent-soft text-accent font-medium` + 右侧 Check 图标，删掉 Spinner。
   - 重新提交时默认选中 `submissionNoteId`。
   - 成功 toast「任务已提交」；失败 toast 显示后端原因。

**测试**：
- 更新 `task-table.test.tsx`：徽标变体、操作列真值表（含「查看」）、`status 2` 行无徽标、整行链接
- `submit-task-dialog.test.tsx`：知识库只读、默认选中上次笔记、选中态不再有 Spinner
- 筛选计数

**验收**：
- 成员能提交；被退回后能重新提交。
- 管理员看到「新建任务」。
- 已提交的任务没有任何提交按钮。

#### 12.3.3 任务详情（D-17）

- **画板**：[D-17](UI补稿设计图.md#d-17)
- **附录**：A 的 D-17 表；**B 的 D-17 完整图例**
- **依赖**：B-1（热力图）
- **文件**：
  - 新增 `features/tasks/components/{task-detail-page,task-heatmap,return-submission-dialog}.tsx`
  - `app/globals.css`（热力色阶 Token）

**要点**：

1. **视角**：本库 `permissions === 1` 用管理员视角（`useAdminTaskQuery`），否则用成员视角（`useMemberTaskQuery`）。
2. **管理员视角**，按图例 1 – 19：
   - **页头**：
     - 「‹ 任务」
     - 任务名
     - 时间状态徽标（`taskPhase`：未开始 / 进行中 / 已截止）
     - 「{发布人} 发布 · {开始} – {截止} · 还剩 N 天」。`AdminNoteTaskVO` 没有发布人昵称，从同一任务的 `useMemberTaskQuery` 结果里取 `taskCreatorNickname`；管理员也在任务成员表里，`status = 2`。
     - 「编辑任务」次按钮 → `taskEditHref`
   - **统计卡**：应提交、已提交、完成率（`completionRate`）、进度条与「已提交 / 应提交」。
   - **任务描述**：只读 TipTap（`preset="readonly"`，dynamic import），描述为空时整卡隐藏。
   - **提交记录**：
     - `Segmented`：已提交 / 未提交 / 已退回，对应 `userTaskStatus` 1 / 0 / 3。三个 tab 的计数取各自查询的 `total`，三条查询并行、每页 20。
     - 已提交、已退回的行点击打开 `/notes/{baseId}/{noteId}`（§1.4 第 1 条）；「未提交」行不可点。
     - 已提交的行悬停出「⋯」：打开提交的笔记 / 退回。
   - **退回**：`ConfirmDialog`，`tone="danger"`，文案「{昵称} 的提交会变成「已退回」，TA 可以在 {截止时间} 之前重新提交。」
     - 已截止时改为「任务已截止，退回后 TA 将无法重新提交。」
     - 成功后 toast「已退回」，失效提交记录与详情，该行移到「已退回」。
3. **热力图 `TaskHeatmap`**：
   - **Token**：在 `globals.css` 定义 `--heat-0` … `--heat-5` 与 `--heat-future`，取值见下方代码块（与 Q-01 #5 一致，深色翻转为暗 → 亮）。
   - **布局**：CSS Grid，行 = 成员，列 = `days`；格高 26、圆角 4、间距 2px；`isFutureDay` 的列画描边空格。
   - **交互**：每格可聚焦，`aria-label="{昵称} · {MM-dd} 编辑 {n} 次"`；悬停或聚焦时出现 Tooltip，内容同 aria-label，数字用主文字色。
   - **行数**：超过 12 人时用 `collapseMembers` 折叠。
   - **图例**：「少 → 多」6 档色块，外加「未到」空格。
   - **降级**：B-1 未上线（404）时整卡不渲染；其他错误走 `QueryError`。

   ```css
   :root { --heat-0: rgb(120 120 128 / .10); --heat-1: #dce9fa; --heat-2: #afcdf3; --heat-3: #76a9ea; --heat-4: #3d84dd; --heat-5: #0b5bbe; --heat-future: rgb(120 120 128 / .05); }
   .dark { --heat-0: rgb(120 120 128 / .18); --heat-1: #15304f; --heat-2: #1c4a7c; --heat-3: #2767ac; --heat-4: #4a8fdd; --heat-5: #9cc8ff; --heat-future: rgb(120 120 128 / .08); }
   ```

4. **成员视角**（图例 20 – 21）：
   - 任务名、我的状态、时间窗口、描述。
   - 「我的提交」：`submissionNoteId` 存在时显示笔记行，标题取 `useNoteQuery(submissionNoteId)`，点击去编辑器。
   - 时间线：`useTaskTimelineQuery`，只显示提交（3）与退回（4），新的在上。
   - 页头主按钮：`canSubmit` →「提交」，`canResubmit` →「重新提交」，已提交为禁用的「已提交」，截止后为禁用的「已截止」（图例 `ts-member`）。前两种打开 12.3.2 的提交对话框。
5. **不存在**：两种视角查不到时显示 `NotFoundState({ object: "任务", backHref: 任务 Tab })`。

**测试**：
- `task-detail-page.test.tsx`：
  - 管理员视角渲染统计
  - 切到「已退回」时请求带 `userTaskStatus=3`
  - 退回流程与失效
  - 已截止文案
  - 成员视角三种按钮状态
  - 不存在态
- `task-heatmap.test.tsx`：
  - 档位 class
  - 未来列
  - 折叠行
  - Tooltip 文案
  - 404 时不渲染

**验收**：
- 管理员能看到进度并退回提交。
- 被退回的成员刷新后在 D-07 看到「已退回」和「重新提交」。
- 深色下热力图读法正确，数值越大越亮。

#### 12.3.4 任务新建 / 编辑（D-18）

- **画板**：[D-18](UI补稿设计图.md#d-18)
- **附录**：A 的 D-18 表；**B 的 D-18 完整图例**
- **文件**：新增 `features/tasks/components/{task-form-page,date-time-field}.tsx`

**要点**：

1. **表单状态与校验**：

   ```ts
   const taskFormSchema = z.object({
     taskName: z.string().trim().min(1, "请填写任务名称").max(20, "任务名称最多 20 个字"),
     startTime: z.date(),
     endTime: z.date(),
     taskDescribe: z.string(),
   }).refine((v) => v.endTime > v.startTime, { path: ["endTime"], message: "截止时间必须晚于开始时间" });
   ```

   新建时后端只校验非空，但 PATCH 限制 1–20 字，两边统一按 20 校验。

2. **字段**：
   - 「发布到 ▣ {库名}」只读
   - 任务名称：自动聚焦、`N / 20` 计数
   - 开始 / 截止：`DateTimeField`，Popover 内是月历（7 列、今天描边、选中 accent、窗口内浅色连成区间）+ `HH:mm` 输入 +「确定」
   - 快捷胶囊 1 周 / 2 周 / 1 个月：用 `presetEndTime` 回填截止
   - 任务描述：TipTap `minimal` 预设（dynamic import），工具条为粗体、斜体、H2、无序列表、有序列表、链接；读写 Markdown
3. **提交**：
   - 校验失败时滚动并聚焦第一个错误字段；错误以内联方式显示，不弹 toast。
   - 新建：`POST /admin/noteTasks`，拿返回的 `id`，toast「任务已发布」，跳 `taskDetailHref`。
   - 编辑：`PATCH /admin/noteTasks/{id}`，toast「已保存」，跳详情。
   - 提交中表单只读，按钮显示「发布中…」/「保存中…」；失败 toast 后端原因并保留输入。
4. **编辑模式**：用 `useAdminTaskQuery` 预填；标题「编辑任务」、返回「‹ 任务详情」、按钮「保存修改」。
5. **离开保护**：表单有改动时注册 `beforeunload`；点「‹ 任务」或「取消」时，有改动先弹 `ConfirmDialog`。

**测试**：
- `task-form-page.test.tsx`：
  - 空名称
  - 21 字
  - 截止早于开始的内联错误
  - 快捷胶囊回填
  - 新建 payload（含 ISO 时间与 `knowledgeBaseId`）
  - 编辑预填与 PATCH payload
  - 离开确认
- `date-time-field.test.tsx`：选日、改时间、确定回填

**验收**：
- 管理员从任务 Tab 发布任务后，本库成员在 D-07 看到它。
- 编辑任务后详情立即更新。
- 编辑器 chunk 不超预算。

<a id="m12-4"></a>

### M12.4 笔记

#### 12.4.1 新建笔记页（D-03）

- **画板**：[D-03](UI补稿设计图.md#d-03)
- **附录 A**：D-03 表
- **文件**：`features/notes/components/create-note-page.tsx`

**要点**：
1. 知识库选项末尾加一张与选项同尺寸的虚线卡片「新建知识库」，打开 `CreateBaseDialog`。
   - 创建成功后留在本页、自动选中新库，并失效知识库列表。
2. 标题输入框：`h-10 rounded-md`、`N / 15` 计数、`autocomplete="off"`，超出上限计数转 danger。
3. 「取消」：带 `?baseId=` 进来时回 `/notes/:baseId`，否则回 `/notes`。

**测试**：
- 新建库后自动选中
- 取消去向两种
- 计数转色

**验收**：从知识库内「+」进入再取消，回到原库。

#### 12.4.2 对话框与命令面板（D-04）

- **画板**：[D-04](UI补稿设计图.md#d-04) ① – ④
- **附录 A**：D-04 表
- **文件**：
  - `features/notes/components/{create-note-dialog,create-base-dialog,note-editor}.tsx`
  - `components/layout/command-palette.tsx`

**要点**：
1. **① 新建笔记**：
   - 标题下加归属提示胶囊「创建到 ▣ {库名}」
   - 页脚加「取消」次按钮
2. **② 新建知识库**：
   - 页脚加「取消」
   - 从 `?new=1` 打开时，关闭要同时用 `router.replace` 去掉该参数
3. **③ 命令面板**：只做 12.0.1 的高亮底色替换，结构不变。
4. **④ 删除确认**：编辑器「删除笔记」改用 `ConfirmDialog`，文案按图例。D-01 行菜单与移动端动作表之外的删除都走它。

**测试**：
- 取消清空表单
- `?new=1` 关闭后地址栏无参数
- 删除走确认（替换 `note-editor.test.tsx` 里对 `window.confirm` 的打桩）

**验收**：四个浮层在浅色、深色下与画板一致，页脚不发黑。

#### 12.4.3 笔记历史版本（D-16）

- **画板**：[D-16](UI补稿设计图.md#d-16)
- **附录**：A 的 D-16 表；**B 的 D-16 完整图例**
- **依赖**：B-2（不阻塞：B-2 只影响异常 id 的报错形态）
- **文件**：
  - 新增 `features/notes/{use-note-history.ts,lib/history-groups.ts}`
  - 新增 `features/notes/components/{note-history-page,history-diff-view}.tsx`
  - `features/notes/components/note-editor.tsx`（菜单入口）
  - `features/notes/query-keys.ts`

**要点**：
1. **入口**：编辑器顶栏「⋯」菜单第一项「历史版本」（Clock 图标）→ `noteHistoryHref`。点之前先 `flush()`，把未保存的正文落盘。
2. **布局**：满幅（12.0.4 已加判定）；左边版本内容，右边 320 宽的历史面板。
   - 侧栏保持「笔记」选中，目录里当前笔记保持高亮。
3. **右侧面板**：
   - 标题「历史记录」+「共 N 个版本」（取第一页的 `total`）。
   - 列表：`useNoteHistoryInfinite`，每页 15 条，滚到底自动加载（`IntersectionObserver`）；到底显示「没有更早的版本了」。
   - 分组：`groupByDay(items, now)` → 今天 / 昨天 / `MM-dd 周X`。
   - 版本行：头像首字、昵称（`updaterNickname`，缺省回退 `updaterUsername`）、时间。
   - 第一条带「当前版本」徽标。
   - 默认选中第二条（上一个版本）；只有一条时选中它，并显示「这篇笔记还没有历史版本」空态。
4. **左侧内容**：
   - 提示条「正在查看 {昵称} 于 {时间} 保存的版本」。
   - `Segmented`：正文 / 本次改动。
     - **正文**：只读 TipTap 渲染 `ensureLeadingHeading(content, title)`。
     - **本次改动**：`HistoryDiffView`，用现有 `lib/notes/diff.ts` 的 `diffLines(上一版本.content, 本版本.content)` 按行渲染。上一版本 = 列表里紧挨着的更早一条，按需取；最早的版本整篇视为新增。
       - 新增行 `bg-success/18 underline decoration-success`。
       - 删除行 `bg-danger/12 line-through`。
       - 颜色之外还有下划线 / 删除线，不单靠颜色区分。
       - 本期**按行高亮**（§1.4 第 4 条），行内词级差异不做。
   - 版本内容加载时只在正文区显示段落骨架，提示条与右侧列表不受影响；失败显示 `QueryError({ object: "这个版本" })`。
5. **恢复**：「恢复此版本」主按钮，选中「当前版本」时隐藏；本库 `permissions > 2` 时也隐藏。
   - 点击后弹 `ConfirmDialog`：标题「恢复到这个版本？」，说明用图例 `r4-desc` 的原文，默认焦点在「取消」。
   - 确认后调 `useRestoreNoteVersionMutation`：
     1. `GET /notes/{noteId}` 取最新 `updateTime`，用 `toVersion` 得到 `version`。
     2. `PATCH /notes/{noteId}`，body 为 `{ title, content, version }`，均取自该历史版本。
     3. 成功：用返回值写 `noteQueryKeys.detail(noteId)` 缓存，toast「已恢复到 {时间} 的版本」，`router.push` 回编辑器；`setTimeout(2000)` 后失效 `historyList`（快照由消息队列异步生成）。
     4. 冲突码（`VERSION_CONFLICT_CODE`）：toast「笔记刚被其他会话更新，请刷新后再恢复」，留在本页并刷新列表。

**测试**：
- `history-groups.test.ts`：跨天、跨年、周几
- `use-note-history.test.ts`：
  - 无限翻页
  - 恢复的请求顺序与 body
  - 冲突分支
  - 延迟失效（fake timers）
- `note-history-page.test.tsx`：
  - 默认选中上一版本
  - 当前版本隐藏恢复
  - 只读权限隐藏恢复
  - 本次改动的增删行样式
  - 只有一个版本的空态
  - 版本加载失败可重试
- `note-editor.test.tsx`：菜单第一项是「历史版本」且先 `flush`

**验收**（真实栈）：
- 编辑一篇笔记两次后打开历史，看到 3 个版本，「本次改动」标出差异。
- 恢复到最早版本后回到编辑器，正文正确。
- 约 2 秒后历史里多出一条「当前版本」。

<a id="m12-5"></a>

### M12.5 协同文档

#### 12.5.1 协同文档库（D-10）

- **画板**：[D-10](UI补稿设计图.md#d-10)
- **附录 A**：D-10 表
- **文件**：
  - `features/collab/components/doc-library.tsx`
  - `features/collab/use-collab-room.ts`（暴露重连）

**要点**：
1. 页面标题改为「协同文档」，与侧栏入口同名。
2. 整张卡片可点，指向 `/docs/:id`。
3. 更新时间改用 `formatRelativeTime`。
4. 删除改为先弹 `ConfirmDialog`「从文档库移除？」，确认后再 `removeDoc`。
5. 连接失败文案改为「协同服务暂时连不上，已写下的内容不会丢失。」，并加「重新连接」。
   - `useCollabRoom` 返回 `reconnect()`：先 `provider.disconnect()` 再 `provider.connect()`。
6. 空态带「新建文档」；新建对话框页脚补「取消」。

**测试**：
- 删除必须确认
- 重连调用 `disconnect` / `connect`（打桩 provider）
- 卡片 href
- 相对时间

**验收**：两个浏览器同时打开，一边删除要确认，另一边实时消失。

#### 12.5.2 协同文档工作区（D-11）

- **画板**：[D-11](UI补稿设计图.md#d-11)
- **附录 A**：D-11 表
- **文件**：`features/collab/components/doc-workspace.tsx`

**要点**：
1. 顶栏加「复制链接」次按钮：`navigator.clipboard.writeText(location.href)`，toast「链接已复制，发给同伴即可一起编辑」。
2. 断线时在正文上方显示 `ConnectionBanner`，正文继续可编辑（Y.Doc 本地保留）。
3. **文档已移除**：索引已同步（`index.status === "connected"`），但 `index.docs` 里找不到该 id 时，显示不存在态「这篇文档已从文档库移除」+「回到文档库」，**不再打开空房间**。
   - 索引未连上时不做判断，避免误判。

**测试**：
- 复制链接
- 断线提示条
- 索引已连接且无该 id 时显示移除态
- 索引未连接时不显示

**验收**：A 移除文档后，B 的工作区切到移除态。

<a id="m12-6"></a>

### M12.6 设置、认证与 CLI 授权

#### 12.6.1 设置 · 账号（D-12）

- **画板**：[D-12](UI补稿设计图.md#d-12)
- **附录 A**：D-12 表
- **依赖**：B-3
- **文件**：
  - `features/settings/components/{settings-page,account-settings}.tsx`
  - `features/settings/use-profile.ts`
  - `components/layout/app-sidebar.tsx`（用户卡选中态）

**要点**：
1. 侧栏底部用户卡在 `/settings/*` 下显示 `bg-accent-soft` 选中态。
2. **资料卡**：
   - 用户名改为锁图标 +「用户名 {username} · 不可修改」。
   - 昵称 `N / 30`。
   - 性别用 `Select`：未设置 = 2、男 = 0、女 = 1。取值与 `sys_user.sex` 一致，现在前端用 null 表示未设置，要改掉。
   - 邮箱、手机号可以清空。
3. **未保存提示**：表单与服务端值不一致时显示「有未保存的修改」，一致时隐藏并禁用「保存资料」。
4. **保存**：`useUpdateMyProfileMutation` → `PUT /user/mine/profile`，四个字段全量提交。成功后用返回值写 `settingsQueryKeys.profile` 缓存，并失效 `authQueryKeys.me`。
   - B-3 上线前按钮保留，失败时 toast 后端原因。
5. **改密码**：
   - 三个输入改用 `PasswordInput`。
   - 下方规则清单（8–15 位 / 含大写 / 含小写 / 含数字）随输入实时打勾。
   - 原密码错误时，把后端业务错误落到原密码字段下方。
6. 资料加载失败走 `QueryError`。

**测试**：
- dirty 判定
- 性别映射（2 ↔ 未设置）
- 清空邮箱时 payload 为 `""`
- 规则清单四项
- 原密码错误落到字段

**验收**（B-3 上线后）：清空邮箱保存，刷新后仍为空；把性别改回「未设置」后刷新仍生效。

#### 12.6.2 设置 · 外观 / 集成（D-13）

- **画板**：[D-13](UI补稿设计图.md#d-13)
- **附录 A**：D-13 表
- **文件**：`features/settings/components/{appearance-settings,integrations-settings}.tsx`

**要点**：
1. **外观**：三张带预览的单选卡（浅色 / 深色 / 跟随系统）。
   - `role="radiogroup"`，方向键切换，点了立即生效。
   - 预览缩略用两套 Token 直接画侧栏 + 内容卡，不截图。
2. 下方说明「当前系统为{浅/深}色，界面正在使用{浅/深}色。偏好只保存在这台设备的浏览器里。」
   - 系统色取 `matchMedia("(prefers-color-scheme: dark)")`。
3. **集成**：空态文案按 12.0.3 的表，去掉 MinIO / 华为 OBS 字样。
4. **AI 分区**：只保留入口，不动内容。

**测试**：
- radiogroup 方向键
- 说明文案随系统色变化（mock `matchMedia`）

**验收**：键盘能切换主题；集成页不再出现服务名。

#### 12.6.3 登录与注册（D-14）

- **画板**：[D-14](UI补稿设计图.md#d-14)
- **附录 A**：D-14 表
- **文件**：
  - `app/(auth)/layout.tsx`
  - `features/auth/components/{login-form,register-form}.tsx`

**要点**：
1. **卡片**：顶部换成品牌标记（`components/layout/brand-logo.tsx` 的 `AnynoteLogo` 32 +「Anynote」），宽 400、圆角 20、内边距 28。
2. **输入**：`h-10 rounded-md`；密码用 `PasswordInput`；注册页性别用 `Select`（男 / 女，必填）。
3. 「还没有账号？ 创建账号」「已有账号？ 登录」的链接改用 accent 色。
4. **来自 CLI 授权**：`?next=` 以 `/cli/authorize` 开头时，标题下显示 `accent-soft` 提示条「登录后将回到「授权 CLI 登录」继续」。
   - `next` 的站内校验沿用 `lib/auth/redirect.ts` 的 `isSafeNextPath`。

**测试**：
- 提示条只在 next 指向授权页时出现
- 密码显隐
- 注册性别必填

**验收**：`anynote auth login` 在未登录浏览器里走完整条链路，登录页能看到提示条。

#### 12.6.4 CLI 授权（D-15）

- **画板**：[D-15](UI补稿设计图.md#d-15)
- **附录 A**：D-15 表
- **文件**：
  - `features/auth/components/cli-authorize.tsx`
  - `apps/cli/src/auth/loopback.ts`（回调完成页，**单独提交**）

**要点**：
1. 说明文案去掉 `**`，「独立的」用 `<strong>` 渲染。
2. 新增一行「回调到本机 127.0.0.1:{port}」，端口取自链接参数 `port`，方便用户与终端核对。
3. 安全说明换成图例里的人话版本。
4. 授权链接无效、读取账号失败的文案按 12.0.3 的表。
5. CLI 回环回调完成页改成同一视觉：品牌标记、居中卡片、「已收到授权，请回到终端继续。此页面可以关闭。」
   - 这部分在 `apps/cli`，提交 scope 用 `cli`。
   - 改完跑 `pnpm --filter @anynote/cli build`，确认 `bundled.ts` 无意外 diff。

**测试**：
- `cli-authorize.test.tsx`：无星号、端口行
- `apps/cli` 的 loopback 测试：响应 HTML 含新文案

**验收**：`pnpm --filter web test:e2e -- cli-authorize.spec.ts` 通过。

<a id="m12-7"></a>

### M12.7 移动端

移动端各屏沿用 p07–p09 的几何：顶部安全区 47、导航栏高 56、左右边距 16、浮岛 tab bar 350×64。组件优先复用 `components/layout/mobile/*`；需要底部面板时用 `components/ui/sheet.tsx`（`side="bottom"`），需要动作表时用 `MobileActionSheet`。

#### 12.7.1 工作台与我的（M-01、M-02）

- **画板**：[M-01](UI补稿设计图.md#m-01) · [M-02](UI补稿设计图.md#m-02)
- **附录 A**：M-01、M-02 表
- **文件**：`features/dashboard/components/mobile-dashboard.tsx`、`features/settings/components/mobile-me.tsx`

**要点**：
1. **工作台**：
   - 「待办 · 全部」→ `/m/notes/{baseId}/tasks`。
   - 任务行可点，去同一地址。
   - 待办只列 `status` 为 0 或 3 的前 3 条；1 和 2（管理员）不列。
2. **我的**：
   - 资料卡整卡可点 → `/m/settings/profile`。
   - 「更多」只剩协同文档与 PDF 问答（12.0.4 已改注册表）。
   - 「退出登录」先弹 `MobileActionSheet` 确认，再调登出。

**测试**：
- 待办过滤
- 全部链接
- 资料卡 href
- 退出必须确认

**验收**：工作台点「全部」进入当前库的任务 Tab，底部 tab bar 保持「知识库」高亮。

#### 12.7.2 慕课 Tab 与慕课详情（M-03、M-06）

- **画板**：[M-03](UI补稿设计图.md#m-03) · [M-06](UI补稿设计图.md#m-06)
- **附录 A**：M-03、M-06 表
- **文件**：
  - `features/mooc/components/mobile/{mooc-list-mobile,mooc-detail-mobile}.tsx`
  - 新增 `features/notes/components/mobile/base-section-tabs.tsx`（从 `note-list-mobile.tsx` 抽出）

**要点**：
1. **抽出公共头部**：把 `note-list-mobile.tsx` 里的库头与 `BaseSectionTabs` 抽成共用组件，M-03 / M-04 / M-05 都用它。
   - 知识库内 Tab 之间用 `router.replace` 切换，不入栈，返回键总是回知识库列表。
2. **慕课 Tab**：
   - 接收 `baseId`，删掉跨库选择器。
   - 行列表形态（92 高、分隔线），显示「更新于 {相对时间}」。
   - 行 → `mobileMoocDetailHref`。
   - 空态「课程在桌面版创建。」，不给按钮。
3. **慕课详情**：
   - 顶栏固定显示课程名（`useMoocQuery`）。
   - 返回兜底 `/m/notes/:baseId/mooc`。
   - 「目录 / 内容」分段，选中条目后自动切到「内容」。
   - 内容区显示所在章节、「下一节」、「重新获取」。
   - 与 12.2.4 修同一个子条目缺陷，共用修复后的选择逻辑。
   - tab bar 保持「知识库」高亮。

**测试**：
- Tab 切换用 `replace`
- 行 href
- 目录选中后自动切内容
- 下一节

**验收**：从 `/m/notes/3` 切到「慕课」，tab bar 可见、库头不变，返回回到知识库列表。

#### 12.7.3 任务 Tab 与任务详情（M-04、M-12）

- **画板**：[M-04](UI补稿设计图.md#m-04) · [M-12](UI补稿设计图.md#m-12)
- **附录**：A 的 M-04、M-12 表；**B 的 M-12 完整图例**
- **文件**：
  - `features/tasks/components/mobile/task-cards-mobile.tsx`
  - 新增 `features/tasks/components/mobile/{task-detail-mobile,submit-task-sheet}.tsx`

**要点**：
1. **任务 Tab**：
   - 接收 `baseId`，用 12.7.2 的公共头部。
   - 状态筛选平铺成全宽 `Segmented`，每项带计数。
   - 行列表，整行 → `mobileTaskDetailHref`。
   - 行尾：`canSubmit` →「提交」，`canResubmit` →「重新提交」，已提交 → accent 文字「查看」（图例 `r-view`）。**删掉**对已提交任务显示「重新提交」的现逻辑（§1.4 第 3 条）。
   - 状态徽标：0 warning、1 success、3 danger；2（管理员自己）不显示。
   - 行尾按钮区域点击不触发行跳转。
2. **提交面板 `SubmitTaskSheet`**：
   - 底部 Sheet，顶部圆角 20 + 把手。
   - 知识库只读行。
   - 笔记单选列表（圆圈 + 白勾），重新提交时默认选中上次的笔记。
   - 44 高「提交」按钮，未选笔记时禁用。
   - 保持 `dynamic` 引入：现在 `/m/tasks` 首屏离 250KB 预算只剩 2.3KB，见 `task-cards-mobile.tsx` 注释。
3. **任务详情**（非沉浸式，tab bar 可见）：
   - **成员视角**：
     - 任务名、状态、时间窗口（≤ 3 天 warning，截止后「已截止」）、描述。
     - 「我的提交」笔记行 → `/m/notes/:baseId/:noteId`。
     - 提交历史时间线。
     - 贴在 tab bar 上方的主按钮：未提交「提交」、已退回「重新提交」（打开 `SubmitTaskSheet`），已提交「已提交」禁用，截止后「已截止」禁用。
   - **管理员视角**：
     - 「8 / 12 人已提交」与进度条。
     - 分段列表：已提交 / 未提交 / 已退回。
     - 提交行 → 笔记。
     - 「⋯」打开动作表：打开笔记 / 退回。退回需要**连点两次**确认（图例 `ms-return`）。
     - 底部提示「编辑任务、查看编辑活跃度请使用桌面版。」
   - 不存在态同 D-17。

**测试**：
- 真值表同 12.3.2
- 面板默认选中
- 退回二次确认
- 管理员视角不出编辑入口

**验收**：
- 手机上能完成「提交 → 被退回 → 重新提交」（F-06 流程 Q）。
- `pnpm --filter web bundle:budget` 中 `/m/notes/[baseId]/tasks` 与 `/m/notes/[baseId]/tasks/[taskId]` 不超过 250KB。

#### 12.7.4 资料 Tab（M-05）

- **画板**：[M-05](UI补稿设计图.md#m-05)
- **附录 A**：M-05 表
- **文件**：`features/notes/components/mobile/base-docs-mobile.tsx`

**要点**：
- 用公共头部；行可点 → `/m/ai/pdf/:docId`。
- 列表末尾放文字链接「去「PDF 问答」上传 ›」→ `/m/ai/pdf`。
- 空态文案按 12.0.3 的表。

**测试**：行 href、上传链接。

**验收**：点资料行进入已有的 PDF 详情页。

#### 12.7.5 新建笔记与历史版本（M-07、M-13）

- **画板**：[M-07](UI补稿设计图.md#m-07) · [M-13](UI补稿设计图.md#m-13)
- **附录**：A 的 M-07、M-13 表；**B 的 M-13 完整图例**
- **文件**：
  - `features/notes/components/mobile/{create-note-mobile,note-editor-mobile}.tsx`
  - 新增 `features/notes/components/mobile/note-history-mobile.tsx`

**要点**：
1. **新建笔记**：
   - 已选库行文字 accent、右侧 ✓。
   - 库行左侧用封面渐变方块（`cover-gradient.ts`）。
   - 列表末尾「新建知识库」行打开底部面板形态的新建库表单，创建后自动选中。
   - 标题输入 `h-12 rounded-md text-base`（16px，防 iOS 缩放）。
   - 返回兜底：带 `?baseId=` 回该库，否则 `/m/notes`。
2. **编辑页入口**：顶栏「⋯」动作表第一项「历史版本」→ `mobileNoteHistoryHref`，先 `flush()`。
3. **历史版本**（沉浸式，两级在同一路由内切换）：
   - 用 `?v={operationId}` 表示版本页：列表 → 版本页用 `router.push`，返回键回到列表。
   - **列表**：按日期分组，第一条「当前版本」不可点，其余点进版本页；滚动加载每页 15 条。
   - **版本页**：
     - 顶栏标题是版本时间。
     - 「正文 / 本次改动」分段，复用 `HistoryDiffView`。
     - 保存人提示条。
     - 贴底「恢复此版本」，打开动作表，连点两次确认。
   - 恢复成功后回编辑页。数据层完全复用 12.4.3。

**测试**：
- `?v` 切换
- 当前版本不可点
- 恢复二次确认
- 返回键行为

**验收**：F-06 流程 R 的移动分支能走通。

#### 12.7.6 协同文档（M-08、M-09）

- **画板**：[M-08](UI补稿设计图.md#m-08) · [M-09](UI补稿设计图.md#m-09)
- **附录 A**：M-08、M-09 表
- **文件**：`features/collab/components/mobile/{doc-library-mobile,doc-workspace-mobile}.tsx`

**要点**：
1. **文档库**：
   - 加返回键，兜底 `/m/me`。
   - 标题改为「协同文档」。
   - 行元信息「{创建者} · {相对时间}更新」。
   - 「⋯」动作表加说明「移除后所有成员的文档库里都看不到它。」，移除需要二次确认。
2. **工作区**：
   - 工具条的图片按钮置灰，长按或 Tooltip 说明「协同文档暂不支持图片」（MinIO 方案 D3「本期不接」）。
   - 断线时标题下显示提示条 +「重新连接」。
   - 「文档已移除」同 12.5.2。

**测试**：
- 返回兜底
- 移除二次确认
- 图片按钮禁用
- 断线提示

**验收**：与桌面同一文档互通，断网后恢复能自动同步。

#### 12.7.7 搜索与设置分节（M-10、M-11）

- **画板**：[M-10](UI补稿设计图.md#m-10) · [M-11](UI补稿设计图.md#m-11)
- **附录 A**：M-10、M-11 表
- **文件**：
  - `features/search/components/mobile-search.tsx`
  - `lib/mobile/search.ts`
  - `features/settings/components/mobile-settings.tsx`

**要点**：
1. **搜索**：
   - 输入框 44 高、`rounded-md`，占位「搜索页面、知识库或操作…」，有输入时出现清除按钮。
   - 结果分三组：快捷操作 / 知识库 / 页面。
     - 知识库候选取自 `useKnowledgeBasesQuery` 的缓存，不新增请求。
     - 页面组由导航注册表派生，不含任务、慕课；AI 入口副标题「入口保留」。
   - 行右侧只显示 ›，不再显示路径。
   - 无结果时显示「没有找到「{q}」」+ 说明，查询词 3–15 字时给「用「{q}」新建笔记」（`/m/notes/new?title=`，新建页读取 `title` 预填）。
2. **设置分节**：改成 iOS 设置式的行表单，不再复用桌面两列表单组件。
   - 标签左、值右，行高 52。
   - 性别用动作表选择。
   - 密码行带显隐与规则清单。
   - 主题三行单选（色块 28），立即生效。
   - 集成空态文案按 12.0.3 的表。
   - AI 分节只保留入口。
   - 保存同 12.6.1，依赖 B-3。

**测试**：
- `search.test.ts`：分组、知识库候选、无任务 / 慕课
- 无结果新建链接只在 3–15 字出现
- 设置行表单的 dirty 与保存 payload

**验收**：手机上搜库名能直达知识库；设置页在 375 宽下没有横向滚动。

<a id="m12-8"></a>

### M12.8 验收与文档

1. **单测、类型、规范**：
   - `pnpm --filter web test`
   - `pnpm --filter web typecheck`
   - `pnpm check`
   - `pnpm --filter @anynote/cli test`（12.6.4 动了 CLI）
   - `cd services && mvn test -pl note` 与 `mvn test -pl system`
2. **契约**：`pnpm openapi:check` 无漂移。
3. **E2E**：需要生产构建与真实后端栈，命令见 README「端到端与性能门禁」。
   - 已有用例全绿，并同步更新：
     - `mobile-core.spec.ts`：删 `/m/wikis`；`/m/tasks`、`/m/mooc` 改为断言重定向
     - 其余用例凡是点到本轮改过的删除 / 移除操作，都改成先确认对话框（开工时 `grep -rn "删除\|移除" apps/web/e2e` 列全）
   - 新增用例：
     - `tasks-admin.spec.ts`（chromium）：管理员新建任务 → 成员提交 → 管理员退回 → 成员重新提交
     - `note-history.spec.ts`（chromium）：编辑两次 → 查看改动 → 恢复
     - `mobile-tasks.spec.ts`（mobile）：知识库内任务 Tab 可见 tab bar → 进入详情 → 底部面板提交
     - `redirects.spec.ts`（chromium）：`/mooc/:id`、`/tasks`、`/m/mooc` 的去向
4. **预算**：
   - `pnpm --filter web bundle:budget`
   - `pnpm --filter web lighthouse:budget`
   - `pnpm --filter web lighthouse:budget:mobile`
5. **视觉走查**：逐屏对照 [UI补稿设计图.md](UI补稿设计图.md)，每块画板浅色、深色各看一遍，并对照附录 A 逐条勾选。有意偏离的记入 changelist 的「偏差」一节。
6. **文档**：
   - 新增 `docs/changelist/YYYY-MM-DD-ui-supplement.md`，按 `docs/changelist/README.md` 的强制要求，以 git 实际结果编写。
   - `docs/refactor/FRONTEND_MILESTONES.md`：M7.6 第 5 条标记关闭（B-3）。
   - `CLAUDE.md`「上下文文档导航」新增 `docs/ui/` 一行，指向本方案与图集。遵守文档维护约定，同一个 commit 提交。

---

<a id="tests"></a>

## 6. 测试策略汇总

| 层 | 新增 / 修改 | 约定 |
|----|-------------|------|
| 前端纯函数 | `task-window`、`heatmap`、`history-groups`、`toUserMessage`、`navigation` 地址函数与沉浸式判定 | Vitest；时间相关的函数都接收 `now`，不 mock 全局时钟 |
| 前端 hooks | 任务 8 个、历史 3 个、慕课 1 个、成员 2 个、资料 1 个、资料更新 1 个 | `renderHook` + 每个用例新建 `QueryClient({ retry: false })`；在 openapi-fetch 客户端层打桩 |
| 前端组件 | §5 各任务「测试」列出的用例 | Testing Library + `fireEvent`；类名断言只写与 Token 相关的 |
| 缺陷先行 | 慕课子条目、状态枚举 3 = 已退回、`/m/notes/3/tasks` 沉浸式、已提交不出重新提交、CLI 授权星号 | **先提交能复现的失败用例**，再改代码；同一分支里前后两个 commit |
| 守卫 | `token-usage.test.ts` | 进默认 `pnpm test` |
| 后端 | `NoteTaskServiceImplEditHeatmapTest`、`NoteHistoryServiceImplTest`、`SysUserServiceImplUpdateMyProfileTest`、（可选）`NoteTaskServiceImplMemberDetailTest` | JUnit 5 + Mockito，`@ExtendWith(MockitoExtension.class)`；不写 `@SpringBootTest` |
| E2E | 新增 4 个 spec，修改 `mobile-core.spec.ts`，另按 `grep` 结果调整涉及删除操作的用例 | 按文件名分 project：`mobile-*.spec.ts` 只跑 mobile |
| 预算 | 新增的 8 条路由进入 `bundle:budget` 统计 | 首屏 JS ≤ 300KB；`/m/*` ≤ 250KB；编辑器 chunk ≤ 250KB |

---

<a id="git"></a>

## 7. 分支、提交与文档

**分支**（都从 `dev` 切出，完成后 `--no-ff` 合回 `dev`）：

| 分支 | 内容 | scope |
|------|------|-------|
| `feat/note-task-edit-heatmap` | B-1 | `note` · `openapi` |
| `fix/note-history-validation` | B-2 | `note` · `openapi` |
| `feat/system-update-my-profile` | B-3 | `system` · `openapi` |
| `feat/note-task-member-detail` | B-4（可选） | `note` · `openapi` |
| `feat/ui-supplement` | M12.0 – M12.8 前端 | `web`、`ui`、`cli`、`docs` |

**提交**（按 README「Git 工作流」）：
- **一个 commit 只动一个 service / package**：Java、前端、CLI 分开提交。
- **message 用中文**，`type(scope)` 用英文，**不加 `Co-Authored-By`**。
- **每个任务至少一个 commit**，例：`feat(web): 任务详情页支持管理员退回提交与编辑热力图`。
- **缺陷修复拆成两个 commit**：先 `test(web): 复现慕课详情子条目无法选中`，再 `fix(web): 慕课详情子条目独立选中`。
- **`openapi/specs/*.json`** 与对应 Controller 放在同一分支，单独一个 `chore(openapi)` commit。
- **`packages/api-client/src/`** 不提交。

**OpenSpec 提案**（`.claude/openspec/changes/`，日期取开工日）：
- `YYYY-MM-DD-note-task-edit-heatmap.md`
- `YYYY-MM-DD-note-history-validation.md`
- `YYYY-MM-DD-system-update-my-profile.md`
- `YYYY-MM-DD-mobile-kb-tabs-and-legacy-redirects.md`：登记路由变化，含新增、重定向与删除，**不改后端契约**。写法参照 `2026-09-12-mobile-route-segment.md`。

**文档同步**：见 M12.8 第 6 条。改 `CLAUDE.md` 时遵守它的「文档维护约定」：先 `grep` 引用，再和被引用文件一起提交。

---

<a id="order"></a>

## 8. 执行顺序与依赖

| 任务 | 依赖 | 说明 |
|------|------|------|
| B-1 / B-2 / B-3 / B-4 | 无 | 与前端并行；建议在 M12.0 期间完成 |
| M12.0 基建 | 无 | **第一个合入**，其余任务都依赖它 |
| M12.1 路由迁移 | M12.0 | 新路由骨架、重定向、删 wikis |
| M12.2 桌面知识库内 | M12.1 | D-01 02 05 06 08 09 |
| M12.3 任务 | M12.1；B-1 | 热力图卡片在 B-1 上线前隐藏，不阻塞其余部分 |
| M12.4 笔记 | M12.1；B-2（非阻塞） | D-03 04 16 |
| M12.5 协同文档 | M12.0 | D-10 11 |
| M12.6 设置与认证 | M12.0；B-3 | 保存资料的真实栈验收要等 B-3 |
| M12.7 移动端 | M12.1，及对应桌面任务的数据层（12.2.4、12.3.1、12.4.3） | M-01 … M-13 |
| M12.8 验收与文档 | 以上全部 | |

**建议节奏**（单人）：

| 顺序 | 任务 | 预估 |
|------|------|------|
| 1 | M12.0 | 2 天 |
| 2 | M12.1 | 1 天 |
| 3 | M12.3.1 → 12.3.2 → 12.3.3 → 12.3.4 | 4 天 |
| 4 | M12.4 | 2.5 天 |
| 5 | M12.2 | 3 天 |
| 6 | M12.5 | 1 天 |
| 7 | M12.6 | 2 天 |
| 8 | M12.7 | 5 天 |
| 9 | M12.8 | 2 天 |

合计约 22.5 个工作日。后端 B-1 到 B-3 合计约 3 天，建议在前端 M12.0 期间同步完成，这样 M12.3 / M12.6 开工时端点已经可用。

**并行拆分**（多人）：
- M12.0 合入后，M12.2、M12.3、M12.4、M12.5、M12.6 互不依赖，可以分给不同的人。
- M12.7 各子任务跟随对应的桌面任务，由同一个人完成更顺。

---

<a id="risks"></a>

## 9. 风险与应对

| 风险 | 影响 | 应对 |
|------|------|------|
| 恢复版本依赖消息队列异步生成快照，RocketMQ 堆积时历史列表迟迟不出现新版本 | D-16 恢复后看不到「当前版本」更新 | 2 秒后失效一次；列表顶部加一个手动刷新图标。消费失败时 `NoteMessageListener` 已有日志，不在前端兜底 |
| `n:mooc:read` 权限规则缺失（M7.6 第 3 条） | D-06 / M-06 的文档条目加载失败 | 界面按错误态处理；验收前在测试环境补上权限规则数据，这是数据问题，不是代码问题 |
| PDF 上传转存失败（M7.6 第 4 条） | D-08「上传 PDF」跳过去后上传失败 | 本轮不修；资料 Tab 只负责跳转，验收只检查跳转与参数带入 |
| B-3 排期晚于前端 | D-12 / M-11 无法保存 | 前端按新契约实现并保留错误提示；12.6.1 的真实栈验收顺延到 B-3 合入后，其余验收不受影响 |
| 移动端首屏预算吃紧（`/m/tasks` 余量仅 2.3KB） | 新的任务 Tab / 详情超出 250KB | `SubmitTaskSheet`、日期、编辑器一律 dynamic；时间格式化不引入 dayjs；每个 PR 跑 `bundle:budget` |
| 热力图数据量：成员多、窗口长 | 表格过宽、渲染慢 | B-1 限制最多 62 天；前端最多 12 行加折叠，横向超出时卡片内部横向滚动 |
| 删除 `/wikis` 后仍有外部书签 | 旧链接 404 | 已拍板直接删除，不做兜底 |
| `useMemberTaskQuery` 逐页查找，任务很多时请求多 | 成员详情首屏慢 | 单库任务通常少于 50 个，一页即可；若出现性能问题再启用 B-4 |

---

<a id="acceptance"></a>

## 10. 本轮验收清单

**后端**
- [ ] B-1 任务编辑热力图端点合入 `dev`，`pnpm openapi:check` 通过
- [ ] B-2 笔记历史查询健壮性合入 `dev`
- [ ] B-3 个人资料对外端点合入 `dev`，M7.6 第 5 条关闭
- [ ] （可选）B-4 成员侧单个任务查询

**前端基建与路由**
- [ ] 12.0.1 Token 与组件底色，守卫测试进默认单测
- [ ] 12.0.2 圆角 10、Select、Popover、PasswordInput、ConfirmDialog
- [ ] 12.0.3 状态组件与 24 处错误态
- [ ] 12.0.4 导航注册表（含沉浸式判定缺陷）
- [ ] 12.1.1 新增 8 条路由
- [ ] 12.1.2 重定向 6 条
- [ ] 12.1.3 删除 wikis

**桌面**
- [ ] 12.2.1 D-01
- [ ] 12.2.2 D-02
- [ ] 12.2.3 D-05
- [ ] 12.2.4 D-06（含缺陷）
- [ ] 12.2.5 D-08
- [ ] 12.2.6 D-09
- [ ] 12.3.1 任务数据层（含枚举缺陷）
- [ ] 12.3.2 D-07
- [ ] 12.3.3 D-17
- [ ] 12.3.4 D-18
- [ ] 12.4.1 D-03
- [ ] 12.4.2 D-04
- [ ] 12.4.3 D-16
- [ ] 12.5.1 D-10
- [ ] 12.5.2 D-11
- [ ] 12.6.1 D-12
- [ ] 12.6.2 D-13
- [ ] 12.6.3 D-14
- [ ] 12.6.4 D-15（含 CLI 回调页）

**移动**
- [ ] 12.7.1 M-01 / M-02
- [ ] 12.7.2 M-03 / M-06
- [ ] 12.7.3 M-04 / M-12
- [ ] 12.7.4 M-05
- [ ] 12.7.5 M-07 / M-13
- [ ] 12.7.6 M-08 / M-09
- [ ] 12.7.7 M-10 / M-11

**门禁与文档**
- [ ] `pnpm --filter web test`、`typecheck`、`pnpm check` 全绿
- [ ] `mvn test -pl note`、`mvn test -pl system` 全绿
- [ ] E2E 全绿（含新增 4 个 spec）
- [ ] `bundle:budget`、`lighthouse:budget`、`lighthouse:budget:mobile` 通过
- [ ] 31 块屏幕画板浅色、深色走查完毕，附录 A 162 条逐条勾选
- [ ] changelist、`FRONTEND_MILESTONES.md`、`CLAUDE.md` 同步

---

<a id="appendix-a"></a>

## 附录 A　画板改动逐条落点

范围：画板图例里，所有橙字建议、「现实现 / 旧前端」对比、「需后端」提示和「已拍板」说明，共 162 条。

- 图例号与画板上的编号一致。D-04 的四个浮层连续编号，号码前标出所属浮层 ①–④。
- 「落地处理」写「按稿实现」的，照图例做即可；其余行以本列为准，依据见 §1.4。
- 没有列出的图例是与现实现一致的元素，走查时照常对照画板，不需要改代码。

#### D-01 笔记 Tab → 任务 12.2.1

[画板](UI补稿设计图.md#d-01)

| 图例号 | 元素 | 设计要求 | 落地处理 |
|---|---|---|---|
| 22 | 行操作 ⋯（图标按钮） | 28×28 全圆 · 仅悬停 / 聚焦时可见；→ 打开行操作菜单（建议新增：复用编辑器已有的移动 / 删除能力） | 按稿实现 |
| 28 | 空态 · 新建笔记（次按钮） | outline 32 高 · 页头主按钮仍保留；→ 同页头「新建笔记」（建议新增） | 按稿实现 |
| 30 | 重试（次按钮） | → 重新请求当前页（建议新增） | 按稿实现 |

#### D-02 概览 Tab → 任务 12.2.2

[画板](UI补稿设计图.md#d-02)

| 图例号 | 元素 | 设计要求 | 落地处理 |
|---|---|---|---|
| 9 | 新建笔记（主按钮） | 本屏唯一主按钮；「可阅读」权限下隐藏（建议）；→ 打开「新建笔记」对话框 → /notes/:baseId/:noteId | 按稿实现 |

#### D-03 新建笔记 → 任务 12.4.1

[画板](UI补稿设计图.md#d-03)

| 图例号 | 元素 | 设计要求 | 落地处理 |
|---|---|---|---|
| 17 | 新建知识库（虚线卡片） | 与选项同尺寸 · 1px 虚线 · accent 文本（建议新增：原先只在「无知识库」空态出现）；→ 打开「新建知识库」对话框 → 创建成功后留在本页并自动选中新库 | 按稿实现 |
| 19 | 标题输入框（聚焦态）（输入框） | 40 高 · 圆角 10（p01 输入框规范；现 Input 为 rounded-lg = 14，建议对齐）· 聚焦 1px accent + 3px ring · 占位「3-15 个字符」· autocomplete=off | 按稿实现 |
| 23 | 取消（幽灵按钮） | 36 高 · label/secondary；→ /notes（带 ?baseId 进来时回 /notes/:baseId，建议） | 按稿实现 |

#### D-04 对话框与命令面板 → 任务 12.4.2

[画板](UI补稿设计图.md#d-04)

| 图例号 | 元素 | 设计要求 | 落地处理 |
|---|---|---|---|
| ①3 | 归属提示（文本） | 「创建到 ▣ 产品设计知识库」13 · 底 fill · 28 高胶囊；对话框不再让人猜笔记会进哪个库（建议新增） | 按稿实现 |
| ①7 | 取消（次按钮） | outline 36 高（建议新增，与 × 同效，给不熟悉 Esc 的人一个明确出口）；→ 关闭并清空表单 | 按稿实现 |
| ②15 | 关闭 ×（图标按钮） | → 关闭并清空表单；从 ?new=1 打开时同时去掉该参数（建议） | 按稿实现 |
| ②16 | 取消（次按钮） | → 同 ×（建议新增） | 按稿实现 |

#### D-05 慕课 Tab → 任务 12.2.3

[画板](UI补稿设计图.md#d-05)

| 图例号 | 元素 | 设计要求 | 落地处理 |
|---|---|---|---|
| 6 | 新建课程（主按钮） | 34 高全圆 accent · 本屏唯一主按钮（现实现为 outline 次按钮，建议与笔记 Tab 统一）· 可阅读权限下隐藏；→ 打开「新建课程」对话框（下方 ①） | 按稿实现 |
| 7 | 课程卡片（卡片按钮） | 三列 324 宽 · 间距 14 · 圆角 14 · shadow-card · 整卡可点；→ /notes/:baseId/mooc/:moocId（建议路由；现为 /mooc/:id，返回会落到跨库列表） | 按稿实现 |
| 16 | 空态 · 新建课程（次按钮） | outline 32 高（现实现空态无按钮）；→ 同页头「新建课程」 | 按稿实现 |
| 18 | 重试（次按钮） | → 重新请求课程列表（建议新增） | 按稿实现 |
| 19 | 可阅读权限（状态） | userPermission = 3 时页头只剩搜索 / 主题，不出现「新建课程」（建议：避免点了才报无权限） | 按稿实现 |
| 21 | 说明（文本） | 「课程会创建在「产品设计知识库」下。」14/20 label/secondary（现文案「…挂在当前选中的知识库下」，知识库内已无「选中」一说） | 按稿实现 |
| 23 | 课程名称（输入框） | 32 高 · 圆角 10（已拍板；现 Input rounded-lg = 14）· 打开即聚焦 · 占位「例如：高等数学（上）」· 「N / 50」· 回车提交 | 按稿实现 |
| 29 | 内联错误（状态） | 名称不足 2 个字：输入框 1px danger + 3px danger ring · 计数转 danger · 下方「课程名称至少 2 个字符」12 danger（现实现只弹 toast，建议内联） | 按稿实现 |

#### D-06 慕课详情 → 任务 12.2.4

[画板](UI补稿设计图.md#d-06)

| 图例号 | 元素 | 设计要求 | 落地处理 |
|---|---|---|---|
| 2 | ‹ 慕课（文字按钮） | 32 高 · accent · 左对齐内容列（现文案「返回课程列表」且回 /mooc 跨库页）；→ /notes/:baseId/mooc | 按稿实现 |
| 3 | 课程名称（文本） | Display 34/41 SemiBold（现详情页不显示课程名，只有返回按钮） | 按稿实现 |
| 11 | 子条目（列表行） | 34 高 · 圆角 9 · 图标 15 · 标题 14；→ 选中该条目并在右侧打开（现实现点子条目会选中并收起父章节，章节下的视频无法播放 —— 需修复） | 按稿实现 |
| 19 | 所在位置（文本） | 「视频 · 在「第 1 章 · …」中」13 label/tertiary（建议新增，折叠目录后仍知道在哪一章） | 按稿实现 |
| 20 | 下一节（次按钮） | outline 32 高 · 按目录顺序取下一个视频 / 文档；最后一节隐藏（建议新增）；→ 选中下一条目并滚回顶部 | 按稿实现 |
| 21 | 未选择条目（文本） | 「从左侧选择章节、视频或文档开始学习。」13 label/secondary · 1px 虚线框 · 高 264（建议：进入时默认选中第一个视频） | 按稿实现 |
| 24 | 重新获取（次按钮） | → 重新请求 /public/byObjectName（建议新增） | 按稿实现 |

#### D-07 任务 Tab → 任务 12.3.2

[画板](UI补稿设计图.md#d-07)

| 图例号 | 元素 | 设计要求 | 落地处理 |
|---|---|---|---|
| 6 | 新建任务（主按钮） | 34 高全圆 accent · 只有知识库管理员可见（第 4 轮拍板：新建放在任务 Tab 下；现实现没有任何新建入口）；→ /notes/:baseId/tasks/new（D-18） | 按稿实现 |
| 7 | 状态筛选（分段控件） | 32 高 · 全部 / 未提交 / 已退回 / 已提交 + 计数 · 单选 radiogroup · 方向键切换（建议新增：与移动端的状态筛选一致；列表已在前端，纯本地过滤）；→ 过滤表格行，不发请求 | 按稿实现 |
| 10 | 任务名称（文本） | 15 Medium · 单行截断；空名称「未命名任务」· 行最小高 72 · 整行可点（悬停底 hover 色）；→ /notes/:baseId/tasks/:taskId（D-17 任务详情） | 按稿实现 |
| 11 | 发布人（文本） | 「林一 发布」12 label/tertiary（taskCreatorNickname，已返回但现实现未展示） | 按稿实现 |
| 14 | 我的状态（徽标） | 按 submissionStatus（UserNoteTaskStatus）：0 未提交 = warning · 1 已提交 = success · 3 已退回 = danger · 2 无需提交（知识库管理员自己）不显示徽标与操作（现实现把 2 显示成「已退回」，且用 outline / secondary / destructive） | 按稿实现：先修前端枚举，3 = 已退回、2 = 无需提交（§1.4 第 2 条） |
| 16 | 提交（次按钮） | outline 28 高 · 未提交且未截止时出现；→ 打开「提交任务」对话框（下方 ①） | 按稿实现 |
| 18 | 查看（已提交）（文字按钮） | accent 文字 · 已提交不能再次提交（后端拒绝「你已经提交过该任务」），要改须管理员先退回（现移动端对已提交显示「重新提交」，点了必失败）；→ /notes/:baseId/tasks/:taskId（D-17） | 按稿实现：已提交只出「查看」，不出提交类按钮（§1.4 第 3 条） |
| 20 | 空态（文本） | 「这个知识库下还没有任务」17 SemiBold · 「任务由知识库管理员发布。」13 · 虚线框（现为表格内一行文字） | 按稿实现 |
| 25 | 重试（次按钮） | → 重新请求（建议新增） | 按稿实现 |
| 29 | 知识库（只读字段） | 32 高 · 底 hover 色 · 圆角 10 · 固定为任务所在库，不可切换 —— 后端要求提交的笔记与任务同库（否则报「笔记和任务不属于一个知识库」）；现实现可切换且默认第一个库 | 按稿实现：只读行（§1.4 第 1 条） |
| 32 | 已选笔记（状态） | 底 accent/tint · 文本 accent Medium · 右侧 ✓（现实现用转圈图标表示选中，易误读为加载中） | 按稿实现 |

#### D-08 资料 Tab → 任务 12.2.5

[画板](UI补稿设计图.md#d-08)

| 图例号 | 元素 | 设计要求 | 落地处理 |
|---|---|---|---|
| 6 | 上传 PDF（主按钮） | 34 高全圆 accent · 上传图标 15（现实现只在空态里有「去上传」）；→ /ai/pdf?baseId=:baseId（上传链路带索引轮询，只保留这一条实现） | 同 `p-row`，带 `?baseId` |
| 8 | 资料行（列表行） | 56 高 · 文件图标 18 label/secondary · 行间 1px separator · 整行可点（现实现行不可点）；→ /ai/pdf?baseId=:baseId&docId=:docId（打开 PDF 预览与问答，第 3 轮出稿） | `/ai/pdf` 需先支持 `?baseId&docId` 初始化（只改取参，不改 AI 页版式） |
| 15 | 建立索引（次按钮） | 悬停「未索引」行时替换徽标 · 24 高 outline · accent 文本（后端已有 POST /docs/{id}/index）；→ 触发索引 → 徽标变「索引中…」转圈 → 轮询到 1 后变「已索引」 | 按稿实现 |
| 22 | 重试（次按钮） | → 重新请求（建议新增） | 按稿实现 |

#### D-09 成员 Tab → 任务 12.2.6

[画板](UI补稿设计图.md#d-09)

| 图例号 | 元素 | 设计要求 | 落地处理 |
|---|---|---|---|
| 6 | 三档权限（说明卡） | 三列 56 高 · 徽标 + 一句话：管理员 / 可编辑 / 可阅读（permissions 1 / 2 / 3，数值越小权限越大）· 不可点（建议新增：现页面只有徽标，没有解释） | 按稿实现 |
| 7 | 按用户名搜索（搜索框） | 34 高 · 圆角 10 · 底 bg/grouped · 输入 300ms 防抖（后端 GET /bases/users 已支持 username 参数，建议新增）；→ 带 username 重新请求列表 | 按稿实现 |
| 15 | 行操作 ⋯（图标按钮） | 28×28 全圆 · 仅「我是管理员」且非自己的行、悬停 / 聚焦时出现；→ 打开行操作菜单 | 按稿实现 |
| 16 | 移除成员（危险菜单项） | 菜单头「周宁 · 可阅读」12 label/tertiary · danger 文本 + userMinus 图标（后端已有 DELETE /bases/users）；→ 打开「移除成员？」确认（下方 ①） | 按稿实现 |

#### D-10 协同文档库 → 任务 12.5.1

[画板](UI补稿设计图.md#d-10)

| 图例号 | 元素 | 设计要求 | 落地处理 |
|---|---|---|---|
| 2 | 页面标题「协同文档」（文本） | Display 34/41 · 与侧栏入口同名（现实现标题为「文档」） | 按稿实现 |
| 7 | 文档卡片（卡片） | 三列 · 圆角 14 · shadow-card · 整卡可点（现实现只有标题文字是链接）；→ /docs/:id | 按稿实现 |
| 10 | 更新时间（文本） | 「昨天更新」12 相对时间 label/tertiary（现为 toLocaleString 全量时间，建议统一 formatRelativeTime） | 按稿实现 |
| 12 | 删除（图标按钮） | 32×32 ghost · Trash 15 · aria-label「删除 {标题}」；→ 打开「从文档库移除？」确认（下方 ②；现实现点了立即删除） | 按稿实现 |
| 15 | 连接失败（文本） | 「协同服务暂时连不上，已写下的内容不会丢失。」13 danger（现文案「请确认 collab 服务已启动」面向开发者，建议改为用户语言） | 按稿实现 |
| 16 | 重新连接（次按钮） | → 重建 WebSocket 连接（建议新增；y-websocket 也会自动重连） | 按稿实现 |
| 18 | 空态 · 新建文档（次按钮） | → 同页头「新建文档」 | 按稿实现 |
| 24 | 取消（次按钮） | （现实现页脚只有「创建」）；→ 关闭并清空 | 按稿实现 |

#### D-11 协同文档工作区 → 任务 12.5.2

[画板](UI补稿设计图.md#d-11)

| 图例号 | 元素 | 设计要求 | 落地处理 |
|---|---|---|---|
| 5 | 复制链接（次按钮） | outline 32 高 · Link 图标（建议新增：「把链接发给同伴」是协作的第一步，现页面没有入口）；→ 复制当前地址 → toast「链接已复制，发给同伴即可一起编辑」 | 按稿实现 |
| 10 | 连接断开（文本） | 徽标「未连接」· 正文上方 36 高提示条「连接已断开，恢复后会自动同步你的改动」13 · 继续可编辑（Y.Doc 本地保留）（建议新增） | 按稿实现 |
| 12 | 重新连接（次按钮） | → 重建连接（建议新增） | 按稿实现 |
| 13 | 文档已被移除（文本） | 索引里找不到该 id：「这篇文档已从文档库移除」17 SemiBold · 「可能被其他成员移除了。」13（建议新增：现实现会当作新文档打开一个空房间） | 按稿实现 |

#### D-12 设置 · 账号 → 任务 12.6.1

[画板](UI补稿设计图.md#d-12)

| 图例号 | 元素 | 设计要求 | 落地处理 |
|---|---|---|---|
| 1 | 用户卡（选中态）（链接） | 设置不进一级导航，入口就是侧栏底部用户卡；在 /settings/* 时底 accent/tint（建议，现无选中态）；→ /settings/profile | 按稿实现 |
| 8 | AI（入口保留）（Tab 链接） | 已拍板：AI 相关页面暂不出稿，只保留分区入口；→ /settings/ai（内容本轮不画） | 按稿实现 |
| 11 | 用户名（文本） | 锁图标 13 +「用户名 chenke · 不可修改」13 label/tertiary（现为「用户名 chenke（不可修改）」放在标题下） | 按稿实现 |
| 13 | 昵称（输入框） | 32 高 · 圆角 10（已拍板；现 14）· 「N / 30」 | 按稿实现 |
| 14 | 性别（下拉选择） | 未设置 / 男 / 女 · 与输入框同高同圆角（现为原生 select 36 高圆角 6，和输入框对不齐）；→ 展开选项 | 按稿实现 |
| 15 | 邮箱（输入框） | type=email · 清空后要能真正清除：资料保存改走后端新增的对外端点，约定传空字符串 = 清空（现 PUT /user/{id} 是内部端点，浏览器调用被拒；前端还会过滤空值） | 依赖 B-3：空串 = 清空（§1.4 第 5 条） |
| 16 | 手机号（输入框） | 占位「用于找回账号（选填）」· 清空规则同邮箱 | 同 `a-email` |
| 17 | 未保存提示（状态） | 表单与服务端值不一致时出现「有未保存的修改」13 label/tertiary；一致时整段隐藏且「保存资料」禁用（建议新增） | 按稿实现 |
| 18 | 保存资料（主按钮） | 34 高全圆 accent · 卡片页脚右对齐 · 保存中「保存中…」；→ 对外资料更新端点（需后端新增）→ toast「资料已更新」；失败 toast.error 保留输入 | 依赖 B-3：`PUT /user/mine/profile` |
| 23 | 显示 / 隐藏（图标按钮） | EyeOff 15 · 输入框内右侧（建议新增）；→ 切换明文显示 | 按稿实现 |
| 24 | 规则清单（状态） | 8–15 位 / 含大写 / 含小写 / 含数字，随输入实时打勾：满足 = success ✓，未满足 = label/tertiary（现实现只在提交后弹 toast） | 按稿实现 |
| 28 | 重试（次按钮） | → 重新请求 /user/mine（建议新增） | 按稿实现 |

#### D-13 设置 · 外观 / 集成 / AI 入口 → 任务 12.6.2

[画板](UI补稿设计图.md#d-13)

| 图例号 | 元素 | 设计要求 | 落地处理 |
|---|---|---|---|
| 3 | 浅色 / 深色（单选卡片） | 三列 · 预览缩略 132 高圆角 12（侧栏 + 内容卡，直接用两套 Token 画）· 下方单选圆 18 + 图标 15 + 文字 14 · radiogroup，方向键切换（现实现为三个小胶囊按钮，看不出效果）；→ 立即切换主题（next-themes），无需保存 | 按稿实现 |
| 5 | 当前生效说明（文本） | info 13 +「当前系统为浅色，界面正在使用浅色。偏好只保存在这台设备的浏览器里。」12 label/tertiary —— 说清「跟随系统」此刻的结果，以及偏好不跨设备（建议新增） | 按稿实现 |
| 7 | 空态（文本） | Plug 图标 30 · 「暂无可用的集成」16 SemiBold · 「文件存储与 AI 服务由管理员在后台配置，这里暂时没有需要你连接的服务。」13（现文案点名 MinIO / 华为 OBS，面向开发者） | 按稿实现 |
| 9 | 内容区 · 暂不出稿（占位） | 已拍板：AI 相关页面（含本分区的默认模型选择）暂时不画；落地时沿用本页「分组卡片 + 单选卡片」的版式 | 按稿实现 |

#### D-14 登录与注册 → 任务 12.6.3

[画板](UI补稿设计图.md#d-14)

| 图例号 | 元素 | 设计要求 | 落地处理 |
|---|---|---|---|
| 1 | 品牌标记（品牌） | Logo 32 +「Anynote」17 SemiBold（现为纯文字「ANYNOTE」小标签）· 卡片宽 400 · 圆角 20 · 内边距 28 · shadow-card + 1px separator · 整屏 bg/grouped 居中 | 按稿实现 |
| 5 | 用户名（输入框） | 40 高 · 圆角 10（已拍板；现 14）· 15 号字 · autocomplete=username · 打开页面即聚焦 | 按稿实现 |
| 7 | 显示密码（图标按钮） | Eye 16 · 输入框内右侧 · aria-label「显示密码」（建议新增）；→ 切换明文 / 密文 | 按稿实现 |
| 9 | 创建账号（文字链接） | 「还没有账号？」14 label/secondary + 链接 accent Medium（现为黑色下划线链接）；→ /register | 按稿实现 |
| 14 | 性别（下拉选择） | 男 / 女 · 40 高圆角 10（现为原生 select 36 高，和输入框不齐；接口要求必填，不提供「未设置」） | 按稿实现 |
| 21 | 来自 CLI 授权（状态） | ?next= 指向 /cli/authorize 时，标题下出现 accent/tint 提示条「登录后将回到「授权 CLI 登录」继续」（建议新增：否则用户不知道为什么突然要登录） | 按稿实现 |

#### D-15 CLI 授权 → 任务 12.6.4

[画板](UI补稿设计图.md#d-15)

| 图例号 | 元素 | 设计要求 | 落地处理 |
|---|---|---|---|
| 2 | 说明（文本） | 「命令行工具请求访问你的 Anynote 账号。授权后它会拿到一对独立的令牌，与当前浏览器会话互不影响。」14/20（现文案里的 **独立的** 是字面星号，未渲染成加粗） | 按稿实现 |
| 4 | 回调地址（文本） | 终端图标 +「回调到本机 127.0.0.1:53817」· 端口取自链接参数 port（建议新增：让用户能和终端里的端口核对，防止被别的本机进程诱导授权） | 按稿实现 |
| 7 | 安全说明（文本） | 「授权码只在本机 CLI 与服务器之间传递，60 秒内有效，必须配合 CLI 私有的校验码才能兑换。」12 label/tertiary（把 PKCE 讲成人话；现文案为「不会出现在浏览器地址栏以外的任何地方」） | 按稿实现 |
| 13 | 回调完成页（外部页面） | 由 CLI 本地回环服务返回，不在 apps/web：「Anynote CLI · 已收到授权，请回到终端继续。此页面可以关闭。」（样式在 apps/cli/src/auth/loopback.ts，建议与本卡片同一视觉） | 改 `apps/cli/src/auth/loopback.ts` 的回调页样式，单独提交（scope `cli`） |

#### D-16 笔记历史版本 → 任务 12.4.3

[画板](UI补稿设计图.md#d-16)

| 图例号 | 元素 | 设计要求 | 落地处理 |
|---|---|---|---|
| 1 | 编辑器 ⋯「历史版本」（菜单项） | 笔记编辑器（p04）顶栏 ⋯ 菜单第一项 · Clock 图标 15（已拍板：从知识库里的笔记页进入）；→ /notes/:baseId/:noteId/history | 按稿实现 |
| 4 | 正文 / 本次改动（分段控件） | 32 高 · 默认「正文」；「本次改动」用该版本的编辑记录（noteEditList：原文 / 改后）标出新增与删除；→ 切换阅读方式，不发请求 | 「本次改动」本期按行比较、整行高亮（§1.4 第 4 条） |
| 5 | 恢复此版本（主按钮） | 34 高全圆 · 选中「当前版本」时隐藏 · 没有专门的回滚端点：取该版本的 title + content 调 PATCH /notes/{noteId}（带当前 version）写回 —— 已核对后端会异步生成一条新的历史版本；→ 打开「恢复到这个版本？」确认（下方 ①） | 按稿实现：`PATCH /notes/{noteId}` 写回（§1.4 第 4 条） |
| 7 | 新增 / 删除（图例） | 只在「本次改动」出现 · 新增 = success 18% 底 + 下划线 · 删除 = danger 12% 底 + 删除线（颜色之外还有下划线 / 删除线，不靠颜色区分） | 按稿实现 |
| 11 | 日期分组（文本） | 今天 / 昨天 / 09-12 周六 · 12 SemiBold label/tertiary（现实现是一长串不分组的时间） | 按稿实现 |
| 21 | ① 说明（文本） | 「正文会回到 陈可 · 今天 11:05 的样子。当前内容会先作为一个新版本保留在历史记录里，随时可以再换回来。」—— 已核对：保存后 MQ 异步写入操作记录与历史快照（内容无变化时不产生新版本） | 按稿实现 |

#### D-17 任务详情 → 任务 12.3.3

[画板](UI补稿设计图.md#d-17)

| 图例号 | 元素 | 设计要求 | 落地处理 |
|---|---|---|---|
| 1 | 任务（保持选中）（导航项） | 详情仍在知识库里（已拍板），侧栏「任务」保持高亮；→ /notes/:baseId/tasks | 按稿实现 |
| 11 | 已提交 / 未提交 / 已退回（分段控件） | 30 高 + 计数 · 对应 /admin/noteTasks/submissions 的 userTaskStatus = 1 / 0 / 3（与成员侧 submissionStatus 是同一个 UserNoteTaskStatus：2 = 无需提交，只有管理员自己）；→ 切换列表，分页每页 20 | 按稿实现：`userTaskStatus` = 1 / 0 / 3（§1.4 第 2 条） |
| 12 | 提交行（列表行） | 60 高 · 笔记图标 17 · 提交的笔记标题 15 · 悬停底 hover 色；「未提交」列表只有昵称 + 用户名，不可点；→ /notes/{任务的 knowledgeBaseId}/{noteId}（后端要求提交的笔记与任务同库，不用补字段） | 按稿实现：`/notes/{任务 knowledgeBaseId}/{noteId}`（§1.4 第 1 条） |
| 14 | 行操作 ⋯（图标按钮） | 悬停出现 · 菜单头「林一 · 09-13 提交」；→ 打开行菜单 | 按稿实现 |
| 15 | 退回（危险菜单项） | 只在「已提交」列表出现 · 截止后仍可退回，但成员已无法重新提交（文案需提示）；→ 打开「退回这份提交？」确认（下方 ②） | 按稿实现 |
| 16 | 标题与说明（文本） | 「成员编辑活跃度」15 SemiBold · 说明 12 label/tertiary · 数据 /noteTasks/{id}/charts（按时间段 × 成员的 editCount） | 数据源改为 B-1 新端点 `GET /admin/noteTasks/{id}/editHeatmap`（§1.4 第 6 条） |
| 20 | 成员视角（视角） | 没有编辑按钮、统计与提交记录；主按钮按状态：未提交「提交」· 已退回「重新提交」· 已提交「已提交」禁用 · 截止「已截止」禁用；下方「我的提交」时间线（/noteTasks/{id}/history，后端已只返回本人记录）。任务信息取自 GET /noteTasks 列表（成员没有按 id 取单条的接口） | 按稿实现：成员任务信息取自列表（§1.4 第 8 条） |
| 25 | ② 说明（文本） | 「林一 的提交会变成「已退回」，TA 可以在 09-18 23:59 之前重新提交。」—— 把后果与截止时间写清（旧文案「确定要退回任务吗？」） | 按稿实现 |

#### D-18 任务新建 / 编辑 → 任务 12.3.4

[画板](UI补稿设计图.md#d-18)

| 图例号 | 元素 | 设计要求 | 落地处理 |
|---|---|---|---|
| 3 | 发布到（文本） | 「发布到 ▣ 产品设计知识库」· 知识库由路由给定，不可改（旧前端是下拉选择，已拍板放到知识库的任务 Tab 下） | 按稿实现 |
| 8 | 1 周 / 2 周 / 1 个月（快捷选择） | 26 高胶囊 · 选中 accent/tint · 右侧说明「成员只能在时间窗口内提交」12（建议新增：多数任务就是这几种时长）；→ 按开始时间回填截止时间（23:59） | 按稿实现 |
| 9 | 任务描述（富文本） | TipTap minimal 预设 · 工具条：粗体 / 斜体 / H2 / 列表 / 有序 / 链接 · 高 130 自增长 · 选填（旧前端是 Vditor Markdown，已统一 TipTap） | 按稿实现 |
| 13 | ② 截止早于开始（文本） | 截止时间字段 danger 描边 +「截止时间必须晚于开始时间」12 danger（旧前端是 warning toast） | 按稿实现 |

#### M-01 工作台 → 任务 12.7.1

[画板](UI补稿设计图.md#m-01)

| 图例号 | 元素 | 设计要求 | 落地处理 |
|---|---|---|---|
| 11 | 全部 ›（文字链接） | → /m/notes/:baseId/tasks（已拍板：任务只属于知识库；现为 /m/tasks，见 M-04） | 按稿实现 |
| 12 | 任务行（列表行） | 60 高 · 图标 16 warning · 任务名 15 · 「截止 09-18 周四」12 tabular-nums label/tertiary（endTime）· 右侧 ›；→ /m/notes/:baseId/tasks（建议：原先行不可点） | 按稿实现 |
| 18 | 知识库（Tab） | 未选：图标 / 文字 label/secondary；/m/notes/* 都点亮它（/m/wikis/* 已拍板删除）；→ /m/notes | 按稿实现 |

#### M-02 我的 → 任务 12.7.1

[画板](UI补稿设计图.md#m-02)

| 图例号 | 元素 | 设计要求 | 落地处理 |
|---|---|---|---|
| 2 | 资料卡（卡片链接） | 358×76 · 圆角 14 · 头像 48 · 右侧 ›；→ /m/settings/profile（建议：原先卡片不可点） | 按稿实现 |
| 10 | 协同文档（列表行） | 60 高 · 标题 15 + 描述一行 · 本组只放跨知识库能力：「任务」「慕课」两行移除（已拍板：只在各知识库 Tab 里出现；现 mobileMoreRoutes 仍列出）；→ /m/docs | 按稿实现 |
| 15 | 退出登录（危险行） | 独立卡片 · 居中 15 danger；→ 弹出确认动作表（建议，见右侧）→ 确认后 /login | 按稿实现 |

#### M-03 慕课 Tab（移动） → 任务 12.7.2

[画板](UI补稿设计图.md#m-03)

| 图例号 | 元素 | 设计要求 | 落地处理 |
|---|---|---|---|
| 1 | 返回 ‹（图标按钮） | 44×44 命中区 · Chevron 26 accent（p08 顶栏：高 56，状态栏安全区 47 之下）；→ 有站内历史 → back()；深链直开 → /m/notes（知识库内 Tab 之间用 replace 切换，不入栈，所以返回总是回到知识库列表） | 按稿实现 |
| 5 | 当前 Tab「慕课」（状态） | accent 实心 · 白字 14 Medium · aria-current=page（现实现：此路由渲染跨库课程列表——顶栏「课程」+ 知识库选择器，返回键回 /m/me，与所在知识库脱节） | 按稿实现 |
| 6 | 课程行（列表行） | 92 高 · 左右 16 · 行间 1px separator（与 p08 笔记列表同为行列表，现实现为描边卡片堆）；→ /m/notes/:baseId/mooc/:moocId（建议路由；现 /m/mooc/:id） | 按稿实现 |
| 10 | 更新时间（文本） | 「更新于 2 小时前」13 tabular-nums label/tertiary（现移动端未展示） | 按稿实现 |
| 16 | 重试（文字按钮） | 44 高命中区；→ 重新请求（建议新增） | 按稿实现 |

#### M-04 任务 Tab（移动） → 任务 12.7.3

[画板](UI补稿设计图.md#m-04)

| 图例号 | 元素 | 设计要求 | 落地处理 |
|---|---|---|---|
| 1 | 当前 Tab「任务」（状态） | accent 实心（现实现：渲染跨库任务卡片——顶栏「任务」+ 知识库选择器 + 状态按钮，默认第一个库而不是当前库） | 按稿实现 |
| 2 | 状态筛选（分段控件） | 358×32 全宽 · 全部 / 未提交 / 已退回 / 已提交 + 计数（现实现是顶栏按钮 → 底部动作表，建议平铺，少一次点击；与桌面 D-07 一致）；→ 本地过滤，不发请求 | 按稿实现 |
| 3 | 任务行（结构） | 上下 16 · 行间 1px separator（现为描边卡片）· 整行可点（行尾按钮区域除外）；→ /m/notes/:baseId/tasks/:taskId（M-12 任务详情） | 按稿实现 |
| 5 | 我的状态（徽标） | 0 未提交 warning · 1 已提交 success · 3 已退回 danger · 2 无需提交不显示（与桌面 D-07、工作台 M-01 一致；现实现把 2 当成已退回） | 同 D-07 `t-status` |
| 8 | 提交（次按钮） | outline 32 高全圆 · 右对齐（现为整行宽 40 高按钮，一屏只放得下两条）；→ 打开「提交任务」底部面板（右侧） | 按稿实现 |
| 10 | 查看（已提交）（文字按钮） | accent 文字 · 44 高命中区 · 已提交不能再次提交（后端拒绝；现实现显示「重新提交」，点了必失败）；→ /m/notes/:baseId/tasks/:taskId（M-12） | 按稿实现：同 D-07 `t-view`；现有移动端「重新提交」按钮删除（§1.4 第 3 条） |
| 12 | 面板标题（文本） | 「提交任务」17 SemiBold + 「{任务名} · 选一篇笔记作为成果」13 label/secondary · 底部面板顶部圆角 20 + 把手（现实现复用桌面居中对话框，软键盘与小屏会挤压） | 按稿实现 |
| 13 | 知识库（只读行） | 48 高 · 底 hover 色 · 圆角 12 · 固定为任务所在库，不可切换（后端要求笔记与任务同库；现实现默认第一个库且可切换） | 按稿实现：只读行（§1.4 第 1 条） |

#### M-05 资料 Tab（移动） → 任务 12.7.4

[画板](UI补稿设计图.md#m-05)

| 图例号 | 元素 | 设计要求 | 落地处理 |
|---|---|---|---|
| 1 | 当前 Tab「资料」（状态） | accent 实心（现实现：独立页，顶栏标题「资料」，没有库头与 Tab，切过来像跳到了另一页） | 按稿实现 |
| 3 | 资料行（列表行） | 68 高 · 分隔线左缩 48 · 整行可点（现实现行不可点）；→ /m/ai/pdf/:docId（路由已存在，沉浸式 PDF 详情，第 3 轮出稿） | 按稿实现 |
| 8 | 去「PDF 问答」上传 ›（文字链接） | 15 Medium accent · 列表末尾居中 · 44 高命中区（上传只保留 PDF 问答一条链路）；→ /m/ai/pdf | 按稿实现 |

#### M-06 慕课详情（移动） → 任务 12.7.2

[画板](UI补稿设计图.md#m-06)

| 图例号 | 元素 | 设计要求 | 落地处理 |
|---|---|---|---|
| 1 | 返回 ‹（图标按钮） | 44×44 · accent；→ 有站内历史 → back()；深链直开 → /m/notes/:baseId/mooc（现兜底 /m/mooc 跨库列表） | 按稿实现 |
| 2 | 课程名称（文本） | 17/22 SemiBold 居中截断 · 固定显示课程名（现实现顶栏随所选条目变成「1.1 …」，离开目录后看不出在哪门课） | 按稿实现 |
| 8 | 知识库（选中）（Tab） | 建议路由在 /m/notes 下，tab「知识库」保持点亮（现 /m/mooc/:id 不点亮任何 tab）；→ /m/notes | 按稿实现 |
| 13 | 所在章节（文本） | 「视频 · 第 1 章 · …」13 label/tertiary（建议新增） | 按稿实现 |
| 14 | 下一节（次按钮） | 44 高 outline 全宽 · 按目录顺序；最后一节隐藏（建议新增：否则每看完一节都要切回目录）；→ 选中下一条目，留在「内容」 | 按稿实现 |
| 18 | 重新获取（文字按钮） | → 重新换取播放地址（建议新增） | 按稿实现 |

#### M-07 新建笔记（移动） → 任务 12.7.5

[画板](UI补稿设计图.md#m-07)

| 图例号 | 元素 | 设计要求 | 落地处理 |
|---|---|---|---|
| 1 | 返回 ‹（图标按钮） | → 有站内历史 → back()；深链直开：带 ?baseId= 时 → /m/notes/:baseId，否则 /m/notes（现固定 /m/notes） | 按稿实现 |
| 4 | 已选知识库（单选行） | 56 高 · 名称 accent Medium · 右侧 ✓ 18（现实现为 5% 蓝底、无勾，选中态不明显）· 带 ?baseId= 进入预选，否则默认第一个 | 按稿实现 |
| 6 | 封面方块（装饰） | 28 圆角 7 · 按 id 取渐变（现为统一 Library 图标，几个库分不出来） | 按稿实现 |
| 7 | 新建知识库（列表行） | accent · 加号方块 28 accent/tint（现只在「无知识库」空态出现）；→ 打开新建知识库面板（D-04② 同表单，底部面板形态）→ 创建后回到本页并自动选中 | 按稿实现 |
| 9 | 标题（输入框） | 48 高 · 圆角 10（已拍板；现 min-h-11 + rounded-lg = 14）· 字号 16（小于 16 iOS 会自动放大页面）· 「N / 15」· 回车 = 创建 | 按稿实现 |

#### M-08 协同文档库（移动） → 任务 12.7.6

[画板](UI补稿设计图.md#m-08)

| 图例号 | 元素 | 设计要求 | 落地处理 |
|---|---|---|---|
| 1 | 返回 ‹（图标按钮） | （现实现无返回键：本页不是 tab 根页，从「我的」或工作台进来后只能靠 tab bar 离开）；→ 有站内历史 → back()；深链直开 → /m/me | 按稿实现 |
| 2 | 标题「协同文档」（文本） | 17/22 SemiBold 居中 · 与入口同名（现为「文档」） | 按稿实现 |
| 6 | 创建者 · 更新时间（文本） | 「陈可 · 2 小时前更新」13 label/tertiary（现为 toLocaleString 全量时间） | 按稿实现 |
| 10 | tab bar 无选中项（状态） | /m/docs 不属于四个 tab，胶囊全部未选（与现实现一致） | 按稿实现 |
| 14 | 动作表标题（文本） | 文档标题 17 SemiBold 截断 · 说明「移除后所有成员的文档库里都看不到它。」13（建议补说明） | 按稿实现 |

#### M-09 协同文档（移动） → 任务 12.7.6

[画板](UI补稿设计图.md#m-09)

| 图例号 | 元素 | 设计要求 | 落地处理 |
|---|---|---|---|
| 9 | 图片（置灰）（状态） | 协同文档没有配置图片上传（MinIO 方案 D3「本期不接」），现点击只弹「当前编辑器未配置图片上传」—— 建议置灰并在长按 / Tooltip 说明「协同文档暂不支持图片」 | 按稿实现 |
| 12 | 连接断开（文本） | 标题下 40 高提示条 warning 12% 底「连接已断开，恢复后会自动同步你的改动」13（建议新增） | 按稿实现 |
| 14 | 重新连接（文字按钮） | → 重建连接（建议新增） | 按稿实现 |

#### M-10 搜索（移动） → 任务 12.7.7

[画板](UI补稿设计图.md#m-10)

| 图例号 | 元素 | 设计要求 | 落地处理 |
|---|---|---|---|
| 3 | 搜索框（搜索框） | 44 高 · 圆角 10 · 底 #E9E9EE（与 p07 搜索框同形）· 16 号字 · 进入即聚焦 · 占位「搜索页面、知识库或操作…」（现为「搜索页面或操作…」）；→ 逐字过滤下方列表（大小写不敏感的子串匹配，标题命中排在前） | 按稿实现 |
| 4 | 清除（图标按钮） | 有输入时出现 · XCircle 18 · 28 命中区（建议新增）；→ 清空并保持聚焦 | 按稿实现 |
| 5 | 分组标题（文本） | 快捷操作 / 知识库 / 页面 · 13/18 SemiBold label/secondary（现实现是一张不分组的长表） | 按稿实现 |
| 6 | 创建笔记（列表行） | 52 高 · 色块 30 圆角 8 · 标题 16 · 右侧 ›（现右侧显示 /m/notes/new 这类路径，面向开发者）；→ /m/notes/new | 按稿实现 |
| 7 | 知识库（列表行） | 封面方块 30 + 库名 · 候选取自知识库列表缓存，不新增请求（建议新增：与桌面 ⌘K「知识库」分组一致）；→ /m/notes/:baseId | 按稿实现 |
| 8 | 页面（列表行） | 工作台 / 知识库 / AI 对话 / PDF 问答 / 协同文档 / 我的 / 设置 · 按导航注册表派生；「任务」「慕课」不再作为独立入口（已拍板，现 mobileMoreRoutes 仍列出）；→ 对应 /m/* 地址 | 按稿实现 |
| 9 | AI 入口（列表行） | 副标题「入口保留」12 label/tertiary —— 已拍板：AI 相关页面暂不出稿，入口照常出现在搜索里；→ /m/ai/chat（目标页本轮不画） | 按稿实现 |
| 12 | 无结果（文本） | 「没有找到「周报模板」」15 SemiBold · 「搜索只覆盖页面与知识库名称，笔记正文暂不支持。」13 label/secondary（现文案「没有找到匹配的页面」） | 按稿实现 |
| 13 | 用「周报模板」新建笔记（文字按钮） | 无结果时给出下一步（建议新增）；→ /m/notes/new（标题预填查询词，3–15 字时） | 按稿实现 |

#### M-11 设置分节（移动） → 任务 12.7.7

[画板](UI补稿设计图.md#m-11)

| 图例号 | 元素 | 设计要求 | 落地处理 |
|---|---|---|---|
| 6 | 昵称（输入行） | iOS 表单行：标签 64 宽左对齐 + 输入 16 号字 · 52 高 · 聚焦只有光标、不加描边（现实现直接复用桌面两列表单，窄屏堆成一长列带标签的输入框） | 按稿实现 |
| 7 | 性别（选择行） | 右侧当前值 + ›（现为原生 select）；→ 弹出动作表：未设置 / 男 / 女（右侧 ②） | 按稿实现 |
| 8 | 邮箱（输入行） | type=email · 清空 = 传空字符串（同 D-12，依赖后端新增的对外资料端点） | 同 D-12 `a-email` |
| 12 | 显示密码（图标按钮） | EyeOff 18 · 44 命中区（建议新增）；→ 切换明文 | 按稿实现 |
| 13 | 规则清单（状态） | 实时打勾，同 D-12（建议新增） | 按稿实现 |
| 16 | 浅色 / 深色 / 跟随系统（单选行） | 52 高 · 色块 28 · 标题 16（现实现是一行三个小胶囊按钮）；→ 立即切换，无需保存 | 按稿实现 |
| 19 | 集成 · 空态（文本） | Plug 30 · 「暂无可用的集成」15 SemiBold · 「文件存储与 AI 服务由管理员在后台配置，这里暂时没有需要你连接的服务。」13 | 按稿实现 |
| 20 | AI · 暂不出稿（占位） | 已拍板：AI 相关页面暂时不画；「我的 › 设置 › AI」入口与 /m/settings/ai 路由保留 | 按稿实现 |

#### M-12 任务详情（移动） → 任务 12.7.3

[画板](UI补稿设计图.md#m-12)

| 图例号 | 元素 | 设计要求 | 落地处理 |
|---|---|---|---|
| 14 | 提交行（列表行） | 60 高 · 笔记标题 15 · 「陈可 · 09-12 14:30 提交」12；→ /m/notes/{任务的 knowledgeBaseId}/{noteId}（同 D-17：笔记与任务同库） | 按稿实现：`/m/notes/{任务 knowledgeBaseId}/{noteId}`（§1.4 第 1 条） |

#### M-13 笔记历史版本（移动） → 任务 12.7.5

[画板](UI补稿设计图.md#m-13)

| 图例号 | 元素 | 设计要求 | 落地处理 |
|---|---|---|---|
| 1 | 编辑器 ⋯「历史版本」（动作项） | 笔记阅读 / 编辑页（p09）顶栏 ⋯ 动作表第一项（右侧 ①）；→ /m/notes/:baseId/:noteId/history | 按稿实现 |
| 8 | 正文 / 本次改动（分段控件） | 358×32 全宽；→ 切换阅读方式 | 同 D-16 `h-mode` |


---

<a id="appendix-b"></a>

## 附录 B　第 4 轮新页面完整图例

这 5 块画板对应的页面在 `apps/web` 里还不存在，下面列出全部图例，方便对照实现。与后端事实冲突的条目，以 §1.4 与附录 A 的「落地处理」为准。
- 分组行加粗，是图例在画板上的分组。
- 「#」列与画板上的编号一致。

#### D-16 笔记历史版本（23 条）→ 任务 12.4.3

[画板](UI补稿设计图.md#d-16)

| # | 元素 | 类型 | 规格 | 交互 / 去向 |
|---|---|---|---|---|
| | **入口与顶栏** | | | |
| 1 | 编辑器 ⋯「历史版本」 | 菜单项 | 笔记编辑器（p04）顶栏 ⋯ 菜单第一项 · Clock 图标 15（已拍板：从知识库里的笔记页进入） | → /notes/:baseId/:noteId/history |
| 2 | ‹ 返回笔记 | 文字按钮 | 32 高 · accent | → /notes/:baseId/:noteId（编辑器） |
| 3 | 「历史版本」 | 文本 | 15/20 SemiBold · 左侧 1px 分隔 · 侧栏保持「笔记」与笔记目录当前项高亮 | — |
| 4 | 正文 / 本次改动 | 分段控件 | 32 高 · 默认「正文」；「本次改动」用该版本的编辑记录（noteEditList：原文 / 改后）标出新增与删除 | 切换阅读方式，不发请求 |
| 5 | 恢复此版本 | 主按钮 | 34 高全圆 · 选中「当前版本」时隐藏 · 没有专门的回滚端点：取该版本的 title + content 调 PATCH /notes/{noteId}（带当前 version）写回 —— 已核对后端会异步生成一条新的历史版本 | 打开「恢复到这个版本？」确认（下方 ①） |
| | **版本内容（左）** | | | |
| 6 | 正在查看 | 提示条 | 44 高 · bg/grouped 圆角 12 · Clock 15 +「正在查看 陈可 于 今天 11:05 保存的版本」13 —— 与编辑器区分，避免误以为能直接改 | — |
| 7 | 新增 / 删除 | 图例 | 只在「本次改动」出现 · 新增 = success 18% 底 + 下划线 · 删除 = danger 12% 底 + 删除线（颜色之外还有下划线 / 删除线，不靠颜色区分） | — |
| 8 | 版本标题 | 文本 | 34/42 Bold · 取该版本的 title（与编辑器 H1 同字阶） | — |
| 9 | 版本正文 | 只读正文 | 只读 TipTap · 17/30 · 纸面内边距 64；「本次改动」下按 originalPosition / revisedPosition 插入高亮片段 | — |
| | **历史记录（右）** | | | |
| 10 | 面板标题 | 文本 | 「历史记录」17 SemiBold + 「共 23 个版本」12 · 宽 320 · 白底 · 左侧 1px separator | — |
| 11 | 日期分组 | 文本 | 今天 / 昨天 / 09-12 周六 · 12 SemiBold label/tertiary（现实现是一长串不分组的时间） | — |
| 12 | 版本行 | 列表行 | 56 高 · 圆角 10 · 头像 28（保存人）· 昵称 14 Medium · 时间 12 tabular-nums（取 /notes/historyList） | 选中该版本，左侧加载 /notes/history?operationId |
| 13 | 当前版本 | 徽标 | accent 徽标 · 列表第一条；选中它时「恢复此版本」隐藏 | — |
| 14 | 已选版本 | 状态 | 底 accent/tint + 左侧 3px accent 竖条 · 昵称 accent SemiBold | — |
| 15 | 加载更早的版本 | 状态 | 每页 15 条 · 滚到底自动加载 · 12px 转圈 +「滚动加载更早的版本」；到底后显示「没有更早的版本了」 | — |
| | **状态（下方缩略）** | | | |
| 16 | 版本内容加载中 | 状态 | 提示条常显，正文区换成段落骨架；右侧列表不受影响 | — |
| 17 | 只有一个版本 | 文本 | 「这篇笔记还没有历史版本」15 SemiBold · 「之后每次保存都会在这里留下一个版本。」13 | — |
| 18 | 版本加载失败 | 文本 | 「这个版本加载失败：{message}」13 danger + 重试 | — |
| 19 | 重试 | 次按钮 | — | 重新请求该版本 |
| 20 | ① 恢复确认 · 标题 | 文本 | 「恢复到这个版本？」16 Medium · 宽 384 | — |
| 21 | ① 说明 | 文本 | 「正文会回到 陈可 · 今天 11:05 的样子。当前内容会先作为一个新版本保留在历史记录里，随时可以再换回来。」—— 已核对：保存后 MQ 异步写入操作记录与历史快照（内容无变化时不产生新版本） | — |
| 22 | ① 取消（默认焦点） | 次按钮 | — | 关闭 |
| 23 | ① 恢复 | 主按钮 | 恢复中「恢复中…」 | 写回成功 → toast「已恢复到 今天 11:05 的版本」→ /notes/:baseId/:noteId |

#### D-17 任务详情（27 条）→ 任务 12.3.3

[画板](UI补稿设计图.md#d-17)

| # | 元素 | 类型 | 规格 | 交互 / 去向 |
|---|---|---|---|---|
| | **侧栏与页头** | | | |
| 1 | 任务（保持选中） | 导航项 | 详情仍在知识库里（已拍板），侧栏「任务」保持高亮 | → /notes/:baseId/tasks |
| 2 | ‹ 任务 | 文字按钮 | — | → /notes/:baseId/tasks |
| 3 | 任务名称 | 文本 | Display 34/41 | — |
| 4 | 时间状态 | 徽标 | 按时间窗口计算：未开始 = secondary · 进行中 = accent · 已截止 = secondary（AdminNoteTaskVO.status 语义未写明，不直接使用） | — |
| 5 | 发布人与时间窗口 | 文本 | 头像 20 +「林一 发布 · 09-10 10:00 – 09-18 23:59 · 还剩 3 天」14 · 剩余 ≤ 3 天转 warning | — |
| 6 | 编辑任务 | 次按钮 | outline 34 高 · 只有知识库管理员可见（成员视角见下方缩略）· 没有删除任务的接口，不画删除 | → /notes/:baseId/tasks/:taskId/edit（D-18） |
| | **进度与描述** | | | |
| 7 | 应提交 / 已提交 | 统计 | 30/34 SemiBold tabular-nums + 单位 13 · needSubmitCount / submittedCount | — |
| 8 | 完成率 | 统计 | submissionProgress · 6 高进度条 accent · 右侧「8 / 12」 | — |
| 9 | 任务描述 | 只读正文 | 只读 TipTap · 15/25 · 旧数据是 Markdown，按 Markdown 渲染；空描述整张卡片隐藏 | — |
| | **提交记录** | | | |
| 10 | 卡片标题 | 文本 | 「提交记录」15 SemiBold | — |
| 11 | 已提交 / 未提交 / 已退回 | 分段控件 | 30 高 + 计数 · 对应 /admin/noteTasks/submissions 的 userTaskStatus = 1 / 0 / 3（与成员侧 submissionStatus 是同一个 UserNoteTaskStatus：2 = 无需提交，只有管理员自己） | 切换列表，分页每页 20 |
| 12 | 提交行 | 列表行 | 60 高 · 笔记图标 17 · 提交的笔记标题 15 · 悬停底 hover 色；「未提交」列表只有昵称 + 用户名，不可点 | → /notes/{任务的 knowledgeBaseId}/{noteId}（后端要求提交的笔记与任务同库，不用补字段） |
| 13 | 提交人 · 时间 · 编辑次数 | 文本 | 12 label/tertiary · submissionNickname · submitTime · noteEditCount | — |
| 14 | 行操作 ⋯ | 图标按钮 | 悬停出现 · 菜单头「林一 · 09-13 提交」 | 打开行菜单 |
| 15 | 退回 | 危险菜单项 | 只在「已提交」列表出现 · 截止后仍可退回，但成员已无法重新提交（文案需提示） | 打开「退回这份提交？」确认（下方 ②） |
| | **成员编辑活跃度（热力图）** | | | |
| 16 | 标题与说明 | 文本 | 「成员编辑活跃度」15 SemiBold · 说明 12 label/tertiary · 数据 /noteTasks/{id}/charts（按时间段 × 成员的 editCount） | — |
| 17 | 色阶图例 | 图例 | 单一色相顺序色阶 6 档，浅→深 = 少→多（深色模式翻转为暗→亮）· 0 次为中性灰 · 「未到」= 描边空格；不用红绿 | — |
| 18 | 热力格 | 图表 | 行 = 成员（昵称 12）· 列 = 天（11 号字）· 格 96×26 圆角 4（撑满卡片宽度） · 格间 2px 留缝 · 成员多于 12 人时按编辑总数排序并折叠「其余 N 人」 | — |
| 19 | 悬停提示 | 状态 | 当前格加 2px 表面色 + 1.5px 主文字色描边 · 浮层「林一 · 09-12 / 编辑 41 次」；数字用主文字色，不用色阶色 | — |
| | **状态（下方缩略）** | | | |
| 20 | 成员视角 | 视角 | 没有编辑按钮、统计与提交记录；主按钮按状态：未提交「提交」· 已退回「重新提交」· 已提交「已提交」禁用 · 截止「已截止」禁用；下方「我的提交」时间线（/noteTasks/{id}/history，后端已只返回本人记录）。任务信息取自 GET /noteTasks 列表（成员没有按 id 取单条的接口） | — |
| 21 | 成员 · 提交 | 主按钮 | — | 打开提交任务对话框（D-07①） |
| 22 | 任务不存在 / 无权限 | 文本 | 「找不到这个任务」17 · 「它可能已被删除，或你不在这个知识库里。」13 | — |
| 23 | 回到任务 | 次按钮 | — | → /notes/:baseId/tasks |
| 24 | ② 退回确认 · 标题 | 文本 | 「退回这份提交？」16 Medium | — |
| 25 | ② 说明 | 文本 | 「林一 的提交会变成「已退回」，TA 可以在 09-18 23:59 之前重新提交。」—— 把后果与截止时间写清（旧文案「确定要退回任务吗？」） | — |
| 26 | ② 取消（默认焦点） | 次按钮 | — | 关闭 |
| 27 | ② 退回 | 危险按钮 | — | POST /admin/noteTasks/submissions/return/{id} → toast「已退回」→ 该行移到「已退回」，计数同步 |

#### D-18 任务新建 / 编辑（15 条）→ 任务 12.3.4

[画板](UI补稿设计图.md#d-18)

| # | 元素 | 类型 | 规格 | 交互 / 去向 |
|---|---|---|---|---|
| | **页头** | | | |
| 1 | ‹ 任务 | 文字按钮 | 编辑时为「‹ 任务详情」 | 离开前表单有改动 → 浏览器离开确认；→ /notes/:baseId/tasks |
| 2 | 「新建任务」/「编辑任务」 | 文本 | Display 34/41 · 说明 15/24：新建「发布后，本库成员会在「任务」里看到它，并在时间窗口内提交一篇笔记。」；编辑「修改会立即对本库成员生效，已有的提交记录不受影响。」 | — |
| | **表单** | | | |
| 3 | 发布到 | 文本 | 「发布到 ▣ 产品设计知识库」· 知识库由路由给定，不可改（旧前端是下拉选择，已拍板放到知识库的任务 Tab 下） | — |
| 4 | 字段标签 | 文本 | 14 Medium | — |
| 5 | 任务名称 | 输入框 | 36 高 · 圆角 10 · 自动聚焦 · 必填 · 「N / 20」（PATCH 接口限 1–20 字，新建同样按 20 校验） | — |
| 6 | 开始时间 | 日期时间 | 36 高 · Clock 15 + 日期 + 时间 · 默认此刻取整到下一个整点 | 打开日期时间浮层（下方 ①） |
| 7 | 截止时间 | 日期时间 | 默认开始 + 7 天 23:59 · 必须晚于开始时间 | 打开日期时间浮层 |
| 8 | 1 周 / 2 周 / 1 个月 | 快捷选择 | 26 高胶囊 · 选中 accent/tint · 右侧说明「成员只能在时间窗口内提交」12（建议新增：多数任务就是这几种时长） | 按开始时间回填截止时间（23:59） |
| 9 | 任务描述 | 富文本 | TipTap minimal 预设 · 工具条：粗体 / 斜体 / H2 / 列表 / 有序 / 链接 · 高 130 自增长 · 选填（旧前端是 Vditor Markdown，已统一 TipTap） | — |
| 10 | 取消 | 幽灵按钮 | — | 同「‹ 任务」 |
| 11 | 发布任务 / 保存修改 | 主按钮 | 34 高全圆 · 名称为空或时间非法时点击 → 滚到第一个错误字段 · 提交中「发布中…」 | 新建 POST /admin/noteTasks → toast「任务已发布」→ 任务详情；编辑 PATCH /admin/noteTasks/{id} → toast「已保存」→ 任务详情 |
| | **状态（下方缩略）** | | | |
| 12 | ① 日期时间选择 | 浮层 | 宽 296 · 月份切换 ‹ › · 7 列日期格 36 · 今天描边、选中 accent 实心 · 下方时间输入 HH:mm + 「确定」· 时间窗口内的日期连成浅色区间 | — |
| 13 | ② 截止早于开始 | 文本 | 截止时间字段 danger 描边 +「截止时间必须晚于开始时间」12 danger（旧前端是 warning toast） | — |
| 14 | ③ 编辑模式 | 状态 | 标题「编辑任务」、按钮「保存修改」、返回「‹ 任务详情」；字段预填，发布到知识库不可改 | — |
| 15 | ④ 发布中 | 状态 | 主按钮转圈「发布中…」· 表单只读 · 失败 toast.error 保留输入 | — |

#### M-12 任务详情（移动）（18 条）→ 任务 12.7.3

[画板](UI补稿设计图.md#m-12)

| # | 元素 | 类型 | 规格 | 交互 / 去向 |
|---|---|---|---|---|
| | **顶栏（两种视角共用）** | | | |
| 1 | 返回 ‹ | 图标按钮 | — | 有站内历史 → back()；深链直开 → /m/notes/:baseId/tasks |
| 2 | 标题「任务详情」 | 文本 | 17/22 SemiBold 居中 · 非沉浸式，tab「知识库」保持点亮 | — |
| 3 | 知识库（选中） | Tab | — | → /m/notes |
| | **成员视角（左屏）** | | | |
| 4 | 任务名称 | 文本 | 20/26 SemiBold · 最多 3 行 | — |
| 5 | 我的状态 | 徽标 | 未提交 warning / 已提交 success / 已退回 danger（与 M-04 列表一致） | — |
| 6 | 时间窗口 | 文本 | Clock 15 +「09-05 10:00 – 09-20 23:59」+ 剩余天数（≤ 3 天 warning，截止后「已截止」label/tertiary）· 下一行发布人头像 18 | — |
| 7 | 任务描述 | 只读正文 | 15/24 · 卡片内 1px 分隔 · 空描述整段隐藏 | — |
| 8 | 分组「我的提交」 | 文本 | 13/18 SemiBold label/secondary | — |
| 9 | 提交的笔记 | 列表行 | 60 高 · 笔记标题 15 Medium · 「产品设计知识库 · 编辑 23 次」12 | → /m/notes/:baseId/:noteId（沉浸式编辑） |
| 10 | 提交历史 | 时间线 | /noteTasks/{id}/history · 圆点 10：提交 accent、退回 danger · 事件 15 + 时间 12 · 新的在上（退回接口没有原因字段，不画退回理由） | — |
| 11 | 提交 / 重新提交 | 主按钮 | 44 高全宽 · 贴在 tab bar 上方，底部渐隐到页面底色 · 未提交「提交」· 已退回「重新提交」· 已提交「已提交」禁用 · 截止后「已截止」禁用 | 打开提交面板（M-04①） |
| | **管理员视角（中屏）** | | | |
| 12 | 提交进度 | 统计 | 「8 / 12 人已提交」28 SemiBold · 6 高进度条 · 67% | — |
| 13 | 已提交 / 未提交 / 已退回 | 分段控件 | 358×32 全宽 + 计数 | 切换列表 |
| 14 | 提交行 | 列表行 | 60 高 · 笔记标题 15 · 「陈可 · 09-12 14:30 提交」12 | → /m/notes/{任务的 knowledgeBaseId}/{noteId}（同 D-17：笔记与任务同库） |
| 15 | ⋯ | 图标按钮 | 44×44 | 打开动作表：打开笔记 / 退回（右侧 ①） |
| 16 | 桌面版提示 | 文本 | 「编辑任务、查看编辑活跃度请使用桌面版。」12 label/tertiary —— 与慕课一致，移动端只做「看与处理」 | — |
| | **状态（右侧缩略）** | | | |
| 17 | ① 退回 | 动作表 | 标题「林一 · 09-13 提交」· 危险项「退回」→ 第二次点击「再点一次确认退回」· 说明「退回后 TA 可以在 09-18 23:59 之前重新提交。」 | 退回 → toast「已退回」 |
| 18 | ② 已截止（成员） | 状态 | 底部按钮换成「已截止」禁用 · 时间窗口转 label/tertiary | — |

#### M-13 笔记历史版本（移动）（13 条）→ 任务 12.7.5

[画板](UI补稿设计图.md#m-13)

| # | 元素 | 类型 | 规格 | 交互 / 去向 |
|---|---|---|---|---|
| | **入口与列表（左屏）** | | | |
| 1 | 编辑器 ⋯「历史版本」 | 动作项 | 笔记阅读 / 编辑页（p09）顶栏 ⋯ 动作表第一项（右侧 ①） | → /m/notes/:baseId/:noteId/history |
| 2 | 返回 ‹ | 图标按钮 | — | → 笔记编辑页；深链直开兜底同址 |
| 3 | 日期分组 | 文本 | 今天 / 昨天 / 09-12 周六 · 13/18 SemiBold label/secondary · 沉浸式页，不显示 tab bar | — |
| 4 | 当前版本 | 徽标 | 每篇第一条 · 不可恢复，也不进入版本页 | — |
| 5 | 版本行 | 列表行 | 60 高 · 头像 32 · 保存人 16 Medium · 时间 13 · 分隔线左缩 60 | → 版本页（中屏） |
| 6 | 加载更早的版本 | 状态 | 滚到底自动加载，每页 15 条 | — |
| | **版本页（中屏）** | | | |
| 7 | 顶栏标题 | 文本 | 「今天 11:05」17 SemiBold —— 时间就是版本的名字 | — |
| 8 | 正文 / 本次改动 | 分段控件 | 358×32 全宽 | 切换阅读方式 |
| 9 | 保存人与时间 | 提示条 | Clock 14 +「陈可 于 今天 11:05 保存」13 · 圆角 12 | — |
| 10 | 版本正文 | 只读正文 | 标题 26/34 Bold · 正文 16/28 · 新增 = 绿底 + 下划线，删除 = 红底 + 删除线（同 D-16） | — |
| 11 | 恢复此版本 | 主按钮 | 44 高全宽 · 贴底，底部留安全区 | 打开恢复确认动作表（右侧 ②） |
| | **状态（右侧缩略）** | | | |
| 12 | ② 恢复确认 | 动作表 | 标题「恢复到今天 11:05 的版本？」· 说明「当前内容会先作为一个新版本保留。」· 「恢复」→「再点一次确认恢复」 | 写回成功 → toast「已恢复」→ 回到笔记编辑页 |
| 13 | ③ 只有一个版本 | 文本 | 「这篇笔记还没有历史版本」15 SemiBold · 「之后每次保存都会在这里留下一个版本。」13 | — |
