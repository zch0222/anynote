# 2026-11-12 笔记编辑器 UI 走查修复（E-01 ～ E-07）

对应走查报告：[`docs/ui/2026-11-11-笔记编辑器UI交互走查报告.md`](../ui/2026-11-11-笔记编辑器UI交互走查报告.md)

本次只处理报告里的 **7 项产品发现**；`B-01`（MinIO 无法解析主机名）属于环境问题，未动。

## 1. 逐项修复

| 编号 | 结论 | 落点 |
|---|---|---|
| E-01 P1 | 网关不再对 Markdown 文本字段做整包实体转义，引用块往返恢复正常 | `services/gateway` ×3 + `apps/web-legacy` 渲染边界 |
| E-02 P2 | 删掉过期的「AI 改写（M7 接入）」入口 | `apps/web/src/components/editor/core/bubble-menu.tsx` |
| E-03 P2 | 「更多格式」移出横滑区、固定在右端，滚动区加右缘渐隐 | `apps/web/src/components/editor/core/toolbar.tsx`、`apps/web/src/styles/mobile.css` |
| E-04 P2 | Slash 菜单补齐 `listbox` / `option` / `aria-selected` / `aria-activedescendant` | `apps/web/src/components/editor/core/slash-menu.tsx`、`apps/web/src/components/editor/extensions/slash-command.ts` |
| E-05 P3 | 链接编辑改应用内 Dialog / Sheet，桌面与移动共用一套校验与命令 | 新增 `apps/web/src/components/editor/core/link-editor.tsx` |
| E-06 P3 | 新建笔记的空态写作引导（只加装饰、不改文档） | 新增 `apps/web/src/components/editor/extensions/empty-body-hint.ts` |
| E-07 P3 | 只有一个知识库时整组隐藏「移动到知识库」 | `apps/web/src/features/notes/components/note-editor.tsx` |

### E-01 · 引用块刷新后退化为普通段落

**根因**：`XSSFilter` 把整个 JSON 请求体当成一段 HTML 文本，交给 `EscapeUtil.clean` 做实体转义。
`>` 变 `&gt;`（`<` 变 `&lt;`）——Markdown 的块语法全在这两个字符上，引用块保存一次就退化成
普通段落，刷新后结构再也回不来。`docs/changelist/2026-09-14-editor-title-as-h1.md` 已记过一次，
本次是同一问题的再次复现。

**改法（按字段分层，而不是按整包）**：

- 新增 `services/gateway/src/main/java/com/anynote/gateway/filter/XssBodySanitizer.java`：
  先把请求体解析成 JSON 树，**只转义非文本字段**，逐个字段判断；
  不是合法 JSON、或一个字段都不需要改写时**一个字节都不动**（返回 `null`，过滤器原样透传）。
- `XssProperties` 新增 `textFields`，默认 `content` / `title`（笔记正文与标题都是 Markdown 文本）；
  `infra/docker/nacos/configs/anynote-gateway-dev.yml` 里同步登记，便于按服务追加。
- `XSSFilter` 用上面的 sanitizer 取代 `EscapeUtil.clean(bodyStr)`，其余分支（开关、GET/DELETE、
  非 JSON、`excludeUrls`）行为不变。

**渲染边界配套（安全面没有变松）**：`content` 不再被服务端转义后，「正文里可能带尖括号」这件事
必须在**真正把内容插进 HTML 的地方**自己兜住。全仓只有 legacy 前端的搜索下拉框用
`dangerouslySetInnerHTML` 渲染标题 / 正文高亮片段，因此：

- 新增 `apps/web-legacy/src/lib/safeHighlightHtml.ts`：先整体转义，再把 ES 高亮标签
  （`<em>` / `<mark>`）还原——顺序反了会把用户输入的 `&lt;em&gt;` 当标签执行。
- `apps/web-legacy/src/components/dashboard/SearchNoteInput/index.tsx` 改用该函数。

新前端不使用 `dangerouslySetInnerHTML`，正文经 ProseMirror schema 渲染，不存在这条路径。

**测试**：`XssBodySanitizerTest`（5 条）+ `XSSFilterTest`（6 条，从过滤器入口验证
`> 引用文字` 原样到达下游、非文本字段照旧转义、四条跳过分支）。
端到端：`apps/web/e2e/notes-editor-audit.spec.ts` 的「引用块与 `<` `&` 保存—刷新后保持原样」。

### E-02 · 过期的「AI 改写」入口

直接移除气泡菜单里的 `Sparkles` 按钮及其 `toast.info("AI 改写将在 M7 接入")`。
理由：当前里程碑资料已标记 M7 完成，而 Slash 菜单里的「AI 续写」是真实可用的——两者并存时，
用户会以为改写也可以点，还被迫看到内部迭代编号。若后续真要支持改写，再按新契约加入口。

### E-03 · 360px 下「更多格式」被裁切

