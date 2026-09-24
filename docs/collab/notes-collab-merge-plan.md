# 笔记协同合并方案：把 `/docs` 多人协作并入知识库笔记

> 版本：v2.0（简化稿，待评审） · 日期：2026-09-21 · **取代 v1.0（2026-09-20 草案）**
> 方向与 v1.0 一致，实现路径按评审结论收窄：**不新增分布式状态机**。被砍掉的设计与理由记在 §13。
> 关联文档：`docs/refactor/FRONTEND_MILESTONES.md` M8.1（协同服务起源）、`.claude/context/frontend.md`（协同编辑现状）、`docs/deployment-network.md`（collab 反代拓扑）

---

## 0. 摘要

现状是两套互不相通的“文档”体系：

- **协同文档**（`/docs` 路由 + `apps/collab` 服务）：基于 Yjs/y-websocket 的实时协作文档，**不经过 Java 后端、不进 MySQL**，正文以 Y.Doc 二进制落本地文件；文档索引本身是一个全站共享的协同房间。
- **知识库笔记**（`services/note` + `features/notes`）：REST + MySQL（`n_note_text` Markdown 正文），有知识库成员/笔记位权限体系、版本乐观锁（A0409）、历史快照与行级 diff、ES 搜索、AI 续写、CLI 读写。

本方案把**协同从一种独立文档类型降级为“笔记的一种编辑模式”**：

1. 协同房间从 `doc:<uuid>` 改为 `note:<noteId>`，与数据库主键一一对应；`index` 房间与 `/docs` 独立文档库退役。
2. 真相源收敛回 MySQL：`n_note_text` 的 Markdown 是唯一存储。**note 房间不落盘**，Y.Doc 只是进程内会话态。
3. 协同准入收敛到知识库权限体系：BFF 签发协同令牌时按笔记查权限，令牌绑定房间与只读标志，collab 服务强制校验——顺带修复现状“任何登录用户可写任意房间”的越权缺陷。
4. 保存**不选 leader**：每个客户端各跑一份现有的 `useSaveNote`，协同模式下 A0409 走覆盖式换号重发。后端零保存语义改动，也不存在“leader 崩了没人兜底”的窗口。
5. 灰度用环境变量总开关，**不加数据库列**。
6. `/docs` 直接退役（前提见 §8）。

里程碑 **M13.0–M13.5**（承接 M12 UI 补稿）。

---

## 1. 背景与现状

### 1.1 两套体系对照

| 维度 | 知识库笔记 | 协同文档（待合并） |
|------|-----------|-------------------|
| 路由 | `/notes/[baseId]/[noteId]`、`/m/notes/...` | `/docs`、`/docs/[id]`、`/m/docs/...` |
| 存储 | MySQL `n_note` / `n_note_text`（Markdown 文本） | Y.Doc 二进制，`apps/collab` 本地文件（`COLLAB_PERSISTENCE_DIR`），全量覆盖写 |
| 列表/索引 | `GET /notes?knowledgeBaseId=`（REST） | `index` 协同房间里的 `Y.Array`，**零后端接口** |
| 归属 | 强属于知识库（`NoteCreateDTO.knowledgeBaseId @NotNull`） | 无归属，全站共享一份列表 |
| 权限 | 库成员 4 级（`n_user_knowledge_base.permissions`）+ 笔记 `permissions char(5)`，`@RequiresNotePermissions` 切面 | 仅“登录即可进任意房间”；协同令牌**不含房间声明**，identity 解出后被丢弃 |
| 并发 | 版本乐观锁（`update_time` 作版本令牌，冲突 `A0409`） | CRDT 自动合并，无冲突概念 |
| 历史 | `n_note_history` 全量快照 + `n_note_edit_log` 行级 diff + `n_note_operation_log`（RocketMQ 异步） | 无（仅 Y.UndoManager 会话内撤销） |
| 生态 | ES 搜索、AI 续写、CLI 读写、移动端完整 | 复制链接即全站可编辑 |

关键代码入口：

- 协同服务：`apps/collab/src/{server,rooms,auth,doc-manager,persistence,protocol}.ts`
- 前端协同域：`apps/web/src/lib/collab/*`（房间契约、会话、索引文档）、`apps/web/src/features/collab/*`（列表/编辑页、hooks）
- BFF 令牌：`apps/web/src/app/api/auth/collab-token/route.ts`（httpOnly 会话 → 5 分钟 HS256 JWT，密钥 `COLLAB_TOKEN_SECRET`）
- 笔记链路：`services/note/.../NoteController.java`、`NoteServiceImpl#getNotePermissions`；前端 `features/notes/use-save-note.ts`（1500ms 防抖自动保存 + A0409 冲突处理 + pagehide keepalive 补发）
- 编辑器预设：`apps/web/src/components/editor/presets/collaborative.ts`（TipTap `Collaboration` + `CollaborationCaret`，关 StarterKit 本地 undo）

### 1.2 协同文档现状的四个结构性缺陷（合并的动机）

1. **越权面**：协同令牌不绑定房间，`authorizeUpgrade` 校验令牌后接受任意合法房间名；任何登录用户可写任意文档（`apps/collab/src/rooms.ts:35-52`、`upgrade.ts:28-29`）。
2. **无归属**：文档不属于任何知识库，无法套用已有的成员/权限/审计体系；UI 只能声明“文档库是全站共享的”（`doc-library.tsx` 说明文案）。
3. **孤岛存储**：正文只存在于 collab 容器的本地文件，单实例、全量覆盖写（代码注释自评“开发/自托管级别”），与 MySQL 世界（搜索、历史、AI、CLI、移动端笔记体验）零互通。
4. **删除不清除**：索引删除只从 `Y.Array` 移除条目，服务端 `doc:<id>` 文件永久残留（无回收端点）。

### 1.3 术语澄清

仓库里有三个“docs”概念，本方案严格区分：

| 称呼 | 实际含义 | 本方案处置 |
|------|---------|-----------|
| 协同文档 | `/docs` 路由的 Yjs 文档（本文合并对象） | 退役，能力并入笔记 |
| 知识库“资料” | `/notes/[baseId]/docs` 的 RAG PDF（`n_doc` 表） | 不动 |
| 文档（泛称） | 下文统一用“笔记”或“协同会话”指代 | — |

