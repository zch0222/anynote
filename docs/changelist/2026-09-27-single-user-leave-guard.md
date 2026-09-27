# 改动清单：单人保存链路的离开拦截

> 日期：2026-09-27 · 分支：`feat/collab-server-persist`（**尚未提交**，与 [`2026-09-25-collab-server-persistence.md`](./2026-09-25-collab-server-persistence.md) 同属一批未提交改动）
> 起因：真实浏览器复现了非协同模式下两条会静默丢改动的路径（离线时站内跳转、跳转时保存请求失败），本批修第一条。

## 概览

非协同模式（以及客户端保存的协同、协同降级）下，只要保存状态是**离线 / 可重试失败 / 不可重试失败 / 冲突**，
离开编辑页就会丢改动：卸载时的补发在离线或失败状态下被跳过，而站内跳转没有任何拦截。
现在这些状态下拦截站内链接、移动端返回键、「历史版本」与「移动笔记」，确认框文案是
「改动尚未保存，离开后会丢失。确定离开吗？」；服务端落库模式沿用原有的同步状态拦截。
另修掉一个随之暴露的问题：离线时确认离开后，跳转退化成整页加载，浏览器还会再弹一次自带的离开提示。

**不在本批范围**：待保存 / 保存中状态下跳走、而卸载补发恰好失败（复现的第二条路径）仍会静默丢失；
浏览器后退键、Android 返回手势（`popstate`）与命令面板等其它 `router.push` 跳转无法拦截。

### 改动面

这批文件里有 11 个本身就是上一批未提交改动的一部分，git 无法单独区分本批增量，下表只给能从 git 得出的数字：

| 类别 | 文件 | 行数（`git diff --numstat` / `wc -l`） |
|------|------|------|
| 新增 | 3 | `leave-confirmation.ts` 26、`leave-confirmation.test.ts` 29、`mobile-notes-single-user.spec.ts` 77 |
| 此前未改动、本批修改 | 3 | `mobile-screen.tsx` +7、`mobile-screen.test.tsx` +36、`note-editor-mobile.test.tsx` +60 / −1 |
| 上一批未提交改动中的文件 | 11 | 增量无法从 git 单独区分 |
| 文档 | 2 | `CLAUDE.md`、`.claude/context/frontend.md` |

### 验证结果

| 命令 / 动作 | 结果 | 备注 |
|------|------|------|
| `npx vitest run`（`apps/web` 全量） | ✅ 161 文件 / 1971 用例 | 本批新增与改写的单测先红后绿 |
| `npx tsc --noEmit`（`apps/web`，含 `e2e/`） | ✅ 0 错误 | |
| `npx @biomejs/biome check apps/web/src apps/web/e2e` | ✅ 482 文件 0 error | |
| 新增 E2E 先在**未改的镜像**上跑 | ❌ 两条都失败（桌面没有确认框；移动端只有浏览器自带的离开提示） | 证明用例能复现问题 |
| 「确认离开只弹一次」先在**只加了拦截、没修二次提示**的镜像上跑 | ❌ 多出一次 `beforeunload` | 证明用例能复现二次提示 |
| 全量 E2E，web 以**协同关闭**构建 | ⚠️ 137 passed / 5 failed / 15 skipped / 7 did not run | 失败：`collab.spec` 1 条（该组要求协同开启，7 条 did not run 同属该串行组）、`notes-image-upload` 3 条（本机 MinIO 配置没有凭据）、`ui-supplement` D-02 1 条 |
| 全量 E2E，web 以**协同开启**构建 | ⚠️ 145 passed / 4 failed / 15 skipped | 失败：`notes-image-upload` 3 条（同上）、`cli-authorize` 1 条撞 60 秒用例超时，**单独重跑 5/5 通过** |
| D-02 单独 `--repeat-each=4` | ⚠️ 3/4 通过 | 已知偶发（前几批清单均有记录），概览页与样式本批未改动 |
| 真实浏览器确认离开（桌面链接、移动端返回键，离线） | ✅ 各只弹一次确认框，随后离开 | |

E2E 用例总数 161 → **164**（桌面 117 + 移动端 47）。

---

## 一、`apps/web/src/features/notes`——拦截判据与接线

