# 改动清单：协同服务落库（路线 B，M14.P / M14.0–M14.5 / M14.7）

> 日期：2026-09-25 · 分支：`feat/collab-server-persist`（从 `dev` 的 `dd13fea` 切出，**尚未提交**）
> 方案：[`docs/collab-persistence/COLLAB_PERSISTENCE_PLAN.md`](../collab-persistence/COLLAB_PERSISTENCE_PLAN.md) v1.3（附录 H 是实施记录与偏差）
> 契约提案：[`.claude/openspec/changes/2026-09-25-collab-server-persistence.md`](../../.claude/openspec/changes/2026-09-25-collab-server-persistence.md)
> 前一批：[`2026-09-21-notes-collab-coldstart-fixes.md`](./2026-09-21-notes-collab-coldstart-fixes.md)

## 概览

协同笔记的保存从「每个浏览器各自 PATCH」改为「协同服务开房时从 note 内部端点加载、防抖后带基准版本号原子写回 MySQL」，
Y 状态存进新表 `n_note_collab_state`。浏览器不再发保存请求，改为：握手声明编辑器版本与本地谱系、
收到 hello 后启用 IndexedDB 本地副本、按 ACK 维护「已同步 / 同步中 / 离线」、闲置 5 分钟断开。
开关 `COLLAB_SERVER_PERSIST` 默认关，关着时 v2.0 客户端保存链路原样工作（能力协商，先发前端再开开关）。

同批完成：并行修复线 M14.P（单人模式 8 处缺陷，附录 E）、编辑器内核抽成 `packages/editor-core` 供 web 与协同服务共用、
内部调用 HMAC 密钥改为可配置、公开 PATCH 改为原子比较、M14.7 外部写入即时并入（Redis 通知）。
**M14.6（删除 v2.0 客户端保存分支）未执行**：按 D9 须在生产打开开关并观察一周后再做。

### 改动面（实测，临时索引 `git add -A` 后 `git diff --cached HEAD -M`，未动工作区索引）

全部改动未提交。相对 `HEAD`（`dd13fea`）：**163 个文件，+11623 / −1231**（不含本清单）。
状态分布：新增 64、修改 85、重命名 13、删除 1（`leading-heading.ts` 移到 editor-core 后改写幅度超过重命名阈值，git 记为删除 + 新增）。

| 目录 | 文件数 | 行数 | 说明 |
|------|--------|------|------|
| `apps/web` | 54 | +4431 / −1004 | 会话层、编辑页接线、保存链路、徽标、E2E |
| `apps/collab` | 28 | +3026 / −77 | 落库核心：房间管理、转换、note 客户端、握手与协议扩展、打包 |
| `packages/editor-core` | 15 新增 + 13 自 web 重命名 | +711 / −0；重命名 +62 / −13 | 编辑器内核，web 与协同服务共用 |
| `services/note` | 23 | +1446 / −19 | 两个内部端点、状态表、外部写入通知、PATCH 原子化 |
| `services/common` | 11 | +332 / −7 | 内部调用密钥可配置 |
| `infra` | 10 | +111 / −23 | compose、Dockerfile、SQL 迁移 |
| 文档（`docs` 3、`.claude` 2、`CLAUDE.md`、`README.md`） | 7 | +1331 / −14 | 方案、契约、上下文与部署说明 |
| 生成物与锁文件（`openapi/specs/note.json`、`pnpm-lock.yaml`） | 2 | +173 / −74 | 见「生成物」 |

### 验证结果（只记实际执行过的命令与真实输出）

| 命令 / 动作 | 结果 | 备注 |
|------|------|------|
| `mvn -B test -pl note -am`（`maven:3.9-eclipse-temurin-21` 容器，本机无 JDK） | ✅ note **94 用例全绿** | 17:10 跑；其后没有再改任何 Java / XML 源码（`find -newer` 核对） |
| 同上，common 模块 | ✅ `common-core` 56、`security-core` 39、`security-servlet` 6，全绿 | 12:45 跑；其后 common 无改动 |
| `npx vitest run`（`apps/web` 全量） | ✅ **160 文件 / 1953 用例全绿** | 前一批 1850 |
| `npx vitest run`（`apps/collab`） | ✅ **13 文件 / 182 用例全绿** | 前一批 98 |
| `npx vitest run`（`packages/editor-core` / `packages/api-core`） | ✅ 39 / 23 | |
| `npx tsc --noEmit`（web / collab / editor-core / api-core） | ✅ 0 错误 | web 的 tsconfig 覆盖 `e2e/` |
| `npx @biomejs/biome check apps/web/src apps/web/e2e apps/collab/src packages/editor-core packages/api-core` | ✅ 0 error | |
| `pnpm openapi:generate` + `git diff` | ✅ 6 份全部拉取成功，只有 `note.json` 变化 | 生成物 |
| 真实栈调用内部端点 | ✅ 带签名 → 笔记不存在时 `A0404`；不带签名 → 「没有内部访问权限」；密钥不对 → 「内部调用签名验证失败」；经网关不带 Bearer → `A0350` | |
| `docker compose ... build anynote-collab anynote-web` | ✅ 两个镜像均以 `--frozen-lockfile` 构建通过 | 协同服务镜像 310MB |
| `apps/collab/scripts/spike/perf.ts`（M14.0，Apple M2） | ✅ 20KB：构建 450ms / 序列化 13–17ms / +58MB；200KB：构建 1.8s / 序列化 0.3–0.4s / 差异 1.2–1.4s / +约 490MB | 详见方案附录 H.2 |