### 1.4 开工前必须先修的既有缺陷（M13.1 前置）

`NoteServiceImpl#getNotePermissions` 的“知识库只读成员”分支（`services/note/.../NoteServiceImpl.java:497`）写的是：

```java
NotePermissions notePermissions = this.permissionCompute(Integer.valueOf(noteInfo.getPermissions().charAt(2)));
```

`Integer.valueOf(char)` 走的是 `int` 重载，拿到的是**字符码**（`'0'` → 48、`'6'` → 54），不是同级分支用的 `Integer.parseInt(substring(...))`。任何数字字符都落在 48~57，`permissionCompute` 的 0/4/6/7 分支全不匹配，必然抛 `BusinessException("笔记权限错误", AUTH_ERROR)`。

影响面：`@RequiresNotePermissions` 切面统一经此方法取权限（`RequiresNotePermissionsAspect:62`），所以**知识库只读成员打开该库任意笔记都会失败**，不只是协同路径。本方案的 `collab-grant` 复用同一方法，且 D8 把只读用户放在这条路上，不先修就实现不了。

处置：按仓库规约**先写复现该 bug 的失败用例**，再改成 `Integer.parseInt(noteInfo.getPermissions().substring(2, 3))`。`permissions char(5)` 的槽位含义见 `infra/sql/anynote.sql:54` 的列注释（作者 / 知识库管理员 / 同知识库用户 / 其它用户 / 匿名用户），只读成员与编辑成员同取第 3 槽后再降级封顶为 READ，与该分支既有的封顶逻辑一致。

---

## 2. 目标与非目标

### 2.1 目标

1. 任一笔记可开启实时协同：多位有编辑权的库成员同时编辑同一笔记，实时互见光标与内容，无版本冲突对话。
2. 协同不破坏笔记既有生态：ES 搜索、历史版本、AI 续写、CLI、移动端对协同笔记照常工作（因为真相源仍是 MySQL Markdown）。
3. 权限收敛：能进哪个笔记的协同房间、能否写入，由知识库成员 + 笔记 `permissions` 体系决定，令牌级别强制。
4. `/docs` 独立文档库退役。

### 2.2 非目标（本期不做）

- **服务端权威写回**（v1.0 的“二期”）。共享序列化包、InnerAuth 快照端点、Gateway 内部头透传验证等整条路线本期不立项，理由见 §13。
- 匿名/外链分享协作（外部访客进房间）——沿用库成员体系，笔记级分享链接另立方案。
- 协同评论、提及、通知。
- `apps/collab` 多实例水平扩展（记录单实例限制与预留，见 §11）。
- AI 服务直接消费 Y.Doc（AI 仍读 MySQL）。
- 只读用户进房间看实时流（见 D8）。

---

## 3. 总体架构

### 3.1 目标态

```
  客户端 A                                        客户端 B
  TipTap · Y.Doc                                  TipTap · Y.Doc
  自动保存（覆盖式冲突）                            自动保存（覆盖式冲突）
      │      ╲                                ╱      │
      │       ╲  ③⑤ WSS /collab/note:<id>   ╱       │
      │        ▼                            ▼        │
      │     ┌────────────────────────────────┐       │
      │     │ apps/collab                    │       │
      │     │ note:<noteId> 房间 · 不落盘     │       │
      │     │ 冷启动为空 → ④ 由客户端灌入     │       │
      │     └────────────────────────────────┘       │
      │                                              │
      │ ①②⑥         ┌──────────────┐         ①②⑥ │
      └─────────────▶│   Next BFF   │◀───────────────┘
                     │ /api/proxy/note/*          │
                     │ /api/auth/collab-token     │
                     └──────────────┬─────────────┘
                                    │
                     ┌──────────────▼──────────────┐
                     │ services/note（经 Gateway）  │
                     │ 正文 · 协同准入 · 版本锁 A0409 │
                     └───────┬──────────────┬──────┘
                             │              │ ⑦
              ┌──────────────▼──┐    ┌──────▼──────────────┐
              │ MySQL           │    │ RocketMQ            │
              │ n_note_text     │    │ ES 索引 · 历史快照   │
              │ （真相源）       │    └─────────────────────┘
              └─────────────────┘
```

### 3.2 端到端数据流

1. **开笔记**：客户端经 BFF 拿 `GET /notes/{id}`（Markdown 正文 + `updateTime`），与今天单人模式完全一致。
2. **换令牌**：`POST /api/auth/collab-token { noteId }`；BFF 以会话身份调 `GET /notes/{id}/collab-grant` 取权限，签一枚带 `room` / `ro` 的 5 分钟 JWT。权限为 NONE 直接不签。
3. **连房间**：`wss://…/collab/note:<noteId>?token=…`；collab 校验 `token.room` 必须等于握手房间名，`ro=true` 的连接丢弃写方向消息。
4. **冷启动注入**：房间为空时，满足“已 `synced` + 文档为空 + `meta.seeded` 未置位 + 我是在场 clientID 最小的那个”的那个客户端，把第 1 步的 Markdown 在**一个** `INJECT_ORIGIN` 事务内注入并置位 `seeded`。正文未就位前编辑器只读。详见 D4。
5. **协同编辑**：所有连接经 CRDT 合并；awareness 带光标与协作者（现状机制不变）。collab 全程不解析内容。
6. **保存**：**每个客户端各自保存**，只在本地编辑产生改动时排队（远端广播不触发）。防抖 3s，`PATCH /notes/{id}`；协同模式下 A0409 走覆盖式换号重发，不弹冲突框。详见 D5 与 §7.3。
7. **落库后**：照常发 MQ 生成 ES 索引与历史。内容相同的重复保存在后端算空 diff，`NoteMessageListener#generateNoteEditLog` 直接跳过，不产 operation log / edit log / history。
8. **房间关闭**：最后连接离开 → 房间销毁，无落盘。下次打开重新从 DB 注入。

### 3.3 写冲突矩阵