| 文件 | 状态 | 作用与原因 |
|------|------|-----------|
| `use-save-note.ts` | 修改 | 新增 `hasUnsavedRisk(status)`（离线 / 失败 / 冲突时离开会丢改动）与确认文案 `UNSAVED_LEAVE_MESSAGE`；`setStatus` 包一层同步写 `statusRef`，对外给 `getStatus()`——按钮在 `await flush()` 之后要立刻知道落盘结果，等不到重新渲染；`beforeunload` 在用户刚于站内确认过离开时不再二次拦截，但仍发起一次保存 |
| `use-note-editor-session.ts` | 修改 | 离开拦截按模式取判据：服务端落库看同步状态，其余看 `hasUnsavedRisk(save.status)`；新增 `confirmLeave()` 给按钮触发的跳转用，现取保存状态，确认离开时记下这次确认 |
| `use-leave-guard.ts` | 修改 | 站内链接确认离开时记下确认；`beforeunload` 在刚确认过时放行；编辑页卸载时清掉确认记录 |
| `leave-confirmation.ts` | 新增 | 「站内刚确认过离开」的短暂记录（5 秒窗口）。离线时站内跳转会退化成整页加载，不记录的话浏览器会紧接着再弹一次自带的离开提示 |
| `components/note-editor.tsx` | 修改 | 「历史版本」与「移动笔记」在 `flush()` 之后调用 `confirmLeave()`，落盘仍失败时先确认 |
| `components/mobile/note-editor-mobile.tsx` | 修改 | 同上，并把 `confirmLeave` 交给顶栏返回键 |
| `__tests__/use-save-note.test.tsx` | 修改 | 判据真值表；`getStatus` 在 `flush` 失败返回后立即是 `error`；刚确认离开时关页不拦截但仍保存 |
| `__tests__/use-leave-guard.test.tsx` | 修改 | 确认离开后整页卸载不再二次拦截；取消不留记录；卸载时清记录 |
| `__tests__/leave-confirmation.test.ts` | 新增 | 窗口内有效、过窗口失效、清除后失效 |
| `components/__tests__/note-editor.test.tsx` | 修改 | 保存失败时点站内链接先确认、取消留在本页、确认照常跳转、已保存时不打扰；「历史版本」落盘仍失败时先确认。顺带修正一处**用例自身的错误**：「历史版本先落盘」用例的保存响应缺 `id`，过不了 schema，那次保存一直是失败的——拦截上线后它才暴露 |
| `components/mobile/__tests__/note-editor-mobile.test.tsx` | 修改 | 保存失败时返回键先确认、已保存时照常返回、离线时「历史版本」先确认、冲突时「移动到…」先确认；保存桩补 `getStatus` |

## 二、`apps/web/src/components/layout/mobile`——返回键可被拦下

| 文件 | 状态 | 作用与原因 |
|------|------|-----------|
| `mobile-screen.tsx` | 修改 | 新增 `confirmLeave` 属性：返回前调用，返回 false 本次返回作废，对缺省语义与 `onBack` 都生效。返回键是按钮（`router.back()`），链接拦截管不到它 |
| `__tests__/mobile-screen.test.tsx` | 修改 | 取消时不返回；确认时照常返回；`onBack` 同样先经过确认 |

## 三、`apps/web/e2e`

| 文件 | 状态 | 作用与原因 |
|------|------|-----------|
| `notes-single-user.spec.ts` | 修改 | 新增 ③：离线编辑后点站内链接弹确认，取消留在本页，恢复联网后改动照常保存 |
| `mobile-notes-single-user.spec.ts` | 新增 | 移动端两条：离线时点返回键先确认、取消留在本页；确认离开只弹一次确认 |
| `support/collab-persist.ts` | 修改 | `createMobileNote`、`forceSingleUser` 从各 spec 收拢到公共工具 |
| `mobile-collab-persist.spec.ts` | 修改 | 改用公共的 `createMobileNote` |

## 四、文档

| 文件 | 状态 | 作用与原因 |
|------|------|-----------|
| `CLAUDE.md` | 修改 | E2E 用例数 161 → 164 |
| `.claude/context/frontend.md` | 修改 | 补离开拦截的判据与接线说明 |

## 审计要点

1. **`useSaveNote` 的状态写入全部改走包装后的 `setStatus`**，以便 `getStatus()` 同步可读；5 处 hook 的依赖数组补上了它（它本身稳定，不改变重建时机）。
2. **待保存 / 保存中刻意不拦截**：这两种状态靠卸载补发送出，拦截会让正常编辑后的每次跳转都弹框。代价是「跳走时补发恰好失败」仍会静默丢失，需要另修（补发失败重试或提示）。
3. **拦不到的跳转**：浏览器后退键与 Android 返回手势（`popstate` 不可取消，Next 的监听先于页面注册）、命令面板等其它 `router.push`。整页卸载仍有浏览器自带确认兜底。
4. **`leave-confirmation.ts` 是模块级状态**：5 秒窗口、编辑页卸载即清除；只影响「刚确认过离开」之后的整页卸载提示，不影响站内拦截本身。
