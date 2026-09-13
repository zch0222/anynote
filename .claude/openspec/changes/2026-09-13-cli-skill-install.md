# CLI skill 分发与安装

## 背景

`apps/cli` 的 agent 配套能力原先只有一条路径：把 skill 放在仓库的 `.claude/skills/anynote-*`，
让**在本仓库里干活**的 Claude Code 用项目级 skill 发现。这对另外两种常见场景是空的：

1. 用户在**别的目录**里干活（写自己的笔记、自己的项目），希望 Claude Code / Codex / dsh 都能直接调用 `anynote`；
2. CLI 可能装在 nvm 的全局包里，工作目录根本没有 `.claude/`。

2026-09-13 用户要求：CLI 增加一键安装 skill 的命令，支持 dsh / Claude Code / Codex，装到**全局**目录，
用**复制**模式，skill 必须**打包进 CLI 程序**以保证每次安装的版本匹配。

## 已确认契约

### 安装目标（两种范围）

| agent | 全局根目录 | 项目级根目录（`--local`） | 覆盖方式 |
|-------|-----------|--------------------------|---------|
| Claude Code | `~/.claude/skills` | `<项目根>/.claude/skills` | `CLAUDE_CONFIG_DIR`（仅全局） |
| Codex | `$CODEX_HOME/skills`（默认 `~/.codex/skills`） | `<项目根>/.agents/skills` | `CODEX_HOME`（仅全局） |
| dsh | `$DSH_HOME/skills`（默认 `~/.dsh/skills`） | `<项目根>/.dsh/skills` | `DSH_HOME`（仅全局） |

⚠️ dsh 只扫描 skill 根目录的**直接子项**（`<name>/SKILL.md` 或 `<name>.md`），不递归，
所以安装的是一个个 skill 目录，不是把整个 `skills/` 塞进某个子目录。

**项目根** = 从 cwd 向上**最近的含 `.git` 的目录**，找不到就用 cwd 本身。
这条规则**必须与 dsh 的 `findProjectRoot` 一致**（`@deepseek-ai/dsh-skill-filesystem` 的实现）：
两边算出不同的"项目根"，就会出现「装了但 agent 看不见」。

已核对的三个 agent 的项目级 skill root 依据：

- dsh：扫 `<项目根>/.dsh/skills`（rank 100）与 `<项目根>/.agents/skills`（rank 200）；
- Codex：二进制内含 `.agents/skills` 与 "repo skills root" 判定；
- Claude Code：`.claude/skills` 即仓库级 skill 目录。

> ⚠️ **dsh 不扫描 `.claude/skills`**。在只有 `.claude/skills` 的仓库里 dsh 看不到这些 skill，
> 必须用 `--local`（或全局安装）落到 `.dsh/skills`。

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
| `skill install [--agent=...] [--local] [--force] [--root]` | 复制安装；可重复执行，内容没变时幂等 |
| `skill list [--local]` | 只读检查安装状态、磁盘版本与漂移 |
| `skill uninstall [--agent=...] [--local]` | 只删带版本戳的目录 |

`doctor` **同时**报告全局与项目级两组（各 3 行）——只报一边会让用 `--local` 装过的人误以为没装。

## 安全边界（本提案的核心约束）

1. **绝不误删用户的东西**：`uninstall` 只删 SKILL.md 里带 `anynote-cli-version` 戳的目录；
   同名但没有戳的（用户自己写的）一律保留并如实报告。
2. **覆盖用户同名 skill 需要显式 `--force`**：`install` 发现目标位置有无戳的同名 skill 时跳过该 agent
   并回报原因；全部目标都被占用且没有 `--force` 时以用法错误（退出码 2）结束，而不是默默覆盖。
3. **本仓库自己的 skill 源文永远不可被覆盖，且不受 `--force` 影响**：在本仓库跑
   `skill install --local` 时，目标 `apps/../.claude/skills/anynote-*` 正好是 `src/bundled.ts`
   的**输入**，覆盖它会直接破坏"打包快照 == 源文"的一致性门禁。判据是"无版本戳 **且** 内容与
   打包进来的 SKILL.md 逐字节相同"（安装副本一定带戳，故只有源文命中）。命中时该 agent 被
   列进 `skipped` 并给出改用全局安装的提示；`--force` 也不放行——覆盖源文不是用户的合理诉求。
