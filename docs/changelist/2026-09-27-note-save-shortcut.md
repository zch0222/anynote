# 改动清单：笔记编辑器 Cmd / Ctrl + S 保存

> 日期：2026-09-27 · 分支：`dev`
> 起因：新前端（`apps/web`）笔记编辑页按 Cmd / Ctrl + S 弹出的是浏览器的「网页另存为」，笔记本身没有保存——
> 编辑页从来没有拦过这个快捷键，TipTap 扩展里也没有绑定 `Mod-s`。

## 概览

笔记编辑页（桌面 `/notes/[baseId]/[noteId]` 与移动端 `/m/notes/[baseId]/[noteId]`）挂载期间，
Cmd / Ctrl + S 被拦下，改为立即保存：

| 保存模式 | 按下后的行为 |
|------|------|
| 单人 / 客户端保存的协同 / 协同降级 | 跳过 1.5 秒（协同 3 秒）防抖，立即 `flush()`；没有改动时不发请求 |
| 不可重试的失败（`failed`） | 等同失败提示条上的「重试」：解除停摆后再保存 |
| 冲突未解决 | 不发请求，照旧等用户在冲突对话框里选择 |
| 服务端落库（`COLLAB_SERVER_PERSIST`） | 只拦下浏览器的默认动作，不发请求（正文由协同服务写库） |

保存结果沿用顶栏的保存徽标（保存中 → 已保存 / 失败 / 离线），不另弹提示。

**不在本批范围**：任务详情 / 任务表单、慕课详情等其它用到 `TiptapEditor` 的页面没有接这个快捷键。

### 改动面

| 类别 | 文件 | 行数（`git diff --numstat` / `wc -l`） |
|------|------|------|
| 新增 | 2 | `use-save-shortcut.ts` 35、`use-save-shortcut.test.tsx` 99 |
| 修改（代码） | 1 | `use-note-editor-session.ts` +15 |
| 修改（测试） | 4 | `note-editor.test.tsx` +89、`note-editor-mobile.test.tsx` +42、`note-editor-collab.test.tsx` +26、`e2e/notes-single-user.spec.ts` +33 |
| 修改（文档） | 2 | `CLAUDE.md` +1 / −1、`.claude/context/frontend.md` +3 |

### 验证结果

| 命令 / 动作 | 结果 | 备注 |
|------|------|------|
| 新增单测先在**未改的代码**上跑 | ❌ 6 条失败 + 1 个文件无法解析 | 桌面 3 条、移动端 2 条、服务端落库 1 条均因「默认动作未被拦下 / 没有立即保存」失败；`use-save-shortcut.test.tsx` 因被测文件不存在而无法导入。证明用例能复现问题 |
| `npx vitest run src/features/notes`（`apps/web`） | ✅ 36 文件 / 381 用例 | 修复后 |
| `npx vitest run`（`apps/web` 全量） | ✅ 162 文件 / 1988 用例 | |
| `npx tsc --noEmit`（`apps/web`，含 `e2e/`） | ✅ 0 错误 | |
| `npx @biomejs/biome check apps/web/src` 与 `apps/web/e2e/notes-single-user.spec.ts` | ✅ 0 error | |
| 重建 `anynote-web` 容器（协同关闭）后跑 `e2e/notes-single-user.spec.ts` | ✅ 4 passed | 含新增 ④：真实 Chromium 下按键后 1 秒内（短于 1.5 秒防抖）发出 PATCH，且默认动作已被拦下 |
| 同一构建跑 `notes.spec.ts`、`notes-title.spec.ts`、`mobile-notes-single-user.spec.ts`、`mobile-notes-title.spec.ts` | ✅ 14 passed | 笔记相关回归 |
| `playwright test --list` | 165 条（chromium 118） | E2E 用例数 164 → **165** |

**未做**：新增 E2E ④ 没有在未改代码的镜像上跑过（复现靠上面的单测）；全量 E2E 没有跑。

---

## 一、`apps/web/src/features/notes`——快捷键与接线

| 文件 | 状态 | 作用与原因 |
|------|------|-----------|
| `use-save-shortcut.ts` | 新增 | Cmd / Ctrl + S 拦下浏览器默认动作并调用回调。不复用 `useHotkey`：后者对长按连发不拦截（连发事件照样弹另存为），且在冒泡阶段监听（内层组件阻止冒泡就失效）；这里改为连发也拦、只存一次，并在 window 捕获阶段监听 |
| `use-note-editor-session.ts` | 修改 | 新增 `saveNow`：服务端落库时不发请求；`failed` 时走 `retry()`（`flush()` 在停摆时是空操作）；其余走 `flush()`。桌面与移动端共用这份会话，所以两端同时生效 |
| `__tests__/use-save-shortcut.test.tsx` | 新增 | Cmd 与 Ctrl 都生效、大写锁定生效、连发只拦不重复保存、Shift / Alt / 其它键不拦、内层阻止冒泡照样拦下、用最新回调、卸载后不再拦截 |
| `components/__tests__/note-editor.test.tsx` | 修改 | 有改动时 1 秒内（短于防抖）发出 PATCH 并拦下默认动作；无改动时拦截但不发请求；不可重试失败后等同「重试」；卸载后不再拦截 |
| `components/__tests__/note-editor-collab.test.tsx` | 修改 | 服务端落库模式下按快捷键只拦截、不发 PATCH |
| `components/mobile/__tests__/note-editor-mobile.test.tsx` | 修改 | 移动端接线：按快捷键调用 `flush`；`failed` 时调用 `retry` 而不是 `flush`。保存桩补 `retry` |

## 二、`apps/web/e2e`

| 文件 | 状态 | 作用与原因 |
|------|------|-----------|
| `notes-single-user.spec.ts` | 修改 | 新增 ④：输入后立刻按 `ControlOrMeta+s`，1 秒内等到 PATCH、页面冒泡阶段读到 `defaultPrevented === true`、库里正文包含刚输入的内容。原生另存为对话框 Playwright 观察不到，只能以默认动作是否被拦下为判据 |

## 三、文档

| 文件 | 状态 | 作用与原因 |
|------|------|-----------|
| `CLAUDE.md` | 修改 | E2E 用例数 164 → 165（桌面 117 → 118） |
| `.claude/context/frontend.md` | 修改 | 在离开拦截之后补一条快捷键保存的行为与接线说明 |

## 审计要点

1. **捕获阶段 + 无条件 `preventDefault`**：编辑页挂载期间，页面上任何位置（包括打开的对话框、菜单里）按 Cmd / Ctrl + S 都会被拦下，不再有「网页另存为」。这是有意的：编辑页上这个快捷键只有「保存笔记」一种含义。
2. **`failed` 时走 `retry()` 而不是 `flush()`**：`useSaveNote` 在不可重试失败后会停摆，`flush()` 此时是空操作；用户主动按保存等同点「重试」。若失败原因仍在（如登录过期），会再次回到 `failed`，与点按钮一致。
3. **服务端落库模式只拦截不保存**：编辑页在该模式下没有保存请求可发，写库时机由协同服务决定；同步状态看 `CollabSyncBadge`。
4. **按 `event.key` 匹配**：与 `useHotkey` 一致。非拉丁键盘布局（如俄文）下 Ctrl + S 的 `key` 不是 `s`，不会被拦下。
