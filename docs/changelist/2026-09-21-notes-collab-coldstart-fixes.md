# 改动清单：笔记协同冷启动四处缺陷修复（M13 复核）

> 日期：2026-09-21 · 分支：`fix/notes-collab-cold-start`（从 `dev` 切出）
> 方案：[`docs/collab/notes-collab-merge-plan.md`](../collab/notes-collab-merge-plan.md) v2.0（D4 / §7.3 / §7.4 / §9 / §11 已随本批订正）
> 契约提案：[`.claude/openspec/changes/2026-09-21-collab-grant-hide-metadata.md`](../../.claude/openspec/changes/2026-09-21-collab-grant-hide-metadata.md)
> 前一批：[`2026-09-21-notes-collab-merge.md`](./2026-09-21-notes-collab-merge.md)（M13.0–M13.5）

## 概览

对上一批 M13 成果做真实栈复核后修掉的四处缺陷，全部集中在**冷启动注入**这条链路上，
实测互相咬合（其中两处是「两个错凑成一个对」，只修一个会让另一个暴露），因此一批处理。
另登记一个**本批不修**的前置缺口（笔记权限入口缺失）。

### 改动面（实测，`git diff --numstat e50dd00..80449cc` / `git status --porcelain`）

分支相对 `dev`（`e50dd00`）：6 个代码 / 测试 / 契约 commit（`649d786`…`80449cc`），外加本清单所在的 1 个文档 commit。

| 类别 | 文件数 | 行数 |
|------|--------|------|
| 代码、测试与契约（6 个 commit） | 24 | +909 / −147 |
| 文档（与本清单同一 commit） | 4 | +85 / −12，外加本清单 240 行 |

按目录分布：

| 目录 | 新增 | 修改 | 说明 |
|------|------|------|------|
| `services/note` | 0 | 5（含 1 测试） | `collab-grant` 拒签路径不回元数据 |
| `apps/collab` | 0 | 1 | 删一个死导入 |
| `apps/web/src/lib/collab` | 1（测试） | 3（含 1 测试） | 注入守卫与注入事务 |
| `apps/web/src/features` | 0 | 6（含 3 测试） | 协同运行时与两端编辑器接线 |
| `apps/web/e2e` | 0 | 6 | 3 条并发/写入回归 + 可写等待 helper + 1 处既有脆弱性 |
| `openapi` / `.claude/openspec` | 1 | 1（生成物） | 契约提案 + baseline 重生 |
| 文档 | 1（本清单） | 3 | `CLAUDE.md` / `frontend.md` / 方案订正 |

### 验证结果（只记实际执行过的命令与真实输出）

| 命令 / 动作 | 结果 | 备注 |
|------|------|------|
| `mvn -B -pl note -am test`（WSL，JDK 21） | ✅ **60 用例全绿** | 上一批 58 + 本批 2；新增两条改前必红；2026-09-25 合并前复跑一致 |
| `pnpm test`（`apps/collab`） | ✅ **8 文件 / 98 用例全绿** | 只删了一个死导入，回归确认；2026-09-25 合并前复跑一致 |
| `npx vitest run`（`apps/web` 全量） | ✅ **155 文件 / 1850 用例全绿** | 上一批 1826 + 本批 24；2026-09-25 合并前复跑一致 |
| `npx tsc --noEmit`（`apps/web`） | ✅ 0 错误 | |
| `npx @biomejs/biome check apps/web/src apps/web/e2e apps/collab/src` | ✅ 490 文件 0 error | |
| `pnpm openapi:generate` + `git diff` | ✅ 仅 `note.json` 的 `CollabGrantVO` 字段描述变化 | 生成物，CI `openapi-check` 卡 diff |
| `pnpm openapi:check` | ✅ 6 份 baseline 全部一致，无漂移 | 与 CI 同行为 |
| `pnpm --filter web test:e2e` | ✅ 最后一轮全量 **144/144** | 用例数 141 → 144；此前各轮的偶发失败逐条见下方「E2E」 |
| `pnpm --filter web bundle:budget` | ✅ **3 项全 PASS** | 桌面最重 `/notes/new` 301.5/310KB；移动最重 `/m/notes/[baseId]/tasks/[taskId]` 245.4/250KB；编辑器 chunk 14.1/250KB——与上一批同值，本批未增重 |
| 真实栈复现脚本（真 Chromium + 真容器） | ✅ 四处缺陷均已不复现，见下方「真实栈复核」 | 改前的失败输出记在各条缺陷里 |

