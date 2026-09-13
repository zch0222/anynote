---
name: anynote-cli
description: 用 anynote CLI 操作 Anynote 的知识库与笔记。当用户要求查看/创建/修改/删除 Anynote 的知识库或笔记、导出笔记正文、检查 Anynote 登录状态，或直接提到 anynote 命令时使用。仅用于操作 Anynote 里的数据，不用于改本仓库的代码。
---

# Anynote CLI

Anynote 的命令行前端（`apps/cli`，包名 `@anynote/cli`，bin `anynote`）。它直连 Gateway（不经 Next BFF），
输出对 agent 友好的 JSON 信封与固定退出码。

## 何时用

- 用户要读写 Anynote 的**知识库**或**笔记**（增删改查、导出正文、改标题、移动笔记）
- 用户要确认 Anynote 的登录状态或网关是否可达

**不要用于**：修改本仓库的代码（那是普通编辑任务）、协同编辑会话、文件上传（本期未实现）。

## 准备

```bash
# 本仓库内开发时用构建产物；装到全局后可以直接写 anynote
CLI="node apps/cli/dist/anynote.mjs"
$CLI doctor     # 自检：网关可达性 + 本地凭据 + 各 agent 的 skill 安装情况
```

`doctor` 的 `gateway` 不是 `UP` 时，先让用户把后端起起来，不要继续往下猜。

### 安装到各 agent 的 skill 目录

```bash
anynote skill install              # 全局：Claude Code / Codex / dsh 三家都装
anynote skill install --local      # 项目级：装进当前项目，可随仓库提交给团队共用
anynote skill install --agent=claude
anynote skill list                 # 看装没装、版本对不对（也支持 --local）
anynote skill uninstall --yes      # 只删本 CLI 装的，用户手写的同名 skill 不动
```

| agent | 全局根目录 | 项目级根目录（`--local`） |
|-------|-----------|--------------------------|
| Claude Code | `~/.claude/skills`（或 `$CLAUDE_CONFIG_DIR/skills`） | `<项目根>/.claude/skills` |
| Codex | `$CODEX_HOME/skills`，默认 `~/.codex/skills` | `<项目根>/.agents/skills` |
| dsh | `$DSH_HOME/skills`，默认 `~/.dsh/skills` | `<项目根>/.dsh/skills` |

**项目根** = 从当前目录向上最近的含 `.git` 的目录。安装是**复制**且 skill 内容随 CLI 一起打包，
所以版本一定匹配；CLI 升级后重跑一次 `skill install` 即完成升级。

⚠️ **在本仓库（anynote）里跑 `--local` 时，`.claude/skills` 会被跳过**——那正是本仓库的 skill 源文
（`src/bundled.ts` 的输入），不能被安装副本覆盖。这是预期行为，不要加 `--force` 去硬闯；
本仓库请改用全局安装，或只装另外两家（`--agent=dsh --agent=codex`）。

**认证**：先跑 `anynote auth status`。未登录时**让用户自己执行** `anynote auth login --username <名> --password-stdin`，
不要代替用户输入口令。CI / 沙箱可用 `ANYNOTE_TOKEN` 环境变量提供 token（不落盘、不自动刷新）。

## 输出契约

stdout 不是 TTY 时自动输出 JSON 信封，agent 无需加 `--json`：

```jsonc
{ "ok": true,  "command": "note get", "data": { } }
{ "ok": false, "command": "note set", "error": { "code": "A0409", "message": "...", "exitCode": 5 } }
```

**stdout 只放数据**，提示与日志都在 stderr，所以 `anynote note get 123 > note.md` 是安全的。

## 退出码（按码分支，不要 grep 中文文案）

| 码 | 含义 | 该怎么做 |
|----|------|---------|
| 0 | 成功 | 继续 |
| 1 | 业务失败 | 读 `error.message`，通常不可自动重试 |
| 2 | 参数/用法错误（含写操作缺 `--yes`） | 改命令行重试 |
| 3 | 未认证或无权限 | 见下方「易错点 1」，不要贸然要求重新登录 |
| 4 | 网关不可达 | 让用户起后端，或检查 `ANYNOTE_API_URL` / `anynote config set api-url` |
| 5 | 版本冲突 | **重读 → 合并 → 带新 version 重试**，禁止盲目覆盖 |
| 6 | 资源不存在 | 确认 ID |

## 易错点

1. **知识库的「不存在」会伪装成「无权限」**：`base get <从未存在的 id>` 返回 `A0301`（退出码 3），因为后端权限切面先于存在性检查执行。**不要据此判定登录失效**——先用 `auth whoami` 确认登录态。已删除的知识库则返回 `A0404`（退出码 6）。笔记侧没有这个问题。
2. **写操作在非交互环境必须显式 `--yes`**，否则退出码 2 且**不会发出请求**。不确定时先 `--dry-run` 预览。
3. **`note list` 与 `note recent` 不是一回事**：`note list --base <id>` 是知识库内的笔记，新建后立即可见；`note recent` 来自操作日志，**刚创建还没编辑过的笔记不会出现**。
4. **Markdown 往返有损**：文本对齐等没有 Markdown 表达的属性在保存时会丢失。改动用户笔记前提醒这一点。
5. **列表默认只取 20 条**，用 `--page` / `--limit` 翻页，用 `--fields` 裁剪字段控制上下文。

## 环境变量与持久化

| 变量 | 默认 | 说明 |
|------|------|------|
| `ANYNOTE_API_URL` | `http://localhost:8080` | Gateway 地址，优先级高于设置文件 |
| `ANYNOTE_TOKEN` | — | 直接提供 accessToken，**不落盘、不刷新**，过期即退出码 3 |
| `ANYNOTE_PROFILE` | `default` | 凭据 profile，等价于 `--profile` |
| `ANYNOTE_CONFIG_DIR` | `%APPDATA%\anynote` / `~/.anynote` | 凭据、设置与锁文件目录 |
| `ANYNOTE_JSON` | — | 置 `1` 强制 JSON 输出 |

**远程地址与登录态都是持久化的**：`anynote config set api-url <url>` 写 `<configDir>/settings.json`，
`auth login` 写 `<configDir>/credentials.json`，之后所有命令直接复用，无需重复指定。
优先级：`--api-url` / `ANYNOTE_API_URL` > 设置文件 > 内置默认值。

## 标准写入流程（务必照做）

```bash
$CLI note get 1024 --json > /tmp/note.json            # 1. 取 version 与正文
node -e "…"                                           # 2. 在本地改内容
$CLI note set 1024 --file /tmp/note.md \
  --version "$(node -p "require('/tmp/note.json').data.version")" --yes   # 3. 带 version 保存
```

退出码 5 表示别人先改了：回到第 1 步重读，合并后再存。没有 version 又确实要覆盖时才用 `--force`。

完整命令、参数与示例见 @reference/commands.md（生成物，不要手改）。
