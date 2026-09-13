# 2026-09-13 笔记编辑器图片上传加载提示

## 概览

给笔记编辑器的图片上传加上**上传进度指示器**。此前上传期间没有任何反馈，用户
"连在不在传都不知道"；现在四条插图入口（工具栏 / Slash 菜单 / 粘贴 / 拖拽）都会先在
插入位置放一个「转圈 + 上传中 N%」的占位指示器，上传完成后原地换成真正的图片，
失败则把指示器摘掉。

| 项 | 值 |
|---|---|
| 修改文件数 | 9（含 1 个既有单测 + 1 个既有 E2E） |
| 新增文件 | 2（均为单测；另有本 changelist 未计入） |
| 增删行数 | 866 insertions / 57 deletions（`git diff --stat 3b77a12...HEAD`，11 files changed） |
| 代码改动 | 有（`apps/web` 编辑器与上传链） |
| 验证方式 | 单测 876 条 + 真实 Docker 栈上全量 Playwright E2E + 产物体积预算 |

分支与提交（topic 分支 `--no-ff` 合并，符合 README「Git 工作流」）：

| 提交 | 内容 |
|------|------|
| `854b763` | `feat(web): 笔记插图过程中显示上传进度指示器`（7 文件，+280 / −57） |
| `5ca37b8` | `test(web): 覆盖图片上传指示器的状态机与四条插图入口`（4 文件，+586） |
| `fc6e900` | `chore: merge feat/note-image-upload-indicator → dev`（双父 merge commit） |

## 编辑器与上传链

| 文件 | 状态 | 作用与原因 |
|------|------|------|
| `apps/web/src/components/editor/extensions/anynote-image.ts` | 修改 | 本次核心。新增 `uploadImageAt(view, uploadFn, file, options)` 作为**四条入口唯一的插图实现**：先 `setMeta` 插入一条上传记录，插件据此渲染指示器，`uploadFn` 的 `onProgress` 持续更新百分比，落定后再在同一次事务里把指示器换成 `image` 节点（失败则只摘指示器）。指示器用 `Decoration.widget` 而非文档节点，因此**不进 Markdown 序列化**（上传途中的自动保存不会把占位符写进正文），协同模式下也只是本地 UI。插件 `apply` 里对 `tr.docChanged` 走 `tr.mapping.map`，让指示器随用户继续编辑而漂移，不会停在旧坐标。id 用自增序号而非 `crypto.randomUUID()`——后者只在 secure context 下存在，而这个 id 不需要随机性，用它会把非 HTTPS 环境下的插图功能一起拖下水。导出 `IMAGE_UPLOAD_INDICATOR_SELECTOR` 供单测与 E2E 共用，避免两边各写一份字符串。 |
| `apps/web/src/components/editor/core/toolbar.tsx` | 修改 | 工具栏图片按钮改为调用 `uploadImageAt`。原先自己 `uploadFn(file).then(insertContentAt)`，既没有进度也绕过了指示器；改完四条入口共用一条路径。`onError` 从 `.catch` 改成选项回调，toast 文案不变。 |
| `apps/web/src/components/editor/extensions/slash-items.ts` | 修改 | Slash 菜单「图片」同上改为 `uploadImageAt`。它原先也是自己插节点，属于必须一起收口的入口。 |
| `apps/web/src/lib/editor/upload.ts` | 修改 | `UploadOptions.onProgress` 显式声明为 `| undefined`（`exactOptionalPropertyTypes` 下不能缺省传递）；`createNoteImageUploader(noteId, onProgress)` 把它透传给 `uploadFile`。分片进度本来就在算，只是此前没有出口。 |
| `apps/web/src/features/notes/components/note-editor.tsx` | 修改 | `uploadFn` 把 `options?.onProgress` 转交给 `createNoteImageUploader`，接上编辑器与上传实现之间断掉的那一环。 |
| `apps/web/src/features/notes/components/mobile/note-editor-mobile.tsx` | 修改 | 与桌面同一处转发。移动端工具栏是同一套 `Toolbar` 组件，指示器因此自动生效。 |
| `apps/web/src/styles/tiptap.css` | 修改 | 新增 `.anynote-image-upload`（虚线框 + 转圈 + 百分比，颜色全走 `globals.css` 的 token，明暗主题自适应）与 keyframes。按 `prefers-reduced-motion: reduce` 降级为呼吸式淡入淡出——旋转动画对前庭敏感人群不友好，但完全静止又会丢掉"在动"的信息。数字用 `tabular-nums`，百分比跳动时宽度不抖。 |

