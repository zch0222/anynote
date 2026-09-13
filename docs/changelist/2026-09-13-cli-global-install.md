# Changelist：CLI 全局安装形态——完全不依赖项目目录（2026-09-13）

> 对应里程碑：`docs/cli/CLI_MILESTONES.md` M9.5 → 「补充：全局安装形态（等价 `npm install -g`）」
> 契约提案：[`.claude/openspec/changes/2026-09-13-cli-skill-install.md`](../../.claude/openspec/changes/2026-09-13-cli-skill-install.md)（新增「全局安装形态」一节）
> 前两批：[`2026-09-13-cli-skill-install.md`](./2026-09-13-cli-skill-install.md)（全局安装 skill + 配置持久化）、
> [`2026-09-13-cli-skill-local-install.md`](./2026-09-13-cli-skill-local-install.md)（`--local` + AI 提示词）、
> [`2026-09-13-readme-global-install.md`](./2026-09-13-readme-global-install.md)（README 统一为全局安装）
> 分支：`feat/cli-global-install` → `dev`（`--no-ff` 合并）
> 本清单按 `git status --porcelain` / `git diff --numstat` 实际输出编写。

## 概览

用户要求：**「安装完成之后 cli 就完全不依赖项目目录独立可运行，跟 `npm install -g` 要实现相同效果。
README.md 中也要有相同的安装方案，不要有任何依赖于项目目录的使用方式。」**

前几批虽然把 README 统一成"全局安装"，但**安装方式本身仍是仓库相对路径**
（`node apps/cli/dist/anynote.mjs`）——换目录即失效、删掉仓库 CLI 直接报废；
`anynote skill install` 装出去的 skill 里也写死了同一个路径，agent 在别的项目里读到必然踩坑。
本次把它换成真正的全局安装：**打包 tarball → `npm install -g`**。

| 项 | 数量 |
|----|------|
| 文件总数 | **15**（新增 3，修改 12） |
| 新增行 | **+371** |
| 删除行 | **−69** |
| 提交数 | 2（`feat(cli)` 代码与文档 · `docs(cli)` 里程碑与方案） |

按目录分布：

| 目录 | 文件 | 插入行 | 说明 |
|------|------|--------|------|
| `apps/cli/scripts/` | 1 新增 | 84 | `pack-global.mjs`：产出可全局安装的 tarball |
| `apps/cli/src/core/` | 1 新增 | 33 | `install-mode.ts`：识别全局 / 仓库 / 其它形态 |
| `apps/cli/src/__tests__/` | 1 新增 | 47 | `install-mode.test.ts` 8 条 |
| `apps/cli/src/commands/meta.ts` | 1 修改 | 8 | `doctor` 报 `installMode` / `selfContained` / `executable` |
| `apps/cli/package.json` | 1 修改 | 1 | 新增 `pack:global` 脚本 |
| `apps/cli/src/bundled.ts` | 1 修改 | 3 | **生成物**：skill 源文改了，重新构建后的快照 |
| `README.md`（仓库根） | 1 修改 | 38 | **用户要求的主体**：安装方案改为 tgz |
| `apps/cli/README.md` | 1 修改 | 49 | 安装一节重写为 tgz 流程 + 开发期用法说明 |
| `.claude/skills/**` | 3 修改 | 15 | 去掉写死的仓库相对路径（**skill 源文，同时是打包输入**） |
| `.claude/openspec/changes/` | 1 修改 | 28 | 新增「全局安装形态」节 |
| `docs/cli/**` | 3 修改 | 65 | 里程碑、方案（新增 §10.4、决策 5 改写）、生成物 |

> ⚠️ 工作区里另有**与本次无关**的既有未提交改动（`infra/docker-compose.yaml`、
> `docs/changelist/2026-09-13-nginx-tls.md`、`docs/changelist/2026-09-13-web-lan-origin.md`），
> **未被本次提交包含**，也未计入上表。

## 验证结果

