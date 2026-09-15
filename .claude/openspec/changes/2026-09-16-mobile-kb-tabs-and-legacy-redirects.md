# UI 补稿：知识库内路由、旧地址重定向与 wikis 删除

## 背景与授权

2026-09-16 用户拍板 [`docs/ui/UI补稿落地改造方案.md`](../../../docs/ui/UI补稿落地改造方案.md)
§1.3 的决定记录（「按目前方案确定：画板上标『建议』的路由、重定向与橙字改动全部采纳」），
UI 补稿改造进入实施（里程碑 M12）。

此前 2026-09-15 已单独拍板三条与本提案直接相关的范围决定：

| 日期 | 决定 |
|------|------|
| 2026-09-15 | 慕课、任务只属于知识库：只在 `/notes/[baseId]/mooc`、`/notes/[baseId]/tasks` 下出现，跨库列表不再作为入口 |
| 2026-09-15 | 删除旧入口 `/wikis`、`/m/wikis*`，不出稿 |
| 2026-09-15 | 笔记历史版本从知识库里的笔记页进入；任务详情、任务新建与编辑放在知识库的任务 Tab 下 |

**本提案不改任何后端契约**：没有新增 / 修改 Controller、没有新增端点、`openapi/specs/*.json` 不变，
因此不需要为此跑 `pnpm openapi:generate`。新增页面全部走既有端点 + 既有 `@anynote/api-client`
typed client + Next BFF。

> 同一轮里的三处后端契约变更（任务编辑热力图、笔记历史查询健壮性、个人资料对外更新端点）
> 各自另有提案：`2026-09-16-note-task-edit-heatmap.md`、`2026-09-16-note-history-validation.md`、
> `2026-09-16-system-update-my-profile.md`。本提案不覆盖它们。

## 一、新增路由（8 条）

全部落在知识库上下文里，因此侧栏/Tab bar 的高亮规则天然成立
（`isBaseActive` 按 `/notes/:id` 前缀判定，`parseNoteIdFromPath` 已支持两段数字）。

| 地址 | 页面 | 画板 | 说明 |
|------|------|------|------|
| `/notes/[baseId]/mooc/[moocId]` | 慕课详情 | D-06 | 取代 `/mooc/[id]` |
| `/notes/[baseId]/tasks/[taskId]` | 任务详情 | D-17 | 新迁移；旧前端 `/dashboard/task/[id]` |
| `/notes/[baseId]/tasks/new` | 新建任务 | D-18 | 仅知识库管理员；静态段 `new` 优先于 `[taskId]` |
| `/notes/[baseId]/tasks/[taskId]/edit` | 编辑任务 | D-18 | 仅知识库管理员 |
| `/notes/[baseId]/[noteId]/history` | 笔记历史版本 | D-16 | 新迁移；旧前端 `/note/[id]/history` |
| `/m/notes/[baseId]/mooc/[moocId]` | 慕课详情（移动） | M-06 | 取代 `/m/mooc/[id]` |
| `/m/notes/[baseId]/tasks/[taskId]` | 任务详情（移动） | M-12 | 移动端不提供新建 / 编辑 |
| `/m/notes/[baseId]/[noteId]/history` | 笔记历史版本（移动） | M-13 | 沉浸式 |

页面文件只做两件事：解析参数（`Number.isSafeInteger(id) && id > 0`，否则 `notFound()`）、
渲染对应 feature 组件。**不在 RSC 里取数**——那会挡住路由切换的即时反馈，
而这一轮新增的页面全都是"点了就该马上有反应"的详情页。

### 两处必须按数字段判定的路由工具

`components/layout/navigation.ts` 里两条判定原来用 `[^/]+` 通配，会被知识库内的二级 Tab 误命中：

| 函数 | 原判定 | 新判定 | 后果 |
|------|--------|--------|------|
| `isImmersiveMobileRoute` | `/^\/m\/notes\/[^/]+\/[^/]+$/` | `/^\/m\/notes\/\d+\/\d+$/` | 旧写法把 `/m/notes/3/tasks` 当成编辑器，**底部 tab bar 被误隐藏**，与画板 M-03 – M-05 不符（§1.4 第 7 条） |
| `isFullBleedRoute` | `/^\/notes\/\d+\/\d+$/` | 追加 `/^\/notes\/\d+\/\d+\/history$/` | D-16 与编辑器同为满幅，外层再加留白会把它变成"灰底上浮着的一张卡片" |

## 二、旧地址重定向（6 条）