| 场景 | 语义 |
|------|------|
| 协同房间内多客户端 | CRDT 合并，无内容冲突；DB 写入靠版本锁串行化，落后者换号重发 |
| 房间活跃期间，legacy 前端 / CLI `PATCH` | 协同侧下一次保存会覆盖它；另一侧下次 PATCH 收 A0409，走既有冲突处理（回读比对 / CLI 报冲突）。协同会话是活跃期间的权威，可接受并记录 |
| 房间冷置期间，legacy / CLI 编辑 | 正常单人链路；下次打开笔记时房间为空，从 DB 重新注入，读到的就是最新内容 |
| AI 续写块、图片上传 | 均操作 TipTap 文档 / file 服务，与协同模式正交；AI 块写进 Y.Doc 后随本地保存落库 |

---

## 4. 关键决策

### D1 协同是笔记的编辑模式，真相源仍是 MySQL Markdown

Y.Doc 不进数据库、不成为长期存储。理由：笔记生态（ES、行级 diff、AI、CLI、移动端）全部以 Markdown 文本为契约；协同只是“多个编辑者共享一个会话态”。代价是保存时 Markdown 序列化有损（与现状单人编辑相同的损失面：`textAlign`、highlight 颜色本就不入 Markdown），不引入新损失。

### D2 房间契约 `note:<noteId>` + 令牌绑定房间与只读

- 房间名：`note:<noteId>`，noteId 为正整数（DB 主键）。两侧契约文件（`apps/collab/src/rooms.ts` 与 `apps/web/src/lib/collab/rooms.ts`）同步重写，保持“逐字一致”约定并补一条对拍测试。`index` / `doc:<uuid>` **直接删除**，不设过渡期（§8）。
- BFF `POST /api/auth/collab-token` 请求体从空改为 `{ noteId: number }`，签发前经 Gateway 调 `GET /notes/{id}/collab-grant`（§5.2）。
- JWT claims 增加 `room`（必须等于握手房间名）、`ro`（权限 < EDIT 为 true）。TTL 300s 与续期机制不变；**续期即重查权限**，权限撤销最迟在令牌过期时生效（≤5 分钟，见 §11 风险 3）。
- collab 握手：`token.room !== 房间名 → 403`；`ro=true` 的连接丢弃客户端→服务端方向的 sync 写消息，awareness 放行；identity（name/color）保留在连接对象上，修复现状“解出即丢”。

> 只读是权限语义与防误操作层的约束：恶意客户端理论上可绕过协议直接发伪造 update。深度防御（对 ro 连接仅转发 awareness）成本更高，本期不做。

### D3 note 房间不落盘

`note:*` 房间走 `memoryOnlyPersistence`，不写 `.ydoc` 文件。理由：

- 真相源是 MySQL，缓存只在“所有人同时掉线且最后一段编辑没落库”这个窄窗口里有价值，却要付出“缓存新旧裁决”的全部复杂度（v1.0 的 `.ver` 侧车，见 §13）。
- 冷启动恒为空 ⇒ 恒从 DB 注入 ⇒ **没有新旧可裁**，也不可能读到被 CLI/legacy 改过之后的陈旧缓存。
- 该窄窗口本身已被 §7.3 的三条卸载兜底覆盖：在场的**每个**客户端都带 `pagehide` / `beforeunload` / `visibilitychange` 落盘，不是只有一个 leader。
- collab 进程重启时，重连的客户端本地 Y.Doc 仍持有完整状态，sync 时会把内容推回服务端，房间自愈。

实现上只改 `createCollabServer`：按 `parseRoom` 的结果选持久化实现，`note` 房间用 `memoryOnlyPersistence`。`persistence.ts` 的文件实现与目录穿越防护保留原样（`index` / `doc:` 删除后它实际不再被使用，作为能力保留以便将来复用）。

### D4 冷启动注入：客户端守卫，不引入服务端选举

> **2026-09-21 修订（实施后实测纠正）**：本节原文的守卫条件第 4 条写的是“awareness 里只有我一个 clientID”，
> 该规则**有致命缺陷**，已改为确定性选举。原文与纠正记录都保留在下面，理由见本节末尾的「修订说明」。

房间为空时，由客户端把 REST 拿到的 Markdown 注入 Y.Doc。以下条件同时成立才注入：

```
provider.synced === true                     // 已与服务端完成同步，“空”是真的空
&& 文档为空（XmlFragment.length === 0）
&& meta.get("seeded") !== true               // 共享 meta（D6）里没人注入过
&& 我是在场 clientID 最小的那个               // 确定性选举，各端结论一致
&& 上述条件持续满足 SETTLE_MS（建议 600ms）
```

注入在一个 `doc.transact(fn, INJECT_ORIGIN)` 事务里完成——**正文与 `meta.seeded = true` 必须同在这一个事务里**，
只给 `seeded` 打 origin 的话，正文那一半会带着 ySyncPlugin 自己的 binding 作 origin，逃过 §7.3.1 的保存过滤。

为什么不需要服务端选举：各端看到的是同一组 awareness clientID，取最小值这件事不需要协商。
`seeded` 标记再挡一道“带本地状态重连的客户端”路径：它的状态里 `seeded` 已是 true，同步后到场的新客户端看到非空且已置位，自然跳过。

自愈性：若被选中者在注入前掉线，房间回到空态，剩下的人里 clientID 最小的那个会重新满足条件并注入——不存在“没人注入导致笔记显示为空”的死角（这正是服务端选举方案必须额外实现“重指派”的原因）。

残留风险：awareness 尚未收敛时两端可能各自选出自己，内容重复（可由笔记历史恢复）。
`SETTLE_MS` 的静默窗口足以让 awareness 收敛——服务端在新连接建立时就会把现有 awareness 推过去，
收敛时间是一个 RTT 量级。

`prosemirrorToYDoc` 与 `ySyncPluginKey` 由 `@tiptap/y-tiptap` 导出（TipTap 3 的 y-prosemirror 封装，已随 `@tiptap/extension-collaboration` 进依赖树，不新增体积）。

#### 修订说明：为什么“awareness 里只有我”是错的