### E2E（`E2E_BASE_URL=http://localhost:3000`，打真实容器栈；web 镜像以 `NEXT_PUBLIC_COLLAB_NOTES=1` 构建）

用例总数 144 → **161**（桌面 116 + 移动端 45）：新增 `collab-persist` 12 条、`mobile-collab-persist` 3 条、`notes-single-user` 2 条。
下表如实记录服务端落库开关打开（`COLLAB_SERVER_PERSIST=true`）后的各轮：

| 轮次 | 结果 | 说明 |
|------|------|------|
| 第 1 轮（全量） | ❌ 142 passed / 11 failed / 8 did not run | 与本批有关 5 条：4426 在 hello 之前到达时徽标仍是「已保存」（1）；落库模式下目录与列表标题不随 H1 更新（桌面、移动各 1）；两条既有用例写死 `[data-status="saved"]`（2）。其余：`cli-authorize` 1 条缺 CLI 产物（先 `pnpm --filter @anynote/cli build`）、`notes-image-upload` 3 条（见下）、`ui-supplement` D-02 1 条（此后两轮全量均通过）、`mobile-collab-persist` 断网用例 1 条（见下一行） |
| 修复后定向重跑 | ✅ 桌面 41/41、移动 4/4 | 断网用例的偶发原因：断网不一定让已建立的 WebSocket 立即报错，y-websocket 靠 30 秒收不到消息判定断线（每 3 秒检查），而断言只等 30 秒；改为 45 秒并注明原因，实测 38.6 秒转为离线 |
| 第 2 轮（全量） | ⚠️ 154 passed / 4 failed / 3 did not run | 3 条是 `notes-image-upload`（见下）；新发现 1 处：「删除协同状态行后重连」在谱系重建期间输入丢失（修复见方案附录 H.4）；3 条 did not run 是同一串行组里排在它后面的用例 |
| `collab-persist` × 2（`--repeat-each=2`） | ⚠️ 23/24 → 修复后 ✅ **24/24** | 第二遍的 60KB 长文用例又暴露一处：收到 4409 到新会话建好之间编辑器仍可输入；修复后两遍全绿（60KB 打开到可编辑 1.2–1.6s、编辑到落库约 2.7s） |
| 第 3 轮（全量） | ⚠️ **156 passed / 5 failed** | 3 条是 `notes-image-upload`（见下）；2 条是 `cli-authorize` 撞 60 秒用例超时（页面已显示「已收到授权」），**单独重跑 5/5 通过**（每条 2–3 秒），本批未改 CLI 与 BFF 认证，判定为全量跑里的偶发 |

**`notes-image-upload` 3 条在三轮全量里都失败，与本批无关**：note 服务调 file 服务建上传任务时，file 服务报
`AccessKey and SecretKey must not be empty`，即它拿到的 MinIO 配置没有凭据（README「端到端与性能门禁」写明该用例要求 `MIN_IO_CONFIG` 带真实凭据）。
请求已通过 `@InnerAuth` 校验、失败点在 MinIO 客户端；本批没有改动 file 服务与 MinIO 配置，也未读取或改写本机的凭据配置。

**开关关闭（`COLLAB_SERVER_PERSIST=false`，即回滚状态）的一轮全量**：⚠️ **142 passed / 15 skipped / 4 failed**。
15 条跳过是只在落库模式下有意义的 `collab-persist` 与 `mobile-collab-persist`；失败的 3 条是上面的 `notes-image-upload`，
另 1 条是 `ui-supplement` D-02（单独重跑该 spec **23/23 通过**，前一批清单也记过它的偶发）。
v2.0 的冷启动注入、双端同步、单人保存等既有协同用例在新前端下全部通过，确认「关开关即回滚」成立。

### 产物预算

`pnpm --filter web bundle:budget`（先本地 `NEXT_PUBLIC_COLLAB_NOTES=1 next build`）三项全 PASS，与前一批**同值**——
编辑器扩展移进 `@anynote/editor-core`、会话层新增的 IndexedDB / 确认计数都在动态加载的 chunk 里，没有进首屏：