## 测试

| 文件 | 状态 | 作用与原因 |
|------|------|------|
| `apps/web/src/components/editor/extensions/__tests__/anynote-image.test.ts` | 新增 | 11 条，测指示器状态机本身。用**核心 `Editor`（prosemirror 层）而非 React 组件**：指示器是 widget decoration，生命周期完全由插件状态决定，在 view 层断言最贴近真实行为。覆盖出现 / 进度更新 / 百分比夹取与 NaN / 成功落图 / 失败摘除 / 不进 Markdown / 并行上传互不干扰 / 编辑导致的位置漂移 / 编辑器销毁后回调不抛错。**所有用例都挂 `MarkdownBridge`**：不挂时 `getMarkdown()` 恒返回空串，"占位符没进正文"会退化成永远成立的假绿（本次实测踩到过）。 |
| `apps/web/src/components/editor/__tests__/image-upload-indicator.test.tsx` | 新增 | 7 条，测**四条入口都接到同一个带进度的实现**。这是回归保护的重点：任何一条入口将来自己 `insertContent`，提示就会失效，而单测指示器本身是发现不了的。直接调用插件注册的 `handlePaste` / `handleDrop`（按 ProseMirror 的分发方式依次询问，不能只看第一个 handler——StarterKit 与 tiptap-markdown 也注册了同名钩子），工具栏则通过截获其创建的隐藏 `input` 喂文件。 |
| `apps/web/src/lib/editor/__tests__/upload.test.ts` | 修改 | +2 条：进度回调真的被透传（单调不减、落在 0–100、末值为 100），以及不传 `onProgress` 时上传照常完成。 |
| `apps/web/e2e/notes-image-upload.spec.ts` | 修改 | +2 条真实链路用例：上传期间指示器可见且写着「上传中」、失败后被清理（不留永久转圈的占位）。**上传太快**（1×1 PNG 只有一片，整个流程几十毫秒），直接断言必然 flaky，所以用例内用 `page.route` 延迟建任务响应把瞬态窗口撑开——这也更接近慢网络下的真实体感。失败分支用 `route.fulfill` 返回业务错误码 + HTTP 200，与后端真实错误形态一致。 |

## 审计要点

1. **指示器是 decoration 不是文档节点**，这是整个设计的关键取舍。好处：不进 Markdown
   （上传途中自动保存不会写进正文）、不进协同（纯本地 UI）、失败可直接摘除。
   代价：位置需要靠 `tr.mapping` 手动维护，`apply` 里的映射顺序有讲究——
   **必须先映射已有项、再追加新项**，否则新项会因为坐标已属于新文档而被多映射一次。
2. **`percent` 必须进 `Decoration.widget` 的 spec**。ProseMirror 靠 `eq` 判断 widget
   是否变化，spec 不变就不会重绘，百分比会卡在初始值。这一点没有类型保护，改动时容易漏。
3. **四条入口收口到 `uploadImageAt`** 是本次的结构性改动。以后新增插图入口（如
   右键菜单、AI 配图）必须走它，否则又会退回"没有提示"的状态；`image-upload-indicator.test.tsx`
   就是为这条约束兜底的。
4. **插件状态与 React 完全解耦**，单测因此可以在纯 `Editor` 上跑：不需要 Testing Library、
   不受重渲染干扰，也比渲染整个编辑器组件快得多。
5. **`prefers-reduced-motion` 的降级不是可选项**。仓库此前没有任何旋转动画的降级处理
   （`globals.css` 与 `save-status.tsx` 都没有），本次至少把**新增**动画做成合规的；
   既有那处（保存状态徽标的 `animate-spin`）属于历史欠账，未在本批一并处理。
6. **没有引入新的运行时依赖**，编辑器和上传实现的引用都保持 `useMemo` 稳定，
   否则每次渲染都会重建编辑器实例（见 `tiptap-editor.tsx` 的注释）。

## 验证结果

全部为**实际执行过**的命令与真实输出（真实 Docker 栈 + `https://192.168.3.90:3000`
生产构建，本机自签名证书环境）。

