# 2026-09-12 CLI 前端改动清单

> 对比基线：`dev` → `feat/cli-frontend` | 编写规范见 [README.md](./README.md)
> **本表严格按 git 的实际输出编写**，不是凭印象罗列。
> 复核命令：`git diff --stat dev...feat/cli-frontend` 与 `git diff --name-status dev...feat/cli-frontend`。

## 0. 概览

| 项 | 数值 |
|----|------|
| 新增文件 | 62 个 |
| 修改文件 | 11 个（其中 `pnpm-lock.yaml` 占 856 行） |
| 删除文件 | 0 |
| 合计 | 73 个文件，+8480 / −155 |

按目录：`apps/cli` 38 · `packages/api-core` 11 · `apps/web` 6 · `.claude/skills` 4 · `docs/cli` 4 ·
`.claude/openspec` 2 · `docs/changelist` 2 · `services/note` 2 · 根目录 4（`CLAUDE.md`、`pnpm-workspace.yaml`、`pnpm-lock.yaml`、`.github/workflows/test.yml`）。

> 构建产物 `apps/cli/dist/` 已被 gitignore 覆盖，不在上表内。

**验证结果（全部实际执行过）**

| 检查 | 命令 | 结果 |
|------|------|------|
| 全仓单测 | `pnpm test` | 5 个任务全绿，共 850 条：web 595 · CLI 137 · collab 75 · api-core 23 · openapi-tools 20 |
| 全仓类型检查 | `pnpm typecheck` | 5 个任务通过 |
| 代码规范 | `npx biome check .` | 344 个文件无问题 |
| Java 单测（note 模块） | `cd services && mvn -o test -pl note` | 20 个用例通过 |
| CLI 端到端 | `pnpm --filter @anynote/cli test:e2e` | 32 个用例通过（打真实 docker 全栈） |

---

## 1. 后端（services/note）

修复了一个会直接挡住"知识库删除"的权限缺陷。

| 文件 | 状态 | 作用与原因 |
|------|------|-----------|
| `services/note/src/main/java/com/anynote/note/service/impl/KnowledgeBaseServiceImpl.java` | 修改（+4/−2） | `deleteKnowledgeBaseById` 的创建者判断漏了取反，导致**创建者永远删不掉自己的知识库、非创建者却能删别人的**；补上 `!` 并加注释说明 |
| `services/note/src/test/java/com/anynote/note/service/impl/KnowledgeBaseServiceImplDeleteTest.java` | 新增 | 该缺陷的复现与回归用例（创建者可删 / 非创建者被拒且不落库 / 知识库不存在 / 影响行数不符），先写失败用例再改代码 |

---

## 2. 共享数据层（packages/api-core，新包）

从 `apps/web` 抽出前端与 CLI 都要用的数据层，避免两份实现漂移。

| 文件 | 状态 | 作用与原因 |
|------|------|-----------|
| `packages/api-core/package.json` | 新增 | 新 workspace 包 `@anynote/api-core`，以 TS 源码形式被 web 与 CLI 引用 |
| `packages/api-core/tsconfig.json` | 新增 | 继承仓库共享 tsconfig；平台中立，不引 node 类型 |
| `packages/api-core/vitest.config.ts` | 新增 | node 环境单测配置，与 `apps/collab` 保持一致 |
| `packages/api-core/src/index.ts` | 新增 | 统一出口，便于调用方一行导入 |
| `packages/api-core/src/codes.ts` | 新增 | 收敛调用方需要分支处理的 `ResData.code`（如 `A0409` 冲突），消除各处硬编码字符串 |
| `packages/api-core/src/errors.ts` | 新增 | 从 `apps/web/src/lib/api/errors.ts` 迁入的 `ApiError` 与 `unwrapEnvelope`，CLI 与 web 共用同一套信封拆包 |
| `packages/api-core/src/query.ts` | 新增 | 从 `apps/web/src/lib/api/dto-query.ts` 迁入的包装对象 query 展平器；springdoc 的 `docListDTO` 这类参数 Spring 只认平铺写法，CLI 必须复用而不是重踩 |
| `packages/api-core/src/note-schemas.ts` | 新增 | 笔记/知识库的 zod schema、`toVersion()`、分页信封、默认封面等常量；表单文案类 schema 仍留在 UI 层 |
| `packages/api-core/src/__tests__/errors.test.ts` | 新增 | 信封拆包的 9 条分支：业务码、HTTP 失败、traceId 透传、非 JSON 响应、schema 不符 |
| `packages/api-core/src/__tests__/note-schemas.test.ts` | 新增 | `toVersion` 边界、分页 `rows` 归一化、schema 容忍后端新增字段 |
| `packages/api-core/src/__tests__/query.test.ts` | 新增 | 包装对象展平、顶层标量保留、null/undefined 忽略 |

