# Changelist：CLI skill 项目级安装（`--local`）与 AI 自助安装提示词（2026-09-13）

> 对应里程碑：`docs/cli/CLI_MILESTONES.md` M9.5 → 「补充：项目级安装（`--local`）与 AI 自助安装提示词」
> 契约提案：[`.claude/openspec/changes/2026-09-13-cli-skill-install.md`](../../.claude/openspec/changes/2026-09-13-cli-skill-install.md)（本次扩写了安装目标与安全边界）
> 前一批：[`2026-09-13-cli-skill-install.md`](./2026-09-13-cli-skill-install.md)（M9.5 主体：全局安装 + 配置持久化）
> 分支：`feat/cli-skill-local` → `dev`（`--no-ff` 合并）
> 本清单按 `git status --porcelain` / `git diff --numstat dev...HEAD` 实际输出编写。

## 概览

用户追加要求：**「在 README 补充一个在 dsh 中让 AI 自己安装 CLI 客户端和 skill 的提示词，在项目中本地安装」**。

前一批的 `skill install` 只能装**全局**目录，无法表达"装进当前项目"，因此必须先补一个能力，
再把提示词写进 README。落地方式是给 CLI 增加 `--local`（经用户确认后实施）。

| 项 | 数量 |
|----|------|
| 文件总数 | **19**（无新增文件，全部是修改） |
| 新增行 | **+825** |
| 删除行 | **−145** |
| 提交数 | 2（`feat(cli)` 代码 + 测试 · `docs(cli)` 文档与 gitignore） |

按目录分布（数字为 `git diff --numstat dev...HEAD` 的插入行数）：

| 目录 | 文件 | 插入行 | 说明 |
|------|------|--------|------|
| `apps/cli/src/**`（功能） | 4 | 223 | `--local` 的项目根解析与命令面 |
| `apps/cli/src/__tests__/**` | 3 | 231 | 单测从 216 增至 228 条 |
| `apps/cli/e2e/**` | 2 | 108 | 端到端从 43 增至 44 条 |
| `README.md`（仓库根） | 1 | 77 | **本次需求的主体**：AI 自助安装提示词 |
| `apps/cli/README.md` | 1 | 22 | 两种范围的根目录表与源文保护 |
| `.claude/skills/**` | 2 | 34 | skill 源文（**同时是打包输入**）+ 生成物 |
| `docs/cli/**` | 3 | 76 | 方案 §10.3、里程碑 M9.5、生成物 |
| `.claude/openspec/changes/` | 1 | 44 | 契约扩写 |
| `.gitignore` | 1 | 8 | 忽略 `--local` 在本仓库的产物 |

> ⚠️ 工作区里另有**与本次无关**的既有未提交改动（`infra/docker-compose.yaml`、
> `docs/changelist/2026-09-13-nginx-tls.md`、`docs/changelist/2026-09-13-web-lan-origin.md`，
> 内网 HTTPS 改造），**未被本次提交包含**，也未计入上表。
> （前一批 changelist 记的 `README.md` 也属那批未提交改动，本次只提交了本批次对 README 的改动。）

## 验证结果

| 命令 | 结果 |
|------|------|
| `pnpm --filter @anynote/cli test` | ✅ **228 passed**（14 文件；本批前 216） |
| `npx turbo test --force` | ✅ 5 任务全绿，共 **1222** 条（web 876 · CLI 228 · collab 75 · api-core 23 · openapi-tools 20） |
| `pnpm --filter @anynote/cli typecheck` | ✅ 通过 |
| `biome check apps/cli` | ✅ 47 文件干净 |
| `pnpm --filter @anynote/cli test:e2e` | ✅ **44 passed**（真实 docker 全栈；本批前 43）。曾出现一次 21 条 API 用例集中失败，重跑连续三次 44/44 全绿，判定为后端瞬时竞争而非改动引入 |
| 生成物稳定性 | ✅ 连跑 `build → manifest:write → build` 两轮，三个生成物 SHA256 不变 |
| 真实进程烟测 | ✅ 见下 |

### 手工烟测（真实 CLI 进程）