```
PASS  单条路由首屏 JS（gzip）（/notes/new）：301.5 KB / 预算 310.0 KB
PASS  移动端路由首屏 JS（gzip）（/m/notes/[baseId]/tasks/[taskId]）：245.4 KB / 预算 250.0 KB
PASS  编辑器 chunk 合计（gzip）：14.1 KB / 预算 250.0 KB
```

### 生成物

| 文件 | 产出方式 | CI 是否卡 diff |
|------|---------|---------------|
| `openapi/specs/note.json` | `pnpm openapi:generate`（从运行中的网关拉取），单行 JSON 所以 diff 是 +1 / −1 | 是（`openapi-check.yml`）；评审看 `NoteCollabController` / `CollabSnapshotSaveDTO` / `CollabSnapshotVO` / `NoteEditDTO` 的注解 |
| `pnpm-lock.yaml` | `pnpm install`（web 去掉 15 个转到 editor-core 的直接依赖——13 个 TipTap 扩展与 `prosemirror-markdown`、`tiptap-markdown`，collab 新增 TipTap / jsdom / ioredis / tsup，web 新增 `lib0` 与 `fake-indexeddb`） | 否；`infra/Dockerfile.web` 与 `Dockerfile.collab` 的 `--frozen-lockfile` 会卡，两个镜像均已重建通过 |
| `packages/editor-core/schema-lock.json` | 不是命令产物：改 schema 时手动登记「版本号 → schema 摘要」，`schema-version.test.ts` 比对 | 是（单测卡死） |

---

## 一、`apps/collab`——服务端落库

开关关闭时行为与 v2.0 完全一致（`server.test.ts` 的既有用例覆盖）；打开后 note 房间改由 `NoteRoomManager` 管理。

