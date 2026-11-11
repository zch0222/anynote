# 桌面客户端与知识库 Git 模块：里程碑

> 文档版本：v0.1 | 创建 2026-10-01 | 状态：**未开工**（等 [README](./README.md#待拍板的决策) 里的 D1–D11 拍板）
> 方案：[DESKTOP_PLAN.md](./DESKTOP_PLAN.md) · [GIT_MODULE_PLAN.md](./GIT_MODULE_PLAN.md)

编号接在 M14（协同落库）之后，本系列为 **M15**。分支按里程碑从 `dev` 切出（`feat/desktop-*`、`feat/editor-fidelity` 等），
完成后 `--no-ff` 合并回 `dev`。每个里程碑都要满足 `CLAUDE.md` 的测试要求：没有单测的改动不算完成。

## 依赖关系

```
M15.0 拍板与技术验证
  ├── M15.1 编辑器保真（editor-core）──────────────┬──► M15.4 本地仓库与 Typora 式编辑 ──┐
  ├── M15.2 抽包（editor-ui / native-auth）─► M15.3 桌面壳与云端知识库 ─┤                  │
  │                                                                  └──► M15.5 Git 基础 ─┤
  └── M15.6 Git 模块：后端与网页 Tab ──────────────────────────────────────────────────────┴──► M15.7 同步引擎 ──► M15.8 打包、发布与退役
```

- M15.1 不依赖桌面端，可以最先做，web 直接受益。
- M15.6 不依赖桌面端，可以和 M15.3–M15.5 并行。
- M15.7 的「双向」部分必须等 M15.1 完成（D5、D8）。

## 粗估工期

单人全职、熟悉本仓库的粗估，只用于排期参考：

| 里程碑 | 人日 |
|------|------|
| M15.0 拍板与技术验证 | 3–4 |
| M15.1 编辑器保真 | 6–8（L2 另计 3–4） |
| M15.2 抽包 | 3–4 |
| M15.3 桌面壳与云端知识库 | 8–10 |
| M15.4 本地仓库与 Typora 式编辑 | 6–8 |
| M15.5 Git 基础 | 5–6 |
| M15.6 Git 模块：后端与网页 Tab | 5–6 |
| M15.7 同步引擎 | 10–14 |
| M15.8 打包、发布与退役 | 4–5 |
| **合计** | **约 50–65 人日** |

---

## M15.0 拍板与技术验证

**目标**：拍板决策，并用最小代码验证四个关键假设。

- [ ] README 的 D1–D11 拍板，结果回写 README 与本文
- [ ] Electron 最小骨架：`app://` 加载界面；在 CSP `connect-src 'none'` 下经 IPC 代理拉通 `GET /api/system/user/mine`
- [ ] 复用 `/cli/authorize` 完成一次桌面端登录（暂用 CLI 文案）
- [ ] git 验证：克隆、提交、推送到临时 bare 仓库；porcelain v2 解析中文与空格路径
- [ ] 保真原型（L1）跑仓库自己的 `docs/**/*.md` 与 `README.md`，记录对不齐的块及原因
- [ ] 构建方案选型：Vite + tsup，还是 electron-vite

**验收**：结论写进本文「验收记录」；验证代码不合并进 `dev`（或只合并文档）。

## M15.1 编辑器保真（`packages/editor-core`）

**目标**：保存不改动没碰过的内容；front matter、HTML、脚注不再被破坏。

- [ ] L1：`createSourceBaseline` / `getMarkdownPreserving`；剔除 TrailingNode 补的空段落；对不齐时整篇退回普通序列化
- [ ] 语料门禁：`fixtures/` + `docs/**/*.md` + `README.md`——打开即保存逐字节一致；改一个词只差一行；撤销后一致
- [ ] L3：front matter、原始 HTML（块级与行内，只显示源码）、脚注节点；递增 `EDITOR_SCHEMA_VERSION` 并登记 `schema-lock.json`
- [ ] `deriveTitle`；`leadingHeadingOf` 跳过 front matter
- [ ] `local` 预设：去掉 `Typography`、`TextAlign`，关闭补 H1
- [ ] web 的保存链路切到保真保存；`apps/collab` 回归
- [ ] L2（列表符号、强调符号、围栏、Setext、表格对齐、段内折行），可以拆成 M15.1b 单独交付

**验收**：

```bash
pnpm --filter @anynote/editor-core test
pnpm --filter web test
pnpm --filter @anynote/collab test
```

全部通过，语料门禁 0 差异；在网页端打开并保存 10 篇现有笔记，`n_note_text.content` 不变。

## M15.2 抽包

**目标**：web 与桌面共用编辑器界面，CLI 与桌面共用登录。

- [ ] `packages/editor-ui`：迁入 `apps/web/src/components/editor/**`（协同预设留在 web）；`cn`、katex、shiki 加载器随迁；
      移动端工具条用到的 `Sheet` 改为注入
- [ ] web 改为依赖 `@anynote/editor-ui`；Tailwind 扫描包的源码
- [ ] `packages/native-auth`：迁入 `pkce.ts`、`loopback.ts`、`browser-login.ts`（错误类型与「打开浏览器」改为注入）；CLI 改为依赖它
- [ ] 版本号换算、冲突判定等纯函数下沉到 `@anynote/api-core`
- [ ] `pnpm install --lockfile-only` 同步 lockfile

**验收**：web 与 CLI 的单测、E2E 结果与抽包前一致；`pnpm --filter web bundle:budget` 通过。

## M15.3 桌面壳与云端知识库

**目标**：能登录、能管理知识库、能编辑和保存云端笔记。

- [ ] 删除 Tauri 骨架，`apps/desktop` 改为 Electron（目录见 DESKTOP_PLAN §5）
- [ ] 安全基线：沙箱、CSP、导航拦截、IPC 发送方校验与 zod 参数校验（各自有单测）
- [ ] 登录：native-auth + `safeStorage` + 单飞刷新；授权页按 `client=desktop` 切换文案（web 小改）
- [ ] 服务器地址设置与 `settings.check`
- [ ] 网关代理与白名单；`anynote-asset://server/{fileId}` 与本地缓存
- [ ] 知识库：列表、新建、改名、删除
- [ ] 笔记：列表、新建、编辑、自动保存、A0409 冲突、改名、移动、删除；图片上传
- [ ] 退出前刷盘
- [ ] 设计：补齐桌面端画板，或明确「按 web 现有风格」

**验收**：单测全绿；手工清单（登录、断网再恢复、A0409 冲突、图片显示与上传、退出时有未保存改动）；Playwright 驱动 Electron 的冒烟用例 3 条。

## M15.4 本地仓库与 Typora 式编辑

**目标**：像 Typora 一样编辑本地 Markdown，保存不重排。

- [ ] 工作区注册表、工作区信任、路径守卫（含 Windows 盘符、UNC 路径、符号链接用例）
- [ ] 文件树；新建、重命名、移动、删除到回收站
- [ ] 打开与原子保存（BOM、CRLF、期望值校验）；外部修改监听与提示
- [ ] 图片粘贴到 `assets/`；`anynote-asset://local/…`
- [ ] Typora 第一档显示（光标处显示标记）；源码模式（CodeMirror 6 按需加载）
- [ ] 外部图片开关与 `anynote-asset://remote/…`

**验收**：把仓库自己的 `docs/` 当工作区打开，随意打开并保存 10 篇，`git status` 干净；改一个词，`git diff` 只有一行。

## M15.5 Git 基础

**目标**：在桌面端完成日常的 Git 操作。

- [ ] runner：不经 shell、`--` 分隔、传输白名单、超时；版本检测与安装引导
- [ ] status、diff、stage、commit、fetch、pull、push、clone、log、branch、switch
- [ ] 合并冲突列表与冲突视图
- [ ] 凭据：Git Credential Manager / ssh-agent 的引导；`GIT_AUTH` 错误路径
- [ ] 状态栏与 Git 面板

**验收**：真实 git + 临时 bare 仓库的集成测试全绿（不出网，进默认单测）；手工用 GitHub 私有仓库各走一次 HTTPS 与 SSH 推送。

## M15.6 Git 模块：后端与网页 Tab

**目标**：服务端能保存绑定、映射与游标；网页端能查看和管理绑定。

- [ ] OpenSpec 提案三份（GIT_MODULE_PLAN §11）
- [ ] 迁移 SQL，并同步 `infra/sql/anynote.sql`
- [ ] `KnowledgeBaseGitController` / Service：权限、URL 校验、`reset`、同步者接管、快照、游标事务；JUnit 单测（`MockitoExtension`）
- [ ] `GET /notes/{id}` 加 `gitPath`；`NoteCreateDTO.title` 放宽到 1–80
- [ ] 删除知识库时连带清理
- [ ] `pnpm openapi:generate`，提交 baseline
- [ ] web：`/notes/[baseId]/git` Tab；编辑器页头的 Git 标签；补 H1 与只读逻辑

**验收**：

```bash
cd services && mvn test -pl note
pnpm openapi:check
pnpm --filter web test
```

全部通过；Tab 页面在真实浏览器里实拍核对（没有画板时请设计确认）。

## M15.7 同步引擎

**目标**：知识库与仓库可靠地双向同步。分三步交付：

- [ ] **M15.7a 仅导出**：`plan()`、执行器、预览；首次同步、增量同步、推送被拒重试、游标 A0409
- [ ] **M15.7b 仅导入**：新文件建笔记、修改导入、图片上传、改名跟踪
- [ ] **M15.7c 双向**（依赖 M15.1）：三方合并、冲突项与冲突界面、删除确认与阈值、内容相同配对
- [ ] 崩溃注入测试：在执行器每一步注入失败，验证都能恢复
- [ ] 绑定流程：桌面端绑定远程仓库（克隆到本机）或本机已有仓库；换一台电脑时克隆
- [ ] 可选定时同步

**验收**：判定表单测覆盖每一格；集成测试（真实 git + bare 仓库 + API 打桩）全绿；端到端完整往返一条（需要真实后端栈）；
用仓库自己的 `docs/` 做一次真实的双向同步，提交的 diff 里只有预期改动。

## M15.8 打包、发布与退役

**目标**：可以分发给用户；旧的桌面链路全部清理。

- [ ] electron-builder：Windows NSIS（签名取决于证书采购）；macOS 与 Linux 按 D11
- [ ] 自动更新（generic 源 + 签名校验）
- [ ] CI 新增 `desktop` job
- [ ] 退役：Tauri、`/api/auth/exchange`、`bridge.ts`、`DESKTOP_EXCHANGE_KEY` 全链路（清单见 DESKTOP_PLAN §8），附 OpenSpec 提案
- [ ] 同步 `CLAUDE.md`、`README.md`、`.claude/context/frontend.md`、`apps/desktop/README.md`
- [ ] 改动清单 `docs/changelist/YYYY-MM-DD-desktop-client.md`

**验收**：在一台干净的 Windows 机器上：安装 → 登录 → 编辑云端笔记 → 编辑本地仓库并提交推送 → Git 知识库双向同步 → 卸载干净。

---

## 验收记录

（待填）

## 与方案的偏差

（待填）