**改法**：把工具栏拆成「横滑区 + 固定区」两层——
`renderSlots(MOBILE_PRIMARY, …)` 进入 `.anynote-toolbar__scroll`（只有它 `overflow-x: auto`），
「更多格式」触发器进 `.anynote-toolbar__more`（`flex-shrink: 0`、1px 左分隔线、不透明底色）。

滚动区加右缘蒙版渐隐（`mask-image`）作为「还能横滑」的提示，替代原来「没有任何提示」。
`mobile.css` 里工具条本身不再 `overflow-x: auto`，否则固定区会跟着一起滚走。

**测试**：`mobile-toolbar.test.tsx` 断言「更多」不在滚动区里、常驻命令一个不少；
`styles/__tests__/editor-styles.test.ts` 断言滚动区 `overflow-x: auto` + `mask-image`、
固定区 `flex-shrink: 0` + 分隔线、工具条本体不再横滑。
端到端：`apps/web/e2e/mobile-toolbar-overflow.spec.ts` 在 320 / 360 / 375 / 393 下量几何。

### E-04 · Slash 菜单缺少激活项语义

**改法**：
- `slash-menu.tsx`：容器 → `role="listbox"` + `aria-label="插入命令"` + 稳定 `id`；
  选项 → `role="option"` + 稳定 `id` + `aria-selected`；空态换成 `<output aria-live="polite">`。
- 新增 `onActiveOptionChange` 回调：激活项变化时回传选项 id。
- `slash-command.ts`：`onStart` 给编辑器挂 `aria-controls` / `aria-haspopup`，
  `onUpdate` 同步 `aria-activedescendant`，`onExit` 清理——焦点始终留在正文里。
- 选项的点击用 `onMouseDown` + `preventDefault` 阻止焦点转移（命令仍在 `onClick` 里执行）。

**说明**：这是 ARIA 1.2 的「组合框 + 浮层」模式，listbox / option 不进 Tab 序列。
Biome 的 `useSemanticElements` 在这里是误报（它建议换原生 `select` / `option`，而原生控件无法
维持「焦点在编辑器、激活项靠 `aria-activedescendant`」），因此在 `biome.json` 里对该文件单独关闭这一条，
理由写在文件头注释里。

**测试**：`slash-menu-a11y.test.tsx`（4 条：listbox/option 语义、方向键改 `aria-selected` 并回传 id、
Enter 执行、空态可播报并清空激活项）。

### E-05 · 链接编辑用原生 prompt

**改法**：新增 `link-editor.tsx`，两端共用同一份实现：

- `resolveLinkInput()`：空串 = 移除链接；`#` / `/` 开头原样接受；`http(s)` / `mailto` / `tel`
  要求完整形状；裸域名自动补 `https://`；`javascript:` / `data:` 等协议与带空格地址一律拒绝。
- `applyLinkHref()`：桌面与移动共用一条 `setLink` / `unsetLink` 路径，杜绝再次漂移。
- `LinkEditor`：桌面 `Dialog`、移动端底部 `Sheet`，含行内校验、`移除链接`、取消。

`bubble-menu.tsx` 与 `toolbar.tsx` 都改成打开这个弹层。气泡菜单的弹层**挂在 BubbleMenu 之外**
——气泡菜单在编辑器失焦时会收起，放进子节点会被一起卸载。

**测试**：`link-editor.test.tsx`（9 条：解析口径、命令分支、非法地址不执行、移除链接、
移动端 Sheet、宿主开合）。

### E-06 · 新建笔记没有空态引导

**根因**：笔记标题就是正文首节点 H1，新建笔记在文档层只有一个 `heading` 节点；
`@tiptap/extension-placeholder` 只覆盖「整篇为空」与「空段落」两种情形。

**改法**：新增 `EmptyBodyHint` 扩展：当文档恰好只有一个 H1 时，在它后面挂一个
**widget decoration**（`.anynote-empty-body-hint`，`pointer-events: none`）。
它只影响绘制——不进 Markdown、不触发保存、不产生「打开笔记就多一个空行」的差异，
用户一敲字就消失。样式在 `tiptap.css`，注册进 `full` 预设（`collaborative` 复用 `full`）。

**测试**：`empty-body-hint.test.tsx`（4 条：空态出现、装饰不改文档与 Markdown、有正文时不出现、
它挂在 contenteditable 内部不挡点击）。

### E-07 · 单知识库时出现空的「移动到知识库」分组

**改法**：`note-editor.tsx` 先算出 `movableBases`（排掉当前知识库），
为空时整组（标签 + 列表 + 尾随分隔线）都不渲染；只有一个分隔线留在「历史版本」与「删除笔记」之间。

**测试**：`note-editor.test.tsx` 新增 2 条（单知识库时菜单只剩两项、多知识库时出现分组并列出目标、
当前知识库不出现在列表里）。

## 2. 测试与其它改动

