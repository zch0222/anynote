# Changelist：CLI skill 一键安装与配置持久化（2026-09-13）

> 对应里程碑：`docs/cli/CLI_MILESTONES.md` M9.5
> 契约提案：[`.claude/openspec/changes/2026-09-13-cli-skill-install.md`](../../.claude/openspec/changes/2026-09-13-cli-skill-install.md)
> 分支：`feat/cli-skill-install` → `dev`（`--no-ff` 合并）
> 本清单按 `git status --porcelain` / `git diff --stat` 实际输出编写。

## 概览

用户要求：**CLI 增加一键安装 skill 的命令**，支持 dsh / Claude Code / Codex，装到**全局**目录，
**复制**模式，skill **打包进 CLI** 以保证每次安装的版本匹配；并且 **CLI 的远程地址与登录状态都要持久化**。

| 项 | 数量 |
|----|------|
| 文件总数 | **38** |
| 新增文件 | **12**（CLI 源码 6 · 单测 4 · 构建脚本 1 · OpenSpec 提案 1） |
| 修改文件 | **26** |
| 新增行 | **+2690** |
| 删除行 | **−98** |

按目录分布（数字为 `git diff --numstat` 的插入行数）：

| 目录 | 新增 | 修改 | 插入行 | 说明 |
|------|------|------|--------|------|
| `apps/cli/src/**`（功能） | 6 | 7 | 916 | skill 分发、设置持久化、可重复选项 |
| `apps/cli/src/__tests__/**` | 4 | 4 | 929 | 单测从 137 增至 216 条 |
| `apps/cli/scripts/**` | 1 | 0 | 123 | 构建期 skill 快照生成 |
| `apps/cli/e2e/**` | 0 | 2 | 213 | 端到端从 32 增至 43 条 |
| `apps/cli/`（README / package.json） | 0 | 2 | 69 | 文档与构建脚本编排 |
| `.claude/skills/**` | 0 | 4 | 156 | skill 源文（**同时是打包输入**）+ 生成物 |
| `docs/cli/**` | 0 | 4 | 211 | 方案、里程碑、生成物、索引 |
| `.claude/openspec/changes/` | 1 | 0 | 77 | 契约登记 |
| 仓库根（CLAUDE.md / biome.json） | 0 | 2 | 14 | 同步禁止清单与生成物 ignore |
| `.github/workflows/test.yml` | 0 | 1 | 11 | 生成物漂移门禁扩到三个产物 |

> ⚠️ 工作区里另有两处**与本次改动无关**的既有未提交改动（`README.md`、`infra/docker-compose.yaml`、
> `docs/changelist/2026-09-13-nginx-tls.md`、`docs/changelist/2026-09-13-web-lan-origin.md`，
> 内网 HTTPS 改造），**未被本次提交包含**，也未计入上表。

## 验证结果

| 命令 | 结果 |
|------|------|
| `pnpm --filter @anynote/cli test` | ✅ **216 passed**（14 文件；改动前 137） |
| `npx turbo test --force` | ✅ 5 任务全绿，共 **1210** 条（web 876 · CLI 216 · collab 75 · api-core 23 · openapi-tools 20） |
| `pnpm typecheck` | ✅ 5 任务通过 |
| `biome check apps/cli` | ✅ 47 文件干净 |
| `biome check .` | 🟡 444 文件，仅剩 1 处**既有**报错 `apps/web/src/components/editor/core/toolbar.tsx:314`（`noArrayIndexKey`，已用 `git stash` 在干净 `dev` 上复现确认与本次改动无关） |
| `pnpm --filter @anynote/cli test:e2e` | ✅ **43 passed**（真实本地 docker 全栈；改动前 32） |
| 生成物稳定性 | ✅ 连跑 `build → manifest:write → build` 两轮，三个生成物 SHA256 均不变 |
| 手工烟测 | ✅ 真实 `node dist/anynote.mjs skill install` 装入隔离目录，SKILL.md 带 `anynote-cli-version: 0.1.0`；`config set/get/unset` 落盘与回落均正确 |

## 一、CLI 功能主体（`apps/cli/src`）

用户要求的三件事分别落在 `skills/`（分发）、`commands/skill.ts`（命令面）、`core/settings.ts`（持久化）。
下方括号里是 `git diff --numstat` 的插入行数。

