# Changelist：README 安装说明改为全局安装（2026-09-13）

> 前一批：[`2026-09-13-cli-skill-local-install.md`](./2026-09-13-cli-skill-local-install.md)（新增 `--local` 与 AI 自助安装提示词）
> 契约提案：[`.claude/openspec/changes/2026-09-13-cli-skill-install.md`](../../.claude/openspec/changes/2026-09-13-cli-skill-install.md)
> 本清单按 `git status --porcelain` / `git diff --numstat` 实际输出编写。

## 概览

用户澄清：**「README.md 中的安装应该是直接全局安装，不需要写本地项目安装的说明」**。

前一批把 `--local`（项目级安装）写进了 README 的提示词。但全局安装本身已经满足"装一次、任何目录都能用"，
README 作为面向新人的入口，不该把两种范围都摊开——`--local` 属于"随仓库分发给团队"的特殊场景。
本次据此把 README 的安装说明统一为**全局安装**。

**只改文档，不动代码**：`--local` 能力本身保留（CLI 命令、`apps/cli/README.md`、OpenSpec 提案里都仍在），
只是不再出现在 README 的推荐路径里。

| 项 | 数量 |
|----|------|
| 文件总数 | **2**（均为修改） |
| 新增行 | **+21** |
| 删除行 | **−19** |

| 文件 | 状态 | 作用与原因 |
|------|------|-----------|
| `README.md` | 修改（+12/−13） | 提示词的第 2、3 步由 `skill install --local` / `skill list --local` 改为不带 `--local` 的全局形式；目标目录由 `<项目根>/...` 改为 `~/.dsh/skills`、`~/.codex/skills`、`~/.claude/skills`；删掉"本仓库 `.claude/skills` 是打包源、claude 会进 skipped"那段说明（全局安装不触发源文保护，实测 `skipped=[]`，该说明已无必要）；「几点说明」首条由"只影响当前项目"改为"全局安装，一处生效" |
| `docs/cli/CLI_MILESTONES.md` | 修改（+9/−6） | M9.5 补充小节记下这次澄清：README 只写全局安装，`--local` 仍保留在 CLI 与 `apps/cli/README.md`；同时把 dsh 的三个 skill 根目录（含 `~/.dsh/skills` rank 400）写全 |

## 验证结果

| 命令 | 结果 |
|------|------|
| 按 README 提示词逐条实跑 | ✅ `pnpm --filter @anynote/cli build` → `skill install` → `skill list`，三家各装 2 个 skill、`skipped=[]`、dsh 两行 `v=0.1.0 drifted=false` |
| `git grep` 复查 README | ✅ 不再出现 `--local`、`项目根`、`.dsh/skills`（相对路径）等本地安装字样 |
| 仓库工作区 | ✅ 全局安装不在仓库内产生 `.dsh/` / `.agents/` 目录 |
| `npx turbo test --force` | ✅ 5 任务全绿（本次未改代码，仅文档） |

## 审计要点

1. **提示词里"验收标准"必须与全局安装对得上**——原来写的是"dsh 那两行出现版本号"，
   全局与 `--local` 下 dsh 都会装上，所以这条断言本身没变；但 `skipped` 的行为不同
   （`--local` 在本仓库会跳过 claude，全局不会），文案已相应去掉。
2. **`--local` 是有意保留的**——不是删功能，只是不写进 README。它的正当场景是
   "把 skill 随仓库提交、团队成员克隆即可用"，读 `apps/cli/README.md` 即可看到。
3. **dsh 的根目录这次写准了**：`~/.dsh/skills`（rank 400）是全局安装真正的落点；
   项目级才是 `<项目根>/.dsh/skills`（rank 100）。两者容易混，README 里统一用 `~` 形式。