### 真实栈复核（`NEXT_PUBLIC_COLLAB_NOTES=1`，重建 `anynote-modules-note` 与 `anynote-web` 镜像后）

| 复核点 | 改前实测 | 改后实测 |
|--------|---------|---------|
| 两端同时打开冷房间（交错 0/300/600/900/1200ms × 2 轮） | 0ms / 500ms **必现两端空白** | ✅ **10/10 两端都读到正文** |
| 同一用户开两个标签页 | ❌ 两个标签页都空白 | ✅ 两个标签页都有正文 |
| 在空白编辑器里打字 | ❌ 库里正文被整段覆盖 | ✅ 正文未就位时编辑器只读，打不进字 |
| 打开一篇没有顶部 H1 的老笔记、零击键 | ❌ 发出 1 次 PATCH 并改写正文 | ✅ **0 次 PATCH**，正文不变 |
| 连续输入 `ABCDE` 后落库 | ⚠️ 发 2 次 PATCH，第 1 次只到 `ABCD` | ✅ **1 次 PATCH**，内容 `ABCDE` |
| 连接建立前（换令牌拖慢 5s）打字 | ❌ 屏幕上丢失、库里却有 | ✅ 打不进字，库与屏幕一致 |
| 无关账号调 `collab-grant` | ❌ 回 `{perm:NONE, version, title}` | ✅ 回 `{perm:NONE, version:null, title:null}` |
| 作者调 `collab-grant` | ✅ | ✅ `MANAGE` + 版本 + 标题照旧 |

> 复核脚本是一次性的调试产物，未入库；上表的每一行都对应一次真实浏览器 / 真实网关调用。

### E2E（`E2E_BASE_URL=http://localhost:3000`，打真实容器栈）

共跑六轮，外加若干次单 spec 重跑，如实记录（本机是开发栈，连跑数小时后出现过几次偶发失败，逐条列在下面）：

| 轮次 | 结果 | 说明 |
|------|------|------|
| 第 1 轮（只改了产品代码，用例还没跟着改） | ❌ 7 failed / 126 passed | 6 条败在本批引入的只读窗口（见下方「行为变更」）：`notes` 自动保存 1 条、`notes-image-upload` 4 条（只读态敲 `/` 唤不起 Slash 菜单）、`mobile-core` 1 条。另 1 条 `ai-stream` 是**既有**用例脆弱性 + 后端 AI 异常，与本批无关 |
| 第 2 轮（`notes` / `collab` / `notes-image-upload` 定向重跑） | ✅ **22/22** | 含本批新增的 3 条并发/写入回归 |
| 第 3 轮（全量） | ⚠️ 143 passed / 1 failed | 失败的是 `ui-supplement.spec.ts` 的 D-02「5 格计数与侧栏二级导航一一对应」，**单独重跑 7/7 通过**；该用例走知识库概览页、本批未触碰，判定为与本批无关的 flake |
| 第 4 轮（全量） | ⚠️ 143 passed / 1 failed | 这次换成 `notes-image-upload` 的「上传失败时指示器被清理」。根因是**用例自身的竞态**：它把建任务的路由 mock 成瞬间失败，指示器的可见窗口可能短于一次断言轮询。已在该 mock 里压一拍再回（不是等 UI，是给「指示器出现过」这条断言一个可观察窗口），`--repeat-each=3` 实测 12/12 稳定 |
| 第 5 轮（全量） | ⚠️ 143 passed / 1 failed | 这次是 `notes.spec.ts` 的「行内代码有芯片底色」（这一轮与单测并行在跑）。之后单独重跑该 spec 三次：`--repeat-each=2` 时 1 failed / 7 did not run / 12 passed，败在第 2 遍的「新建的笔记出现在知识库的笔记列表里」；再跑一次 1 failed / 9 did not run，首条用例停在登录页（登录态失效）；第三次 **10/10 通过**。这两处失败都发生在不碰编辑器的步骤上，原因未深究 |
| 第 6 轮（全量，先清空 `e2e/.output`，无其他测试并行） | ✅ **144 passed**（3.8m） | 在最后一个 commit `80449cc` 之后跑；上面各轮与重跑中红过的用例，这一轮全部通过 |