---

## 3. CLI 工程配置（apps/cli）

| 文件 | 状态 | 作用与原因 |
|------|------|-----------|
| `apps/cli/package.json` | 新增 | 包定义与脚本（`build` / `test` / `test:e2e` / `manifest:write`），bin 名 `anynote` |
| `apps/cli/tsconfig.json` | 新增 | 继承共享 tsconfig，加 node 类型与 DOM lib（要用 `Request`/`Response`） |
| `apps/cli/tsup.config.ts` | 新增 | 打成单文件 ESM 产物。两处必须的配置：`noExternal` 全量内联（否则运行时加载不到 TS 源码形式的 api-core）、banner 里补 `createRequire`（否则内联的 CJS 依赖加载 node 内建模块会抛错） |
| `apps/cli/vitest.config.ts` | 新增 | 单测配置，进默认 `pnpm test` |
| `apps/cli/vitest.e2e.config.ts` | 新增 | 端到端配置（串行、60s 超时），**不进**默认 `pnpm test` 与 CI |
| `apps/cli/README.md` | 新增 | 面向人的使用说明：构建、环境变量、凭据安全（含 Windows 无权限保护）、测试与生成物流程 |

## 4. CLI 核心层（apps/cli/src/core、src/auth）

| 文件 | 状态 | 作用与原因 |
|------|------|-----------|
| `apps/cli/src/main.ts` | 新增 | bin 入口，只负责接 `process` 并把退出码写回 `process.exitCode` |
| `apps/cli/src/run.ts` | 新增 | 用 commander 从注册表动态搭建命令树，处理全局开关、写操作守卫、`--dry-run`、异常到退出码的映射；为可测试性返回退出码而不是调用 `process.exit` |
| `apps/cli/src/version.ts` | 新增 | 版本常量（单文件产物读不到 package.json），由单测约束与 package.json 一致 |
| `apps/cli/src/core/command.ts` | 新增 | `defineCommand` 与注册表条目类型；`result()` 辅助函数保住 `render` 的入参类型 |
| `apps/cli/src/core/registry.ts` | 新增 | 全部命令的单一事实源，CLI 解析 / manifest / 文档三处共用 |
| `apps/cli/src/core/context.ts` | 新增 | 运行上下文与依赖注入点（api 客户端、凭据、IO、时钟），单测据此免起网络 |
| `apps/cli/src/core/api.ts` | 新增 | 六域 openapi-fetch 客户端 + Bearer 注入 + 401 刷新重放。**必须基于原请求头复制**再加 Authorization，否则会抹掉 Content-Type（后端会报 octet-stream 不支持） |
| `apps/cli/src/core/env.ts` | 新增 | 环境变量 schema 与默认配置目录；空字符串按"未设置"处理 |
| `apps/cli/src/core/exit.ts` | 新增 | 退出码常量与 `ApiError` → 退出码映射，是 agent 不解析文案也能决策的基础 |
| `apps/cli/src/core/output.ts` | 新增 | JSON 信封、人类可读表格（CJK 双宽对齐）、`--fields` 裁剪；**stdout 只放数据**，提示走 stderr |
| `apps/cli/src/core/schema-introspect.ts` | 新增 | 从 zod schema 反射出命令行选项形态（布尔开关 vs 取值选项）与描述文案 |
| `apps/cli/src/auth/lock.ts` | 新增 | 基于 `mkdir` 原子性的跨进程锁（含陈旧锁抢占、超时），防止多 agent 并发刷新把会话互相刷废 |
| `apps/cli/src/auth/store.ts` | 新增 | 凭据读写（多 profile、原子写、POSIX 0600）与刷新协议（前后重读 + 先落盘再释放锁） |

## 5. CLI 命令与 manifest（apps/cli/src/commands、src/manifest）

| 文件 | 状态 | 作用与原因 |
|------|------|-----------|
| `apps/cli/src/commands/auth.ts` | 新增 | `auth login/register/logout/whoami/status`；口令默认走 stdin，`--password` 会打安全告警 |
| `apps/cli/src/commands/base.ts` | 新增 | 知识库增删改查。`base update` 会先读当前封面再回填——后端 `@Url` 切面拿 cover 做白名单校验，缺省直接 NPE |
| `apps/cli/src/commands/note.ts` | 新增 | 笔记增删改查 + 移动。正文直接是 Markdown；`note set` 强制 `--version` 或 `--force`，冲突落到退出码 5 |
| `apps/cli/src/commands/meta.ts` | 新增 | `manifest`（自描述与文档生成）、`doctor`（网关与凭据自检）、`config path` |
| `apps/cli/src/manifest/json.ts` | 新增 | 注册表 → manifest JSON（含退出码表与 zod 派生的 JSON Schema）；**不含时间戳**，保证可 diff |
| `apps/cli/src/manifest/markdown.ts` | 新增 | manifest → Markdown 速查表，供 `docs/cli/COMMANDS.md` 与 skills reference 共用 |