| 文件 | 状态 | 作用与原因 |
|------|------|-----------|
| `src/skills/agents.ts` | 新增（89） | 三个 agent 的**全局 skill 根目录**解析：Claude Code `~/.claude/skills`（`CLAUDE_CONFIG_DIR` 覆盖）、Codex `$CODEX_HOME/skills`、dsh `$DSH_HOME/skills`。dsh 只扫描根目录直接子项、不递归，所以装的是一个个 skill 目录；用 frontmatter 的 `name` 反查已装目录，覆盖安装才能认领"被改过目录名"的旧安装 |
| `src/skills/stamp.ts` | 新增（70） | 版本戳的写入 / 读取。安装时在 SKILL.md 的 frontmatter 之后插 `<!-- anynote-cli-version: x.y.z -->`，这是"版本匹配"的落地形式。`stamp()` 是**先移除旧戳再插入**——必须幂等，否则重复安装每次都被算作变更、CI diff 门禁会抖 |
| `src/skills/install.ts` | 新增（192） | 复制安装的核心：原子写、幂等 / 升级判定（`installed`/`updated`/`unchanged`）、skill 包内 `..` 路径穿越拒绝、只读比对（`inspectAgent`）、卸载。卸载**只删带版本戳的目录**，同名无戳的（用户手写）保留并如实回报，避免误删用户的东西 |
| `src/commands/skill.ts` | 新增（227） | `skill install` / `skill list` / `skill uninstall`。`install` 遇到目标位置有同名**非本 CLI 安装**的 skill 时会整体跳过该 agent 并说明原因，要覆盖必须显式 `--force`；`--root` 只重定向 Claude Code（只有它能把配置根目录用单个环境变量整体搬家） |
| `src/core/settings.ts` | 新增（60） | `<configDir>/settings.json` 设置存储，落 `apiUrl`。**与凭据分成两个文件**：登出清 `credentials.json` 时不能顺手抹掉用户配的网关地址。原子写；文件损坏 / 字段非法一律当作"没设过"，不让所有命令都起不来 |
| `src/core/env.ts` | 修改（+58/−7） | `ANYNOTE_API_URL` 由"带默认值"改为**可选**，新增 `resolveApiUrl()`：环境变量 > 设置文件 > 内置默认值，并回报来源（`env`/`file`/`default`）；拆出 `resolveConfigDir()`，因为"设置文件里存着 apiUrl、而读 env 又需要它"这个先后顺序必须显式化 |
| `src/run.ts` | 修改（+24/−4） | 启动顺序改为**先定目录 → 读设置 → 读 env**，并把 `SettingsStore` 注入 context；数组字段声明成**可重复选项**（见下方缺陷 1-3） |
| `src/core/context.ts` | 修改（+6） | `CliContext` 增加 `settings`，并允许复用已构造的实例（run.ts 在构造 env 之前就要读它） |
| `src/core/schema-introspect.ts` | 修改（+8） | 新增 `isArrayField()`：剥掉 `default` 包装后判断最内层是不是数组，供选项声明分支使用 |
| `src/commands/meta.ts` | 修改（+107/−3） | 新增 `config get` / `config set` / `config unset`；`config path` 补 `settingsPath` 与 apiUrl 来源；`doctor` 增加 `apiUrlSource` 与**三家 skill 安装情况汇总**（省掉"先 doctor 再 skill list"两步） |
| `src/core/registry.ts` | 修改（+8/−1） | 登记 3 个 skill 命令与 3 个 config 命令 |
| `src/version.ts` | 修改（+6/−2） | 改为 `bundled.ts` 的**再导出**。版本号出现在 manifest / `--cli-version` / skill 版本戳三处，多一份副本就多一处漂移点 |

## 二、skill 打包（构建期快照）

| 文件 | 状态 | 作用与原因 |
|------|------|-----------|
| `scripts/build-bundled.mjs` | 新增（123） | 把 `<repo>/.claude/skills/anynote-{cli,notes}` 烘焙成 `src/bundled.ts`。**不另存 skill 副本**（同一批 skill 既要给项目级 Claude Code 用、又要能装到任意目录的 agent，两份源文必然漂移），而是单向派生。行尾统一 LF 再嵌入，否则 Windows 检出会让生成物产生差异；脚本拒绝 `src/version.ts` 再写版本号字面量 |
| `src/bundled.ts` | 新增（28，**生成物**） | skill 内容快照 + `CLI_VERSION`。入库并由 CI 卡 diff；单测断言它与 `.claude/skills` 源文**逐字节一致**，抓"改了 skill 但没重新构建" |
| `package.json` | 修改（+5/−4） | `build`/`dev` 前置跑 `build-bundled.mjs`；`manifest:write` 结尾再刷一次（`reference/commands.md` 同时是 `bundled.ts` 的输入，顺序不能反）；新增 `skills:write`；`lint` 覆盖 `e2e` 与 `scripts` |

## 三、skill 源文（`.claude/skills`）

