# CLI skill 分发与安装

## 背景

`apps/cli` 的 agent 配套能力原先只有一条路径：把 skill 放在仓库的 `.claude/skills/anynote-*`，
让**在本仓库里干活**的 Claude Code 用项目级 skill 发现。这对另外两种常见场景是空的：

1. 用户在**别的目录**里干活（写自己的笔记、自己的项目），希望 Claude Code / Codex / dsh 都能直接调用 `anynote`；
2. CLI 可能装在 nvm 的全局包里，工作目录根本没有 `.claude/`。

2026-09-13 用户要求：CLI 增加一键安装 skill 的命令，支持 dsh / Claude Code / Codex，装到**全局**目录，
用**复制**模式，skill 必须**打包进 CLI 程序**以保证每次安装的版本匹配。

## 已确认契约

### 安装目标（全局根目录）

| agent | 根目录 | 覆盖方式 | 依据 |
|-------|--------|---------|------|
| Claude Code | `~/.claude/skills` | `CLAUDE_CONFIG_DIR` | Claude Code 的个人 skill 目录 |
| Codex | `$CODEX_HOME/skills`（默认 `~/.codex/skills`） | `CODEX_HOME` | Codex 的 skill 安装位置（`skill-installer` 亦如此） |
| dsh | `$DSH_HOME/skills`（默认 `~/.dsh/skills`） | `DSH_HOME` | dsh 的 user 级 skill root |

⚠️ dsh 只扫描 skill 根目录的**直接子项**（`<name>/SKILL.md` 或 `<name>.md`），不递归，
所以安装的是一个个 skill 目录，不是把整个 `skills/` 塞进某个子目录。

### 复制模式（明确不用符号链接）

- agent 的全局目录与 CLI 的安装位置没有关系（nvm 全局包 / 仓库 dist / 临时解包），
  软链一旦源被清理就是断链；
- Windows 上创建符号链接需要开发者模式或管理员权限，复制则永远可用；
- 卸载时按目录整体删除，不需要追踪链接目标。

### 版本匹配（打包进 CLI）

skill 与 CLI 的命令面、退出码是**强耦合**契约：skill 写错退出码，agent 就会做错决策。所以：

1. 构建期把 `<repo>/.claude/skills/anynote-cli`、`anynote-notes` 的内容烘焙进
   `apps/cli/src/bundled.ts`（生成物，入库并由 CI 卡 diff），**不另存一份 skill 副本**；
2. 版本号只在 `package.json` 写一次，`src/version.ts` 只是 `bundled.ts` 的再导出；
3. 每次安装都在 SKILL.md 的 frontmatter 之后写一行
   `<!-- anynote-cli-version: <ver> -->`，`doctor` / `skill list` 据此报版本漂移。

### 命令面

| 命令 | 说明 |
|------|------|
| `skill install [--agent=...] [--force] [--root]` | 复制安装；可重复执行，内容没变时幂等 |
| `skill list` | 只读检查安装状态、磁盘版本与漂移 |
| `skill uninstall [--agent=...]` | 只删带版本戳的目录 |

## 安全边界（本提案的核心约束）

1. **绝不误删用户的东西**：`uninstall` 只删 SKILL.md 里带 `anynote-cli-version` 戳的目录；
   同名但没有戳的（用户自己写的）一律保留并如实报告。
2. **覆盖用户同名 skill 需要显式 `--force`**：`install` 发现目标位置有无戳的同名 skill 时跳过该 agent
   并回报原因；全部目标都被占用且没有 `--force` 时以用法错误（退出码 2）结束，而不是默默覆盖。
3. **只写进受支持 agent 的全局根目录**，不跟随符号链接、不接受 skill 包内的 `..` 路径。
4. 不碰任何凭据：skill 安装与 `credentials.json` / `ANYNOTE_TOKEN` 无关。

## 验证

- `apps/cli/src/__tests__/skill-package.test.ts`：版本戳位置与幂等、三个根目录解析与优先级、
  **打包快照与 `.claude/skills` 源文逐字节一致**（抓"改了 skill 没重新构建"）。
- `apps/cli/src/__tests__/skill-install.test.ts`：复制而非软链、幂等、升级记原版本、
  三个 agent 互不干扰、路径穿越被拒、用户同名 skill 被识别与保护、卸载只删自己装的那份。
- `apps/cli/src/__tests__/skill-commands.test.ts`：`resolveTargets` 展开规则、命令层的跳过与 `--force`、
  `doctor` 的 skill 汇总（全部写在临时目录，绝不碰开发者真实的 `~/.claude`）。
- `apps/cli/e2e/cli.live.test.ts`：真实 CLI 进程在隔离的 `CLAUDE_CONFIG_DIR` / `CODEX_HOME` / `DSH_HOME`
  下完成 install → list → 重装幂等 → uninstall 闭环。

## 需要同步的文档

- `apps/cli/README.md`：安装命令、根目录表、复制与版本匹配的理由。
- `docs/cli/CLI_PLAN.md` §10 / §11 与 `docs/cli/CLI_MILESTONES.md` M9.3：补记分发方式。
- `.claude/skills/anynote-cli/SKILL.md`：给 agent 看的安装与根目录表。
- CLAUDE.md：禁止清单的生成物条目补上 `src/bundled.ts`。
