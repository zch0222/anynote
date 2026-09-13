# Anynote CLI 可执行里程碑（M9.0 - M9.5）

> 文档版本：v2.1 | 创建 2026-09-12 | 最近更新 2026-09-13（M9.5 skill 分发与配置持久化完成）
> 关联文档：[CLI_PLAN.md](./CLI_PLAN.md)（技术方案，本文的 §N 引用都指向它） · [README.md](./README.md) · [本期改动审计清单](../changelist/2026-09-12-cli-frontend.md)
> 编号说明：**M9.x 是 CLI 自己的里程碑序列**，接在 Phase 5 的 M8 之后编号只为避免歧义，CLI 不属于 Phase 5。
> **CLI 不阻塞 Phase 5 发版**（合并 `main` + 打 tag `v0.6.0`），两条线可并行。

---

## 0. 总览

| ID | 名称 | 前置 | 状态 | 说明 |
|----|------|------|------|------|
| **M9.0** | 前置与地基 | §16 决策 | ✅ 完成（后端注解补全除外） | workspace 登记、`packages/api-core` 抽取、两份 OpenSpec 提案、CLAUDE.md 同步 |
| **M9.1** | CLI 骨架与认证 | M9.0 | ✅ 完成 | registry / 输出契约 / 退出码 / 凭据与跨进程刷新 / manifest |
| **M9.2** | 命令面 | M9.1 | 🟡 部分完成 | auth + base + note 全套已完成并端到端验证；**doc / ai / notify 本期未做** |
| **M9.3** | Skills 与漂移门禁 | M9.2 | ✅ 完成 | 3 个 skill + 生成物入库 + CI `cli` job |
| **M9.4** | MCP 与分发 | M9.3 | ⬜ 未开工 | `anynote mcp` 尚未实现 |
| **M9.5** | Skill 一键安装与配置持久化 | M9.3 | ✅ 完成 | `anynote skill install/list/uninstall`、skill 打包进 CLI、`config set/unset` |

**本期交付边界**（用户指定"先实现主要流程，至少完成知识库与笔记的增删改查"）：

- ✅ 知识库：create / get / list / update / rm
- ✅ 笔记：create / list / recent / get / set / mv / rm
- ✅ 认证：register / login / logout / whoami / status
- ✅ 元命令：manifest / doctor / config path / config get / config set / config unset
- ✅ Skill 分发：skill install / list / uninstall（Claude Code / Codex / dsh）
- ❌ 文档库与 RAG、AI 对话、通知、文件上传 —— 推到下一期
- ❌ MCP server —— 推到 M9.4

---

## M9.0 前置与地基 ✅

### 完成项