原文的论证是“两个客户端不可能同时满足『awareness 里只有我』”。这句话本身成立，
但它恰恰导出了相反的结论：**两端互见时，双方都不满足条件，于是谁都不注入**。
房间永远停在空态，两端都显示空白正文——原文断言的“不存在没人注入导致笔记显示为空的死角”
只对“注入者先掉线”的串行情形成立，对并发首连不成立。

实测（真实容器栈 + 真 Chromium）：第二端在 **1 秒内**进来即触发；0ms / 500ms 交错必现，
1000ms 起正常。触发方式包括同一用户开两个标签页、手机与桌面同时打开、两人点同一条链接。
死锁不会自行超时，只在一端离开后另一端才注入。

后果不止是“显示为空”：用户看到空白编辑器会开始打字，那一拍保存把库里的正文**整段覆盖**
（实测原正文被替换成刚敲的一句话）。因此本次除了改选举规则，还加了一道兜底——
**正文就位前编辑器只读**（见 §7.4），即便选举再出意外也不可能写出空白正文。

§11 的风险 7 预判了这个场景，但预判的失效方向反了（写的是“内容重复”，实际是“两端全空”），
缓解措施“awareness 互见即互斥”正是缺陷本身。


### D5 保存：人人保存 + 覆盖式冲突策略，不选 leader

每个客户端各跑一份 `useSaveNote`，**只在本地编辑产生改动时排队**。协同模式下版本冲突不是“冲突”：本地 CRDT 状态按构造已包含房间里所有人的编辑，服务端那份只可能是它的旧投影，因此 A0409 一律换号重发。

与“服务端指定 leader 客户端保存”（v1.0 方案）相比：

| | v2.0 人人保存 | v1.0 leader 保存 |
|---|---|---|
| 协议 | 无新增消息类型 | 需新增 type 5 + 掉线重指派 |
| 服务端状态 | 无 | 房间级 writer 引用 |
| leader 崩溃 | 不存在该概念 | 尾巴只能靠缓存兜底 |
| 卸载兜底 | 每个客户端各一份 | 只有 leader 有 |
| 代价 | 换手时多一次 GET + 一次 PATCH | — |

完整实现见 §7.3。

### D6 共享 `meta` map

房间内一个 `Y.Map("meta")`，两个键：

| 键 | 写入方 | 用途 |
|----|--------|------|
| `seeded` | 注入者 | 冷启动注入守卫（D4） |
| `savedVersion` | 每次保存成功的客户端 | 让在场所有人同步版本令牌，把常态下的 A0409 降到 0（§7.3） |

它随 Y.Doc 走，不落盘、不进 DB，是纯会话态。`savedVersion` 的并发写按 Y.Map 的 last-write-wins 解决；万一读到旧值，落到既有的 A0409 换号重发路径，不会出错。

### D7 灰度用环境变量总开关，不加 `collab_enabled` 列

`NEXT_PUBLIC_COLLAB_NOTES=1` 开启笔记协同；关闭即完全回到现状单人链路。

不加数据库列的理由：真相源、正文格式、保存端点在两种模式下完全相同，per-note 粒度买不到额外的风险隔离，却要付出 SQL 迁移 + PO/mapper/VO + 开关端点 + OpenSpec + OpenAPI 重生 + 菜单项 + 双分支测试的全链路成本。回滚 = 改环境变量重部署。

若上线后确需灰度到部分用户，优先在 BFF 层按用户/知识库判定（不改 schema），再考虑加列。

### D8 只读用户一期不进协同房间

权限 < EDIT 的用户打开协同笔记 → 维持现状 REST 静态读（`preset="readonly"`）。理由：只读实时流需要 ro 房间语义 + 移动端连接的电量/流量权衡，价值密度低于写协同；协议已就绪（`token.ro` + 服务端丢写），将来要做只需接前端。

### D9 history 不加节流字段，先用保存侧限频

v1.0 打算加 `NoteEditDTO.snapshotHistory` 来抑制协同期间的全量快照。本期不做，理由：

- `generateNoteEditLog` 在行级 diff 为空时**整段跳过**（`NoteMessageListener.java:91-115`），不产 operation log / edit log / history。人人保存造成的重复内容写入天然不产快照。
- 协同保存的节奏与单人自动保存同量级（都是“停手后一拍”），并非逐击键落库。
- 保存侧已有两层限频：防抖 3s（协同模式从 1500ms 上调）+ “内容与基线相同则不发”（§7.3）。

M13.5 验收时实测 history 生成频率；确认偏高再回头加这个字段，改动面很小且与本方案正交。

### D10 移动端与桌面同链路

`/m/docs` 删除后，移动端笔记编辑（`note-editor-mobile.tsx`）接入同一协同运行时，`toolbar="mobile"`（协同预设已支持该组合）。注意 WS 生命周期（后台冻结、回前台重连）与 bundle 预算复测：**预算是按路由算的**，删 `/m/docs` 腾出的是那条路由的额度，yjs 进 `/m/notes/*` 是净增长，必须实测（`/m/*` ≤ 250KB）。

---

## 5. 后端改动（services/note）

### 5.1 先修权限推导缺陷（M13.1 前置）

见 §1.4。先写失败用例再改，独立成一个 commit。

### 5.2 新端点 `GET /notes/{noteId}/collab-grant`（M13.1）

- 普通 Bearer 认证（BFF 以用户身份调用，语义是“我对此笔记的协同准入”，不是内部调用，**不加 `@InnerAuth`**）。
- 复用 `NoteServiceImpl#getNotePermissions` 推导权限。
- 响应 `CollabGrantVO`：

```json
{
  "noteId": 123,
  "perm": "MANAGE | EDIT | READ | NONE",
  "version": "1758297600000",
  "title": "会议纪要"
}
```

- `version` = 当前 `update_time` 版本令牌（`NoteVersionUtil.toVersion`），供客户端首拍保存使用；轻量响应，不回正文。
- 笔记不存在 → `INVALID_USER_INPUT_NOT_FOUND`；无权限返回 `perm: "NONE"`（由 BFF 决定拒签，不在这里抛 401，便于前端区分“没权限”与“没登录”）。
- OpenAPI：Springdoc 注解齐全，`pnpm openapi:generate` 重生 baseline 并提交。