| 文件 | 状态 | 作用与原因 |
|------|------|-----------|
| `src/note-rooms.ts` | 新增 | 落库模式的房间管理：开房三分支（从未写回 → 由 Markdown 构建；状态与版本一致 → 直接恢复；状态过期 → 恢复后按差异更新到库里的内容）、2s / 最长 10s 防抖、写库在途时的再写、A0409 后回读合并（同谱系按 Y 状态合并，外部写入走 Markdown 三方合并）、2s→60s 不放弃的退避、SIGTERM 应急落盘与开房恢复、笔记删除断开（4404）、`/healthz` 指标；写库成功广播 `STORED` |
| `src/converter.ts` | 新增 | 无界面编辑器做 Markdown ↔ Y.Doc 转换（用 `@anynote/editor-core` 的扩展，与浏览器同一套规则）；按「笔记 id + 版本 + 编辑器版本」确定性派生谱系与 clientID，同一版本重复构建逐字节相同（附录 H.3 第 1 条） |
| `src/dom.ts` | 新增 | 在 Node 里挂 jsdom 的最小全局对象，TipTap 的无界面实例需要它 |
| `src/note-store.ts` | 新增 | note 内部端点客户端：HMAC 签名头（与 Java `HmacUtils` 同一测试向量）、超时、Base64 编解码；A0409 返回冲突而不是抛错，A0404 抛 `NoteNotFoundError`，其余失败抛 `NoteStoreError` 进入退避 |
| `src/external-updates.ts` | 新增 | 订阅 Redis `collab:note-updated:*`，把外部写入即时交给在线房间合并（M14.7）；没配 Redis 时只靠写库时的原子比较发现外部写入 |
| `src/server.ts` | 修改 | 落库模式的握手：校验编辑器版本（不符 4426）与谱系（不符先发 `EPOCH_MISMATCH` 再 4409）、开房期间缓冲消息、发 hello、可写连接的写消息回 ACK、最后一人离开立即写库；`/healthz` 增加 `serverPersist` / `pendingStores` / `failingRooms` / `lastStoreError` |
| `src/protocol.ts` | 修改 | 自定义消息类型 100 的常量与编解码（HELLO / ACK / EPOCH_MISMATCH / STORED）、关闭码、连接级 `acknowledge` 回调；`CollabDoc` 暴露只读连接被拒写入的计数 |
| `src/rooms.ts` | 修改 | 握手查询串多解析 `editorVersion` 与 `lineage`（`fresh` / `epoch:<uuid>` / `unknown`），非法值一律按最保守处理 |
| `src/upgrade.ts` | 修改 | 把编辑器版本与谱系带进会话，供 `server.ts` 判定 |
| `src/persistence.ts` | 修改 | 新增应急落盘 `createFileSpool`（复用房间名的目录穿越防护、原子写、谱系不符时留档不恢复）与关闭态 `disabledSpool` |
| `src/config.ts` | 修改 | 新配置 `COLLAB_SERVER_PERSIST` / `NOTE_SERVICE_URL` / `ANYNOTE_INTERNAL_SECRET` / `COLLAB_STORE_DEBOUNCE_MS` / `COLLAB_STORE_MAX_DEBOUNCE_MS` / `COLLAB_REDIS_URL`；开关打开却缺地址或密钥时启动即失败，不带病运行 |
| `src/main.ts` | 修改 | 按配置接上外部写入订阅；SIGTERM 只处理一次，退出前写回全部房间、仍失败的写应急落盘 |
| `tsup.config.ts` | 新增 | 协同服务要打进 TS 源码包 `@anynote/editor-core`，改由 tsup 打单文件；jsdom / ws 保持外部依赖 |
| `tsconfig.json` | 修改 | 模块解析改为 `bundler`，与 tsup 一致（`NodeNext` 解析不了源码包的 `.ts` 导出） |
| `package.json` | 修改 | 构建改为 tsup；新增 editor-core、TipTap、y-tiptap、jsdom、ioredis 依赖 |
| `.gitignore` | 修改 | 忽略性能脚本的输出目录 |
| `scripts/spike/perf.ts` | 新增 | M14.0 性能验证脚本（20KB / 200KB 正文的构建、序列化、差异耗时与内存），结果记在方案附录 H.2；属测试豁免范围 |
| `src/__tests__/note-rooms.test.ts` | 新增 | 26 条：开房三分支、确定性构建、防抖与最长等待、在途再写、不写无变化内容、三方合并与广播、连续冲突改走退避、外部写入通知、失败退避、**超时但已生效的写回不重复并入**、应急落盘恢复与留档、删除断开、落库通知只在真正写库成功时发 |
| `src/__tests__/server-persist.test.ts` | 新增 | 端口 0 起真实实例、真实 `ws` 客户端 + 假 note 服务：hello 与谱系、旧客户端与版本不符 4426、谱系不符 4409、笔记不存在 4404、开房期间消息缓冲、ACK 与带签名写回、只读连接不回 ACK、只打开不写库、写库失败时 `/healthz` 报出失败房间、外部写入通知的合并与忽略 |
| `src/__tests__/note-store.test.ts` | 新增 | 签名测试向量、快照解码、A0404 / A0409 / 网络错误的分流 |
| `src/__tests__/converter.test.ts` | 新增 | 取标题与截断、补 H1、确定性构建、差异更新保留未改段落的条目身份、谱系形态 |
| `src/__tests__/external-updates.test.ts` | 新增 | 频道名解析与非法 id |
| `src/__tests__/config.test.ts` | 修改 | 新配置项的默认值、取值范围与「开关打开缺必填项即失败」 |
| `src/__tests__/persistence.test.ts` | 修改 | 应急落盘的读写、删除、留档、目录穿越防护、未配置目录 |
| `src/__tests__/protocol.test.ts` | 修改 | 类型 100 编解码与非法负载 |
| `src/__tests__/rooms.test.ts` | 修改 | `lineage` / `editorVersion` 解析边界 |
| `src/__tests__/upgrade.test.ts` | 修改 | 会话里带出编辑器版本与谱系 |
| `src/__tests__/server.test.ts` | 修改 | 测试配置补上新配置项（开关关闭），既有 v2.0 用例原样通过 |

## 二、`services/note`（Java）——内部端点、状态表与 PATCH 原子化