这批文件**同时是打包输入**：改了它们必须重新 `build`，否则 CI 的 `bundled.ts` diff 会阻断。

| 文件 | 状态 | 作用与原因 |
|------|------|-----------|
| `.claude/skills/anynote-cli/SKILL.md` | 修改（+41/−8） | 补"安装到各 agent 全局目录"表与命令；补充"远程地址与登录态都是持久化的"及优先级；shell 片段改为 `anynote` |
| `.claude/skills/anynote-notes/SKILL.md` | 修改（+13/−16） | 片段统一从 `$CLI` 改成 `anynote`，并说明本仓库内可用 `node apps/cli/dist/anynote.mjs` 替代——安装到全局后这才是用户看到的样子 |
| `.claude/skills/anynote-dev/SKILL.md` | 修改（+15/−3） | 生成物从 1 个扩到 3 个并给出表格与顺序约束；写明 `bundled.ts` 不要手改、版本号不要写第二份 |
| `.claude/skills/anynote-cli/reference/commands.md` | 修改（+87/−3，**生成物**） | `anynote manifest --format=markdown --write` 产出，新增 6 条命令的参数表 |

## 四、单元测试（`apps/cli/src/__tests__`）

| 文件 | 状态 | 作用与原因 |
|------|------|-----------|
| `skill-package.test.ts` | 新增（175） | 版本戳位置 / 幂等 / 换版本不累积；三个根目录与覆盖变量优先级；`stampFiles` 不改输入；**打包快照与 `.claude/skills` 源文逐字节一致**；skill 里 `@reference/...` 引用的文件确实被打包 |
| `skill-install.test.ts` | 新增（215） | 复制而非软链（断言 `lstat` 不是符号链接）、子目录文件一并复制、幂等 `unchanged`、升级记 `previousVersion`、三个 agent 互不干扰、**路径穿越被拒**、rename 失败不假装成功、按 `name` 认领改过名的目录、卸载只删带戳的 |
| `skill-commands.test.ts` | 新增（312） | 命令层：`resolveTargets` 展开规则、装到三家 / 只装指定、幂等、**用户手写同名 skill 被跳过**（无 `--force` 时全部被占则以用法错误退出）、`--force` 覆盖、`--root` 重定向、`doctor` 汇总、`config` 四个命令的成功与失败路径。全部把根目录指到临时目录，**绝不写开发者真实的 `~/.claude`** |
| `settings.test.ts` | 新增（76） | 设置存储：缺文件 / 损坏 / 字段非法均回落空设置、目录自动创建、原子写不留 `.tmp`、清空键、与 `credentials.json` 互不干扰 |
| `run.test.ts` | 修改（+128） | 新增两组：**可重复选项**四条（回归下方缺陷 1-3）、**设置持久化**四条（文件生效 / env 优先级 / `--api-url` 最高 / 文件损坏回落默认） |
| `schema-introspect.test.ts` | 修改（+23/−1） | `isArrayField` 的正反例（含回归护栏注释） |
| `store.test.ts` | 修改（+10/−2） | 修复既有 flaky（见下方"顺带修复"） |
| `helpers.ts` | 修改（+3） | 测试 context 补 `settings` 与 `apiUrlSource` |

## 五、端到端测试（`apps/cli/e2e`）

真实本地 docker 全栈，**不进**默认 `pnpm test` 与 CI。

| 文件 | 状态 | 作用与原因 |
|------|------|-----------|
| `cli.live.test.ts` | 修改（+206/−1） | 新增 `skill 一键安装`（7 条）与 `配置持久化`（4 条）。skill 用例把三家 agent 的全局目录隔离到临时目录，验证真实 CLI 进程的 install → list → 重装幂等 → 手写 skill 保护 → uninstall 闭环；配置用例验证"只配过一次、不带 `ANYNOTE_API_URL` 也生效"，以及登录态跨进程持久化 |
| `helpers.ts` | 修改（+7/−2） | `runCli` 增加 `extraEnv`（隔离 agent 目录）与 `withoutApiUrl`（验证设置文件生效时不能有环境变量压着） |

## 六、CI 与仓库配置

| 文件 | 状态 | 作用与原因 |
|------|------|-----------|
| `.github/workflows/test.yml` | 修改（+11/−5） | `cli` job 的漂移检查从 2 个产物扩到 **3 个**（加 `apps/cli/src/bundled.ts`）；步骤名与错误提示同步 |
| `biome.json` | 修改（+2/−1） | `apps/cli/src/bundled.ts` 加入 ignore：它是生成物，格式化它会与构建脚本的输出打架（与 `packages/api-client/src`、`openapi/specs` 同一处理方式） |
| `CLAUDE.md` | 修改（+3/−1） | 禁止清单新增两条：不手改 `bundled.ts`、不在 `version.ts` 再写版本号；导航里标注 M9.5 已完成。**按仓库"文档维护约定"同步**，不是可选动作 |

