# 改动清单：把 `/docs` 多人协作并入知识库笔记（M13.0–M13.5）

> 日期：2026-09-21 · 分支：`feat/notes-collab-merge` · 方案：[`docs/collab/notes-collab-merge-plan.md`](../collab/notes-collab-merge-plan.md) v2.0
> 契约提案：[`.claude/openspec/changes/2026-09-21-notes-collab-merge.md`](../../.claude/openspec/changes/2026-09-21-notes-collab-merge.md)

## 概览

协同从「一种独立文档类型」降级为「笔记的一种编辑模式」：房间 `doc:<uuid>`/`index`
改为 `note:<noteId>`，真相源收敛回 MySQL，令牌绑定房间与只读标志，note 房间不落盘，
`/docs` 独立文档库退役。

### 改动面（实测，`git status --porcelain` / `git diff --numstat`）

分支 `feat/notes-collab-merge` 相对 `dev`（`b1d6c90`）：**7 个 commit + 19 个未提交文件**。

| 类别 | 文件数 | 行数 |
|------|--------|------|
| 新增（未跟踪，不含本清单） | 3 | — |
| 修改（未提交） | 16 | +305 / −142 |
| 已提交到分支（7 个 commit，含 21 个删除文件） | — | 见 `git diff --stat dev...HEAD` |

按目录分布（**未提交部分**）：

| 目录 | 新增 | 修改 | 删除 | 说明 |
|------|------|------|------|------|
| `apps/web/e2e` | 1 | 9 | 0 | `/docs` 退役后的用例适配 + 保存徽标公共断言 |
| `apps/web/src/features` | 2 | 4 | 0 | 编辑器协同接线修正、工作台死链、新增回归用例 |
| `infra` | 0 | 2 | 0 | `NEXT_PUBLIC_COLLAB_NOTES` 构建参数贯通 |

已提交部分（`dev...HEAD`）另含：`services/note` 3 新增 + 3 修改、`apps/collab` 14 修改、
`apps/web` 删除 21 个 `/docs` 文件、`packages/api-core` 1、`openapi/specs/note.json`（生成物）、
OpenSpec 提案 1。

### 验证结果（只记实际执行过的命令与真实输出）

| 命令 | 结果 | 备注 |
|------|------|------|
| `mvn -B -pl note -am test`（WSL，JDK 21 + Maven 3.6.3） | ✅ **58 用例全绿**（含新增 9 + 7） | `NoteServiceImplCollabGrantTest` 9、`NoteServiceImplGetNotePermissionsTest` 7 |
| `pnpm test`（`apps/collab`） | ✅ **8 文件 / 98 用例全绿** | 房间契约、握手、只读丢写、不落盘 |
| `pnpm test`（`apps/web` 全量） | ✅ **154 文件 / 1826 用例全绿** | 含本次新增 11 条（`note-editor-collab` 4 + `note-editor-mobile-collab` 7）与工作台死链回归 1 条 |
| `pnpm openapi:check`（Git Bash，前端栈在线） | ✅ **6 份 baseline 全部一致，无漂移** | `note` 64 paths，含 `/notes/{noteId}/collab-grant` |
| `pnpm --filter web typecheck` | ✅ 0 错误 | 桌面 + 移动端两份编辑器接入后各复查一次 |
| `pnpm --filter @anynote/collab typecheck` | ✅ 0 错误 | |
| `npx @biomejs/biome check apps/web/src apps/web/e2e` | ✅ 471 文件 0 error | |
| `pnpm --filter web bundle:budget` | ✅ **3 项全 PASS** | 桌面最重 `/notes/new` 301.5/310KB；移动最重 `/m/notes/[baseId]/tasks/[taskId]` 245.4/250KB；编辑器 chunk 14.1/250KB。协同笔记路由本体：桌面 `/notes/[baseId]/[noteId]` 282.7KB、移动 `/m/notes/[baseId]/[noteId]` 213.7KB |
| `pnpm --filter web test:e2e` | ✅ **141 用例全绿**（chromium 99 + mobile 42） | 连跑三轮：末轮 141/141。前面两轮各有 1 条 `cli-authorize` 超时，见「审计要点」第 9 条 |
| `pnpm --filter web lighthouse:budget`（桌面） | ✅ **5 条路由全 PASS** | login 100 · dashboard→/notes 99 · /notes 99 · **/notes/new 99** · /ai/chat 99；Accessibility 全 96 |
| `pnpm --filter web lighthouse:budget:mobile` | ⚠️ **4/5 达标；`/m/dashboard` 未达标（80 / 门槛 85）** | 见下方「Lighthouse 移动端未达标项」——**已实测确认为既有问题，非本批引入** |
| `.dsh-ops/verify-pc-collab.mjs`（真实 Chromium，PC 1440×900） | ✅ **10/10 通过** | 见下方「真实浏览器验收」 |
| `.dsh-ops/verify-mobile-collab.mjs`（真实 Chromium，Pixel 5） | ✅ **6/6 通过** | 同上 |

