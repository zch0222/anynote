# `@anynote/cli`

Anynote 的命令行前端，供人在终端、以及 Claude Code / Codex / dsh 等 agent 操作知识库与笔记。
直连 Gateway（不经 Next BFF），输出 JSON 信封 + 固定退出码。

- 方案与里程碑：[`docs/cli/CLI_PLAN.md`](../../docs/cli/CLI_PLAN.md) · [`docs/cli/CLI_MILESTONES.md`](../../docs/cli/CLI_MILESTONES.md)
- 命令速查（生成物）：[`docs/cli/COMMANDS.md`](../../docs/cli/COMMANDS.md)
- Skills 源文：`.claude/skills/anynote-cli` / `anynote-notes` / `anynote-dev`（`anynote-dev` 只服务本仓库，不随 CLI 分发）

## 构建与运行

```bash
pnpm --filter @anynote/cli build        # 产出单文件 dist/anynote.mjs（已内联全部依赖与 skill）
node apps/cli/dist/anynote.mjs --help
node apps/cli/dist/anynote.mjs doctor   # 自检网关可达性、本地凭据与 skill 安装状态
```

产物是自包含的单文件，可以脱离 pnpm workspace 拷到别处直接 `node anynote.mjs` 运行。

## 一键安装 skill（Claude Code / Codex / dsh）

```bash
node apps/cli/dist/anynote.mjs skill install      # 三家都装；装到全局目录
node apps/cli/dist/anynote.mjs skill install --agent=claude --agent=dsh
node apps/cli/dist/anynote.mjs skill list         # 看装没装、版本对不对
node apps/cli/dist/anynote.mjs skill uninstall    # 卸载（只删本 CLI 装的）
```

| agent | 全局 skill 根目录 | 覆盖方式 |
|-------|------------------|---------|
| Claude Code | `~/.claude/skills` | `CLAUDE_CONFIG_DIR` |
| Codex | `$CODEX_HOME/skills`（默认 `~/.codex/skills`） | `CODEX_HOME` |
| dsh | `$DSH_HOME/skills`（默认 `~/.dsh/skills`） | `DSH_HOME` |

三条设计约束（变更前先读 [`2026-09-13-cli-skill-install.md`](../../.claude/openspec/changes/2026-09-13-cli-skill-install.md)）：

1. **复制，不是符号链接**。CLI 可能装在 nvm 的全局包里，软链一旦源被清理就是断链；
   Windows 上创建符号链接还需要开发者模式或管理员权限。
2. **skill 打包进 CLI**，所以装出来的版本与当前 CLI 一定匹配。`SKILL.md` 里会写一行
   `<!-- anynote-cli-version: x.y.z -->`，CLI 升级后重跑一次 `skill install` 即完成升级，
   `skill list` / `doctor` 会报出版本漂移。
3. **不动用户自己的 skill**。卸载只删带版本戳的目录；安装遇到同名但没有版本戳的
   （用户手写）会跳过该 agent 并说明原因，要覆盖必须显式 `--force`。

## 快速上手

```bash
CLI="node apps/cli/dist/anynote.mjs"

# 登录（口令从 stdin 读，避免进 shell history）
echo -n "你的口令" | $CLI auth login --username alice --password-stdin
$CLI auth whoami

# 网关地址配一次就够（写入 <configDir>/settings.json，之后所有命令复用）
$CLI config set api-url http://192.168.3.90:8080
$CLI config get          # 看生效值与来源：env / file / default

# 知识库
$CLI base create --name "我的知识库" --yes
$CLI base list --fields id,knowledgeBaseName
$CLI base update 70 --name "改个名" --yes
$CLI base rm 70 --yes

# 笔记：正文就是 Markdown
ID=$($CLI note create --base 70 --title "会议纪要" --yes | node -p "JSON.parse(require('fs').readFileSync(0)).data.id")
$CLI note get "$ID" --out note.md
$CLI note set "$ID" --file note.md --version "$($CLI note get "$ID" --json | node -p "JSON.parse(require('fs').readFileSync(0)).data.version")" --yes
$CLI note rm "$ID" --yes
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
