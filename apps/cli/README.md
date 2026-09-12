# `@anynote/cli`

Anynote 的命令行前端，供人在终端、以及 Claude Code / Codex / dsh 等 agent 操作知识库与笔记。
直连 Gateway（不经 Next BFF），输出 JSON 信封 + 固定退出码。

- 方案与里程碑：[`docs/cli/CLI_PLAN.md`](../../docs/cli/CLI_PLAN.md) · [`docs/cli/CLI_MILESTONES.md`](../../docs/cli/CLI_MILESTONES.md)
- 命令速查（生成物）：[`docs/cli/COMMANDS.md`](../../docs/cli/COMMANDS.md)
- Claude Code skills：`.claude/skills/anynote-cli` / `anynote-notes` / `anynote-dev`

## 构建与运行

```bash
pnpm --filter @anynote/cli build        # 产出单文件 dist/anynote.mjs（已内联全部依赖）
node apps/cli/dist/anynote.mjs --help
node apps/cli/dist/anynote.mjs doctor   # 自检网关可达性与本地凭据
```

产物是自包含的单文件，可以脱离 pnpm workspace 拷到别处直接 `node anynote.mjs` 运行。

## 快速上手

```bash
CLI="node apps/cli/dist/anynote.mjs"

# 登录（口令从 stdin 读，避免进 shell history）
echo -n "你的口令" | $CLI auth login --username alice --password-stdin
$CLI auth whoami

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
| `ANYNOTE_API_URL` | `http://localhost:8080` | Gateway 地址 |
| `ANYNOTE_TOKEN` | — | 直接提供 accessToken，**不落盘、不刷新**，过期即退出码 3 |
| `ANYNOTE_PROFILE` | `default` | 凭据 profile，等价于 `--profile` |
| `ANYNOTE_CONFIG_DIR` | `%APPDATA%\anynote` / `~/.anynote` | 凭据与锁文件目录 |
| `ANYNOTE_JSON` | — | 置 `1` 强制 JSON 输出 |

空字符串一律按"未设置"处理。

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

## 生成物

改了 `src/commands/**` 之后必须重新生成命令文档并提交：

```bash
pnpm --filter @anynote/cli build
pnpm --filter @anynote/cli manifest:write
git diff --exit-code docs/cli/COMMANDS.md .claude/skills/anynote-cli/reference/
```

CI 的 `cli` job 会卡这个 diff。