## 6. CLI 单元测试（apps/cli/src/__tests__，137 个用例）

| 文件 | 状态 | 作用与原因 |
|------|------|-----------|
| `apps/cli/src/__tests__/helpers.ts` | 新增 | 测试夹具：可断言的 IO、打桩 fetch（桩在注入点而非全局 fetch，URL 拼装与请求头会被真实执行）、上下文构造 |
| `apps/cli/src/__tests__/exit.test.ts` | 新增 | 退出码映射的全部分支，含 HTTP 401/403/404 兜底与网络错误识别 |
| `apps/cli/src/__tests__/output.test.ts` | 新增 | 信封结构、字段裁剪、CJK 表格对齐、失败在 JSON/人类两种模式下的去向 |
| `apps/cli/src/__tests__/env.test.ts` | 新增 | 环境变量默认值、非法 URL 报错、空串视为未设置、各平台默认配置目录 |
| `apps/cli/src/__tests__/schema-introspect.test.ts` | 新增 | zod 包装类型剥离、布尔字段识别、驼峰转 kebab |
| `apps/cli/src/__tests__/lock.test.ts` | 新增 | 并发只有一个拿到锁、陈旧锁抢占、等锁超时返回 null、owner.json 损坏的退化路径 |
| `apps/cli/src/__tests__/store.test.ts` | 新增 | 原子写、多 profile 隔离、环境变量优先级、**并发刷新只打一次后端**、等锁超时后重读到别人的新 token |
| `apps/cli/src/__tests__/api.test.ts` | 新增 | 域前缀（ai 走 aiNio）、多余斜杠、**Content-Type 不被覆盖的回归护栏**、包装对象 query 展平、401 只重放一次且请求体一致 |
| `apps/cli/src/__tests__/run.test.ts` | 新增 | 参数解析、**`note set --version` 不被 CLI 版本选项吞掉的回归护栏**、写操作守卫零请求、dry-run、输出模式、异常映射 |
| `apps/cli/src/__tests__/commands.test.ts` | 新增 | 每条命令的成功与失败路径；含 `base update` 回填 cover、`note set` 的三种非法入参、输出不含 token |
| `apps/cli/src/__tests__/manifest.test.ts` | 新增 | manifest 纯函数性（无时间戳）、排序稳定、JSON Schema 正确、Markdown 渲染稳定、版本号与 package.json 一致 |

## 7. CLI 端到端测试（apps/cli/e2e，32 个用例）

| 文件 | 状态 | 作用与原因 |
|------|------|-----------|
| `apps/cli/e2e/helpers.ts` | 新增 | 以子进程方式驱动构建产物（真正的端到端：含 argv 解析、退出码、stdout），并生成随机测试账号 |
| `apps/cli/e2e/cli.live.test.ts` | 新增 | 打真实 docker 全栈：知识库与笔记的完整增删改查闭环、Markdown 往返一致、冲突→5、缺 `--yes`→2 且不落库、笔记不存在→6、知识库从未存在→3（后端 `A0301`）、`--dry-run` 不落库、创建者删除知识库（后端修复的回归） |

---

## 8. 前端改动（apps/web，均为最小化改动）

| 文件 | 状态 | 作用与原因 |
|------|------|-----------|
| `apps/web/src/lib/api/errors.ts` | 修改（−52 → 5 行） | 实现迁入 `@anynote/api-core`，此处改为再导出，页面与 hook 的 import 路径一行未动 |
| `apps/web/src/lib/api/dto-query.ts` | 修改（−24 → 5 行） | 同上，展平器迁入 api-core 后再导出 |
| `apps/web/src/features/notes/schemas.ts` | 修改（−88 → 40 行） | 数据层 schema 迁入 api-core 并再导出；带中文校验文案的表单 schema 留在本文件 |
| `apps/web/src/features/notes/use-save-note.ts` | 修改（+1/−1） | 冲突码改为引用 `RES_CODE.VERSION_CONFLICT`，消除 `"A0409"` 的第二处硬编码 |
| `apps/web/package.json` | 修改（+1） | 新增 `@anynote/api-core` workspace 依赖 |
| `apps/web/next.config.ts` | 修改（+3） | `transpilePackages` 声明 api-core：它与只含类型的 api-client 不同，带运行时代码，必须交给 Next 一起编译 |