1. **假项目的深层子目录**（`<tmp>/proj/apps/cli`，`<tmp>/proj/.git` 存在）跑 `skill install --local`：
   项目根正确识别为 `<tmp>/proj`，落点 `.dsh/skills`、`.agents/skills`、`.claude/skills`，
   全局目录（隔离开的 `CLAUDE_CONFIG_DIR` / `CODEX_HOME` / `DSH_HOME`）**零改动**。
2. **在 anynote 仓库里跑 `--local`**：`.claude/skills` 被列进 `skipped`（提示这是仓库源文），
   dsh / codex 正常安装，退出码 0；`git status .claude/skills` 无 diff——源文未被污染。
3. **真实 dsh 会话**：`--local` 装完后 `anynote-cli` / `anynote-notes` 出现在会话的可用 skill 列表，
   删除 `.dsh/skills` 后列表清空——证明 dsh 读的是项目级根目录而非 `.claude/skills`。
4. **README 提示词逐条照跑**：`pnpm --filter @anynote/cli build` → `skill install --local` →
   `skill list --local`，dsh 两行输出 `installed=true v=0.1.0 drifted=false`，与提示词里写的验收标准一致。

## 一、CLI 功能（`apps/cli/src`）

| 文件 | 状态 | 作用与原因 |
|------|------|-----------|
| `src/skills/agents.ts` | 修改（+59/−5） | 新增 `findProjectRoot` / `projectSkillRoot` / `resolveSkillRoot` 与 `SkillScope`。**项目根判定必须与 dsh 的 `findProjectRoot` 同规则**（从 cwd 向上最近的含 `.git` 的目录，找不到用 cwd 本身）——规则不一致会表现为"装成功了但 skill 不生效"，是最难排查的失败模式。三家项目级落点：`.claude/skills` / `.agents/skills` / `.dsh/skills` |
| `src/skills/install.ts` | 修改（+45/−4） | `InstallDeps` 增加 `scope` 与可注入的 `pathExists`（单测不起真实目录树）；新增 `isOwnSource()`——判据是"无版本戳 **且** 内容与打包进来的 SKILL.md 逐字节相同"，只有仓库源文命中（安装副本一定带戳） |
| `src/commands/skill.ts` | 修改（+112/−33） | 三个命令都加 `--local`；`install` 增源文保护分支；`doctor` 的 `summarizeSkillStatus` 改为**同时**查全局与项目级。另外把"被源文挡住"与"撞上用户同名 skill"的提示语分开，并在后者才提示 `--force` |
| `src/run.ts` | 修改（+7/−1） | 仅格式化（import 换行），无行为变化 |

## 二、测试

| 文件 | 状态 | 作用与原因 |
|------|------|-----------|
| `src/__tests__/skill-package.test.ts` | 修改（+64/−1） | 新增 `projectSkillRoot` 三家落点、`findProjectRoot`（最近 `.git` / 嵌套仓库取最近 / 无处可寻回落起点）、`resolveSkillRoot` 的 scope 分支。断言一律 `path.resolve` 后比较（`findProjectRoot` 内部会 resolve） |
| `src/__tests__/skill-commands.test.ts` | 修改（+163） | 新增 `--local` 五条：装进项目根且**不碰全局目录**、版本戳与幂等、本地/全局 list 互不干扰、`--local uninstall` 只删项目级、**源文保护（`--force` 也不放行）**，以及"报错不误导用户加 `--force`" |
| `src/__tests__/run.test.ts` | 修改（+4/−3） | 仅格式化 |
| `e2e/helpers.ts` | 修改（+8/−1） | `runCli` 增加 `cwd` 选项（`--local` 靠它向上找项目根） |
| `e2e/cli.live.test.ts` | 修改（+100/−5） | 新增 `--local` 端到端一条（假项目深层子目录 → 安装 → 落点校验 → 全局未污染 → list → uninstall）；`doctor` 那条改为断言全局 + 项目级共 6 行，并**钉住 local/claude 会看到仓库自己的 `.claude/skills` 源文**（证明项目级不是空转） |

## 三、文档与仓库配置

