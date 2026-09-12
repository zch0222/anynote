# 笔记顶部一级标题同步修复

## 概览

完成工作区中尚未验收的标题同步修复：桌面与移动端在正文首个块为非空 H1、且文字发生变化时，将其纯文本作为笔记标题，与当前正文一起自动保存；目录和列表通过现有保存缓存更新。补齐初始化缺陷：TipTap 的 `setEditable` 会发送没有文档变更的 update，原接线在 H1 基线建立前误保存，导致刷新后手动标题被覆盖；现在过滤非文档事务，加载旧笔记不重命名，只改正文保留手动标题，空 H1 不清空标题。

统计范围为本批标题修复，相对当前 HEAD 的未提交差异；不包含已有的 `CLAUDE.md` MinIO 导航改动和 `docs/minio/MINIO_PLAN.md`。按 `git status --porcelain`、`git diff --stat`、`git diff --numstat` 与 `git ls-files --others --exclude-standard` 核对，新增文件另计完整行数；本批没有生成物入库。

本批共 **12 个文件：新增 6、修改 6、删除 0，+440 / -27 行**；其中代码与测试 11 个文件、+362 / -27 行，本文新增 78 行。

| 目录 | 新增 | 修改 | 删除 | 增加行 | 删除行 |
|------|------|------|------|--------|--------|
| `apps/web/src/features/notes/` | 2 | 4 | 0 | 221 | 23 |
| `apps/web/src/components/editor/` | 0 | 2 | 0 | 29 | 4 |
| `apps/web/e2e/` | 3 | 0 | 0 | 112 | 0 |
| `docs/changelist/` | 1 | 0 | 0 | 78 | 0 |

### 验证结果

命令在仓库根执行，除非另有说明；Windows 本地命令直接调用已安装的 `.CMD`，避免当前 pnpm 包装器自动重装依赖。

| 命令 / 环境 | 结果 |
|-------------|------|
| `apps/web` 下 `.\node_modules\.bin\vitest.CMD run src/features/notes/__tests__/use-note-title.test.tsx src/features/notes/components/__tests__/note-editor.test.tsx src/features/notes/components/mobile/__tests__/note-editor-mobile.test.tsx src/components/editor/__tests__/editor.test.tsx` | 4 个文件、32 条测试通过 |
| `.\node_modules\.bin\biome.CMD check`，参数为下表 11 个代码与测试文件 | 11 个文件通过，无自动修改 |
| `git diff --check` | 通过 |
| 默认入口 `localhost:3000` 的标题 E2E | 注册返回 403：与现有容器配置的公开来源不一致 |
| `E2E_BASE_URL=http://192.168.3.90:3000` 下标题 E2E 首轮 | 桌面通过；移动端标题保存与刷新通过，但返回导航断言失败，已调整为从列表进入后再验证返回 |
| `NEXT_PUBLIC_APP_URL=http://localhost:3100` 下本机 `next build` | 编译、类型检查和静态页面生成通过；standalone 打包因 Windows symlink EPERM 失败，改用 Dockerfile 构建 |
| `apps/web` 下 `.\node_modules\.bin\vitest.CMD run --maxWorkers=2` | 93 个文件、848 条测试通过；初次不限并发运行因资源争用主动中止后重跑 |
| `docker build -f infra/Dockerfile.web --build-arg NEXT_PUBLIC_APP_URL=http://localhost:3100 -t anynote-title-e2e .` | Linux 生产镜像构建通过，包含类型检查；Docker CLI 使用本机 DockerDesktop 的绝对路径调用 |
| `node apps/web/scripts/bundle-report.mjs --budget` | 本机已编译产物三项预算通过：桌面最大 295.3 KB / 300 KB、移动端 243.1 KB / 250 KB、编辑器 13.2 KB / 250 KB；Windows standalone 打包失败不影响此编译产物统计 |
| 新镜像上 `playwright.CMD test notes-title.spec.ts notes.spec.ts mobile-core.spec.ts` 两轮 | 每轮 31 通过、2 失败、2 未执行；标题用例先暴露空选区、后暴露刷新时伪 update 覆盖手动标题，均已修复；存量移动核心用例还存在返回 about:blank / 从列表进入时目标笔记不可见的问题，本批保留原文件，未宣称该扩展回归全绿 |
| `apps/web` 下 `vitest.CMD run src/components/editor/__tests__/editor.test.tsx`，新增初始化复现用例、修复前 | 1 失败、8 通过：断言初始化不应触发 onChange，实际调用 1 次，确认失败复现 |
| 过滤非文档事务后重跑首行四文件单测命令 | 4 个文件、33 条测试通过；直接关闭 setEditable 通知的中间方案曾导致 2 条工具栏测试失败，最终保留内部通知并仅过滤业务保存回调 |
| 最终版本在 `apps/web` 下 `.\node_modules\.bin\vitest.CMD run --maxWorkers=4` | 93 个文件、849 条测试通过 |
| 最终 Docker 镜像，`E2E_BASE_URL=http://localhost:3100`，`apps/web` 下 `.\node_modules\.bin\playwright.CMD test notes-title.spec.ts notes.spec.ts` | **10 条全部通过（56 秒）**：桌面标题、移动标题及桌面笔记保存/冲突/布局/代码块回归；连接真实本地后端，未 mock；验收后停止临时前端容器 |

