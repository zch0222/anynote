# 改动清单：把 `/docs` 多人协作并入知识库笔记（M13.0–M13.5）

> 日期：2026-09-21 · 分支：`feat/notes-collab-merge` · 方案：[`docs/collab/notes-collab-merge-plan.md`](../collab/notes-collab-merge-plan.md) v2.0
> 契约提案：[`.claude/openspec/changes/2026-09-21-notes-collab-merge.md`](../../.claude/openspec/changes/2026-09-21-notes-collab-merge.md)

## 概览

协同从「一种独立文档类型」降级为「笔记的一种编辑模式」：房间 `doc:<uuid>`/`index`
改为 `note:<noteId>`，真相源收敛回 MySQL，令牌绑定房间与只读标志，note 房间不落盘，
`/docs` 独立文档库退役。

### 改动面（实测，`git status --porcelain` / `git diff --numstat`）

| 类别 | 文件数 | 行数 |
|------|--------|------|
| 新增（未跟踪，不含本清单） | 11 | +995 |
| 修改 | 44 | +1733 / −359 |
| 删除 | 21 | −1888 |
| **合计** | **76** | **+2728 / −2247** |

按目录分布：

| 目录 | 新增 | 修改 | 删除 | 说明 |
|------|------|------|------|------|
| `services/note`（Java） | 3 | 3 | 0 | 权限缺陷修复 + `collab-grant` 端点 |
| `apps/collab`（Node） | 0 | 14 | 0 | 房间契约 / 令牌绑房间 / 只读丢写 / 不落盘 |
| `apps/web`（前端） | 7 | 23 | 21 | BFF / 协同运行时 / 双模式 / `/docs` 退役 |
| `packages/api-core` | 0 | 1 | 0 | `noteDetailSchema` 补 `notePermissions` |
| `openapi/specs` | 0 | 1 | 0 | **生成物**：`note.json` baseline |
| `.claude/openspec` | 1 | 0 | 0 | 契约提案 |
| `docs/changelist` + `CLAUDE.md` + `.claude/context` | 1（本清单，+150） | 2 | 0 | 改动清单本身 + 文档同步 |

### 验证结果（只记实际执行过的命令与真实输出）

| 命令 | 结果 | 备注 |
|------|------|------|
| `mvn -pl note -am test`（JDK 21 + Maven 3.9） | ✅ **58 用例全绿**（含新增 9 + 7） | `NoteServiceImplCollabGrantTest` 9、`NoteServiceImplGetNotePermissionsTest` 7 |
| `npx vitest run`（`apps/collab`） | ✅ **8 文件 / 98 用例全绿** | 重写后的房间契约、握手、只读丢写、不落盘 |
| `npx vitest run`（`apps/web` 全量） | ✅ 151 文件 / 1792 用例全绿 | **早于最后三批新增用例**（见下） |
| `npx vitest run`（新增/改动目标文件） | ✅ 逐项全绿：`injection` 12、`lib/collab/rooms` 7、`collab-token-route` 17、`use-collab-note` 10、`use-save-note` 31、`save-status` 12、`env` 17、`navigation` 28、`app-shell`+`mobile-me` 33、`note-history-page` 18 | 最后三批（`use-collab-note` / `use-save-note` 协同块 / `save-status` 协同态）是**单独跑**的 |
| `npx tsc --noEmit`（`apps/web`） | ✅ 0 错误 | 含移动端接入后的复查 |
| `curl http://localhost:8080/note/v3/api-docs` | ✅ 出现 `/notes/{noteId}/collab-grant` | 网关聚合可见 |
| `docker compose build anynote-modules-note` + `up` | ✅ 容器 healthy | 新 jar 已部署，日志 `笔记模块启动` |
| `openapi/generate.sh`（经 msys2 bash） | ✅ `openapi/specs/note.json` 已更新 | 仅 note 一份发生变化 |

**未执行 / 未完成（阻断，见「审计要点」第 6 条）**：

- 最后三批用例合入后的**全量** `apps/web` 单测复跑（改前那次 1792 是全量，但不含这三批）
- Playwright E2E（`apps/web/e2e/*`）与**真实浏览器移动端 / PC 端**验证
- `pnpm --filter web bundle:budget`、`pnpm openapi:check`
- `git commit` / 合并 `dev`

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
| `src/features/notes/components/note-editor.tsx` | 修改 | 桌面编辑器接协同：`collabEnabled` 开关判定、`preset` 双模式切换、断线**降级横幅 + 回退单人模式**、头部挂在线成员与协同态保存徽标；`onChange` 在协同模式下不再重复排队 |
| `src/features/notes/components/mobile/note-editor-mobile.tsx` | 修改 | 移动端同一套接线（`toolbar="mobile"`），保证两端行为不分叉 |
| `src/features/notes/components/collab-presence.tsx` | 新增 | 在线成员头像条从 `features/collab/components/collab-status.tsx` 迁入笔记域——`/docs` 退役后协同状态属于笔记编辑器 |
| `src/components/note/save-status.tsx` | 修改 | 新增 `collabConnected`：连上时「已保存」改说「已同步」且不显示时间（本地 `lastSavedAt` 与本房间是否同步无关）；保存中/失败/冲突仍按本地态显示 |

### 3.3 新增/更新的用例

| 文件 | 状态 | 作用与原因 |
|------|------|-----------|
| `src/features/collab/__tests__/use-collab-note.test.tsx` | 新增 | 10 条：开关关闭不连、连 `note:<id>`、错误态降级、`savedVersion` 同步、`publishSavedVersion`、**origin 过滤三态**（远端不排、注入不排、本地才排） |
| `src/lib/collab/__tests__/injection.test.ts` | 新增 | 12 条：`shouldInject` 真值表穷举、`meta` 读写、非法 `savedVersion` 归一 |
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

## 四、文档同步

| 文件 | 状态 | 作用与原因 |
|------|------|-----------|
| `CLAUDE.md` | 修改 | 仓库定位里补 `apps/collab` 的房间契约（`note:<noteId>`、令牌绑房间与只读、不落盘、旧契约退役）；`docs/collab/` 指针由「待评审」改为「实施中」并指向本清单——悬空/过期引用是仓库明令禁止的 |
| `.claude/context/frontend.md` | 修改 | 「协同编辑（M8.1）」整节改写为「笔记的一种编辑模式（M13.2–M13.4）」：房间名、令牌 `room`/`ro`、注入守卫、人人保存、开关与降级；同时清掉侧栏分组 / 骨架 / 目录树 / 工具条表里的「协同文档」表述，避免文档继续描述已退役的 `/docs` |
| `docs/changelist/2026-09-21-notes-collab-merge.md` | 新增 | 本清单 |

## 五、审计要点

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
6. **本批尚未完成的验证（环境阻断，非代码问题）**：本机权限在实施中途变为受限模式，
   `node_modules/.pnpm` 下部分包与 `.git` 写入被拒（`EPERM` / `index.lock` Permission denied），
   docker CLI 也不可用。因此**未跑**：合入最后三批用例后的全量 `apps/web` 单测、Playwright E2E、
   真实浏览器移动端/PC 端验证、`bundle:budget`、`openapi:check`，以及 `git commit` 与合并 `dev`。
   恢复权限后须按方案 §9 全项补跑。