| 文件 | 状态 | 作用与原因 |
|------|------|-----------|
| `.../controller/NoteCollabController.java` | 新增 | `GET` / `PUT /notes/{noteId}/collab-snapshot`，挂 `@InnerAuth`：两个端点绕过笔记权限，只供协同服务在容器网络里调用 |
| `.../service/NoteCollabService.java` | 新增 | 接口 |
| `.../service/impl/NoteCollabServiceImpl.java` | 新增 | 读快照（正文、版本、Y 状态与谱系）；写回在一条带 `update_time` 条件的 UPDATE 里比较并写入，0 行即 A0409；同一事务写正文与状态表，提交后照常发 ES 索引与编辑日志；操作者依次回落到房间最后编辑者、笔记最后更新者、创建者 |
| `.../service/NoteChangePublisher.java` | 新增 | 事务提交后向 `collab:note-updated:<id>` 发布外部写入通知；发布失败只记日志，不影响写入 |
| `.../model/po/NoteCollabState.java` / `.../mapper/NoteCollabStateMapper.java` / `resources/mapper/NoteCollabStateMapper.xml` | 新增 | 状态表的 PO、Mapper 与 upsert |
| `.../model/dto/CollabSnapshotSaveDTO.java` / `.../model/vo/CollabSnapshotVO.java` | 新增 | 写回请求体（含 `@Size(80)` 标题、Base64 状态、36 位谱系、数字基准版本）与快照返回体 |
| `.../mapper/NoteMapper.java` / `resources/mapper/NoteMapper.xml` | 修改 | 新增 `updateNoteIfVersion`；公开更新 `updateNote` 增加可选的 `update_time = baseUpdateTime` 条件 |
| `.../service/impl/NoteServiceImpl.java` | 修改 | `editNote` 先读旧记录，按 `NoteVersionUtil.nextUpdateTime` 取新版本、带基准版本原子更新（读写之间被写过返回 A0409）、记录 `update_by`（此前每次 PATCH 都被写空）、提交后发布外部写入通知；删除笔记同时删状态行并发布通知 |
| `.../utils/NoteVersionUtil.java` | 修改 | `nextUpdateTime = max(当前秒, 旧版本 + 1 秒)`，所有写入方共用，版本号严格递增（附录 H.3 第 3 条：修掉历史恢复被协同写回覆盖） |
| `.../model/bo/NoteUpdateParam.java` | 修改 | 增加 `baseUpdateTime` |
| `.../model/dto/NoteEditDTO.java` / `.../controller/NoteController.java` | 修改 | 标题 `@Size(max = 80)` + 控制器 `@Validated`：`n_note.title` 是 `varchar(80)`，超长标题原本让整次保存回滚并无限重试（附录 E） |
| `.../service/impl/NoteCollabServiceImplTest.java` | 新增 | 比较成功 / 失败、标题为空不改标题、同秒连续写回版本递增、操作者回落、状态表写入、两条消息的 userId、笔记不存在、非法 Base64、读快照三种情况 |
| `.../service/NoteChangePublisherTest.java` | 新增 | 事务中提交后才发送、无事务时立即发送、通知发布失败不抛、没有 Redis 时不发布 |
| `.../service/impl/NoteServiceImplDeleteNoteTest.java` | 新增 | 删除时删状态行并发布通知 |
| `.../model/dto/CollabSnapshotSaveDTOTest.java` / `NoteEditDTOTest.java` | 新增 | 校验注解的边界 |
| `.../service/impl/NoteServiceImplEditNoteTest.java` | 修改 | 记录更新者、带基准版本更新、0 行返回 A0409、发布外部写入通知 |
| `.../utils/NoteVersionUtilTest.java` | 修改 | `nextUpdateTime`：截断到秒、同秒再写晚 1 秒、旧版本领先于当前时间、没有旧版本 |

## 三、`services/common`——内部调用密钥可配置

`@InnerAuth` 的 HMAC 密钥原本是随仓库公开的常量，协同服务（Node）要按同一规则签名，因此改为配置项。

| 文件 | 状态 | 作用与原因 |
|------|------|-----------|
| `anynote-common-security-core/.../properties/InternalSecretProperties.java` | 新增 | 读 `anynote.internal.secret`（环境变量 `ANYNOTE_INTERNAL_SECRET`），未配置时回落到原常量并在非 dev profile 打 WARN |
| `anynote-common-security-core/.../AutoConfiguration.imports` | 修改 | 注册上面的配置类 |
| `anynote-common-security-servlet/.../aspect/InnerAuthAspect.java` | 修改 | 校验改用配置的密钥（构造注入） |
| `anynote-common-security-reactive/.../aspect/InnerAuthWebfluxAspect.java` | 修改 | 同上（Reactive） |
| `anynote-common-security-servlet/.../feign/FeignRequestInterceptor.java` / `FeignAutoConfiguration.java` | 修改 | 签名改用配置的密钥，两端必须一致 |
| `anynote-common-core/.../constant/SecurityConstants.java` | 修改 | 注释改为「仅作未配置时的默认值」 |
| `InternalSecretPropertiesTest.java` / `InnerAuthAspectTest.java` / `FeignRequestInterceptorTest.java` | 新增 | 配置值与回落、非 dev 回落才告警；签名正确 / 错误 / 缺头；拦截器用配置密钥签名 |
| `anynote-common-core/.../HmacUtilsTest.java` | 修改 | 增加与协同服务共用的签名测试向量 |

## 四、`packages/editor-core`——编辑器内核

web 与协同服务必须用同一套 schema 与 Markdown 规则，否则服务端写回的正文与浏览器看到的不同。
扩展定义从 web 移入（git 识别为重命名），web 只在其上叠加界面（node view、Placeholder、Slash 菜单等）。