## apps/web：笔记标题状态与保存

| 文件 | 状态 | 作用与原因 |
|------|------|------------|
| `apps/web/src/features/notes/use-note-title.ts` | 新增 | 以 ProseMirror 首块 H1 纯文本的变化驱动标题同步，并用 ref 返回本次保存所需标题，避免 React 状态尚未更新而保存旧标题。 |
| `apps/web/src/features/notes/components/note-editor.tsx` | 修改 | 桌面编辑器接入共享标题 hook 和初始化基线，将同步后的标题与当前正文作为同一份草稿保存。 |
| `apps/web/src/features/notes/components/mobile/note-editor-mobile.tsx` | 修改 | 移动端复用同一标题同步规则和保存接线，避免两端行为分叉。 |
| `apps/web/src/features/notes/__tests__/use-note-title.test.tsx` | 新增 | 覆盖标题提取、格式文本、空值、非顶部 H1、代码与引用、手动命名及切换基线，限制自动改名范围。 |
| `apps/web/src/features/notes/components/__tests__/note-editor.test.tsx` | 修改 | 断言桌面输入框立即更新且 PATCH 同时携带新标题与正文，防止只更新界面而持久化旧标题。 |
| `apps/web/src/features/notes/components/mobile/__tests__/note-editor-mobile.test.tsx` | 修改 | 断言移动端输入框与自动保存草稿中的标题一致，验证共享 hook 的移动端接线。 |

## apps/web：编辑器公共回调

| 文件 | 状态 | 作用与原因 |
|------|------|------------|
| `apps/web/src/components/editor/core/tiptap-editor.tsx` | 修改 | 回调第二参数提供当前 Editor，并过滤 setEditable 等非文档变更事务，避免初始化误保存覆盖手动标题，同时保留工具栏所需内部通知。 |
| `apps/web/src/components/editor/__tests__/editor.test.tsx` | 修改 | 断言 onChange 收到当前 Editor，且初始化与切换编辑权限均不触发保存，复现并防止刷新后手动标题被覆盖。 |

## apps/web：端到端回归

| 文件 | 状态 | 作用与原因 |
|------|------|------------|
| `apps/web/e2e/notes-title.spec.ts` | 新增 | 验证桌面 H1 连续修改、目录更新、刷新持久化及手动改名后编辑正文，覆盖真实浏览器到后端保存链路。 |
| `apps/web/e2e/mobile-notes-title.spec.ts` | 新增 | 验证移动端 H1 同步、刷新、返回列表和再次打开，并先从列表进入以建立符合返回语义的浏览历史。 |
| `apps/web/e2e/support/editor.ts` | 新增 | 建立并核对原生完整文本选区后使用真实键盘输入，避免 End 只选视觉行或布局变化留下空选区导致标题追加。 |

## docs：审计记录

| 文件 | 状态 | 作用与原因 |
|------|------|------------|
| `docs/changelist/2026-09-12-note-title-sync.md` | 新增 | 记录本批逐文件差异、标题同步边界及实际验收结果，便于独立评审。 |

## 审计要点

- 同步范围限定为正文**第一个块**的非空一级标题，后续 H1、二级标题、代码和引用不参与命名。
- 初始化只建立标题基线；手动命名后修改正文不会被原 H1 覆盖，之后修改 H1 仍会同步。
- 标题更新与正文保存使用同一事务回调中的 Editor 和即时 ref，重点核对没有陈旧 React 状态进入草稿。
- TipTap 的 update 不等同于正文修改；必须过滤 `transaction.docChanged === false`，并保留编辑器内部通知，防止初始化误改标题或工具栏缺失。
- 本批不变更 API 契约；列表更新、失败重试和版本冲突继续使用已有 `useSaveNote` 流程。
- 移动端返回按钮遵循浏览历史；E2E 必须从列表进入再测试返回，不能把新建页误认成列表。
