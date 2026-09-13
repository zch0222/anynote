# `@anynote/cli`

Anynote 的命令行前端，供人在终端、以及 Claude Code / Codex / dsh 等 agent 操作知识库与笔记。
直连 Gateway（不经 Next BFF），输出 JSON 信封 + 固定退出码。

- 方案与里程碑：[`docs/cli/CLI_PLAN.md`](../../docs/cli/CLI_PLAN.md) · [`docs/cli/CLI_MILESTONES.md`](../../docs/cli/CLI_MILESTONES.md)
- 命令速查（生成物）：[`docs/cli/COMMANDS.md`](../../docs/cli/COMMANDS.md)
- Skills 源文：`.claude/skills/anynote-cli` / `anynote-notes` / `anynote-dev`（`anynote-dev` 只服务本仓库，不随 CLI 分发）

## 安装（全局，独立于项目目录）

推荐路径：**打包成 tarball → `npm install -g`**，效果与安装一个已发布的包相同。
装完之后 CLI 被复制到全局 `node_modules`，与仓库、与当前工作目录都无关，删掉仓库照常运行。

```bash
pnpm --filter @anynote/cli build         # 产出单文件 dist/anynote.mjs（已内联全部依赖与 skill）
pnpm --filter @anynote/cli pack:global   # 产出 dist/anynote-cli-<版本>.tgz
npm install -g apps/cli/dist/anynote-cli-<版本>.tgz

anynote doctor                           # installMode 应为 "global"、selfContained 为 true
anynote skill install                    # 把 skill 装到各 agent 的全局目录
```

⚠️ **不要用 `npm install -g apps/cli` 或 `npm link`**：npm 对本地目录参数会建 junction / symlink
指回仓库（Windows 上实测是 Junction，`LinkType=Junction`、`Target` 指向源目录），**仓库一删就断链**。
`npm pack` 出的 tarball 走解包复制，实测全局包是普通目录（`LinkType` 为空），删掉源目录后照常运行。

升级就是重跑 `build` → `pack:global` → `install -g`，再 `anynote skill install` 刷新 skill；
卸载 `anynote skill uninstall --yes && npm uninstall -g @anynote/cli`。

### 开发期直接跑构建产物

改 CLI 源码时不必每次都全局安装，可以直接跑 `dist/anynote.mjs`：

```bash
node apps/cli/dist/anynote.mjs --help
node apps/cli/dist/anynote.mjs doctor
```

⚠️ 这种用法**依赖当前目录**（必须在仓库里跑），只适合开发调试。
`doctor` 会把这种形态报成 `installMode: "repo"`、`selfContained: false`，以便和全局安装区分开。
**给 agent 或日常使用请一律走上面的全局安装**，不要让 skill 里出现相对路径。

产物本身是自包含单文件，可以脱离 pnpm workspace 拷到别处直接 `node anynote.mjs` 运行。

## 一键安装 skill（Claude Code / Codex / dsh）

```bash
anynote skill install             # 装到三家全局目录（默认）
anynote skill install --agent=claude --agent=dsh
anynote skill list                # 看装没装、版本对不对
anynote skill uninstall --yes     # 卸载（只删本 CLI 装的）
```

两种范围（互不影响，`skill list` / `skill uninstall` 也认 `--local`）：

| agent | 全局根目录 | 项目级根目录 | 覆盖方式 |
|-------|-----------|-------------|---------|
| Claude Code | `~/.claude/skills` | `<项目根>/.claude/skills` | `CLAUDE_CONFIG_DIR`（仅全局） |
| Codex | `$CODEX_HOME/skills`（默认 `~/.codex/skills`） | `<项目根>/.agents/skills` | `CODEX_HOME`（仅全局） |
| dsh | `$DSH_HOME/skills`（默认 `~/.dsh/skills`） | `<项目根>/.dsh/skills` | `DSH_HOME`（仅全局） |

**项目根** = 从当前目录向上**最近的含 `.git` 的目录**（与 dsh 判定项目根的规则一致——
两边算出不同的根就会出现"装了但 agent 看不见"）。全局安装适合"任何目录下都想用"。

三条设计约束（变更前先读 [`2026-09-13-cli-skill-install.md`](../../.claude/openspec/changes/2026-09-13-cli-skill-install.md)）：

1. **复制，不是符号链接**。CLI 可能装在 nvm 的全局包里，软链一旦源被清理就是断链；
   Windows 上创建符号链接还需要开发者模式或管理员权限。
2. **skill 打包进 CLI**，所以装出来的版本与当前 CLI 一定匹配。`SKILL.md` 里会写一行
   `<!-- anynote-cli-version: x.y.z -->`，CLI 升级后重跑一次 `skill install` 即完成升级，
   `skill list` / `doctor` 会报出版本漂移。
3. **不动用户自己的 skill**。卸载只删带版本戳的目录；安装遇到同名但没有版本戳的
   （用户手写）会跳过该 agent 并说明原因，要覆盖必须显式 `--force`。
   另外**本仓库自己的 skill 源文**（`.claude/skills/**`，即 `src/bundled.ts` 的输入）
   永远不可被安装副本覆盖，且这条**不受 `--force` 影响**：在本仓库跑 `--local` 会把它列进
   `skipped`（预期行为，不是失败），本仓库请用全局安装或 `--agent=dsh --agent=codex`。