| 命令 | 结果 |
|------|------|
| `npx vitest run`（apps/web） | **876 passed / 95 files**（改动前基线 856，本次 +20） |
| 新单测单独跑（两个新文件） | `anynote-image.test.ts` **11 passed**；`image-upload-indicator.test.tsx` **7 passed** |
| `npx tsc --noEmit` | 无输出（干净）。`apps/web/next.config.ts` 未设 `ignoreBuildErrors`（那是 `apps/web-legacy` 的旧配置），所以类型检查是真门禁，`pnpm typecheck` 会卡住。 |
| `npx biome check apps/web/src` | 仅剩 1 条 `noArrayIndexKey`，位于 `toolbar.tsx:314` 的 `renderSlots`。已用 `git show HEAD:...toolbar.tsx` 单独 lint 验证**该告警在改动前就存在**（HEAD 版本报同一处，行号 315），与本次无关，未顺手修改。 |
| `pnpm --filter web bundle:budget`（生产构建） | **全绿**：`/notes/[baseId]/[noteId]` 295.4 / 300 KB、`/m/notes/[baseId]/[noteId]` 243.1 / 250 KB、编辑器 chunk 13.8 / 250 KB |
| `E2E_BASE_URL=https://192.168.3.90:3000 npx playwright test e2e/notes-image-upload.spec.ts --project=chromium` | **4 passed**（含新增 2 条） |
| 同上，`--project=chromium` 全量 | **25 passed / 0 failed**（原 23 + 新增 2） |
| 同上，`--project=mobile` 全量 | **27 passed / 1 failed / 2 did not run** |
| 真实浏览器核对渲染 | 亮色 / 暗色截图确认：转圈 + 「上传中 0%」落在图片将要插入的位置；实测 `animationName = anynote-image-upload-spin`、`aria-label = 图片「screenshot-pixel.png」上传中 0%` |

### 关于两条失败用例的归因（均为既有问题，非本次引入）

本次为确认这一点做了**对照实验**：把改动 `git stash` 后按 HEAD 重建镜像、重跑同一套 E2E。

| 用例 | 现象 | 归因与证据 |
|------|------|-----------|
| `pdf-upload.spec.ts`「没选知识库时不上传」 | `expect(uploadButton).toBeDisabled()` 失败，按钮实际为 enabled | **既有 flaky，且基线同样复现**。该用例第 92 行本就用 `if (await uploadButton.isEnabled()) test.skip(...)` 承认"页面可能已自动选中知识库"，属自认的竞态；根因是 `pdf-page.tsx:50-54` 的 `useEffect` 会在 `bases` 返回后自动选中第一个知识库，与该用例"未选中"的前提赛跑。**对照实验**：改动后的镜像全量跑 2 次均失败；**stash 回 HEAD 重建镜像后跑 3 次，2 次失败**（1 次通过），证明失败与本次改动无关。另外该用例单独跑 3/3 通过，也符合竞态特征。`/ai/pdf` 页面只把 `TiptapEditor` 当 `preset="readonly"` 渲染器用，本次改动在该页面上不可达。 |
| `mobile-core.spec.ts`「输入自动保存，返回列表再进来内容还在」 | 断言收到 `about:blank` | **既有缺陷，上一批 changelist 已记录**（`2026-09-13-web-lan-origin.md` 失败归因表末行："移动端返回键 `router.back()` 在无站内历史时退到空白页，与 Origin 无关"）。单独重跑复现一致。 |

> 本批**未修**这两个既有问题：它们与图片上传提示无因果关系，混进同一个 commit 会破坏
> 提交粒度（见 README「一次 commit 只动一个 service 或一个 package」）。建议另开工单。

## 受影响但未改动的文件

| 文件 | 说明 |
|------|------|
| `README.md` | 「端到端与性能门禁」里的 E2E 用例数（22 + 29）在本次改动**之前就已过期**（实际改动前为 23 + 30，本次后为 25 + 30）。因该文件当前还带着上一批 TLS 改造的未提交改动，未在本批一并更新，避免把两批不相关的改动混进同一提交。建议与 TLS 那批一起订正。 |

## 相关文档

- [`docs/changelist/README.md`](./README.md) — 本文件的编写规范
- [`docs/minio/MINIO_PLAN.md`](../minio/MINIO_PLAN.md) §4.1 / §5 — 图片上传任务端点与前端分片直传链路的既有设计
- [`docs/refactor/FRONTEND_REFACTOR_PLAN.md`](../refactor/FRONTEND_REFACTOR_PLAN.md) 第六章 — 编辑器自定义扩展的约定