## 七、文档

| 文件 | 状态 | 作用与原因 |
|------|------|-----------|
| `docs/cli/CLI_MILESTONES.md` | 修改（+64/−5） | 新增 **M9.5** 章节：完成项、3 处与方案的偏差、3 个实现期缺陷、顺带修复的 flaky、验收记录（216 单测 / 43 e2e）；总览表加 M9.5 行并补交付边界；修正 M9.0-M9.3 遗留的"尚未做的收尾"（那批改动实际已合并） |
| `docs/cli/CLI_PLAN.md` | 修改（+36/−5） | 新增 §10.3 全局分发（根目录表 + 三条硬约束）；§10.4 漂移门禁更新为三个生成物；§11 接入表补 Codex / dsh，并把"打成 plugin"的方案记为已被 `skill install` 取代及原因 |
| `docs/cli/README.md` | 修改（+24/−12） | 状态更新到 M9.5；接入方式表补全局安装；30 秒上手加 skill install 与 config set；偏差计数 10 → 13 |
| `docs/cli/COMMANDS.md` | 修改（+87/−3，**生成物**） | 命令速查，新增 6 条命令 |
| `apps/cli/README.md` | 修改（+64/−9） | 新增"一键安装 skill"节（根目录表 + 三条设计约束）与"持久化"节（两个文件的分工与优先级）；生成物一节从 1 个扩到 3 个并说明顺序 |
| `.claude/openspec/changes/2026-09-13-cli-skill-install.md` | 新增（77） | 契约登记：安装目标表、复制模式理由、版本匹配机制、**安全边界三条**（绝不误删用户 skill / 覆盖需 `--force` / 只写受支持根目录）、验证计划 |

## 审计要点

1. **`src/skills/install.ts` 的删除与覆盖边界**——这是本次唯一能破坏用户数据的路径。判据是 SKILL.md 里有没有版本戳：没有戳就说明是用户自己写的，`uninstall` 跳过、`install` 跳过该 agent。看 `uninstallSkill` 与 `skill.ts` 里 `foreign` 那段过滤，以及对应的三条用例（单测两条 + e2e 一条）。
2. **`stamp()` 的幂等性**——它必须先移除旧戳再插入。写成"纯插入"的话重复安装每次都被判为 `updated`，CI 的 `bundled.ts` diff 门禁也会抖。看 `stamp.ts` 里 `stamp()` 的正则与 `skill-install.test.ts`「重复安装是幂等的」。
3. **`run.ts` 的启动顺序**——设置文件里存着 apiUrl，而解析 env 又需要它，所以必须是"先定目录 → 读设置 → 读 env"。顺序写反会静默忽略用户配置的地址；`--api-url` 仍要最高优先级。看 `run.ts` 顶部与 `run.test.ts` 的四条设置用例。
4. **打包快照与源文的一致性**——`bundled.ts` 是生成物，最容易出的错是"改了 skill 忘了重新构建"。`skill-package.test.ts` 有一条逐字节比对的用例直接读 `.claude/skills` 源文，CI 也有 diff 门禁，两道防线。
5. **`build-bundled.mjs` 的纯函数性**——不写时间戳、不写绝对路径（生成物要入库并被 diff），行尾统一 LF（Windows 检出不该产生差异）。已用"连跑两轮 SHA256 不变"实测。
6. **可重复选项的声明方式**——`--agent` 用收集函数而不是变参 `<value...>`（变参会吞掉后面的位置参数），也**不给 commander 默认值**（给了 `[]` 会盖掉 zod 的 `default(["all"])`）。这两个坑都是 e2e 实跑暴露的，各自有用例钉住。

## 顺带修复（与本期需求无关，但被新增用例的负载暴露）

| 文件 | 状态 | 作用与原因 |
|------|------|-----------|
| `src/__tests__/store.test.ts` | 修改（+12/-6） | 「等锁超时后重读到别人刷好的新 token」原先混用真实时间（等锁循环判超时）与假时钟，机器一忙就在持锁者写入新凭据**之前**超时、随机返回 `null`——**并行负载下实测 4 次跑挂 3 次**。改为给等锁循环与 `lockOptions` 注入同一个"每次前进 10ms"的假时钟，推进过程完全确定；修后同样负载 4 次全绿。**先复现、再修**，符合仓库"修 bug 必须先写复现用例"的约定 |