### Lighthouse 移动端未达标项（既有问题，本批未引入、未修）

`/m/dashboard` 移动口径 Performance **80**，门槛 85。**换四种构建组合实测，确认与本批改动无关**：

| 被测对象 | 构建设置 | `/m/dashboard` |
|---|---|---|
| `feat/notes-collab-merge` HEAD（含本批全部改动） | `NEXT_PUBLIC_COLLAB_NOTES=1` | 79 |
| 同上，但**先 stash 掉**本批对 `mobile-dashboard.tsx` / `mobile-search.tsx` 的改动 | `NEXT_PUBLIC_COLLAB_NOTES=1` | 79 |
| 同上，且 **`NEXT_PUBLIC_COLLAB_NOTES` 关闭** | 开关关 | 80 |
| **`dev`（`b1d6c90`，本批之前的基线）** | `NEXT_PUBLIC_COLLAB_NOTES=1` | **80** |

四种组合全部落在 79–80：**`dev` 上就已不达标**，与协同开关无关，也与本批对工作台第三格的改动无关。
其余 4 条（login 93 · /m/notes 87 · /m/notes/new 87 · /m/ai/chat 89）全部达标。

背景：`docs/mobile/MOBILE_MILESTONES.md` 记 2026-09-16 实测为 `/m/dashboard` **89**（当时根因 CLS 0.286，
修后 0.024 达标）。从那时到 `dev` 之间该页回落到 80，**回落归属哪一批未定位**
（不属本批范围，另开工单）。本批对 `mobile-dashboard.tsx` 的改动只是把第三格的 `href`
从 `/m/docs` 换成 `/m/notes`——同一套渲染结构、同一个图标组件，不改变任何渲染路径。

### 顺带修掉的两处 `/docs` 退役残留（工具与门禁侧）

除三个产品缺陷外，`/docs` 退役还漏了两处**构建期工具与性能门禁**里的引用，都不在方案原文里：

| 位置 | 问题 | 处置 |
|------|------|------|
| `apps/web/scripts/lib/lighthouse.mjs` | 默认审计路由仍含 `/docs` 与 `/m/docs`。Lighthouse 对 404 页面**照样给分**（量的是错误页），门禁于是永远"绿"、也永远测不到真实页面 | 采样点换成 `/notes/new` 与 `/m/notes/new`（笔记编辑器所在的同一路由段，且是当前最重的业务页之一）；补 2 条回归用例钉住"审计路由不得含已退役路由" |
| `apps/web/src/features/dashboard/components/mobile-dashboard.tsx`、`.../search/components/mobile-search.tsx` | 见「审计要点」第 7 条（移动首屏死链 + 陈旧图标映射） | 一并修复并补回归 |

**本批未执行的项**：无。方案 §9 的验收项已全部跑到（history 观测见下）。

### 真实浏览器验收（方案 §9 总验收标准）

PC 端（真 Chromium + 真容器栈，`NEXT_PUBLIC_COLLAB_NOTES=1`）：

| 验收点 | 结果 |
|--------|------|
| 新建笔记后正文 H1 = 标题（**编辑器非空白**） | ✅ 实际 `"PC 协同验证 962540"` |
| 协同连接建立（在线成员条出现） | ✅ |
| 保存态徽标 | ✅ `"已同步"`（协同模式文案，D4/§7.4） |
| 第二端打开笔记即读回已有正文 | ✅ 冷启动注入 + sync 双端一致 |
| 另一端实时看到输入内容 | ✅ CRDT 互见 |
| 刷新后内容读回（真相源 MySQL） | ✅ |
| 不存在的笔记拿不到协同令牌 | ✅ BFF 回 `A0404`，不签发 |
| 非法 noteId（`-1`）被 BFF 拒绝 | ✅ HTTP 400 |
| `/docs` 已退役 | ✅ HTTP 404 |
| 无未捕获 JS 报错 | ✅ |

移动端（Pixel 5 视口 + 移动 UA + 触摸）：

| 验收点 | 结果 |
|--------|------|
| 移动端打开笔记正文非空白（H1 = 标题） | ✅ |
| 移动端无横向溢出 | ✅ `overflow=0px` |
| 移动端建立协同连接（在线成员条） | ✅ |
| 移动端输入被桌面端实时看到（跨端互见） | ✅ |
| 移动端刷新后内容读回 | ✅ |
| 移动端无未捕获 JS 报错 | ✅ |