### 产物预算

`pnpm --filter web bundle:budget` 三项全 PASS，数值与上一批**完全相同**（本批只改逻辑、未引入依赖）：

```
PASS  单条路由首屏 JS（gzip）（/notes/new）：301.5 KB / 预算 310.0 KB
PASS  移动端路由首屏 JS（gzip）（/m/notes/[baseId]/tasks/[taskId]）：245.4 KB / 预算 250.0 KB
PASS  编辑器 chunk 合计（gzip）：14.1 KB / 预算 250.0 KB
```

协同笔记本体的两条路由都没进「最重前 10」（第 10 名是 292.9 KB），离预算还有余量。

> 本机 `next build` 在**编译完成之后**的 standalone 拷贝阶段报
> `EPERM: operation not permitted, symlink`（Windows 未开发者模式下建符号链接的限制）。
> 预算脚本读的是 `.next` 的 chunk 与 manifest，这些在报错前已写完（实测时间戳与本次构建一致），
> 因此预算数据有效；但**容器镜像不受影响**（`infra/Dockerfile.web` 在 Linux 里构建，已重建并跑通全套 E2E）。

### 行为变更：协同笔记打开后有约 1 秒的只读窗口

「正文就位前编辑器只读」是本批唯一对用户可见的行为变更，也是 E2E 改动量的来源。

- **谁受影响**：`NEXT_PUBLIC_COLLAB_NOTES=1` 且对该笔记有编辑权的用户。从编辑器出现
  到冷启动注入完成（换令牌 + 建连 + sync + 600ms 静默窗口）之间，正文可读不可写，
  页面上有「正在接入协同会话，正文载入后即可编辑…」提示条。
- **为什么必须只读**：这段时间里正文的唯一真相（Y.Doc）是空的，放开编辑就是
  「对着空白编辑器打字 → 那一拍保存覆盖掉库里的正文」，正是本批要堵的数据损坏路径；
  更早的「连接中」阶段编辑器跑的是单人预设，协同绑定建立时整个实例会被重建，
  那期间的输入同样会被整段丢掉。
- **降级不受影响**：协同连不上时回到单人链路，立即恢复可写。
- **对测试的影响**：任何「等编辑器可见就开始打字」的用例都会丢掉那几下按键。
  已新增共享 helper `e2e/support/editor.ts` 的 `focusWritableEditor()`——多等一个
  `contenteditable="true"`，并被 `notes` / `collab` / `mobile-core` / `notes-image-upload`
  四个 spec 复用（`replaceBlock` 也走同一道等待，它原本会在只读态下
  `closest('[contenteditable="true"]')` 拿到 null 直接抛）。

### 本批**不修**的前置缺口（已登记）

`createNote` 把 `n_note.permissions` 硬编码成 `"70000"`（作者 MANAGE、其余槽位全 0），
全仓**没有任何修改笔记权限的端点**（另一处只有 `submitNote` 的 `"44000"`，同库用户槽位仍是 0）。
实测矩阵（同一知识库内）：

| 身份 | `GET /notes/{id}` | `collab-grant.perm` |
|------|-------------------|---------------------|
| 作者 | `00000` | `MANAGE` |
| 知识库管理员 | `A0301` | `NONE` |
| 知识库编辑成员 | `A0301` | `NONE` |
| 知识库只读成员 | `A0301` | `NONE` |

后果：方案 §9 的总验收标准第 1 条（两位有 EDIT 权的库成员共编同一笔记）与第 3 条后半句
（知识库只读成员能正常打开笔记）**在当前后端下不可能达成**，上一批清单「§9 验收项已全部跑到」
属于夸大。协同目前只能**同一用户多端**使用——而那恰恰是本批修掉的冷启动缺陷的主要触发场景。
这不是 M13 引入的（`getNotePermissions` 其余分支未改），按 2026-09-21 的决定本期只记录不修复，
补权限入口另立工单。方案 §9 已加同样的订正记录。

---

## 一、`services/note`（Java）——拒签路径不回元数据