### 5.3 OpenSpec 提案（M13.0）

`.claude/openspec/changes/2026-09-21-notes-collab-merge.md`：登记 5.2 的新端点、房间契约变更、错误码沿用（`A0301` / `A0409` / `B0001` 无新增）。

### 5.4 本期**不做**的后端改动

- 无 SQL 迁移（不加 `collab_enabled` 列）。
- 无 `NoteEditDTO` 字段变更（不加 `snapshotHistory`）。
- 无内部快照端点、无 HMAC 集成、无 Gateway 内部头透传验证。

即：后端总改动 = 一个只读端点 + 一个 bug 修复。

---

## 6. collab 服务改动（apps/collab）

### 6.1 房间契约（M13.2）

`parseRoom` 只认 `note:<noteId>`（正整数，无前导零，长度上限防滥用）；`index` / `doc:<uuid>` 删除。`roomFileName` 相应简化。两侧契约文件同步改，补一条对拍测试锁住“同一房间名两侧解析一致”。

### 6.2 握手与权限执行（M13.2）

- `verifyCollabToken` 的返回值从 `CollabIdentity` 扩成 `{ identity, room, ro }`，缺 `room` claim 视为非法令牌。
- `authorizeUpgrade` 增加 `token.room === roomName(handshake.room)` 判定，不符返回 403。
- awareness 的 `user` 字段与 token 的 name/color 不一致时以 token 为准覆盖（一行，顺带做）。

### 6.3 写方向拦截（M13.2）

`ro` 连接必须**继续参与 sync 读**（否则收不到初始内容），只丢写。现状 `handleMessage` 把整条 sync 消息直接交给 `syncProtocol.readSyncMessage`（`protocol.ts:117-126`），无法区分子类型，因此要在委派前自己先读一个 varUint：

```
messageYjsSyncStep1 = 0   // 对端要状态 → 必须正常响应
messageYjsSyncStep2 = 1   // 对端推状态 → ro 丢弃
messageYjsUpdate    = 2   // 对端推更新 → ro 丢弃
```

（常量取自 `y-protocols/sync`。）丢弃时记计数供 `/healthz` 观察，**不打日志**——被拒的客户端可能在循环重试，日志会被打爆。

> 这一段是本次 collab 改动里最容易做错的地方：读子类型时必须用同一个 decoder 继续推进，丢弃分支不能把已经读掉的字节还给 `readSyncMessage`。用例必须覆盖“ro 连接仍能完成初始 sync”这一条，否则只读用户会连上但永远看不到内容。

### 6.4 note 房间不落盘（M13.2）

见 D3。`createCollabServer` 按房间类型选持久化实现。

### 6.5 不变项

心跳、`/healthz`、Origin 白名单、y-websocket 线协议兼容性、`CollabDocManager` 的房间生命周期（按需打开、无人时关闭）全部不变。**不新增消息类型，不新增房间级可变状态，不新增任何出站 HTTP。**

---

## 7. 前端改动（apps/web）

### 7.1 BFF `collab-token`（M13.2）

请求体 `{ noteId }` → 调 `collab-grant`（失败或 `perm: "NONE"` → 403 信封）→ claims 注入 `room` / `ro`。`loadSessionProfile` 会话语义与 Cookie 轮换回写不变。单测覆盖：grant 查询失败、NONE 拒签、claims 完整性、`ro` 取值随 perm 变化。

### 7.2 `use-collab-note`（M13.3）

新 hook，组合：grant → token → 房间连接（复用 `lib/collab/session.ts`，room 参数化）→ 注入守卫（D4）→ 保存排队（§7.3）。

`features/collab` 的 `use-collab-room` 连接/重连/`synced` 语义原样复用，只是 room 从 `doc:<uuid>` 变成 `note:<id>`；`CollabPresence` / `CollabStatusBadge` 从 `features/collab` 迁入共享组件域，挂到笔记编辑器头部。

### 7.3 保存逻辑（M13.3，本方案的核心）

#### 7.3.1 触发：只有本地编辑排队保存

协同模式下 `onUpdate` 对远端改动一样会触发（ySyncPlugin 把远端 update 应用成一次 ProseMirror transaction，`tiptap-editor.tsx:121` 的 `docChanged` 为真）。若照单全收，一个人打字会让在场每个人都排一次保存，写放大等于人头数。

判定放在 hook 里订阅 Y.Doc 的 origin，**不改编辑器核心**：

```ts
doc.on("update", (_update, origin) => {
  if (origin === provider) return;        // y-websocket 应用远端更新时 origin 是 provider
  if (origin === INJECT_ORIGIN) return;   // 冷启动注入，内容本就来自 DB
  scheduleSave({ title: getTitleForContent(editor), content: getMarkdown(editor) });
});
```

本地编辑经 ySyncPlugin 写回 Y.Doc 时 origin 是绑定对象，与 provider 天然可分；Y.UndoManager 的撤销同样不是 provider，会正常触发保存。

> **2026-09-21 修订（实施后实测纠正）**，两处：
>
> 1. **过滤名单要加上 meta 写入**。`meta.savedVersion` 原本用裸 `Y.Map.set` 写，没有 origin，
>    于是「保存成功 → 写 meta → 又排一次保存」，每个编辑批次固定多发一次 PATCH。现已加
>    `COLLAB_META_ORIGIN` 并一并过滤。
> 2. **正文不能在这个回调里现取**。ySyncPlugin 在 `view.updateState` 阶段就把改动写进 Y.Doc，
>    而 TipTap 的 `onUpdate` 在其后才发，因此此刻调用方手里的正文快照**恒落后一次击键**——
>    实测一段输入的最后一个字停在本地不落库。这个缺陷从前被上面第 1 条顺手补掉了
>    （多出来的那次保存正好带着最新正文），两个错凑成一个对；只修一个会让丢字暴露出来。
>    现在这个回调只置「下一拍 `onChange` 是本地编辑」的标记，正文取 `onChange` 带来的那一份。