> `doctor` 会**同时**报告全局与项目级两组状态（各 3 行）——只报一边会让用 `--local` 装过的
> 人误以为没装。

## 快速上手

```bash
# 登录（口令从 stdin 读，避免进 shell history）
echo -n "你的口令" | anynote auth login --username alice --password-stdin
anynote auth whoami

# 网关地址配一次就够（写入 <configDir>/settings.json，之后所有命令复用）
anynote config set api-url http://192.168.3.90:8080
anynote config get       # 看生效值与来源：env / file / default

# 知识库
anynote base create --name "我的知识库" --yes
anynote base list --fields id,knowledgeBaseName
# 知识库
anynote base create --name "我的知识库" --yes
anynote base list --fields id,knowledgeBaseName
anynote base update 70 --name "改个名" --yes
anynote base rm 70 --yes

# 笔记：正文就是 Markdown
ID=$(anynote note create --base 70 --title "会议纪要" --yes | node -p "JSON.parse(require('fs').readFileSync(0)).data.id")
anynote note get "$ID" --out note.md
anynote note set "$ID" --file note.md --version "$(anynote note get "$ID" --json | node -p "JSON.parse(require('fs').readFileSync(0)).data.version")" --yes
anynote note rm "$ID" --yes
```

## 环境变量

| 变量 | 默认 | 说明 |
|------|------|------|
| `ANYNOTE_API_URL` | `http://localhost:8080` | Gateway 地址，**优先级高于设置文件** |
| `ANYNOTE_TOKEN` | — | 直接提供 accessToken，**不落盘、不刷新**，过期即退出码 3 |
| `ANYNOTE_PROFILE` | `default` | 凭据 profile，等价于 `--profile` |
| `ANYNOTE_CONFIG_DIR` | `%APPDATA%\anynote` / `~/.anynote` | 凭据、设置与锁文件目录 |
| `ANYNOTE_JSON` | — | 置 `1` 强制 JSON 输出 |

空字符串一律按"未设置"处理。

## 持久化

远程地址与登录态都落盘，配一次之后不用再带：

| 文件 | 内容 | 写入命令 |
|------|------|---------|
| `<configDir>/settings.json` | 网关地址等非敏感设置 | `config set` / `config unset` |
| `<configDir>/credentials.json` | 各 profile 的 token 与用户名 | `auth login` / `auth register` / `auth logout` |

网关地址优先级：`--api-url` > `ANYNOTE_API_URL` > `settings.json` > 内置默认值；
`config get` 与 `doctor` 会打印生效值与来源（`env` / `file` / `default`）。
两份文件互不干扰——登出只清凭据，不会顺手抹掉地址。

## 凭据与安全

- 凭据落在 `<configDir>/credentials.json`，POSIX 下权限 `0600`、父目录 `0700`。
- ⚠️ **Windows 上没有等价的权限保护**，同机其它进程可以读到该文件。介意就用 `ANYNOTE_TOKEN`。
- 任何输出都不会打印 token；`auth status` 只报告存在性与获取时间。
- 口令优先用 `--password-stdin`；用 `--password` 会在 stderr 收到告警（它会进 shell history 与进程列表）。
- 刷新走跨进程文件锁，多个 agent 并发调用不会把会话互相刷掉。设计见
  [`.claude/openspec/changes/2026-09-12-cli-credential-storage.md`](../../.claude/openspec/changes/2026-09-12-cli-credential-storage.md)。

## 测试

```bash
pnpm --filter @anynote/cli test        # 单测，进默认 pnpm test 与 CI
pnpm --filter @anynote/cli test:e2e    # 端到端，需要本地全栈 + 先 build
```

端到端会注册一个随机 `e2e` 前缀账号并在结束时登出（账号记录保留），**不要在生产环境跑**。
skill 安装类用例把三家 agent 的全局目录隔离到临时目录，不会碰你真实的 `~/.claude` / `~/.codex` / `~/.dsh`。

## 生成物

改了 `src/commands/**`、`src/core/exit.ts` 或 `.claude/skills/anynote-{cli,notes}/**` 之后必须重新生成并提交：

```bash
pnpm --filter @anynote/cli build
pnpm --filter @anynote/cli manifest:write   # 写 COMMANDS.md + skills 的 reference，并刷新 skill 快照
git diff --exit-code docs/cli/COMMANDS.md .claude/skills/anynote-cli/reference/ apps/cli/src/bundled.ts
```

三个生成物：

| 生成物 | 来源 | 说明 |
|--------|------|------|
| `docs/cli/COMMANDS.md` | 命令注册表 | 人类可读的命令速查 |
| `.claude/skills/anynote-cli/reference/commands.md` | 同上 | 随 skill 分发；**它同时又是 `bundled.ts` 的输入**，所以顺序不能反 |
| `apps/cli/src/bundled.ts` | `.claude/skills/anynote-{cli,notes}/**` + `package.json` 的 version | 打包进 CLI 的 skill 快照，保证装出去的 skill 与 CLI 版本一致 |

`pnpm --filter @anynote/cli build` 会先刷新 `bundled.ts` 再打包，`manifest:write` 结尾也会刷新它，
所以按上面两条命令的顺序跑完即可。CI 的 `cli` job 会卡这三个生成物的 diff。

> ⚠️ `src/version.ts` 只是 `bundled.ts` 的再导出，**不要再手写版本号字面量**——
> 版本号只在 `package.json` 里写一次，构建脚本会拒绝第二份副本。