`GET /notes/{noteId}/collab-grant` 是普通 Bearer 认证、**刻意不挂 `@RequiresNotePermissions`**
的端点（要把「没权限」与「没登录」区分开），因此任何登录用户都能按 id 调用它。
原实现无差别回 `title` 与 `version`，等于给出一份可枚举的全站笔记标题与最后修改时间清单。

| 文件 | 状态 | 作用与原因 |
|------|------|-----------|
| `.../service/impl/NoteServiceImpl.java` | 修改 | `getCollabGrant` 改为先推权限、`NONE` 直接返回（只带 `noteId` / `perm`），有权限才查标题与 `updateTime`；顺带让拒签路径少查一次库。笔记不存在仍由 `getNotePermissions` 抛 `A0404`，与 `GET /notes/{id}` 同口径 |
| `.../model/vo/CollabGrantVO.java` | 修改 | 两个字段的 `@Schema` 说明补上「`perm` 为 `NONE` 时为 null」，并在类注释写清为什么（端点对任何登录用户开放） |
| `.../controller/NoteController.java` | 修改 | `@Operation` 描述同步该语义——契约以注解为准，OpenAPI 是派生物 |
| `.../service/NoteService.java` | 修改 | 接口 Javadoc 同步，避免实现与接口两处说法不一致 |
| `.../impl/NoteServiceImplCollabGrantTest.java` | 修改 | +2 条：「无权限拿不到标题与版本令牌」（**先写、改前必红**）与「无权限时不再为取标题多查一次库」（`verify(times(1))`） |
| `openapi/specs/note.json` | 修改 | **生成物**：`openapi/generate.sh` 从运行中的网关重生，被 CI `openapi-check` 卡 diff；评审看 `NoteController` 与 `CollabGrantVO` 的注解 |
| `.claude/openspec/changes/2026-09-21-collab-grant-hide-metadata.md` | 新增 | 契约提案：字段与类型不变、取值语义收紧；BFF 只读 `perm`，前端无需改动 |

## 二、`apps/collab`——清一个死导入

| 文件 | 状态 | 作用与原因 |
|------|------|-----------|
| `src/server.ts` | 修改 | 删 `parseRoom` 导入。D3 把持久化收敛成「note 房间一律 `memoryOnlyPersistence`」之后它就没有调用方了；biome 当前配置不报未使用导入，只能人工清 |

## 三、`apps/web/src/lib/collab`——注入守卫与注入事务

这一层是三处前端缺陷里两处的根因所在。

| 文件 | 状态 | 作用与原因 |
|------|------|-----------|
| `injection.ts` | 修改 | ① `shouldInject` 的第 4 条由「awareness 里只有我」改为**确定性选举**（`electInjector`：把自己并进候选集后取最小 clientID）——旧规则让两端同时首连时互相让路，谁都不注入；② 新增 `COLLAB_META_ORIGIN` 与 `isCollabInternalOrigin`，把 `writeSavedVersion` 包进带 origin 的事务，让「写共享 meta」不再被当成一次本地编辑 |
| `inject.ts` | 修改 | 正文注入与 `meta.seeded` 合进**同一个** `doc.transact(..., COLLAB_INJECT_ORIGIN)`。此前只有 `seeded` 那半拍有 origin，正文那一半带着 ySyncPlugin 的 binding 逃过保存过滤（Yjs 事务可嵌套，内层会并入外层并沿用外层 origin） |
| `__tests__/injection.test.ts` | 修改 | 真值表改写：两端在场时只有 clientID 小的注入、三端只选出一个、awareness 未回灌自己时按「只有我」处理；新增「`savedVersion` 写入带 META origin」与 `isCollabInternalOrigin` 的边界 |
| `__tests__/inject.test.ts` | 新增 | **本批关键回归**：用真的 TipTap + 真的 ySyncPlugin 绑定跑一次注入，断言「产生的每一条 Y.Doc update 都带 `COLLAB_INJECT_ORIGIN`，一条都不漏」，并反向断言注入后的真实编辑不带该 origin（否则保存会被永久过滤） |

## 四、`apps/web/src/features`——协同运行时与两端编辑器