> 备选方案是读 `ySyncPluginKey` 的 `isChangeOrigin` / `isUndoRedoOperation` meta（`@tiptap/y-tiptap@3.0.9` 的 dist 里两个标记都在），但那要改共享的 `onUpdate` 签名，没必要。

#### 7.3.2 对 `use-save-note` 的三处改动

现有的防抖、乐观更新、版本号推进、offline/visibilitychange/pagehide 三条兜底**全部原样复用**。只加一个 option 和两处分支：

```ts
conflictPolicy?: "prompt" | "overwrite"   // 默认 prompt = 现状；协同模式传 overwrite
```

**(1) 覆盖式冲突策略。** 在 A0409 分支（`use-save-note.ts:208`）前插入，跳过 `baseRef` 比对与冲突对话框：

```ts
if (conflictPolicy === "overwrite") {
  const server = await fetchNote(noteId).catch(() => null);
  const serverVersion = toVersion(server?.updateTime);
  if (serverVersion === null) { setStatus("error"); return "done"; }
  versionRef.current = serverVersion;
  baseRef.current = { title: server?.title ?? "", content: server?.content ?? "" };
  return "resync";                        // 原样重发
}
```

**(2) 内容没变就不发。** `runSave` 开头加守卫：

```ts
const base = baseRef.current;
if (base && base.title === draft.title && base.content === draft.content) {
  setStatus("saved");
  return "done";
}
```

这是防乒乓的关键：resync 之后 `baseRef` 已等于服务端内容，手里没有更新内容的客户端就此打住。对单人模式也是净优化（卸载补发、resync 重发都可能送重复内容）。

**(3) 重试轮数。** 现为最多两拍（`use-save-note.ts:254`）。协同模式下读版本号与写回之间可能又插进一个人，两拍不够会停在 `error` 态闪徽标。`overwrite` 模式放宽到 4 拍，重试本身幂等。

#### 7.3.3 版本令牌经 `meta.savedVersion` 共享

保存成功后把新版本号写进 `meta.savedVersion`（D6），在场各客户端监听并同步自己的 `versionRef`。这样“别人刚存过、我接着编辑”的常见路径直接拿着最新版本号去写，A0409 在常态下归零，只在真的同时落库时才回落到 resync。

#### 7.3.4 并发时序（两人同时编辑，防抖 3s，起始版本 V0）

| 时刻 | 客户端 A | 客户端 B | DB |
|---|---|---|---|
| t0 | 打字 → 排队 | 收到广播，不排队 | V0 |
| t3 | `PATCH{version:V0}` → 成功 | — | V1 |
| t3+ | 写 `meta.savedVersion = V1` | 收到 meta → `versionRef = V1` | V1 |
| t4 | — | 打字 → 排队 | V1 |
| t7 | — | `PATCH{version:V1}` → 成功 | V2 |

没有 `meta.savedVersion` 时，t7 那格会先撞一次 A0409，多一次 GET + 一次 PATCH，结果相同。

#### 7.3.5 不变的部分

- **标题**：仍是正文第一个 H1，`getTitleForContent(editor)`，两模式同一路径。
- **离开页面**：`pagehide` / `beforeunload` 的 keepalive 补发、`visibilitychange` 切后台落盘、`online` 重连补发——每个客户端各自跑一份，一行不改。这正是本方案 durability 优于“单 leader 保存”的原因。
- **乐观更新**：`queryClient.setQueryData` 照旧写详情缓存。协同模式下编辑器正文由 Y.Doc 灌入、不读这份缓存（`tiptap-editor.tsx:112` 的 `isCollaborative` 分支），因此不存在“缓存回灌把光标顶回文首”的老问题。

### 7.4 编辑器双模式与降级（M13.3）

- `NEXT_PUBLIC_COLLAB_NOTES` 开启且 `perm >= EDIT` → `preset="collaborative"`，保存走 §7.3；否则现状单人链路，一行不改。
- **正文就位前编辑器只读**（2026-09-21 补）：协同模式下正文的唯一真相是 Y.Doc，而它在「连接中」与
  「已连上但还没注入」这两段时间里是空的。放开编辑就是「对着空白编辑器打字 → 那一拍保存覆盖掉库里的正文」，
  这是 D4 缺陷里真正毁数据的一环。判据是 `useCollabNote` 的 `contentReady`（房间正文非空，或本来就没有
  待注入的正文），连接中一律为 false；降级后回到单人链路即恢复可写。同时给出「正在接入协同会话」提示条，
  否则用户只会觉得这页打不出字。
- **断线降级**：协同连接失败（collab 不可达、令牌签发失败）→ 提示条 + 自动回退单人模式（数据仍在，切 `full` 预设继续编辑；此间他人无法实时看到，保存走单人链路，A0409 与冲突对话框重新生效）。
- **状态徽标**：协同模式下非保存方不该长时间停在“已保存 12 分钟前”。文案改为以连接状态为准的“已同步”，保存中 / 保存失败仍按本地状态显示。

### 7.5 移动端（M13.4）

`note-editor-mobile.tsx` 接 `use-collab-note`；后台冻结重连依赖现有 reconnect；E2E 补一条移动端协同用例；跑 `pnpm --filter web bundle:budget` 实测（见 D10）。

### 7.6 `/docs` 退役与导航（M13.5）

- `navigation.ts` 移除“协同文档”入口；`/docs`、`/m/docs` 路由删除。
- `features/collab` 的列表/编辑页组件与 `lib/collab/index-doc.ts` 删除；`lib/collab/{session,identity,rooms}.ts` 保留并被 notes 复用；相关单测随迁随删。

---

## 8. 存量处置与 `/docs` 退役

**前提（待确认，见 Q1）**：`/docs` 从未随生产前端发布——`apps/web-legacy` 仍是用户实际访问的版本，`apps/web` 只部署在线上测试环境（note.zch.one）。因此协同文档库里只有开发 / 测试数据。

**在该前提下的处置**：直接删除路由与索引房间契约，`COLLAB_PERSISTENCE_DIR` 下的 `index.ydoc` / `doc-*.ydoc` 随容器卷归档保留一个发布周期后清理。**不做迁移向导，不设过渡期双契约。**