| 命令 | 结果 |
|------|------|
| `pnpm --filter @anynote/cli test` | ✅ **236 passed**（15 文件；本批前 228） |
| `npx turbo test --force` | ✅ 5 任务全绿，共 **1230** 条（web 876 · CLI 236 · collab 75 · api-core 23 · openapi-tools 20） |
| `pnpm typecheck` | ✅ 5 任务通过 |
| `biome check apps/cli` | ✅ 49 文件干净 |
| `pnpm --filter @anynote/cli test:e2e` | ✅ **44 passed**（真实 docker 全栈） |
| 生成物稳定性 | ✅ 重跑 `build → manifest:write → build`，三个生成物无 diff |

### 手工烟测：独立性是本次的核心验收

1. **打包安装**：`pack:global` 产出 134 KB 的 `anynote-cli-0.1.0.tgz`；
   `npm install -g <tgz>` 后全局包是**普通目录**（`Get-Item -Force` 的 `LinkType` 为空），内含
   `anynote.mjs` + `package.json` 两个文件。
2. **删掉仓库仍可用**（关键实验）：把**整个仓库目录移走**后，在无关目录里执行
   `anynote --cli-version` → `0.1.0`；`anynote doctor` → `installMode=global`、`selfContained=true`；
   `anynote skill install` → `scope=global installed=6 skipped=0`。
3. **对照实验**（证明"必须用 tgz"不是臆测）：`npm install -g <仓库目录>` → 全局包
   `LinkType=Junction`、`Target` 指向源目录；`npm link` 同样是链接。
4. **产物静态检查**：全局 `anynote.mjs` 内**不含**任何指向本仓库的绝对路径；
   出现的 `.claude/skills` 字样全在 skill 说明文本与仓库专用的 `manifest` 命令定义里，不是运行时读取。
5. **两种形态可区分**：仓库内 `node apps/cli/dist/anynote.mjs doctor` →
   `installMode=repo`、`selfContained=false`。

## 一、CLI 功能

| 文件 | 状态 | 作用与原因 |
|------|------|-----------|
| `scripts/pack-global.mjs` | 新增（84） | 在 `dist/pack/` 造一个只含 `package.json` + 单文件 `anynote.mjs` 的发布骨架，`npm pack` 成 tgz，校验非空后清理暂存目录。用 `npm pack` 的**输出去反推产物名**而不是自己拼 scope 规则（`@anynote/cli` → `anynote-cli-0.1.0.tgz` 的规则随 npm 版本变过，首次实现时就拼错成 `cli-0.1.0.tgz`） |
| `src/core/install-mode.ts` | 新增（33） | `detectInstallMode` 按可执行文件路径判定 `global`（`node_modules/@anynote/cli` 或 `anynote-cli`）/ `repo`（`apps/cli/dist`）/ `unknown`；`isSelfContained` 只有 `repo` 为 false。存在的理由：`node apps/cli/dist/anynote.mjs` 与全局 `anynote` **行为看起来一样**，但前者依赖当前目录，必须能被测出来 |
| `src/commands/meta.ts` | 修改（+8/−2） | `doctor` 增加 `installMode` / `selfContained` / `executable`，让"我跑的是独立副本还是仓库产物"一眼可辨 |
| `apps/cli/package.json` | 修改（+1） | 新增 `pack:global` 脚本 |

## 二、测试

| 文件 | 状态 | 作用与原因 |
|------|------|-----------|
| `src/__tests__/install-mode.test.ts` | 新增（47） | 8 条：全局包（scoped / unscoped / Windows 反斜杠路径）、仓库产物（POSIX / Windows）、其它位置、空串、`node_modules` 里但不是本包（不能误判为 global）、`isSelfContained` 只有 `repo` 为 false |

## 三、文档与 skill 源文