| 文件 | 状态 | 作用与原因 |
|------|------|-----------|
| `collab/use-collab-note.ts` | 修改 | ① `onLocalChange(editor)` 改名 `onLocalEdit()` 并**去掉正文参数**——ySyncPlugin 先写 Y.Doc、TipTap 才发 `onUpdate`，在这个回调里现取的正文快照恒落后一次击键；② origin 过滤加上 `isCollabInternalOrigin`（注入 + meta）；③ 新增 `contentReady` / `editable`：连接中与「已连上但正文还没注入」一律不可写；④ settle 定时器到点**再判一次**守卫，不再只靠事件驱动的取消 |
| `notes/components/note-editor.tsx` | 修改 | 桌面端：保存改由 `onChange` 排队（凭 `localEditRef` 标记区分本地/远端），删掉已无人读的 `contentRef`；`editable={collab.editable}`；正文未就位时渲染「正在接入协同会话」提示条（`<output>`，隐式 role=status） |
| `notes/components/mobile/note-editor-mobile.tsx` | 修改 | 移动端同一套接线，保证两端行为不分叉。移动端更要紧：软键盘一弹用户就开始打字 |
| `collab/__tests__/use-collab-note.test.tsx` | 修改 | 改名与新增：写 meta 不触发 `onLocalEdit`；`onLocalEdit` 不带参；新增「连接中不可写 / 正文空时不可写 / 正文到位转可写 / 新笔记不等待 / 降级后恢复可写」5 条 |
| `notes/components/__tests__/note-editor-collab.test.tsx` | 修改 | +6 条：`editable` 传值与提示条的三态；保存排队三条（远端广播不排、本地编辑用 `onChange` 的最新正文、标记只消费一次）。这一组要跨防抖窗口，`describe` 级 `timeout: 20_000` |
| `notes/components/mobile/__tests__/note-editor-mobile-collab.test.tsx` | 修改 | +2 条：移动端的 `editable` 与提示条 |

## 五、`apps/web/e2e`——并发与写入的端到端回归

用例总数 141 → **144**（桌面 102 + 移动端 42）。

| 文件 | 状态 | 作用与原因 |
|------|------|-----------|
| `e2e/collab.spec.ts` | 修改 | 新增一组 3 条：①**两端同时打开冷房间两端都能读到正文**（先落一次盘 → 离开 → 轮询 `collab` 的 `/healthz` 等房间销毁 → `Promise.all` 同时 `goto`）；② 刷新后正文完整含最后一个字；③ **纯打开不产生写入**——刻意先把正文改成没有顶部 H1 的形态，否则「内容与基线相同就不发」的守卫会把缺陷挡掉、用例假绿；另把本地 `focusEditor` 收口到共享 helper |
| `e2e/support/editor.ts` | 修改 | 新增 `focusWritableEditor()`：等 `contenteditable="true"` 再点。协同笔记打开后有约 1 秒只读窗口（见「行为变更」），只等 `toBeVisible` 就打字会丢掉那几下按键；`replaceBlock` 也走同一道等待——它原本在只读态下 `closest('[contenteditable="true"]')` 拿到 null 直接抛 |
| `e2e/notes.spec.ts` | 修改 | 本地 `focusEditor` 改为转发共享 helper。改前「输入会自动保存，刷新后内容还在」在新只读窗口下必红 |
| `e2e/notes-image-upload.spec.ts` | 修改 | 两处：① 唤起 Slash 菜单前先等可写——只读态下敲 `/` 没有任何反应，4 条用例全卡在等 `slash-menu`；② 「上传失败」用例的 mock 路由压一拍再回，消掉「指示器可见窗口短于断言轮询」的竞态（第 4 轮全量跑里红过一次，`--repeat-each=3` 后 12/12 稳定） |
| `e2e/mobile-core.spec.ts` | 修改 | 两处「等可见就点击输入」换成共享 helper |

## 六、顺带修掉的一处用例脆弱性（非本批引入）

| 文件 | 状态 | 作用与原因 |
|------|------|-----------|
| `e2e/ai-stream.spec.ts` | 修改 | 终态断言 `failed.or(answered)` 末尾补 `.first()`。失败文案本身就渲染在只读编辑器里，两侧**会同时命中**，`or()` 返回两个元素直接撞 strict mode，把一次本该通过的「明确失败态」判成失败。该用例注释里写明成功分支当前被后端阻塞（M7.6），而本机 `anynote-modules-ai-nio` 正在抛 `java.util.NoSuchElementException: Context is empty`（服务端异常，与本批前端改动无关），于是这条脆弱性每次都会暴露 |