> 回归保障：`apps/web` 现有 595 个单测在抽包前后均全绿，import 路径未变。

---

## 9. Agent 接入（.claude/skills）

| 文件 | 状态 | 作用与原因 |
|------|------|-----------|
| `.claude/skills/anynote-cli/SKILL.md` | 新增 | 入口 skill：何时用、输出契约、退出码表、五个易错点（尤其"知识库不存在会伪装成无权限"）、标准写入流程 |
| `.claude/skills/anynote-cli/reference/commands.md` | 新增（**生成物**） | 由 `anynote manifest --format=markdown --write` 生成，CI 卡 diff，不要手改 |
| `.claude/skills/anynote-notes/SKILL.md` | 新增 | 笔记配方：批量导出、带冲突保护的写回、新建后填正文、迁移知识库 |
| `.claude/skills/anynote-dev/SKILL.md` | 新增 | 仓库操作手册：compose 的 `--env-file=/dev/null`、改 Java 后的重建顺序、OpenAPI 生成物提交、集成测试标签等踩坑型知识 |

---

## 10. 规约与提案

| 文件 | 状态 | 作用与原因 |
|------|------|-----------|
| `.claude/openspec/changes/2026-09-12-cli-credential-storage.md` | 新增 | 登记 CLI 凭据落盘这一**新增例外**及其边界（路径、权限、Windows 局限、跨进程刷新协议、`ANYNOTE_TOKEN` 逃生口） |
| `.claude/openspec/changes/2026-09-12-knowledge-base-delete-permission.md` | 新增 | 登记知识库删除权限修复：请求/响应结构不变，仅权限语义变化，附修复前后对照表 |
| `CLAUDE.md` | 修改（+15/−4） | 目录清单加 `apps/cli` 与 `packages/api-core`；禁止清单加 CLI 凭据例外与生成物同步要求；测试要求表加 CLI 行；导航加 `docs/cli/`；端到端门禁加 CLI 的 e2e 命令 |

---

## 11. 文档（docs/cli、docs/changelist）

| 文件 | 状态 | 作用与原因 |
|------|------|-----------|
| `docs/cli/README.md` | 新增 | CLI 文档入口与使用者矩阵 |
| `docs/cli/CLI_PLAN.md` | 新增 | 技术方案（事实盘点、架构、选型、代码骨架、风险、决策点） |
| `docs/cli/CLI_MILESTONES.md` | 新增 | M9.0-M9.4 里程碑与本期实际执行记录（含与方案的偏差） |
| `docs/cli/COMMANDS.md` | 新增（**生成物**） | 命令速查表，与 skills reference 同源生成 |
| `docs/changelist/README.md` | 新增 | changelist 的编写规范与命名规则（`YYYY-MM-DD-<slug>.md`），后续所有改动清单都落在该目录 |
| `docs/changelist/2026-09-12-cli-frontend.md` | 新增 | 本文件 |

---

## 12. 构建与 CI

| 文件 | 状态 | 作用与原因 |
|------|------|-----------|
| `pnpm-workspace.yaml` | 修改（+1） | 登记 `apps/cli`（该文件逐个列出 apps，不是 glob，漏登记会让包完全不生效） |
| `pnpm-lock.yaml` | 修改（+856） | 新增 commander / tsup / picocolors 及两个新 workspace 包带来的锁文件更新 |
| `.github/workflows/test.yml` | 修改（+39） | 新增 `cli` job：构建 CLI 后重新生成命令文档并 `git diff --exit-code`，防止 skills 与真实命令漂移；该 job 不需要后端，留在快速反馈的 workflow 里 |

---

## 13. 审计要点（建议重点看这几处）

1. `services/.../KnowledgeBaseServiceImpl.java` 的权限取反 —— 这是本期唯一的后端行为变更，影响面是"谁能删知识库"。
2. `apps/cli/src/core/api.ts` 的请求头复制 —— 写错会静默丢 Content-Type，表现为后端 500 而不是编译错误。
3. `apps/cli/src/auth/store.ts` + `lock.ts` 的刷新协议 —— 写错会在多 agent 并发时把用户登出。
4. `apps/web/src/features/notes/schemas.ts` 等 4 处再导出 —— 确认没有改变任何对外符号（595 个前端单测已覆盖）。
5. `docs/cli/COMMANDS.md` 与 `.claude/skills/anynote-cli/reference/commands.md` 是生成物，审阅时看源头 `src/commands/**` 即可。