| 文件 | 状态 | 作用与原因 |
|------|------|-----------|
| `README.md` | 修改（+38/−20） | **用户要求的主体**。提示词改为五步：`build` → `pack:global` → `npm install -g <tgz>` → `skill install` → `doctor`+`skill list` 自检；明确写出**必须装 tgz，不要 `npm install -g <目录>` / `npm link`** 及实测理由；新增升级/卸载命令；去掉所有 `node apps/cli/dist/...` 的使用方式 |
| `apps/cli/README.md` | 修改（+49/−24） | 新增「安装（全局，独立于项目目录）」一节；把 `node apps/cli/dist/anynote.mjs` 降级为"开发期直接跑构建产物"并标明依赖当前目录；「一键安装 skill」与「快速上手」里的 `CLI=...` 变量全部改为直接写 `anynote` |
| `.claude/skills/anynote-cli/SKILL.md` | 修改（+11/−7） | **去掉了写死的 `CLI="node apps/cli/dist/anynote.mjs"`**；改为 `anynote doctor`，并写明"命令不存在时按本文档装一次，不要用相对路径"；`$CLI` 全部改为 `anynote` |
| `.claude/skills/anynote-notes/SKILL.md` | 修改（+2/−2） | 同样去掉"没装全局命令时用 `node apps/cli/dist/anynote.mjs` 替代"的兜底（那正是依赖项目目录的用法） |
| `.claude/skills/anynote-cli/reference/commands.md` | 修改（+2/−2，**生成物**） | 随命令定义重新生成 |
| `docs/cli/COMMANDS.md` | 修改（+2/−2，**生成物**） | 同上 |
| `.claude/openspec/changes/2026-09-13-cli-skill-install.md` | 修改（+28/−4） | 新增「全局安装形态（`npm install -g <tgz>`）」一节：四种安装方式的实测对照表、独立性验收结论、`doctor` 新字段；验证计划补 `install-mode.test.ts` |
| `docs/cli/CLI_MILESTONES.md` | 修改（+36/−1） | M9.5 增「补充：全局安装形态」小节；缺陷表新增"README / skill 用仓库相对路径当安装方式"；验收数字更新为 236 / 44，并记录独立性实验 |
| `docs/cli/CLI_PLAN.md` | 修改（+27/−2） | 新增 §10.4 全局安装形态（含四种方式对照表与"代码/skill/文档都不许用仓库相对路径"的约束）；§16 决策 5 改写为"打包 tarball 后全局安装" |

## 审计要点

1. **`npm install -g <tgz>` 与 `npm install -g <目录>` 的区别**——这是整批改动的技术支点。
   前者解包复制，后者建 junction/symlink 指回源目录；在 Windows 上用
   `Get-Item -Force` 看 `LinkType` 即可判别（实测 Junction vs 空）。看 `pack-global.mjs` 与
   `CLI_PLAN.md` §10.4 的对照表。
2. **skill 源文里的相对路径**——`anynote-cli` / `anynote-notes` 两份 SKILL.md 是**打包输入**，
   装到全局后 agent 会在别的项目里读它们。原先那句"没装全局命令时用 `node apps/cli/dist/...` 替代"
   正是"依赖项目目录"的典型，已删除。改这两份文件后必须重新 `build`（否则 `bundled.ts` 一致性用例会红）。
3. **`detectInstallMode` 的判定依据是路径而非猜测**——它只做正则匹配，不读环境、不发请求；
   `unknown` 被当作 `selfContained: true`（至少不依赖**本项目**目录），这是刻意的：
   手动拷到 `/opt` 的单文件同样是独立的。
4. **`pack-global.mjs` 用 `npm pack` 的输出去反推产物名**——首次实现时自己拼 scope 规则拼错
   （`@anynote/cli` → `cli-0.1.0.tgz`），脚本随即因 `fs.access` 失败而报错；
   现在读 npm 的 stdout 最稳，并额外断言产物非空。
5. **`--local` 仍然存在**——本次不是删功能，而是让**默认与文档**都走全局。
   `--local` 保留给"把 skill 随仓库提交、团队克隆即可用"的场景，见 `apps/cli/README.md`。
6. **配置与凭据本来就不在项目目录**——`settings.json` / `credentials.json` 在
   `<configDir>`（`%APPDATA%\anynote` 或 `~/.anynote`），与全局安装互不干扰；
   这也是"删掉仓库后 `doctor` 仍能报出 apiUrl 与凭据状态"的原因。