- [x] **T0.1 决策点** —— 用户指示"按方案实施"，[CLI_PLAN.md §16](./CLI_PLAN.md#16-待拍板的决策点) 六项按默认选择执行。
- [x] **T0.2 OpenSpec 提案** —— `.claude/openspec/changes/2026-09-12-cli-credential-storage.md`（凭据落盘例外与跨进程刷新协议）。
      额外新增 `2026-09-12-knowledge-base-delete-permission.md`（见下方计划外工作）。
- [x] **T0.3 CLAUDE.md 同步** —— 目录清单、禁止清单例外、测试要求表、导航、端到端门禁四处。
- [x] **T0.4 抽 `packages/api-core`** —— `errors` / `query` / `note-schemas`，外加计划外的 `codes.ts`（收敛 `ResData.code` 常量）。
      `apps/web` 四个文件改为再导出，import 路径一行未动；**595 个前端单测在抽包前后均全绿**。
- [x] **T0.6 登记 workspace** —— `pnpm-workspace.yaml` 加 `apps/cli`。

### 未做项

- [ ] **T0.5 后端补 `@Operation` 注解** —— **本期跳过**。理由：CLI 的命令 `summary` / `description` 是在
      `defineCommand` 里手写的，不依赖 spec 文案；补注解需要重建全部服务镜像，与"先打通主流程"的本期目标不匹配。
      它仍是下一期做 `doc` / `ai` 命令前的前置（note 79 个 operation 只有 7 个带 summary）。

### 计划外工作：修复后端知识库删除缺陷

跑知识库增删改查端到端流程时发现 `DELETE /api/note/bases/{id}` 的权限判断写反了：

```java
// 修复前：是创建者反而抛「没有权限删除知识库」
if (knowledgeBase.getCreateBy().equals(loginUser.getUserId())) { throw ... }
```

后果是创建者永远删不掉自己的知识库，而任何非创建者都能删别人的。按仓库规约**先写复现用例再改代码**：
新增 `KnowledgeBaseServiceImplDeleteTest`（4 条，修复前 3 条失败），改完 20 个 note 模块用例全绿，
重建 note 镜像后在真实栈复验通过。契约变更登记在
`.claude/openspec/changes/2026-09-12-knowledge-base-delete-permission.md`。

---

## M9.1 CLI 骨架与认证 ✅

### 完成项

- [x] 包脚手架：`package.json` / `tsconfig.json` / `tsup.config.ts` / 两份 vitest 配置
- [x] `core/command.ts` + `core/registry.ts`：`defineCommand` 与擦除泛型的注册表
- [x] `core/env.ts` + `core/context.ts`：环境变量 schema、依赖注入点
- [x] `core/output.ts`：JSON 信封、CJK 对齐表格、`--fields` 裁剪、stdout/stderr 分流
- [x] `core/exit.ts`：退出码常量与 `ApiError` → 退出码映射
- [x] `core/api.ts`：六域客户端、Bearer 注入、401 刷新重放、包装对象 query 展平
- [x] `auth/lock.ts` + `auth/store.ts`：跨进程锁与凭据存储，刷新严格按 §7.5 协议
- [x] `commands/auth.ts`：login / register / logout / whoami / status
- [x] `commands/meta.ts` + `manifest/`：manifest / doctor / config path
- [x] `run.ts` + `main.ts`：commander 装配、全局开关、写操作守卫、退出码收敛
- [x] `apps/cli/README.md`

### 与方案的偏差（已生效，方案文档以本节为准）

| # | 方案原文 | 实际做法 | 原因 |
|---|---------|---------|------|
| 1 | tsconfig 抄 `apps/collab` 的 NodeNext | 用默认的 `bundler` 解析 + `noEmit` | 产物由 tsup 打包，bundler 解析才能让 api-core 的无扩展名相对导入在 web(bundler) 与 CLI 两边都成立 |
| 2 | `commander ^14` | `commander ^12.1` | 锁文件可解析到的稳定版本；API 用法一致 |
| 3 | 退出码 0-5 | 增加 **6 = NOT_FOUND** | 真实后端把"资源不存在"表达成 `A0404`，与通用业务失败混在 1 里会让 agent 无法分支 |
| 4 | `mutating` 同时表示"需要 `--yes`" | 拆出独立的 `confirm` 字段 | `auth login/register/logout` 是写操作但不破坏数据，强制 `--yes` 只会制造摩擦；`confirm` 默认跟随 `mutating` |
| 5 | `auth login` 用 `@clack/prompts` 交互 | **不引入任何交互提示** | agent 场景用不到；口令统一走 `--password-stdin`，少一个依赖 |
| 6 | CLI 版本选项是 `--version` | 改成 `-v, --cli-version` | commander 的程序级 `--version` 会盖过子命令的同名选项，而 `note set --version` 是乐观并发必需参数（已有回归用例钉住） |
| 7 | tsup 只需 `bundle: true` | 追加 `noExternal: [/.*/]` 与 `createRequire` banner | 不内联则运行时加载不到 TS 源码形式的 api-core；内联 CJS 依赖后又需要真正的 `require` 垫片 |

### 实现期发现并修复的缺陷（均已补回归用例）

| 缺陷 | 现象 | 用例 |
|------|------|------|
| `createAuthFetch` 用第二参数追加请求头 | 按 fetch 规范 headers 被**整体替换**，Content-Type 丢失，后端报 `Content-Type 'application/octet-stream' is not supported` | `api.test.ts`「注入 Bearer 且保留 Content-Type」 |
| 凭据"空文件"模板是模块级常量 | `{...EMPTY}` 是浅拷贝，`profiles` 共享同一对象，保存后污染后续读取 | `store.test.ts` 四条 |
| 程序级 `--version` 吞掉子命令参数 | `note set --version <v>` 直接打印 CLI 版本号并退出 0 | `run.test.ts`「--version 属于子命令参数」 |
| commander 的解析错误不走输出契约 | 失败信息只进 stderr，JSON 模式下 stdout 空，agent 读不到 | `run.test.ts`「不给命令时…」 |
| `baseUrl` 只剥一个尾斜杠 | `http://gw//` 拼出 `//api` | `api.test.ts`「多余斜杠」 |
| 环境变量空串撞上 `min(1)` | `ANYNOTE_TOKEN=""` 直接报"环境变量不合法" | `env.test.ts`「空字符串一律视为未设置」 |

---

## M9.2 命令面 🟡

### 完成项

- [x] `commands/base.ts`：list / get / create / update / rm
- [x] `commands/note.ts`：list / recent / get / create / set / mv / rm
- [x] 写操作守卫（非 TTY 缺 `--yes` → 退出码 2 且**零请求**）与 `--dry-run`
- [x] 各命令的默认字段裁剪

### 未做项（推下一期）

- [ ] `commands/doc.ts`（文档库与 RAG）
- [ ] `commands/ai.ts`（对话、翻译）
- [ ] `commands/notify.ts`
- [ ] 文件上传相关命令 —— 仍被 M5.10 / M7.6 记录的后端缺口挡着

### 与方案的偏差

| # | 方案原文 | 实际做法 | 原因 |
|---|---------|---------|------|
| 1 | `note list` 无 `--base` 时退回 `GET /notes/list` | 拆成两条命令：`note list --base`（`POST /notes/bases/{baseId}`）与 `note recent`（`GET /notes`） | 实测 `GET /notes` 由 `n_note_operation_log` 驱动，**新建但没编辑过的笔记不出现**。同一条命令给出两种语义会让 agent 误判 |
| 2 | `base rm` 文档写"不存在时退出码 6" | 改为"不存在时 `A0301`（退出码 3）" | 实测知识库的权限切面先于存在性检查执行，从未存在过的 id 返回 `A0301`；**已删除**的知识库才返回 `A0404`。该差异已写进命令 description 与 skills |
| 3 | `note set` 默认可省略 version | 必须给 `--version` 或显式 `--force` | 省略等于静默放弃冲突检测，对 agent 太危险 |

### 真实栈验收（2026-09-12）

`pnpm --filter @anynote/cli test:e2e` —— **32 个用例全绿**，覆盖：

- 知识库：create → get → list（含 `--fields`）→ update（自动回填 cover）→ rm
- 笔记：create → list（立即可见）→ get（带 version）→ set（`--content` / `--file` / `--title`）→ recent → mv → rm
- 契约：冲突 → 5、缺 `--yes` → 2 且不落库、笔记不存在 → 6、知识库从未存在 → 3（后端 `A0301`）、已删除的知识库 → 6、`--dry-run` 不落库、`--help` → 0
- 安全：stdout 不含 accessToken、口令错误不覆盖本地凭据
- Markdown 正文往返一致（`--out` 落盘后与服务端内容逐字节相同）

---

## M9.3 Skills 与漂移门禁 ✅

### 完成项

- [x] `.claude/skills/anynote-cli/SKILL.md`：输出契约、退出码表、五个易错点、标准写入流程
- [x] `.claude/skills/anynote-notes/SKILL.md`：批量导出、带冲突保护的写回、新建后填正文、迁移
- [x] `.claude/skills/anynote-dev/SKILL.md`：compose 的 `--env-file=/dev/null`、改 Java 后的重建顺序、
      OpenAPI 生成物提交、集成测试标签等踩坑型知识
- [x] `anynote manifest --format=markdown --write` 生成 `docs/cli/COMMANDS.md` 与
      `.claude/skills/anynote-cli/reference/commands.md`，生成物入库
- [x] `.github/workflows/test.yml` 新增 `cli` job（构建 → 重新生成 → `git diff --exit-code`）

### 未做项

- [ ] `.claude/skills/anynote-ai/SKILL.md` —— 等 `commands/ai.ts` 落地后再写，避免写一份指向不存在命令的 skill
- [ ] 在真实 Claude Code 会话里验证 skill 触发准确率（description 的措辞可能还要调）

---

## M9.4 MCP 与分发 ⬜

未开工。`anynote mcp`、MCP 客户端接入文档、可选的 plugin 打包都推到下一期。
届时可直接复用 `registry` 与 `manifest/json.ts` 的 `toJsonSchema`。

> 注：M9.5 已经把"skill 分发"这一半做完了（`anynote skill install`），剩下的是 MCP server 与 plugin 打包。

---

## M9.5 Skill 一键安装与配置持久化 ✅

2026-09-13 用户要求：CLI 增加一键安装 skill 的命令，支持 dsh / Claude Code / Codex，装到**全局**目录，
**复制**模式，skill **打包进 CLI** 以保证版本匹配；同时要求 CLI 的远程地址与登录状态都持久化。

契约登记：[`.claude/openspec/changes/2026-09-13-cli-skill-install.md`](../../.claude/openspec/changes/2026-09-13-cli-skill-install.md)。

### 完成项

- [x] `src/skills/agents.ts`：**全局**与**项目级**两套 skill 根目录解析与覆盖变量
- [x] `src/skills/stamp.ts`：版本戳的写入 / 读取（幂等替换）、frontmatter `name` 解析
- [x] `src/skills/install.ts`：复制安装、幂等与升级、路径穿越防护、用户同名 skill 保护、
      本仓库源文保护、卸载
- [x] `src/commands/skill.ts`：`skill install` / `skill list` / `skill uninstall`（均支持 `--local`）
- [x] `scripts/build-bundled.mjs` + `src/bundled.ts`：构建期把 `.claude/skills/anynote-{cli,notes}` 烘焙进产物
- [x] `src/core/settings.ts`：`<configDir>/settings.json` 的设置存储（原子写、损坏即忽略）
- [x] `config set` / `config unset` / `config get`；`doctor` 汇报 apiUrl 来源与 skill 安装情况
- [x] `run.ts`：先定目录 → 读设置 → 读环境变量的启动顺序；`--api-url` 保持最高优先级
- [x] `run.ts`：数组字段声明成**可重复选项**（`--agent=a --agent=b`）

### 补充：项目级安装（`--local`）与 AI 自助安装提示词

用户追加要求「在 README 补充一个在 dsh 中让 AI 自己安装 CLI 客户端和 skill 的提示词，在项目中本地安装」，
因此在本期补做：

- [x] `skill install/list/uninstall` 增加 `--local`：装进 `<项目根>/.dsh/skills`（dsh）、
      `<项目根>/.agents/skills`（Codex）、`<项目根>/.claude/skills`（Claude Code）。
      **项目根 = 从 cwd 向上最近的含 `.git` 的目录，与 dsh 的 `findProjectRoot` 同规则**
      （规则不一致会出现「装了但 agent 看不见」）
- [x] `doctor` 改为同时报告全局与项目级两组（各 3 行）
- [x] 本仓库 skill 源文保护：在 anynote 仓库里跑 `--local` 时 `.claude/skills` 会被跳过
      （那是 `bundled.ts` 的输入），且**不受 `--force` 影响**
- [x] `README.md` 新增「让 AI 自己装好 CLI 与 skill」段：可直接粘给 agent 的四步提示词
- [x] `.gitignore` 忽略 `--local` 装出来的 `.dsh/skills/` 与 `.agents/skills/`

**关键事实（核对 dsh 源码得出）**：dsh 扫 `<项目根>/.dsh/skills`（rank 100）与
`<项目根>/.agents/skills`（rank 200），**不扫 `.claude/skills`**。所以只有 `.claude/skills` 的
仓库里 dsh 看不到这些 skill，必须用 `--local` 或全局安装。该结论已在真实 dsh 会话中验证：
`--local` 装完后两个 skill 出现在会话的可用 skill 列表里，删掉目录后又消失。

### 与方案的偏差

| # | 方案原文 | 实际做法 | 原因 |
|---|---------|---------|------|
| 1 | `CLI_PLAN.md` §11 把分发留给"M9.4 可选 plugin 打包" | 先做 `skill install`，直接复制进各 agent 的 skill 目录 | plugin 清单格式随 agent 版本变动，而"复制 skill 目录"是三家的公共子集，不依赖任何 plugin API |
| 2 | （未涉及） | `--root` 只重定向 Claude Code 的**全局**目录 | 只有它的配置根目录能被单个环境变量（`CLAUDE_CONFIG_DIR`）整体搬家；Codex / dsh 由 `CODEX_HOME` / `DSH_HOME` 决定，语义更清楚。项目级范围另由 `--local` 表达 |
| 3 | （未涉及） | 版本号只在 `package.json` 写一次，`src/version.ts` 改为再导出 | 版本号出现在 manifest、`--cli-version`、skill 版本戳三处，多一份副本就多一处漂移点；构建脚本会拒绝第二份字面量 |
| 4 | （未涉及） | 项目级安装复刻 dsh 的 `findProjectRoot`（最近 `.git`），而不是用"CLI 运行目录"或"package.json 所在目录" | 两边判定不一致时 dsh 扫的目录与 CLI 写的目录会错位，表现为"装成功了但 skill 不生效"——这是本功能最难排查的失败模式 |

### 实现期发现并修复的缺陷（均已补回归用例）

| 缺陷 | 现象 | 用例 |
|------|------|------|
| 数组字段被当成普通取值选项 | `--agent=claude --agent=dsh` 只留下最后一个字符串，zod 报 `expected array, received string` | `run.test.ts`「可重复选项（数组字段）」四条、`schema-introspect.test.ts` |
| 收集函数给了 commander 默认值 `[]` | `[]` 盖掉 zod 的 `default(["all"])`，不传 `--agent` 时所有 agent 都不装 | `run.test.ts`「不给 --agent 时走 zod 默认值」 |
| 变参 `<value...>` 会吞掉后续参数 | `--agent claude --force` 把 `--force` 当成了第二个 agent 值 | `run.test.ts`「数组选项不会吞掉紧随其后的布尔开关」 |
| `--local` 会覆盖本仓库的 skill 源文 | 在 anynote 仓库里跑 `--local` 时目标正好是 `.claude/skills/anynote-*`（`bundled.ts` 的输入），覆盖即破坏"快照 == 源文"的一致性门禁 | `skill-commands.test.ts`「拒绝覆盖本仓库的 skill 源文」两条（含 `--force` 也不放行） |
| 源文被挡时错误提示误导用户加 `--force` | 源文这条不受 `--force` 影响，但提示语与"用户同名 skill"共用一句，会让人白跑一趟 | 同上第二条用例断言 message 不含 `--force` |

### 顺带修复的既有缺陷（与本期无关，但被新增用例的负载暴露）

| 缺陷 | 现象 | 修复 |
|------|------|------|
| `store.test.ts` 的"等锁超时"用例混用真实时间与假时钟 | 机器一忙（CI / 并行跑其它包）就在持锁者写入新凭据**之前**超时，随机返回 null；实测并行负载下 4 次跑挂 3 次 | 等锁循环的 `now()` 换成每次前进 10ms 的假时钟，并给 `lockOptions` 也注入同一个 `now`，推进过程完全确定 |

### 验收（2026-09-13）

- `pnpm --filter @anynote/cli test` —— **228 条全绿**（M9.3 时为 137 条）
- `pnpm test` —— 5 任务全绿（web · CLI · collab · api-core · openapi-tools）
- `pnpm typecheck` —— 5 任务通过；`biome check apps/cli` 干净（`src/bundled.ts` 作为生成物加入 ignore）
- `pnpm --filter @anynote/cli test:e2e` —— **44 条全绿**（真实 docker 全栈，M9.3 时为 32 条），
  新增 skill 安装闭环、`--local` 项目级安装与配置持久化
- 手工烟测（真实进程）：
  - `skill install --local` 从假项目的**深层子目录**跑，项目根正确识别为假项目根，
    落点是 `.dsh/skills` / `.agents/skills` / `.claude/skills`，全局目录零改动
  - 在 anynote 仓库里跑 `--local`，`.claude/skills` 被跳进 `skipped` 且源文 `git status` 无 diff
  - 真实 dsh 会话：`--local` 装完后 `anynote-cli` / `anynote-notes` 出现在可用 skill 列表，
    删除 `.dsh/skills` 后列表清空——证明 dsh 读的是项目级根目录而非 `.claude/skills`

---

## 1. 回滚与风险控制

| 情况 | 处理 |
|------|------|
| `packages/api-core` 抽取导致 web 回归 | 改动集中在 4 个再导出文件 + `next.config.ts`，直接 revert 即可；595 个前端单测是护栏 |
| 后端删除权限修复引发争议 | 语义变化已登记 OpenSpec；回滚只需还原一行取反并删除对应测试 |
| CLI 命令面与后端契约冲突 | 走 `.claude/openspec/changes/` 提案，不在 CLI 侧硬编码 workaround |
| 整个 CLI 方向被否 | 删除 `apps/cli/`、`.claude/skills/`、`docs/cli/` 与 workspace 登记即可；`packages/api-core` 可保留（对 web 是纯收益） |

---

## 2. 进度记录

| 日期 | 里程碑 | 结果 |
|------|--------|------|
| 2026-09-12 | M9.0 | api-core 抽取完成，web 595 单测全绿；两份 OpenSpec 提案入库；CLAUDE.md 四处同步；后端删除权限缺陷修复（4 条新用例，note 模块 20 用例全绿，真实栈复验通过） |
| 2026-09-12 | M9.1 | CLI 骨架与认证完成；7 处方案偏差、6 个实现期缺陷均已记录并补回归用例 |
| 2026-09-12 | M9.2 | 知识库与笔记增删改查完成；doc / ai / notify 未做 |
| 2026-09-12 | M9.3 | 3 个 skill + 生成物入库 + CI `cli` job |
| 2026-09-12 | 全量验证 | `pnpm test` 5 任务全绿，共 850 条（web 595 · CLI 137 · collab 75 · api-core 23 · openapi-tools 20）；`pnpm typecheck` 5 任务通过；`biome check` 344 文件干净；CLI e2e 32 用例全绿 |
| 2026-09-13 | M9.5 | skill 一键安装（三家 agent、复制模式、打包进 CLI）与配置持久化完成；3 个实现期缺陷 + 1 个既有 flaky 用例修复；CLI 单测 216、e2e 43 条全绿 |

**M9.0-M9.3 的收尾**：改动由 `docs/changelist/2026-09-12-cli-frontend.md` 记录，已按 README 的 Git 工作流
拆分成 后端 / api-core / CLI / 文档与 skills 四个 commit 合入。

**M9.5 的收尾**：见 `docs/changelist/2026-09-13-cli-skill-install.md`，单个 `feat(cli)` commit 合入 `dev`。