- `XSSFilterTest` 里的 `MockServerHttpRequest` 用法跟随本仓 `AuthFilterTest` 的口径
  （`post(path).contentType(...).body(...)` 直接返回请求对象，`get(path)` 需要 `.build()`）。
- `apps/web/vitest.setup.ts`：给 jsdom 补 `Element.prototype.scrollIntoView` 桩。
  该类函数 jsdom 未实现，任何渲染「选中项滚动到可视区」组件的用例都会直接抛
  `scrollIntoView is not a function`——这是环境缺口，不是被测代码的问题。
- `apps/web/e2e/notes-image-upload.spec.ts`：Slash 菜单项从 `button` 变成 `option`，
  用例的角色查询同步改为 `getByRole("option")`。
- `apps/web/e2e/mobile-core.spec.ts`：工具条的几何断言跟着结构一起改——原来断言
  工具条自身 `overflowX: auto` 且所有按钮右缘都在宽度内，现在改为「工具条本身不滚、
  `.anynote-toolbar__scroll` 才滚、「更多格式」整块落在可视区内」。

还有一处**既有配置问题**（本次未改，仅记录）：`anynote-gateway-dev.yml` 的
`security.xss.excludeUrls: - /system/notice` 匹配的是完整请求路径，而实际路径是
`/api/system/notice`，因此这条排除规则从来没有生效过。新口径下系统公告这类富文本字段
更适合加进 `textFields`，需要时按服务确认后再改。

## 3. 验证命令

```bash
# 网关：Markdown 文本字段不再被转义（11 条：5 + 6）
# 注意 surefire 的 -Dtest 用逗号分隔类名，写成 A+B 会一条都不匹配
cd services && mvn -B test -pl gateway -am \
  '-Dtest=XSSFilterTest,XssBodySanitizerTest' '-Dsurefire.failIfNoSpecifiedTests=false'

# 前端：编辑器 / 笔记页 / 样式门禁（15 个文件 188 条）
cd apps/web && pnpm exec vitest run src/components/editor src/styles \
  src/features/notes/components/__tests__/note-editor.test.tsx

# 全仓 lint（含新增 / 改动的 20 个文件）
pnpm exec biome check apps/web/src apps/web/e2e apps/web/vitest.setup.ts biome.json
```

## 4. 未完成 / 遗留

1. **B-01 环境阻塞不在本次范围**：图片上传成功链路仍需恢复 MinIO 与 `minio` 内网解析后复跑
   `e2e/notes-image-upload.spec.ts`（4 条）。
2. **新增 Playwright 用例尚未在本机跑过**：`notes-editor-audit.spec.ts` 与
   `mobile-toolbar-overflow.spec.ts` 需要生产构建 + 真实全栈，本次只做静态编写与 Biome 检查。
3. **网关口径变更需安全评审**：`security.xss.textFields` 把 `content` / `title` 放行为「原样入库」，
   请评审确认「渲染边界转义」这套口径（新前端走 ProseMirror，legacy 搜索高亮已补转义）；
   若其它服务还有把正文塞进 HTML 的路径，应同样在渲染边界补转义，而不是回退到整包转义。

## 5. 验证记录

本次实际执行结果（2026-11-12，本机）：

| 检查 | 结果 |
|---|---|
| `mvn -B test -pl gateway -am '-Dtest=XSSFilterTest,XssBodySanitizerTest' …` | **BUILD SUCCESS**，`Tests run: 5`（XssBodySanitizerTest）+ `Tests run: 6`（XSSFilterTest），合计 11 条、0 失败 |
| `pnpm exec vitest run src/components/editor src/styles src/features/notes/components/__tests__/note-editor.test.tsx` | **15 个文件 / 188 条全绿** |
| `pnpm exec biome check apps/web/src apps/web/e2e apps/web/vitest.setup.ts biome.json` | **495 个文件，0 error**（自动修复了 5 个文件的导入顺序 / 换行） |
| `pnpm exec tsc --noEmit`（apps/web） | 仅 3 条**既有**错误，均与本次改动无关：`use-profile.ts` / `use-task-detail.ts` / `lib/auth/profile.ts` 引用的是尚未重新生成的 `packages/api-client` 类型（该目录 gitignored，需后端运行时跑 `pnpm openapi:generate`） |
| `pnpm exec vitest run`（apps/web 全量） | **2020 / 2023 通过**；2–3 条失败全部落在 `src/features/tasks/components/__tests__`（`date-time-field`、`task-form-page`），两次全量运行的失败集合都不一样，且**单独跑该目录 7 个文件全绿**——判断为全量并行下的计时抖动，与本次改动无关（该模块本次未改动）。 |

未执行（条件不具备，明确不声称通过）：

- `pnpm --filter web test:e2e`：需要生产构建 + 真实全栈；本次新增的两条 Playwright 用例未跑过。
- `surefire` 之外的 Java 全量测试、`bundle:budget`、`lighthouse:budget`。
- `e2e/notes-image-upload.spec.ts`（B-01 环境阻塞）。