| 文件 | 状态 | 作用与原因 |
|------|------|-----------|
| `README.md` | 修改（+77/−7） | **本次需求主体**。新增「让 AI 自己装好 CLI 与 skill」段：可直接粘给 dsh / Codex / Claude Code 的四步提示词（构建 → `--local` 安装 → 自检 → 报告），并写明 dsh 不读 `.claude/skills`、Windows ExecutionPolicy 会拦 `.ps1` 别名、`npm link` 做法等实测结论 |
| `apps/cli/README.md` | 修改（+22/−9） | 两种范围的根目录对照表、项目根判定规则、`--local` 用法，以及第 3 条设计约束（仓库源文不可覆盖） |
| `.claude/skills/anynote-cli/SKILL.md` | 修改（+16/−10） | 给 agent 看的安装表补项目级一列，并写明"在 anynote 仓库里 `--local` 会跳过 `.claude/skills`，属预期行为" |
| `.claude/skills/anynote-cli/reference/commands.md` | 修改（+18/−11，**生成物**） | `manifest --format=markdown --write` 产出，含 `--local` 参数 |
| `docs/cli/COMMANDS.md` | 修改（+18/−11，**生成物**） | 同上 |
| `docs/cli/CLI_PLAN.md` | 修改（+17/−13） | §10.3 改写为两种范围，硬约束由三条增至四条，补项目根必须与 dsh 对齐的理由 |
| `docs/cli/CLI_MILESTONES.md` | 修改（+41/−12） | M9.5 增「补充」小节、第 4 条偏差、两个实现期缺陷、验收数字（228 / 44）与 dsh 源码核对结论 |
| `.claude/openspec/changes/2026-09-13-cli-skill-install.md` | 修改（+44/−17） | 安装目标表扩为两种范围并附三家依据；安全边界新增第 3 条（源文不可覆盖且不受 `--force` 影响）；验证计划与需同步文档同步更新 |
| `.gitignore` | 修改（+8） | 忽略 `--local` 在本仓库装出来的 `.dsh/skills/` 与 `.agents/skills/`——它们只是 `.claude/skills` 源文的派生副本，入库会产生两份拷贝与漂移。只忽略 `skills/` 子目录，`.dsh/` 下将来别的项目配置仍可入库 |

## 审计要点

1. **`findProjectRoot` 与 dsh 的规则一致性**——这是本功能唯一"静默失败"的路径：两边算出不同的项目根，
   CLI 报安装成功、agent 却看不到。规则抄自 `@deepseek-ai/dsh-skill-filesystem` 的 `findProjectRoot`
   （nearest ancestor containing `.git`，否则 cwd）。看 `src/skills/agents.ts` 与 `skill-package.test.ts` 三条用例。
2. **`isOwnSource` 的判据**——"无版本戳 + 内容与打包内容逐字节相同"，两个条件缺一不可：
   只看"无版本戳"会误伤用户手写的同名 skill（那些应该走 `--force` 路径，而不是硬拦）。
   看 `src/skills/install.ts` 与 `skill-commands.test.ts` 的两条源文用例。
3. **源文保护不受 `--force` 影响**——`--force` 的语义是"允许覆盖用户自己的东西"，
   而覆盖仓库源文会破坏 `bundled.ts` 的一致性门禁，不是用户的合理诉求。因此报错文案里
   **不能**出现 `--force`（已有用例断言），否则用户会白跑一趟。
4. **`doctor` 报 6 行而非 3 行**——全局与项目级是两套独立安装，只报一边会让用 `--local` 的人以为没装。
   看 `summarizeSkillStatus` 与 e2e 里那条断言（含"local/claude 命中仓库源文"的钉桩）。
5. **`--local` 与 `--root` 的语义边界**——`--root` 只重定向 Claude Code 的**全局**目录；
   项目级范围由 `--local` 表达。两者同时给时 `--root` 被忽略（项目级不读 `CLAUDE_CONFIG_DIR`），
   这是刻意的：项目级落点必须由项目根唯一决定，否则 CLI 与 dsh 又会算出不同的目录。
6. **`.gitignore` 的粒度**——只忽略 `.dsh/skills/` 与 `.agents/skills/`，不是整个 `.dsh/` / `.agents/`：
   那两个目录下将来可能有需要入库的其它项目配置，一刀切会误伤。