4. **只写进受支持 agent 的根目录**，不跟随符号链接、不接受 skill 包内的 `..` 路径。
5. 不碰任何凭据：skill 安装与 `credentials.json` / `ANYNOTE_TOKEN` 无关。

## 验证

- `apps/cli/src/__tests__/skill-package.test.ts`：版本戳位置与幂等、**全局与项目级两套根目录**、
  `findProjectRoot`（最近 `.git`、嵌套仓库取最近、无处可寻回落到起点）、`resolveSkillRoot` 的
  scope 分支、**打包快照与 `.claude/skills` 源文逐字节一致**（抓"改了 skill 没重新构建"）。
- `apps/cli/src/__tests__/skill-install.test.ts`：复制而非软链、幂等、升级记原版本、
  三个 agent 互不干扰、路径穿越被拒、用户同名 skill 被识别与保护、卸载只删自己装的那份。
- `apps/cli/src/__tests__/skill-commands.test.ts`：`resolveTargets` 展开规则、命令层的跳过与 `--force`、
  `--local` 装到项目根且**不碰全局目录**、本地/全局 list 与 uninstall 互不干扰、
  **源文保护（含 `--force` 不放行、且报错不误导用户去加 `--force`）**、`doctor` 的 skill 汇总
  （全部写在临时目录，绝不碰开发者真实的 `~/.claude`）。
- `apps/cli/src/__tests__/install-mode.test.ts`：`detectInstallMode` 认出全局包（scoped / unscoped /
  Windows 路径）、仓库产物、其它位置；`isSelfContained` 只有 `repo` 为 false。
- `apps/cli/e2e/cli.live.test.ts`：真实 CLI 进程在隔离的 `CLAUDE_CONFIG_DIR` / `CODEX_HOME` / `DSH_HOME`
  下完成 install → list → 重装幂等 → uninstall 闭环；另有一条从**假项目的深层子目录**跑
  `--local`，验证项目根判定、落点正确、全局未被污染、卸载只删项目级。

## 全局安装形态（`npm install -g <tgz>`）

`scripts/pack-global.mjs` 产出只含 `package.json` + 单文件 `dist/anynote.mjs` 的 tarball。
选它而不是别的安装方式，是因为**只有它真正复制**：

| 方式 | 实测结果 | 删掉仓库后 |
|------|---------|-----------|
| `npm install -g <tgz>` | 全局包是普通目录（`LinkType` 为空） | ✅ 照常运行 |
| `npm install -g <目录>` | `LinkType=Junction`，Target 指向源目录 | ❌ 断链 |
| `npm link` | 同样是符号链接 | ❌ 断链 |
| `node apps/cli/dist/anynote.mjs` | 直接读仓库产物 | ❌ 文件不存在 |

已实测：用 `npm install -g <tgz>` 装完后，**把整个仓库目录移走**，`anynote --cli-version`、
`anynote doctor`（`installMode=global`、`selfContained=true`）、`anynote skill install` 全部正常。
产物内也不含任何指向本仓库的绝对路径。

`doctor` 增加 `installMode` / `selfContained` / `executable` 三个字段，让"我跑的是独立副本还是仓库产物"
一眼可辨（`repo` 即依赖当前目录）。

## 需要同步的文档

- `README.md`（仓库根）：新增「让 AI 自己装好 CLI 与 skill」提示词段（复制给 dsh / Codex / Claude Code），
  **只写全局安装**（用户明确要求），安装走 `npm install -g <tgz>`，不使用任何项目相对路径。
- `apps/cli/README.md`：安装一节改为 tgz 流程 + 开发期直接跑的说明、两种范围的根目录表、
  复制与版本匹配的理由、源文保护。
- `docs/cli/CLI_PLAN.md` §10.3 / §11 与 `docs/cli/CLI_MILESTONES.md` M9.5：补记两种范围与全局安装形态。
- `.claude/skills/anynote-cli/SKILL.md`：给 agent 看的安装与根目录表；**去掉写死的仓库相对路径**
  （装到全局后那个路径不存在），改为"命令不在 PATH 时按本文档装一次"。
- CLAUDE.md：禁止清单的生成物条目补上 `src/bundled.ts`。
- `.gitignore`：忽略 `--local` 在本仓库装出来的 `.dsh/skills/` 与 `.agents/skills/`
  （它们只是 `.claude/skills` 源文的派生副本，入库会产生两份拷贝与漂移）。