| 旧地址 | 去向 | 实现 |
|--------|------|------|
| `/mooc` | `/notes` | 服务端 `redirect()` |
| `/tasks` | `/notes` | 服务端 `redirect()` |
| `/mooc/[id]` | `/notes/{knowledgeBaseId}/mooc/{id}` | 客户端组件 `LegacyMoocRedirect` |
| `/m/mooc` | `/m/notes` | 服务端 `redirect()` |
| `/m/tasks` | `/m/notes` | 服务端 `redirect()` |
| `/m/mooc/[id]` | `/m/notes/{knowledgeBaseId}/mooc/{id}` | 同 `/mooc/[id]`，`variant="mobile"` |

**为什么保留而不是直接删掉**：这些地址已经通过分享链接与浏览器书签流出去了，
404 是纯粹的用户损失。没有 id 的三条（`/mooc`、`/tasks`、`/m/mooc`、`/m/tasks`）
推导不出知识库，一律落到知识库列表。

**为什么带 id 的两条要用客户端组件**：新地址的第一段是**知识库 id**，
它只存在于课程数据里（`GET /moocs/{id}` 的 `knowledgeBaseId`），服务端拿不到——
这条请求是浏览器经 BFF 发的。三个状态都要照顾：加载中给骨架、成功后
`router.replace`（不是 `push`，否则详情页的返回键会回到旧地址又被弹回来）、
查不到给不存在态。

## 三、删除 wikis（4 个页面 + 1 个 feature 模块）

删除 `app/(workspace)/wikis/**`、`app/(mobile)/m/wikis/**`、`features/wikis/**`（含测试）。

F-01 / F-02 把它们标为「已拍板删除」，**不留重定向**：旧 IA 下没有需要保护的深链
（wikis 是"只读浏览同一批笔记"的镜像入口，笔记本身的地址 `/notes/:b/:n` 一直有效）。

连带清理：

- `components/layout/navigation.ts`：`mobileTabs` 里「知识库」的 `match` 去掉 `/m/wikis`；
  `MOBILE_ROUTE_PREFIXES` 去掉 `/wikis`；`mobileMoreRoutes` 删「任务」「慕课」两项
  （两者已只属于知识库，列在「我的」会让人看不出"在哪个库"）；
  `lib/mobile/search.ts` 同步删掉这两个候选。
- `features/notes/components/mobile/{note-bases-mobile,note-list-mobile}.tsx`：
  `basePath` 参数只剩一个取值，删掉该参数。
- `e2e/mobile-core.spec.ts`：删 `/m/wikis`，`/m/tasks` 与 `/m/mooc` 改为断言重定向。

### 「我的 › 更多」调整后的内容

只剩「协同文档」与「PDF 问答」——都是**跨知识库**能力，这才符合这一组的定位。

## 四、导航注册表与地址函数

页面里不再手拼地址字符串，统一走 `components/layout/navigation.ts` 导出的函数：

```ts
moocDetailHref(baseId, moocId)      // /notes/:baseId/mooc/:moocId
taskDetailHref(baseId, taskId)      // /notes/:baseId/tasks/:taskId
taskNewHref(baseId)                 // /notes/:baseId/tasks/new
taskEditHref(baseId, taskId)        // /notes/:baseId/tasks/:taskId/edit
noteHistoryHref(baseId, noteId)     // /notes/:baseId/:noteId/history
mobileMoocDetailHref / mobileTaskDetailHref / mobileNoteHistoryHref
```

理由：本轮新增的路由都带**两层 id**，拼错的后果通常是落到别的页面而不是 404，
只在真实点击时才暴露。集中一处之后地址格式有单测兜着
（`components/layout/__tests__/navigation.test.ts`）。

## 验证计划

| 项 | 命令 / 方式 | 期望 |
|----|-------------|------|
| 地址函数与判定 | `pnpm --filter web test -- navigation` | 全绿，含 `/m/notes/3/tasks` 不沉浸、`/notes/3/7/history` 满幅两条回归 |
| 旧地址补救 | `pnpm --filter web test -- legacy-mooc-redirect` | 4 条：桌面 / 移动落点、失败不存在态、缺 `knowledgeBaseId` 不存在态 |
| 删除彻底 | `grep -rn "wikis" apps/web/src` | 0 命中（`navigation.test.ts` 里作为"非一级入口"的断言除外） |
| 深链可达 | E2E `redirects.spec.ts` | `/mooc/:id`、`/tasks`、`/m/mooc` 的去向符合上表 |
| 契约无漂移 | `pnpm openapi:check` | 无 diff（本提案不改后端） |

## 影响面与回滚

- **影响面**：`apps/web` 的路由树与导航注册表。后端、`packages/**`、`infra/**` 零改动。
- **回滚**：整体 revert 这一个批次即可；没有数据迁移、没有配置变更。
- **已知残留**：删除 wikis 后外部书签会 404。这是 2026-09-15 已拍板接受的结果
  （见 [`docs/ui/UI补稿落地改造方案.md`](../../../docs/ui/UI补稿落地改造方案.md) §9 风险表）。