**若前提不成立**（确有需要保留的文档）：退回一次性脚本而非产品功能——用 Node 起一个 y-websocket 客户端读 `index` 房间，对每篇文档连 `doc:<id>` 取正文，序列化成 `.md` 文件交给人工，再由人用 CLI（`anynote note create`）导入目标知识库。整件事是一次性的，不值得为它实现一个带认领、选库、防重复导入的向导页面。

---

## 9. 测试与验收

按仓库测试强制约定逐栈落位（新逻辑必有单测）：

| 栈 | 覆盖点 |
|----|--------|
| Java（JUnit + Mockito，纯单测） | **先写 `getNotePermissions` 只读成员分支的复现用例**；`collab-grant` 权限推导各分支（作者 / 库管理 / 库编辑 / 库读 / 无关用户 / 笔记不存在） |
| collab（Vitest，node） | 新房间契约解析（含非法 noteId、已删除的旧契约必须被拒）；token 房间绑定 403；**ro 连接仍能完成初始 sync**、但 Step2/Update 被丢弃且不落盘；note 房间不写文件；现有一切回归 |
| 前端（Vitest + TL） | BFF route（grant 失败拒签、NONE 拒签、claims 断言）；注入守卫各条件的真值表（尤其“awareness 里不止我一个 → 不注入”、“`seeded` 已置位 → 不注入”）；origin 过滤（provider 来的 update 不排队保存）；`useSaveNote` 的 `overwrite` 分支（A0409 换号重发、不弹冲突）、无变化跳过守卫、4 拍耗尽后的状态；note-editor 双模式切换与断线降级 |
| E2E（Playwright） | 双浏览器共编同一笔记实时互见（改造现 `collab.spec.ts`）；编辑 → 落库 → 刷新读回；关闭协同开关后的单人模式回归；无 EDIT 权用户拿不到令牌；`/docs` 退役后路由 404 |
| 门禁 | `pnpm --filter web bundle:budget`（桌面 310KB / `/m/*` 250KB）；`pnpm openapi:check` baseline 一致 |

**总验收标准**：

1. 两个有 EDIT 权的用户在桌面 + 移动端混编同一笔记，实时合并，全程无冲突对话框。
2. 刷新 / 重进笔记，内容与 MySQL 一致（读的是 REST）。
3. 无 EDIT 权用户拿不到该笔记的协同令牌（BFF 403）；伪造房间的 token 被服务端 403；知识库只读成员能正常打开笔记（§1.4 的修复生效）。
4. 关掉最后一个客户端后重开笔记，内容完整（验证“不落盘 + 卸载兜底”这条组合路径）。
5. 协同会话期间的 history 条数与 ES 索引更新次数记录在案，作为 D9 是否回头加节流的依据。

> **2026-09-21 复核纠正**：第 1、3 条在当前后端下**不可能达成**，M13 的验收记录声称“§9 验收项已全部跑到”属于夸大。
> `createNote` 把 `n_note.permissions` 硬编码成 `"70000"`（作者 MANAGE、其余槽位全 0），全仓没有任何
> 修改笔记权限的端点（另一处只有 `submitNote` 的 `"44000"`，同库用户槽位仍是 0）。实测矩阵：
> 知识库**管理员 / 编辑成员 / 只读成员**对他人笔记一律 `GET /notes/{id}` → `A0301`、`collab-grant` → `NONE`。
> 因此：
> - 第 1 条「两位有 EDIT 权的库成员共编」拿不到，当前唯一可用的多端场景是**同一用户的多个标签页 / 设备**；
> - 第 3 条后半句「知识库只读成员能正常打开笔记」未达成——§1.4 的修复是真的（错误码从
>   `A0300 笔记权限错误` 变成正确的 `NONE` → `A0301`），但只读成员仍然打不开任何笔记。
>
> 这不是 M13 引入的缺陷（`getNotePermissions` 的其余分支未改），而是方案与验收都没注意到的**前置缺口**。
> 按 2026-09-21 的决定，本期**不修**，登记为未解缺口；补权限入口（新端点或改默认槽位）另立工单。
> 详见 [`docs/changelist/2026-09-21-notes-collab-coldstart-fixes.md`](../changelist/2026-09-21-notes-collab-coldstart-fixes.md)。

---

## 10. 里程碑

| 里程碑 | 内容 | 交付物 |
|--------|------|--------|
| M13.0 | OpenSpec 提案 + 设计评审冻结（含 Q1 拍板） | `.claude/openspec/changes/2026-09-21-notes-collab-merge.md` |
| M13.1 | 后端：修 `getNotePermissions` + `collab-grant` 端点 | 复现用例 + Java 单测 + OpenAPI baseline |
| M13.2 | collab：房间契约 + 令牌绑房间/只读 + 写方向拦截 + 不落盘；BFF token 改造 | collab 单测 + BFF 单测 |
| M13.3 | 桌面：`use-collab-note` + 注入守卫 + 保存策略 + 双模式 + 降级 | 前端单测 + 桌面 E2E |
| M13.4 | 移动端接入 + 预算实测 | 移动端单测 + E2E + bundle 报告 |
| M13.5 | `/docs` 退役 + 总验收（§9 全项）+ 文档同步（CLAUDE.md 导航、frontend.md 协同节改写） | 改动清单（`docs/changelist/`）+ 验收记录 |

---

## 11. 风险与已知限制