**§9 第 5 项（history / ES 观测，D9 是否回头加节流的依据）**：对真实协同会话用过的笔记
（`note_id=4210`，两端共编 + 多次防抖保存）查 `anynote` 库得
**history 2 条 / operation_log 2 条 / edit_log 3 条**；全库 history 合计 969 行。
条数与「停手后一拍」的保存次数同量级，**未观察到快照膨胀**——D9「本期不加
`NoteEditDTO.snapshotHistory`」的结论成立，无需回头补字段。

### 实施中发现并修复的三个缺陷（本批新增）

这三个都不在方案原文里，是执行 §9 验收时暴露出来的；每个都先写/先跑出失败用例再改。

| # | 缺陷 | 影响 | 修法 |
|---|------|------|------|
| 1 | **协同模式下编辑器正文恒为空**（P0） | 开关打开后**任何**有内容的笔记打开都是空白编辑器（只剩占位提示与「0 字」）。冷启动注入守卫的 `!editor` 恒成立 → 注入永不执行 | `editor` 实例的交接从 `onChange` 改到 `onReady`，且只在协同绑定就绪后交出（详见「审计要点」第 6 条） |
| 2 | **移动端协同态不可见** | 移动端编辑器不渲染在线成员条，且 `SaveStatusBadge` 未传 `collabConnected`，多人共编时用户看不到任何同伴反馈 | `MobileScreen` 的 `title` 传入徽标 + `CollabPresence`，与桌面同一套语义（§7.2 / §7.4） |
| 3 | **移动工作台第三格是死链** | `/m/dashboard` 快捷操作「协同文档 → `/m/docs`」在退役后必 404，而它是移动端首屏 | 改为「知识库 → `/m/notes`」；配套单测原本断言着那条死链（所以是绿的），一并改成反向断言（详见「审计要点」第 7 条） |

---

## 一、`services/note`（Java）——后端总改动 = 一个只读端点 + 一个 bug 修复

先修既有缺陷再上端点：`getNotePermissions` 的「知识库只读成员」分支用
`Integer.valueOf(char)` 取到的是**字符码**（`'4'`→52）而不是数字 4，
`permissionCompute` 必然抛 `A0300`，导致只读成员打不开该库**任何**笔记。

| 文件 | 状态 | 作用与原因 |
|------|------|-----------|
| `services/note/.../service/impl/NoteServiceImpl.java` | 修改 | ① 修 `getNotePermissions` 只读分支的字符码缺陷（`charAt`→`substring(2,3)`）；② 新增 `getCollabGrant(noteId)`，复用同一权限推导后附版本令牌与标题，无权限回 `NONE` 而不抛 401；③ `grantPerm()` 把内部枚举名 `NO` 映射成对外契约的 `NONE`，避免内部枚举名泄进 API |
| `services/note/.../service/NoteService.java` | 修改 | 接口登记 `getCollabGrant`，与实现同一份 Javadoc 说明「非内部调用、不加 `@InnerAuth`」 |
| `services/note/.../controller/NoteController.java` | 修改 | 新增 `GET /notes/{noteId}/collab-grant`；普通 Bearer 认证，笔记不存在由服务层抛 `A0404` |
| `services/note/.../model/vo/CollabGrantVO.java` | 新增 | 响应 DTO（`noteId` / `perm` / `version` / `title`）；**不回正文**，正文仍由客户端单独 `GET /notes/{id}`，两条链路互不耦合 |
| `services/note/.../service/impl/NoteServiceImplGetNotePermissionsTest.java` | 新增 | 7 条纯单测：作者 / 管理员 / 库管理 / 库编辑 / **库只读（含"旧取值方式必抛 A0300"的反证）** / 库里被禁笔记 / 非成员。用 `@BeforeAll TableInfoHelper.initTableInfo` 注册实体的 lambda 缓存（纯单测无 MyBatis 启动流程），并给每个用户挂非空 `SysRole`（`isAdminX` 会直接取 `role.getRoleKey()`） |
| `services/note/.../service/impl/NoteServiceImplCollabGrantTest.java` | 新增 | 9 条纯单测：六条权限分支 + 笔记不存在 `A0404` + `updateTime` 为空时 `version` 为 null + 权限槽位非法时沿用 `A0300` |
| `openapi/specs/note.json` | 修改 | **生成物**：由 `openapi/generate.sh` 从运行中的网关重生，**被 CI `openapi:check` 卡 diff**；评审请看 `NoteController` 的注解而不是这份 JSON |