| 文件 | 状态 | 作用与原因 |
|------|------|-----------|
| `src/core-extensions.ts` / `src/index.ts` | 新增 | `coreExtensions()`：schema 与 Markdown 所需的完整扩展列表；统一导出扩展与 `MarkdownBridge` |
| `src/extensions/{ai-block,callout,marks,tight-lists,wikilink}.ts` | 重命名 | 自 `apps/web/src/components/editor/extensions/anynote-*.ts` 移入，只改了导入路径 |
| `src/extensions/{math,code-block,image}.ts` | 新增 | 从 web 版拆出无界面的 schema 与 Markdown 部分，web 版以 `.extend()` 叠加 node view |
| `src/markdown.ts` / `src/markdown-it.ts` | 重命名 | 自 `apps/web/src/lib/editor/` 移入 |
| `src/leading-heading.ts` | 新增（自 web 移入并改写） | 取标题规则（截断到 80）、补 H1、正文字数，前端与协同服务共用 |
| `src/version.ts` / `src/schema-digest.ts` / `schema-lock.json` | 新增 | `EDITOR_SCHEMA_VERSION` 与 schema 摘要；握手据此判定 4426 |
| `src/__tests__/schema-version.test.ts` | 新增 | schema 变了而版本号没递增、或版本没登记摘要时失败 |
| `src/__tests__/roundtrip.test.ts` / `leading-heading.test.ts`（重命名） | 新增 / 重命名 | 语料往返稳定；取标题边界（新增截断与字数用例） |
| `fixtures/01–05-*.md`（重命名）/ `fixtures/06-nested-and-mixed.md`（新增） | 重命名 / 新增 | 往返语料移到包内供两侧共用，补一篇嵌套混排 |
| `package.json` / `tsconfig.json` / `vitest.config.ts` | 新增 | 源码包（`sideEffects: false`，导出 `.`、`./leading-heading`、`./version`） |

## 五、`apps/web/src/lib/collab`——会话层

| 文件 | 状态 | 作用与原因 |
|------|------|-----------|
| `session.ts` | 修改 | 握手带 `editorVersion` 与 `lineage`；注册类型 100：hello 切换落库模式并启用本地副本、ACK 递减未确认计数、STORED 记下最近一次落库通知；4426 / 4404 / 4409 转成 `fatal`（**未收到 hello 时也按落库模式展示**，只有落库模式会发这些关闭码）；同步完成却没收到 hello 时清掉本地副本（服务端回滚）；provider 先注册处理器再连接 |
| `local-persistence.ts` | 新增 | IndexedDB 本地副本（lib0 实现、库名 `anynote-note-<id>`）：载入、增量写、谱系记录、出错即停用、30 天清理、登出全清 |
| `sync-state.ts` | 新增 | 未确认计数与 2s 宽限（D12），断线期间编辑记为「离线改动」 |
| `idle.ts` | 新增 | 标签页隐藏且闲置满 5 分钟断开，回到前台或有操作时重连（D13） |
| `__tests__/session.test.ts` | 修改 | 本地副本载入与谱系、hello / ACK / STORED、宽限、回滚清理、三种关闭码、未收到 hello 时的 4426 |
| `__tests__/local-persistence.test.ts` / `sync-state.test.ts` / `idle.test.ts` | 新增 | 用 `fake-indexeddb` 跑真实读写；宽限计时；闲置计时与唤醒 |

## 六、`apps/web/src/features` 与笔记组件——编辑页接线与保存链路

| 文件 | 状态 | 作用与原因 |
|------|------|-----------|
| `features/notes/use-note-editor-session.ts` | 新增 | 桌面与移动编辑页共用的接线（M14.P 提前抽取）：落库模式下不排队保存、协同降级时回到单人保存（修掉 M13 遗留的「降级后一次都不保存」）、绑定就绪才交出编辑器、离开拦截、顶部 H1 一变就写进列表与详情缓存、收到 STORED 刷新版本号与列表（标题落后于本地时不拉取，免得目录标题倒退） |
| `features/notes/use-save-note.ts` | 修改（M14.P） | 单人保存链路重写：1.5s 防抖 + 10s 最长等待、失败分类（登录失效 / 无权限 / 不存在 / 参数错误）停止重试并给出原因、可重试错误 5s 后重试、关页时 60KB 以内用 keepalive 发出、冲突提示与「放弃本地改动」 |
| `features/notes/use-leave-guard.ts` | 新增 | 有未同步改动时拦截离开：关页走 `beforeunload`，站内链接在捕获阶段弹确认 |
| `features/notes/components/collab-notices.tsx` | 新增 | 需刷新、笔记已删除、谱系重建后「复制未同步的内容」三种提示 |
| `features/notes/components/note-editor.tsx` / `mobile/note-editor-mobile.tsx` | 修改 | 改用共享会话 hook；落库模式换成同步徽标；接上提示条与保存失败提示 |
| `features/notes/components/note-history-page.tsx` / `mobile/note-history-mobile.tsx` | 修改 | `ensureLeadingHeading` 改从 editor-core 导入 |
| `features/notes/use-note-title.ts` | 修改 | 取标题改用 editor-core 的 `leadingHeadingOf`（与协同服务同一规则，含截断到 80） |
| `features/collab/use-collab-room.ts` | 修改 | 透出会话状态；落库模式下挂闲置断开；4409 时交还本地内容、清本地副本后重建会话 |
| `features/collab/use-collab-note.ts` | 修改 | 按 hello 分流两条路径：落库模式不注入、不写 meta，正文就位条件改为「本地副本载入或首次同步完成」；给出同步状态、离开拦截文案、`fatal`、取回的未同步正文与 STORED 通知。「已同步」要等服务端完成同步（连接建立后服务端还要校验版本与谱系），「完成过首次同步」按文档实例记录，收到 4409 到新会话建好之间只读——这三处堵住了谱系重建期间输入丢失（**先红后绿**） |
| `features/auth/use-logout-mutation.ts` | 修改 | 登出成功后清空全部本地副本（共用设备不留正文） |
| `components/note/save-status.tsx` | 修改 | 保存徽标增加「保存失败」态与失败提示；新增落库模式的 `CollabSyncBadge`（连接中 / 已同步 / 同步中 / 离线 / 需刷新） |
| `__tests__`（`use-save-note` / `use-leave-guard` / `collab-notices` / `note-editor-collab` / `note-editor` / `note-editor-mobile-collab` / `use-collab-note` / `use-collab-room` / `use-note-title` / `use-logout-mutation` / `save-status`） | 新增 / 修改 | 对应上面每一项的分支：落库模式不发 PATCH、降级后发 PATCH（**先红后绿**）、标题缓存即时更新与不倒退、STORED 只处理一次、失败分类与重试、keepalive 上限、离开拦截、提示条三态、登出清理、徽标文案 |