| # | 风险 | 缓解 |
|---|------|------|
| 1 | collab 单实例：重启丢当前房间内存态 | 重连客户端会把本地 Y.Doc 推回，房间自愈；全员同时掉线才有窗口。多实例需按 noteId 分片或 sticky，房间名已含主键，预留可行 |
| 2 | 全员同时掉线且最后一段编辑未落库 | 每个客户端各带 `pagehide` / `visibilitychange` / keepalive 兜底；窗口与现状单人模式同量级 |
| 3 | 权限撤销最迟 5 分钟生效（token TTL） | 续期重查；高敏感场景先移除库成员再等过期，文档化 |
| 4 | 换手时多一次 GET + 一次 PATCH | `meta.savedVersion` 把常态下的 A0409 降到 0；剩余放大只在真并发时发生 |
| 5 | ES 重索引随每次成功保存无条件触发 | 内容未变的保存被 §7.3 守卫挡在前面；实测后若仍偏高，在 listener 侧加内容指纹判重 |
| 6 | 移动端预算超限（yjs 进笔记编辑器） | 门禁实测把关；超限则把协同运行时做成 `/m/*` 的动态分包 |
| 7 | 注入守卫的 settle 窗口内两人同时首连 | ~~awareness 互见即互斥~~ —— **该缓解措施本身就是缺陷**，互斥导致双方都不注入（2026-09-21 实测，见 D4 修订说明）。现为确定性选举（clientID 最小者注入）+ `meta.seeded` 二道锁 + 正文就位前编辑器只读；残留的内容重复可由笔记历史恢复 |
| 8 | 协同期间 legacy/CLI 的 A0409 频发 | 既有冲突处理链路；CLI 侧报冲突提示已是现状语义 |
| 9 | 协同保存的 `operation_log.operator` 记落库那一刻的人 | 见 Q3 |

---

## 12. 开放问题（待拍板）

| # | 问题 | 建议 |
|---|------|------|
| Q1 | `/docs` 是否有需要保留的真实数据 | 按 §8 前提（只有测试数据）直接删；**M13.0 必须确认**，不确认不动手 |
| Q2 | 协同模式的防抖时长 | 3 秒（单人仍 1.5 秒） |
| Q3 | `operation_log.operator` 记“落库那一刻的人”是否可接受 | 建议接受（`edit_log` 本就不区分操作者）；不可接受则需要服务端权威写回，那是另一个方案 |
| Q4 | `NEXT_PUBLIC_COLLAB_NOTES` 何时默认开 | M13.5 验收后一周稳定期，随小版本改默认值 |
| Q5 | 只读用户进房间看实时流的优先级 | 待定，协议已就绪，接前端即可 |

---

## 13. 与 v1.0 的差异（简化取舍记录）

v1.0（2026-09-20）的方向与本稿一致，差异全部在实现路径。以下是被砍掉的设计与理由，留档以便将来需要时回溯。

| v1.0 设计 | v2.0 处置 | 理由 |
|---|---|---|
| 一期 leader 客户端保存 + **二期服务端权威写回**（共享序列化包 `packages/editor-markdown`、InnerAuth 快照端点、HMAC、Gateway 内部头透传验证） | 删除整条二期路线；一期改为人人保存 | 人人保存已消除二期要解决的主要问题（leader 崩溃丢尾巴）。共享序列化包要保证“同一 TipTap JSON 两侧逐字节一致”，是长期维护负担 |
| 协议新增 `MESSAGE_INITIALIZER = 5`（服务端指定注入者 / writer），掉线重指派 | 删除 | 客户端守卫（D4）自愈且无需服务端状态；服务端选举反而必须额外实现重指派，否则注入者在注入前掉线会让笔记显示为空 |
| `.ver` 侧车文件 + 冷启动三分支版本仲裁 | 删除（改为 note 房间不落盘） | 三分支里 `token.ver < cache.ver` 在该数据流下进不去（缓存 ver 源自 token.ver，恒 ≤ 新连接的 token.ver）；而真正保住未落库尾巴的是“相等”那支。且保存成功后 DB 版本前进、缓存 ver 停在旧令牌上，下次冷启动必判弃缓存——整套机制大部分时候不起作用 |
| `n_note.collab_enabled` 列 + 开关端点 + 菜单项 | 改为环境变量总开关（D7） | per-note 粒度买不到额外风险隔离，却要付全链路成本 |
| `NoteEditDTO.snapshotHistory` 历史节流字段 | 本期不做（D9） | 空 diff 已被 listener 整段跳过；先用保存侧限频，实测后再决定 |
| `/docs` 迁移向导（认领、选库、`migratedTo` 防重复导入）+ 两周迁移窗口 + 过渡期新旧房间契约并存 | 删除；直接退役（§8） | 前提是 `/docs` 只有测试数据（Q1）。即便需要迁移，一次性脚本足够，不值得做成产品功能 |
| 只读用户“一期不进房间”表述为二期再评 | 保留结论，协议一次做到位（D8） | `token.ro` + 服务端丢写在 M13.2 一并实现，将来只需接前端 |

另外，v1.0 未覆盖而本稿补上的：

- `getNotePermissions` 的只读成员分支缺陷（§1.4）——它会让 D8 的只读路径直接不可用。
- “带本地状态重连的客户端”导致的内容翻倍路径——v1.0 的 type 5 只防“两个 initializer”，不防这条；本稿用 `meta.seeded` 关闭（D4）。
- `ro` 丢写必须自己解 sync 子类型（§6.3）——照现状直接委派 `readSyncMessage` 无法区分读写。
- 移动端 bundle 预算是**按路由**算的，删 `/m/docs` 不能抵消 `/m/notes/*` 的增长（D10）。

---

## 附录 A：房间命名契约（目标态）

```
note:<noteId>   noteId = 正整数（n_note 主键）
已删除：index、doc:<uuid>
持久化：note 房间不落盘（memoryOnlyPersistence）
```

## 附录 B：协同令牌 claims（目标态）

```json
{
  "iss": "anynote-web", "aud": "anynote-collab", "sub": "<userId>",
  "name": "<展示名>", "color": "<#RRGGBB>",
  "room": "note:123", "ro": false,
  "exp": "<now+300s>"
}
```

`room` 缺失视为非法令牌（拒绝而非放行，避免旧版本前端在灰度期绕过房间绑定）。

## 附录 C：共享 `meta` map

```
Y.Map("meta")
  seeded: boolean        // 冷启动注入守卫，注入者在注入事务内置位
  savedVersion: string   // 最近一次成功落库的版本令牌，在场客户端据此同步 versionRef
```

均为会话态：不落盘、不进 DB、房间销毁即消失。

## 附录 D：协议消息类型（目标态）

| type | 方向 | 语义 |
|------|------|------|
| 0 sync、1 awareness | 双向 | y-websocket 兼容，**不变** |

本方案不新增任何消息类型。