## 二、`apps/collab`——房间契约收窄 + 越权面修复 + 只读丢写 + 不落盘

`index` / `doc:<uuid>` **直接删除、不设过渡期**（方案 §8，Q1 已确认 `/docs` 只有测试数据）。

| 文件 | 状态 | 作用与原因 |
|------|------|-----------|
| `apps/collab/src/rooms.ts` | 修改 | 契约收敛为 `note:<正整数>`（`/^[1-9][0-9]{0,18}$/` + 安全整数校验）；删 `index` / `doc:`；`roomFileName` 相应简化 |
| `apps/collab/src/auth.ts` | 修改 | `verifyCollabToken` 返回值扩成 `{identity, room, ro}`；**缺 `room` claim 一律拒绝**（灰度期旧前端令牌不得绕过房间绑定）；`ro` 仅严格 `true` 为真 |
| `apps/collab/src/upgrade.ts` | 修改 | 增加 `token.room === 握手房间名` 判定，不符回 **403**——这是越权面的核心修复（旧实现校验令牌后接受任意合法房间） |
| `apps/collab/src/protocol.ts` | 修改 | 只读连接丢写：委派 `readSyncMessage` 前用 `peekVarUint` **只读不前进**地判 sync 子类型，`Step2`/`Update` 丢弃并计数，`Step1` 放行；awareness 里客户端自报的 `user` 以令牌身份覆盖；`rejectedWrites` 计数供 `/healthz`（**不打日志**——被拒客户端可能循环重试） |
| `apps/collab/src/server.ts` | 修改 | `note` 房间统一走 `memoryOnlyPersistence`（真相源是 MySQL，冷启动恒空 ⇒ 恒从 DB 注入，没有新旧可裁）；`/healthz` 汇总 `rejectedWrites`；握手把 `ro` / `identity` 挂到连接上 |
| `apps/collab/src/doc-manager.ts` | 修改 | 新增 `rooms()` 与 `rejectedWrites(room)` 供 `/healthz` 汇总，`/healthz` 要读房间级指标 |
| `apps/collab/src/persistence.ts` | 修改 | `roomFileName` 跟随新契约（`note-<id>.ydoc`）；文件实现与目录穿越防护**原样保留**作为能力备用 |
| `apps/collab/src/__tests__/rooms.test.ts` | 修改 | 拒绝 `index` / `doc:` / `note:0` / 前导零 / 负数 / 小数 / 超长 / 超安全整数；`parseHandshake` 无前导斜杠时与 URL 解析器同口径 |
| `apps/collab/src/__tests__/auth.test.ts` | 修改 | 新增「缺 `room` 拒绝」「`ro` 只在严格 true 为真」「身份/房间/只读一并解出」 |
| `apps/collab/src/__tests__/upgrade.test.ts` | 修改 | 新增「令牌房间≠握手房间 → 403」「缺 room → 401」「已退役 index/doc → 400」 |
| `apps/collab/src/__tests__/protocol.test.ts` | 修改 | 新增只读写拦截全组：**只读仍能完成初始 sync**、Update/Step2 被丢且文档不变、丢写不断连（随后 Step1 仍能拿到 Step2）、awareness 放行、令牌身份覆盖伪造身份 |
| `apps/collab/src/__tests__/server.test.ts` | 修改 | 新增 `note 房间不落盘`（断开后重连读不到旧内容）与真实 socket 上的只读连接用例；`pump` 补上 provider `_onopen` 的首次 syncStep1 |
| `apps/collab/src/__tests__/persistence.test.ts` | 修改 | 文件名映射与非法房间名（含 `index` / `doc:`）随新契约更新 |
| `apps/collab/src/__tests__/doc-manager.test.ts` | 修改 | 房间名随新契约更新；新增 `rooms()` / `rejectedWrites()` 观察指标用例 |

## 三、`apps/web`——BFF、协同运行时、双模式与 `/docs` 退役

### 3.1 BFF 与数据层