## 七、`apps/web/src/components/editor`——改用编辑器内核

| 文件 | 状态 | 作用与原因 |
|------|------|-----------|
| `presets/full.ts` / `minimal.ts` / `readonly.ts` | 修改 | 从 editor-core 取扩展，只叠加界面部分；`full` 的 schema 与 `coreExtensions()` 逐项一致 |
| `extensions/anynote-math.ts` / `code-block-shiki.tsx` / `anynote-image.ts` | 修改 | 改为 `.extend()` editor-core 的定义，只保留 node view 与高亮 |
| `core/tiptap-editor.tsx` | 修改 | value 同步与可写同步跳过已销毁的实例：4409 重建那一拍对旧实例调命令会整页报错（**先红后绿**） |
| `__tests__/editor-core-pair.test.ts` | 新增 | web 完整预设与 `coreExtensions()` 对拍：schema 逐项相同、全部语料序列化逐字节相同 |
| `__tests__/editor.test.tsx` | 修改 | 已销毁实例的回归用例 |
| `__tests__/roundtrip.test.ts` / `image-upload-indicator.test.tsx` / `extensions/__tests__/anynote-image.test.ts` | 修改 | 导入改到 editor-core；语料目录移到包内（5 → 6 篇） |
| `apps/web/package.json` / `next.config.ts` | 修改 | 去掉 15 个转到 editor-core 的直接依赖（13 个 TipTap 扩展与 `prosemirror-markdown`、`tiptap-markdown`），加 `@anynote/editor-core`、`lib0`、`fake-indexeddb`；`transpilePackages` 加 editor-core |

## 八、`apps/web/e2e`——落库联调与故障演练

用例总数 144 → **161**（桌面 116 + 移动端 45）。

| 文件 | 状态 | 作用与原因 |
|------|------|-----------|
| `collab-persist.spec.ts` | 新增 | 12 条：双人同时编辑全程无 PATCH、只打开不编辑版本不变、外部带版本写入即时并入、房间在线时恢复历史版本、kill -9 重启不翻倍不丢、`docker stop` 时最后 2 秒已落库、note 服务不可用期间编辑并重启协同服务后从应急落盘补写、断网编辑关页重开进库、删除状态行后 4409 重建不翻倍、4426 只读提示、后台闲置 5 分钟断开后自动重连、60KB 长文耗时；开关关闭时整组跳过 |
| `mobile-collab-persist.spec.ts` | 新增 | 第 1、2、8 条在移动端视口再跑一遍 |
| `notes-single-user.spec.ts` | 新增 | 单人保存链路（M14.P，把协同令牌打成失败强制走单人链路）：冲突时「放弃我的改动」后离开也不写回；顶部标题超过 80 字仍能保存并截断 |
| `support/collab-persist.ts` | 新增 | 公共工具：协同服务健康端点、本机 Docker 故障注入与 MySQL 查询、带版本号的外部写入、光标落到正文末尾、等库里正文 |
| `support/save-status.ts` | 修改 | 终态锚点同时接受 `saved` 与落库模式的 `synced`，导出供其它 spec 复用 |
| `loading-system.spec.ts` / `ui-redesign.spec.ts` | 修改 | 原本写死 `[data-status="saved"]`，落库模式下徽标终态是 `synced`，改用公共锚点 |

## 九、`infra`