## 七、文档同步

| 文件 | 状态 | 作用与原因 |
|------|------|-----------|
| `docs/collab/notes-collab-merge-plan.md` | 修改 | D4 守卫条件改写 + 新增「修订说明：为什么『awareness 里只有我』是错的」；§3.2 第 4 步同步；§7.3.1 补两条订正（meta origin、正文不能现取）；§7.4 补「正文就位前只读」；§9 补验收第 1/3 条不可达的订正；§11 风险 7 标注「原缓解措施本身就是缺陷」 |
| `.claude/context/frontend.md` | 修改 | 协同编辑节改写：确定性选举、注入事务 origin、`contentReady`/`editable`、保存正文取 `onChange`；并加一条「当前只能同一用户多端共编」的警示 |
| `CLAUDE.md` | 修改 | 协同方案指针补本批四处修复与未解缺口、标注已合并 `dev`，指向本清单；E2E 用例数 141 → 144 |
| `docs/changelist/2026-09-21-notes-collab-coldstart-fixes.md` | 新增 | 本清单 |

> 按 [`docs/changelist/README.md`](./README.md) 的归档约定，上一批清单
> [`2026-09-21-notes-collab-merge.md`](./2026-09-21-notes-collab-merge.md) **保持原样不改**——
> 它是当时改动面的快照；其中「§9 验收项已全部跑到」的夸大表述由本清单的「本批不修的前置缺口」一节订正。

---

## 审计要点

1. **改选举规则的同时必须加「正文就位前只读」**（`use-collab-note.ts` 的 `contentReady`）。
   选举只解决「谁来注入」，而真正毁数据的是「用户对着空白编辑器打字 → 那一拍保存覆盖库里的正文」。
   只读那一道是兜底：即便选举再出意外（awareness 未收敛、注入者掉线），也写不出空白正文。
   评审时请确认这两处**都在**，少任何一处都还留着数据损坏路径。

2. **`inject.ts` 的事务边界是本批最容易改错的一处**。必须是「`setContent` + `meta.seeded` 同在一个
   `doc.transact(..., COLLAB_INJECT_ORIGIN)` 里」。分成两段写（哪怕两段都带 origin）不行——
   `setContent` 那一段产生的 Y.Doc update 会带 ySyncPlugin 自己的 binding 作 origin。
   `__tests__/inject.test.ts` 用真编辑器钉住这条，**把实现改回分两段写它必红**（已实测）。

3. **两个缺陷凑成一个对，必须一起修**。「写 `meta.savedVersion` 没有 origin → 多排一次保存」与
   「origin 回调里取的正文落后一次击键」原本互相抵消：多出来的那次保存正好带着最新正文。
   只补 meta 的 origin 会让丢字暴露成真实缺陷；只改正文来源则留着写放大。改动实测把一段输入的
   PATCH 次数从 2 降到 1，且第一次就带完整内容。

4. **`onLocalEdit` 刻意不带正文参数**（`use-collab-note.ts`）。这是接口层面的防呆：带上参数就会诱使
   调用方在那一刻取快照，而那一刻的快照必然落后一次击键。正文的唯一来源是 `onChange` 的入参。

5. **`collab-grant` 的存在性预言机是有意保留的**（`NoteServiceImpl#getCollabGrant`）。
   无权限回 `A0404`（不存在）还是 `perm: NONE`（存在但没权限）是可区分的，但 `GET /notes/{id}`
   本来就是同样的区分口径，本次不引入新面。真正堵掉的是 `title` / `version` 这两个**内容性**字段。

6. **并发冷启动用例有两个容易踩空的前置**（`e2e/collab.spec.ts`）。
   其一，房间只在有人连着时存在，不等 `collab` 的 `/healthz` 报 `rooms: 0` 就直接开两端，
   测的就不是冷启动而是「后进者同步」——那条路径本来就没问题，用例会假绿。
   其二，两个上下文**各登一次**会触发 refresh 轮换吊销旧 rt，表现为
   `/api/proxy/note/notes/{id}` 偶发 401、页面报「笔记加载失败」，看起来像协同缺陷；
   用例与复核脚本都改成**共用一份 `storageState`**，排除这个干扰后并发冷启动 10/10 通过。