| 文件 | 状态 | 作用与原因 |
|------|------|-----------|
| `src/app/api/auth/collab-token/route.ts` | 修改 | 请求体改 `{noteId}`；签发前以**会话身份**调 `collab-grant`；claims 注入 `room` / `ro`；`perm=NONE` → 403 拒签；`noteId` 非正安全整数 → 400（它会被直接拼进 `room`） |
| `src/lib/auth/profile.ts` | 修改 | 新增 `collabGrantSchema` 与 `loadCollabGrant()`；刻意**不在这里二次刷新**——调用方刚拿到可用 accessToken，重复刷新会让 Cookie 轮换两次、`rotated` 到底哪份生效变含糊 |
| `src/lib/auth/backend-note.ts` | 新增 | BFF 专用 `noteClient`（直连 Gateway 自带 Authorization），与浏览器侧 `/api/proxy/note` 区分开 |
| `src/lib/env.ts` | 修改 | 新增 `NEXT_PUBLIC_COLLAB_NOTES`（严格 `"1"` 才开），D7 的总开关；回滚 = 改环境变量重部署，不加数据库列 |
| `packages/api-core/src/note-schemas.ts` | 修改 | `noteDetailSchema` 补 `notePermissions`，协同前端据此判「能否写」，`>= EDIT(6)` 才连房间 |
| `src/app/api/auth/__tests__/collab-token-route.test.ts` | 修改 | 17 条：claims 完整性、`ro` 随 perm 变化、NONE 拒签、grant 上游失败、缺 room、noteId 校验、刷新后 accessToken 一致性等 |

### 3.2 协同运行时（M13.3 核心）

| 文件 | 状态 | 作用与原因 |
|------|------|-----------|
| `src/lib/collab/rooms.ts` | 修改 | 与服务端同一套 `note:<id>` 规则；导出字面量常量供对拍 |
| `src/lib/collab/__tests__/rooms.test.ts` | 修改 | 前端侧规则用例 + **对拍测试**：直接读服务端 `apps/collab/src/rooms.ts` 源文，比对前缀 / 正则 / 长度上限，改一侧忘另一侧会红 |
| `src/lib/collab/injection.ts` | 新增 | 冷启动注入守卫：`shouldInject()` 纯函数真值表（已同步 / 文档空 / 未 seeded / awareness 只有我）；`meta` 读写（`seeded` / `savedVersion`）；`COLLAB_INJECT_ORIGIN` |
| `src/lib/collab/inject.ts` | 新增 | `injectInitialContent()` 用 `setContent(markdown, {emitUpdate:false})` 经 ySyncPlugin 写入 Y.Doc，并同拍置位 `meta.seeded`（主锁是「文档为空」，`seeded` 兜底「带本地状态重连」路径） |
| `src/lib/collab/session.ts` | 修改 | `fetchCollabToken({noteId})`；续期同样带 `noteId`（**续期即重查权限**）；`noteIdFromRoom()` 在换令牌前就拒非法房间 |
| `src/features/collab/use-collab-note.ts` | 新增 | 组合 grant→token→房间→注入守卫→**保存排队过滤**：订阅 Y.Doc 的 origin，`provider`（远端广播）与 `INJECT_ORIGIN`（冷启动注入）都不排队保存——这是「一个人打字不让在场每个人都排一次保存」的实现点 |
| `src/features/notes/use-save-note.ts` | 修改 | 新增 `conflictPolicy`（`overwrite` 时 A0409 换号重发、不弹冲突框）、`sharedVersion`（别人刚存过的版本号顶掉我手里的过期值）、`onSaved`（保存成功回写共享 meta）、「内容与基线相同就不发」守卫、重试预算 2→4；新增 `COLLAB_AUTOSAVE_DEBOUNCE_MS=3000` |
| `src/features/notes/components/note-editor.tsx` | 修改 | 桌面编辑器接协同：`collabEnabled` 开关判定、`preset` 双模式切换、断线**降级横幅 + 回退单人模式**、头部挂在线成员与协同态保存徽标；`onChange` 在协同模式下不再重复排队保存；**`editor` 实例改由 `onReady` 交接**（P0 修复，见「审计要点」第 6 条） |
| `src/features/notes/components/mobile/note-editor-mobile.tsx` | 修改 | 移动端同一套接线（`toolbar="mobile"`），保证两端行为不分叉；同样改为 `onReady` 交接，并补上**在线成员条 + 协同态徽标**（原先移动端两者都缺） |
| `src/features/notes/components/collab-presence.tsx` | 新增 | 在线成员头像条从 `features/collab/components/collab-status.tsx` 迁入笔记域——`/docs` 退役后协同状态属于笔记编辑器 |
| `src/components/note/save-status.tsx` | 修改 | 新增 `collabConnected`：连上时「已保存」改说「已同步」且不显示时间（本地 `lastSavedAt` 与本房间是否同步无关）；保存中/失败/冲突仍按本地态显示 |
| `src/features/dashboard/components/mobile-dashboard.tsx` | 修改 | 快捷操作第三格 `协同文档 → /m/docs` 是退役后的死链且位于移动首屏，改为 `知识库 → /m/notes`（P0 级死链修复，见「审计要点」第 7 条） |
| `src/features/search/components/mobile-search.tsx` | 修改 | 删掉 `PAGE_ROW_ICONS` 里永不命中的 `/m/docs` 陈条目（候选集已无该路由）与其后成为未使用的 `FileText` 导入 |