| 文件 | 状态 | 作用与原因 |
|------|------|-----------|
| `sql/migrations/2026-09-25-note-collab-state.sql` | 新增 | 建 `n_note_collab_state`（**手动执行**） |
| `sql/anynote.sql` | 修改 | 同步建表语句 |
| `docker-compose.yaml` | 修改 | Java 公共环境加 `ANYNOTE_INTERNAL_SECRET`；协同服务加落库相关变量、`stop_grace_period: 30s`（退出前要写回房间）、依赖 note 与 redis 健康 |
| `docker-compose.prod.yaml` | 修改 | 生产强制配置 `ANYNOTE_INTERNAL_SECRET`（Java 与协同服务） |
| `Dockerfile.collab` / `.dockerignore` | 修改 | 构建阶段带上 editor-core，tsup 打包后 `pnpm deploy --prod`；镜像 310MB |
| `Dockerfile.web` / `.dockerignore` | 修改 | 构建上下文带上 editor-core |
| `.env.example` / `.env.idea.example` | 修改 | 新变量说明 |

## 十、文档与契约

| 文件 | 状态 | 作用与原因 |
|------|------|-----------|
| `docs/collab-persistence/COLLAB_PERSISTENCE_PLAN.md` | 新增（此前未入库） | 方案本体；本批升到 v1.3：§6.6 协议表补 `STORED`、R13（正文列 64KB 上限）、附录 H 实施记录（拍板结论、性能数据、9 条偏差、端到端发现的缺陷、未完成项） |
| `.claude/openspec/changes/2026-09-25-collab-server-persistence.md` | 新增 | 两个内部端点、PATCH 的长度约束与外部写入通知、内部调用密钥、错误码与数据库变更 |
| `CLAUDE.md` | 修改 | `apps/collab` 与 `packages/editor-core` 的定位、HMAC 密钥可配置、测试覆盖表、方案导航、E2E 用例数（144 → 161） |
| `.claude/context/frontend.md` | 修改 | 两种保存模式的说明（含 STORED 与标题缓存） |
| `README.md` | 修改 | 协同服务落库开关、生产必填密钥、落库演练的运行前提（开关、镜像构建参数、会操作本机 Docker） |
| `docs/deployment-network.md` | 修改 | 协同服务 → note / redis 的内部调用 |
| `docs/collab/notes-collab-merge-plan.md` | 修改 | 头部注明客户端保存链路由 M14 接替 |

## 审计要点

1. **两个内部端点绕过笔记权限**（`NoteCollabController`）。安全边界完全靠 `@InnerAuth` 的 HMAC 签名与网关剥掉外部 `from-source`；
   默认密钥随仓库公开，生产 compose 已强制配置 `ANYNOTE_INTERNAL_SECRET`，但 IDEA / 非 compose 部署要自己配。已用真实栈验证：
   不带签名返回「没有内部访问权限」、密钥不对返回「内部调用签名验证失败」、经网关外部调用返回 `A0350`。
2. **公开 PATCH 的行为变更**（`NoteServiceImpl.editNote`）。UPDATE 现在总带「读到的 `update_time`」作条件：
   不带 `version` 的调用（如 CLI）在「读与写之间被别人写过」的毫秒级窗口里也会收到 `A0409`，此前是后写覆盖。
   这是修掉「历史恢复被协同写回覆盖」所必需的（附录 H.3 第 3 条），调用方要把 `A0409` 当成可重试。
3. **合并逻辑是数据正确性的核心**（`note-rooms.ts` 的 `mergeFromStore` / `mergeState` / `mergeExternal`，`converter.ts` 的确定性谱系）。
   同谱系按 Y 状态合并、外部写入走 Markdown 三方合并，两条分支判错会造成正文翻倍或丢改动；
   对应的单测与 kill -9、note 暂停、历史恢复、外部写入、4409 五条故障演练是评审的抓手。
4. **能力协商与上线顺序**。客户端只有收到 hello 才切到落库行为，所以必须**先发前端、再开 `COLLAB_SERVER_PERSIST`**；
   开关打开后，没带编辑器版本的旧页面会收到 4426 并变为只读提示刷新。回滚只需关开关——这也是 M14.6（删除客户端保存分支）暂不执行的原因。
5. **写库失败不放弃**。退避上限 60s、永不丢弃待写标记，失败房间在 `/healthz` 的 `failingRooms` 里；
   已知会持续失败的场景是正文超过 `TEXT` 的 64KB（R13），此时公开 PATCH 也同样写不进去。上线后应对 `failingRooms` 配告警。
6. **正文会留在浏览器里**（`local-persistence.ts`）。IndexedDB 副本在登出时全部清除、30 天未打开自动清理、4404 时删除；
   共用设备不登出的情况下正文仍在本地，与 legacy 的草稿缓存同级。