### 3.3 新增/更新的用例

| 文件 | 状态 | 作用与原因 |
|------|------|-----------|
| `src/features/collab/__tests__/use-collab-note.test.tsx` | 新增 | 10 条：开关关闭不连、连 `note:<id>`、错误态降级、`savedVersion` 同步、`publishSavedVersion`、**origin 过滤三态**（远端不排、注入不排、本地才排） |
| `src/lib/collab/__tests__/injection.test.ts` | 新增 | 12 条：`shouldInject` 真值表穷举、`meta` 读写、非法 `savedVersion` 归一 |
| `src/features/notes/components/__tests__/note-editor-collab.test.tsx` | 新增 | 4 条（本批）：有编辑权才开协同并把 `noteId`/`markdown` 交给运行时；**`onReady` 即交接实例**（P0 复现用例，改前必红）；绑定未就绪时**不得**交出实例；`onReady` 仍建立标题基线 |
| `src/features/notes/components/mobile/__tests__/note-editor-mobile-collab.test.tsx` | 新增 | 7 条（本批）：移动端开协同 + `toolbar="mobile"`、`onReady` 交接、未就绪不交出、徽标说「已同步」不说「已保存」、在线成员条、单人链路不渲染成员条、降级提示条可重连 |
| `src/features/dashboard/components/__tests__/mobile-dashboard.test.tsx` | 修改 | （本批）第三格由断言 `/m/docs`（死链，改前是绿的）改为 `知识库 → /m/notes`，并新增「快捷操作不指向任何已退役路由」的反向回归 |
| `src/features/notes/__tests__/use-save-note.test.tsx` | 修改 | +7 条协同块：`overwrite` 不弹冲突、无变化跳过守卫、4 拍预算、`prompt` 现状不变、`sharedVersion` 生效、`onSaved` 回调、防抖常量关系 |
| `src/components/note/__tests__/save-status.test.tsx` | 修改 | +4 条：协同连接时说「已同步」且不带时间；保存中/失败/冲突不被连接态盖掉 |
| `src/features/collab/__tests__/use-collab-room.test.tsx` | 修改 | 房间名随新契约更新（`note:1` / `note:2`） |
| `src/lib/collab/__tests__/session.test.ts` | 修改 | 换令牌/续期都带 `noteId`；非法房间名在换令牌前就被拒 |
| `src/lib/__tests__/env.test.ts` | 修改 | +2 条：开关默认关闭、只有 `"1"` 才开；默认值快照补 `NEXT_PUBLIC_COLLAB_NOTES: false` |

### 3.4 `/docs` 退役与导航（M13.5）

| 文件 | 状态 | 作用与原因 |
|------|------|-----------|
| `src/components/layout/navigation.ts` | 修改 | 移除「协作」一级分组与「协同文档」入口、`/docs` 移动端映射、`/m/docs` 沉浸式判定、`/m/docs` 更多入口 |
| `src/app/(workspace)/docs/**`、`src/app/(mobile)/m/docs/**` | 删除 | 独立文档库路由整体退役（6 个文件） |
| `src/features/collab/components/**` | 删除 | 列表/编辑页、懒加载入口、状态组件及其用例（12 个文件） |
| `src/features/collab/use-collab-index.ts`、`src/lib/collab/index-doc.ts`、`src/features/collab/schemas.ts` 及用例 | 删除 | 索引房间契约整体退役（3 + 2 个文件） |
| `src/components/layout/__tests__/navigation.test.ts` | 修改 | 断言协作分组消失、`/m/docs` 不再算沉浸式、更多入口只剩 PDF 问答 |
| `src/components/layout/__tests__/app-shell.test.tsx` | 修改 | 一级导航不再有「协同文档」 |
| `src/features/settings/components/__tests__/mobile-me.test.tsx` | 修改 | 「更多」只剩 PDF 问答 |
| `src/features/notes/components/__tests__/note-history-page.test.tsx` | 修改 | 夹具「昨天」改为 `setDate(getDate()-1)`——分组按**本地日历天**切，`now-26h` 在凌晨会跨两个日，只在白天通过 |
| `src/components/layout/mobile/__tests__/mobile-tab-bar.test.tsx`、`src/e2e/mobile-core.spec.ts` | 修改 | 修已知的 `noUncheckedIndexedAccess` / 空值类型报错（非本方案引入，顺手补） |

### 3.5 E2E 适配（本批）

`/docs` 退役后有一批用例的前提消失或选择器失效；**删除 3 条、改写 9 个文件、新增 1 个 helper**。
删掉的都是"前提真的没了"（不是改成空跑）：D-10 协同文档库、M-08 协同文档库、`/m/docs 无横向滚动`。

| 文件 | 状态 | 作用与原因 |
|------|------|-----------|
| `e2e/support/save-status.ts` | 新增 | 保存徽标的公共断言。**不能再用 `hasText: "已保存"`**：协同模式下连上房间时文案是「已同步」（§7.4），写死任一个都会假红；判据改取 `[data-status="saved"]`——`save-status.tsx` 把状态机的枚举直接写进该属性，与文案、与协同连接**都**无关 |
| `e2e/collab.spec.ts` | 修改 | 整条重写为**笔记协同**：走 `/notes/<baseId>/<noteId>`，覆盖双上下文实时互见、落库后刷新读回、协同态徽标、BFF 拒签无权限令牌、`/docs` 404 与一级导航无「协同文档」 |
| `e2e/notes-title.spec.ts`、`e2e/mobile-notes-title.spec.ts`、`e2e/notes.spec.ts`、`e2e/notes-image-upload.spec.ts`、`e2e/mobile-core.spec.ts`、`e2e/ui-redesign.spec.ts` | 修改 | 「已保存」断言改用上面的 helper（共 6 处）；`ui-redesign` 另有一条是**校验徽标胶囊样式**，同样只换定位不动样式断言 |
| `e2e/ui-redesign.spec.ts` | 修改 | 一级导航不再有「协同文档」→ 改为 `toHaveCount(0)` 反向断言，并正向补齐 AI 助手一组（`AI 对话` / `AI 工作流` / `PDF 问答`）与 `sidebar-new-base` |
| `e2e/ui-supplement.spec.ts` | 修改 | 删 D-10 用例；「全部资料 → `/docs`」**保留**并加注——那是知识库「资料」Tab（`/notes/<baseId>/docs`），与退役的一级文档库同名但无关 |
| `e2e/mobile-supplement.spec.ts` | 修改 | 删 M-08 用例；M-02「更多」组由整页文本断言改为**按组**断言（`section` + `h2`，不是 landmark）；深色用例路径去掉 `/m/docs` |
| `e2e/mobile-core.spec.ts` | 修改 | `MOBILE_ROUTES` 去掉 `/m/docs`（循环生成的「无横向滚动」用例随之消失），并注明知识库「资料」Tab 是另一条路由 |
| `e2e/landing.spec.ts` | 未改 | 核查后确认落地页的「协同文档」是**营销文案**（`BentoCard` 是 `<article>`、无 href），不是指向 `/docs` 的链接，不会 404，故保持原样 |

## 四、`infra`——协同总开关贯通到镜像构建（本批）

`NEXT_PUBLIC_*` 被 Next 在**构建时内联**，运行时给容器加环境变量是无效的，必须走 build arg。

| 文件 | 状态 | 作用与原因 |
|------|------|-----------|
| `infra/Dockerfile.web` | 修改 | 新增 `ARG`/`ENV NEXT_PUBLIC_COLLAB_NOTES`。不打通这一条，`Dockerfile` 里的 `pnpm --filter web build` 永远拿不到开关，镜像里的协同恒为关闭（本地实测：不加这个参数时 `/notes/*` 走的是单人链路） |
| `infra/docker-compose.yaml` | 修改 | `build.args` 与容器 `environment` 各补一行，默认 `${NEXT_PUBLIC_COLLAB_NOTES:-}`（**空 = 关闭**）。回滚 = 去掉这个变量重部署一个镜像，不加数据库列（D7） |

## 五、文档同步

| 文件 | 状态 | 作用与原因 |
|------|------|-----------|
| `CLAUDE.md` | 修改 | 仓库定位里补 `apps/collab` 的房间契约（`note:<noteId>`、令牌绑房间与只读、不落盘、旧契约退役）；`docs/collab/` 指针由「待评审」改为「实施中（已完成并合并）」并指向本清单；E2E 用例数由 136 更新为 141 |
| `.claude/context/frontend.md` | 修改 | 「协同编辑（M8.1）」整节改写为「笔记的一种编辑模式（M13.2–M13.4）」：房间名、令牌 `room`/`ro`、注入守卫、人人保存、开关与降级；同时清掉侧栏分组 / 骨架 / 目录树 / 工具条表里的「协同文档」表述，避免文档继续描述已退役的 `/docs` |
| `docs/changelist/2026-09-21-notes-collab-merge.md` | 新增/重写 | 本清单；补入本批新增的三个缺陷修复、真实浏览器验收记录与 §9 第 5 项的 history 观测数据 |

## 六、审计要点

1. **只读丢写是本批最容易做错的一处**（`apps/collab/src/protocol.ts`）。判 sync 子类型必须用
   `peekVarUint` 只读不前进，否则放行分支会把已读掉的字节又交给 `readSyncMessage`，初始 sync 直接解错。
   用例里专门钉了「只读连接仍能完成初始 sync」——做错这条，只读用户会连上但永远看不到内容。
2. **越权面的修复点是令牌绑房间**（`upgrade.ts` 的 `claims.room !== canonicalRoom`）。旧实现解出令牌即放行，
   任何登录用户可写任意房间；`auth.ts` 里「缺 `room` 一律拒绝」是配套的第二道，防止灰度期旧令牌绕过。
3. **`NoteServiceImpl#getNotePermissions` 的 `charAt`→`substring` 影响面超出协同**：切面统一经此取权限，
   修之前**知识库只读成员打不开任何笔记**。用例保留了「旧取值方式必抛 A0300」的反证。
4. **`grantPerm()` 把 `NO` 映射成 `NONE`**：对外契约（方案 §5.2 / OpenSpec）写的是 `NONE`，
   内部枚举名不泄进 API，将来枚举改名也不会悄悄改掉线上字段。
5. **保存侧三处改动互相咬合**（`use-save-note.ts`）：`overwrite` 分支 + 「无变化跳过」守卫 + `sharedVersion`。
   跳过守卫是防乒乓的关键（resync 后 `baseRef` 已对齐，无新内容的客户端就此打住）；少了它，
   4 拍重试会变成写放大。协同模式下 `onChange` 不再排队保存，改由 Y.Doc 的 origin 过滤驱动。
6. **本批最隐蔽的一处：`editor` 实例必须在 `onReady` 交接，不能在 `onChange`**（P0）。
   `onChange` 就是 TipTap 的 `onUpdate`、**只在 `docChanged` 时触发**；而协同模式下编辑器初始为空
   （`content` 刻意不设，正文的唯一真相是 Y.Doc），空文档不产生任何 `docChanged`——实例于是**永远是
   `null`**，冷启动注入守卫的 `!editor` 恒成立，注入永不执行，**任何有内容的笔记打开都是空白编辑器**。
   原先的单测掩盖了它：桩件只验证「传了 `collabEnabled` / `markdown`」，没验证实例真的交出去了。
   修复同时收紧了一条边界——**只在协同绑定就绪后**才交出实例：绑定前编辑器跑的是 `full` 预设，
   那时注入不会经 ySyncPlugin 写进 Y.Doc，却已经把 `meta.seeded` 置位，会让笔记**永久**空白。
   `note-editor-collab.test.tsx` 与 `note-editor-mobile-collab.test.tsx` 分别对两端钉住这两条。
7. **移动工作台的死链是被"绿着的单测"掩盖的**（`mobile-dashboard.tsx`）。
   `QUICK_ACTIONS` 第三格 `协同文档 → /m/docs` 随 `/docs` 退役变成必 404 的链接，且它在移动端**首屏**上；
   配套单测当时正断言着这条 href，所以一路绿灯。修法是改成 `知识库 → /m/notes`（与前两格
   「新建笔记 → `/m/notes/new`」「AI 对话 → `/m/ai/chat`」构成同一套"新建 / 对话 / 浏览"三分法，
   且画板 M-01 正文本身也写着「协同文档不进本页」），并把单测改成**反向断言**（不指向任何已退役路由）。
   **这属于对画板 M-01 图例 6 的有意偏离**，已在此登记；若产品要求另一格，改 `QUICK_ACTIONS` 一行即可。
8. **E2E 的「已保存」断言必须走 `data-status`**：协同模式下徽标文案是「已同步」，把文案写死会在
   开关打开时假红；`save-status.tsx` 的 `data-status` 是这套状态机唯一与文案无关的锚点。
9. **`cli-authorize.spec.ts` 的偶发超时不是本批引入**：连跑三轮 E2E，前两轮各有 1 条该文件的用例
   60s 超时（失败截图显示浏览器侧已到「已收到授权」，卡在等 CLI 子进程退出），单独跑
   `npx playwright test e2e/cli-authorize.spec.ts` 为 **5/5 通过**，末轮全量 **141/141 通过**。
   该文件本批**一字未改**，判定为与机器负载相关的既有 flake，留档不在此处修。
