# Anynote CLI 技术方案（可执行版）

> 文档版本：v1.1 | 创建日期：2026-09-12 | 状态：**M9.0-M9.3 已实施**（M9.2 部分、M9.4 未开工）
> 关联文档：[README.md](./README.md) · [CLI_MILESTONES.md](./CLI_MILESTONES.md) · [本期改动审计清单](../changelist/2026-09-12-cli-frontend.md) · [`docs/refactor/FRONTEND_MILESTONES.md`](../refactor/FRONTEND_MILESTONES.md)（M5.10 / M7.6 的后端缺口）
> 本文是**方案 + 代码骨架**。执行顺序与验收标准在 [CLI_MILESTONES.md](./CLI_MILESTONES.md)。
>
> ⚠️ **实施期与本方案有 10 处偏差**（退出码增加 6 = NOT_FOUND、`mutating` 拆出 `confirm`、
> CLI 版本选项改名 `--cli-version`、`note list` 拆成 `list` / `recent`、不引入交互提示等）。
> **以 [CLI_MILESTONES.md](./CLI_MILESTONES.md) 的"与方案的偏差"两张表为准**，本文未逐条回改。
> 命令的权威清单是生成物 [COMMANDS.md](./COMMANDS.md)。

---

## 1. 目标与非目标

### 1.1 目标

1. 提供 `apps/cli`（包名 `@anynote/cli`，bin `anynote`）作为 Anynote 的命令行前端。
2. **agent 可无人值守驱动**：结构化输出、稳定退出码、自描述 manifest、无交互式全屏界面。
3. 配套 `.claude/skills/anynote-*` 让 Claude Code 开箱即用；配套 `anynote mcp` 让非 Claude agent 同样能用。
4. 完全服从仓库既有约束：contract-first（只用 `@anynote/api-client` 类型）、改动必带单测、中文 commit。
5. 文档与 skills 全部由命令注册表生成，CI 卡漂移。

### 1.2 非目标（明确不做）

| 不做 | 原因 |
|------|------|
| TUI / 全屏交互界面（ink、blessed） | agent 驱动不了；人类需求由 web/desktop 覆盖 |
| 协同编辑（yjs / `apps/collab` 接入） | CRDT 会话是长连接状态，与一次性命令模型冲突；CLI 读写走 REST 即可 |
| 富文本所见即所得编辑 | 正文本来就是 Markdown（见 §2.4），交给用户自己的编辑器 |
| 发布到公共 npm | 内部工具，monorepo 内构建分发即可（见 §16 决策 5） |
| 替代 `apps/web` 的任何功能 | CLI 是补充前端，**不进入** Phase 5 的 `web-legacy` 删除条件 |

---

## 2. 既有事实盘点（方案的地基，均已核对）

> 这一节是"为什么方案长这样"的证据链。改方案前先确认这些事实是否仍成立。

### 2.1 Gateway 路由与认证

- Gateway 路由前缀 `Path=/api/{domain}/**` + `StripPrefix=2`，域名取值：
  `auth` / `system` / `note` / `file` / `aiNio` / `notify` / `manage` / `ai`（已下线，恒 503）。
  证据：`infra/docker/nacos/configs/anynote-gateway-dev.yml`。
- **外部私有请求仅接受 `Authorization: Bearer <token>`**（Phase 5 M2 已确认并实现），旧 `accessToken` 请求头兼容已取消。
- 因此 CLI 直连 Gateway 的 base URL 形如 `http://localhost:8080/api/note`，与 `apps/web/src/lib/auth/backend.ts` 的服务端客户端同构。

### 2.2 BFF 不适合 CLI

`apps/web/src/app/api/proxy/[...path]/route.ts` 的代理层绑定了浏览器威胁模型：
httpOnly Cookie（`at` / `rt`）、`SameSite=Strict`、写请求强制 Origin 校验、进程内 `refreshWithLock`。
CLI 没有 Cookie jar、没有 Origin，而且是**多进程并发**（多个 agent 同时跑），套 BFF 只会引入摩擦。

→ **CLI 直连 Gateway 用 Bearer**，refresh 自己实现，且必须是**跨进程文件锁**（§7.5）。

### 2.3 API 规模与注解密度

| spec | paths | operations | 带 `summary` |
|------|-------|-----------|-------------|
| note | 60 | 79 | 7 |
| system | 23 | 24 | 1 |
| ai | 16 | 18 | 5 |
| file | 13 | 13 | 1 |
| auth | 6 | 6 | 6 |
| notify | 2 | 2 | 0 |

→ manifest / skills 的描述质量直接取决于 `@Operation(summary=...)` 密度。**补注解是 M9.0 的前置任务**（本来也是 Phase 1 的既定约束）。

### 2.4 笔记正文就是 Markdown（关键有利事实）

`apps/web/src/features/notes/components/note-editor.tsx:69` 保存的是 `getMarkdown(editor)` 的结果，
序列化配置见 `apps/web/src/lib/editor/markdown.ts`（`tiptap-markdown`，`html: false`）。

→ **CLI 天然适配**：`note get` 直接吐 Markdown，`note set --file x.md` 直接写回，无需引入 TipTap / ProseMirror 依赖。

⚠️ 已知有损项：`textAlign` 等节点属性没有 Markdown 表达，序列化会丢（`markdown.ts:17` 的注释）。CLI 写回同样会丢，必须在 skills 里写明。

### 2.5 乐观并发已有契约

`NoteEditDTO.version`：本次编辑所基于的版本号（由 `updateTime` 派生，见 `features/notes/schemas.ts` 的 `toVersion()`）；
省略即放弃冲突检测，按后写入者胜出处理；冲突返回 `A0409`（`use-save-note.ts` 的 `VERSION_CONFLICT_CODE`）。

→ CLI 的 `note set` **必须**支持 `--version`，并把 `A0409` 映射成独立退出码，让 agent 能识别"需要先重读再重试"而不是盲目覆盖。

### 2.6 已知的 springdoc 包装对象坑

`GET /notes/search` 的 query 参数是 `noteSearchDTO`（`$ref: NoteSearchDTO`），`GET /docs` 是 `docListDTO`。
Spring 实际按**平铺**参数绑定，bracket / dot 语法都不认。
`apps/web/src/lib/api/dto-query.ts` 的 `flattenedDtoQuerySerializer` 已经解决过一次 —— CLI 必须复用同一份，否则必然重踩（§9）。

### 2.7 工程基线

- pnpm 9 workspace + Turborepo；`pnpm-workspace.yaml` **逐个列出** `apps/*`（不是 glob），新增包必须手动登记。
- Node 22（CI `actions/setup-node@v4` 用 node-version 22；`apps/collab` 已用 `--experimental-strip-types`）。
- Biome：2 空格、`lineWidth: 100`；`dist` 已在 ignore 列表。
- 共享 tsconfig：`@anynote/tsconfig/base.json`（`strict` + `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes`）。
- 测试：Vitest；`apps/collab/vitest.config.ts` 的 node 环境配置可直接抄。
- CI：`.github/workflows/test.yml`（单测门禁）、`openapi-check.yml`（baseline 漂移门禁）。

---

## 3. 架构总览

一份命令注册表，四个出口：

```
                     ┌──────────────────────────────────────┐
                     │  src/commands/*.ts                   │
                     │  defineCommand({ name, args: zod,    │
                     │    endpoint, mutating, run })        │
                     └────────────────┬─────────────────────┘
                                      │  registry（单一事实源）
          ┌───────────────┬───────────┴───────────┬──────────────────┐
          ▼               ▼                       ▼                  ▼
   commander 解析   anynote manifest         anynote mcp        docs/cli/
   argv + --help    --format=markdown        (stdio server)     COMMANDS.md
          │               │                       │                  │
          ▼               ▼                       ▼                  ▼
     人类 / shell   .claude/skills/*/       Codex / dsh /        人类 & 任意
     agent          reference/commands.md   Cursor / Claude      agent 阅读
                    （生成物，CI 卡 diff）    （MCP 客户端）
```

一次 `anynote note get 1024` 的数据流：

```
argv → commander → zod 校验 → CliContext（注入 api / credentials / io / clock）
     → command.run() → openapi-fetch(Bearer) → Gateway /api/note/notes/1024
     → unwrapEnvelope(ResData) → CommandResult
     → JSON 信封（--json 或非 TTY）／人类渲染 → stdout
     → 退出码由 ApiError.code 映射
```

---

## 4. 技术选型

| 维度 | 选择 | 理由 |
|------|------|------|
| 语言 / 运行时 | TypeScript + Node 22（ESM） | 与 `apps/collab` 一致，CI 已是 Node 22 |
| 打包 | `tsup`（esbuild）→ 单文件 `dist/anynote.mjs` + shebang | agent 沙箱要能 `node dist/anynote.mjs` 直跑，不依赖 workspace 软链；冷启动 <100ms |
| 命令解析 | `commander` | 成熟、类型完整、体积小。manifest 是自建的，框架只需管 argv 与 `--help` |
| 参数校验 | `zod`（v4，仓库已用） | 与 web 同栈；v4 内置 `z.toJSONSchema()`，MCP 工具定义零成本派生 |
| HTTP | `openapi-fetch` + `@anynote/api-client` | 服从 contract-first；与 web 同一类型来源 |
| 终端着色 | `picocolors` | 约 2KB，无依赖 |
| 交互提示 | `@clack/prompts`（仅 `auth login`） | 每个交互点都有非交互 flag 等价物 |
| MCP | `@modelcontextprotocol/sdk` | 官方 SDK，stdio transport |
| 测试 | Vitest（node 环境） | 抄 `apps/collab/vitest.config.ts` |

### 4.1 被否决的方案

| 方案 | 否决理由 |
|------|----------|
| **oclif** | 插件体系 / manifest / 目录约定太重，冷启动慢；它的 manifest 格式与我们要喂 skills+MCP 的需求不兼容，等于两套都要写 |
| **yargs** | API 陈旧、体积大、类型推导弱 |
| **citty** | 轻且 ESM 原生，但 help 定制弱、生态小；registry 反正自建，这里优先稳定性 |
| **clipanion** | 类型强但小众，装饰器风格与仓库其它包不一致 |
| **ink / React TUI** | agent 无法驱动全屏交互（§1.2） |
| **Bun 单二进制** | 仓库无 Bun 栈，多一套工具链与 CI 矩阵 |
| **走 BFF 而非直连 Gateway** | 见 §2.2 |
| **单独发 npm 包** | 内部工具；发包会把版本同步变成额外负担（§16 决策 5） |

---

## 5. 目录结构

```
apps/cli/
├── package.json
├── tsconfig.json
├── tsup.config.ts
├── vitest.config.ts
├── README.md                      # 面向人类的使用说明（手写）
└── src/
    ├── main.ts                    # bin 入口：解析 → 分发 → 退出码
    ├── core/
    │   ├── command.ts             # defineCommand / CommandDef / CommandResult
    │   ├── registry.ts            # 所有命令的汇总与查找
    │   ├── context.ts             # CliContext 构造（依赖注入点）
    │   ├── output.ts              # JSON 信封 / 人类渲染 / 字段裁剪
    │   ├── exit.ts                # 退出码常量与 ApiError → exitCode 映射
    │   ├── api.ts                 # openapi-fetch 客户端工厂（Bearer + 401 重放）
    │   └── env.ts                 # 环境变量 schema（zod）
    ├── auth/
    │   ├── store.ts               # 凭据文件读写（多 profile、权限、原子写）
    │   ├── refresh.ts             # 刷新 + 跨进程文件锁
    │   └── lock.ts                # mkdir 原子锁（含 stale 抢占）
    ├── commands/
    │   ├── auth.ts                # login / logout / whoami / status
    │   ├── base.ts                # 知识库
    │   ├── note.ts                # 笔记（含 get/set 的 Markdown 直通）
    │   ├── doc.ts                 # 文档库 + RAG
    │   ├── ai.ts                  # 对话 / 翻译
    │   ├── notify.ts
    │   ├── meta.ts                # manifest / doctor / config
    │   └── index.ts               # 注册表装配
    ├── mcp/
    │   └── server.ts              # registry → MCP tools（stdio）
    ├── manifest/
    │   ├── json.ts                # registry → manifest JSON
    │   └── markdown.ts            # manifest JSON → COMMANDS.md / skills reference
    └── __tests__/                 # 与 apps/collab 同风格
```

新增包必须同步登记：

```yaml
# pnpm-workspace.yaml
packages:
  - "apps/web"
  - "apps/collab"
  - "apps/desktop"
  - "apps/cli"          # ← 新增
  - "packages/*"
  - "openapi"
```

---

## 6. 工程配置

### 6.1 `apps/cli/package.json`

```jsonc
{
  "name": "@anynote/cli",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "bin": { "anynote": "./dist/anynote.mjs" },
  "engines": { "node": ">=22" },
  "scripts": {
    "build": "tsup",
    "dev": "node --experimental-strip-types src/main.ts",
    "lint": "cd ../.. && biome check apps/cli/src",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "test": "vitest run",
    // 生成物写盘：CI 跑完这条后 git diff 必须为空
    "manifest:write": "node dist/anynote.mjs manifest --format=markdown --write"
  },
  "dependencies": {
    "@anynote/api-client": "workspace:^",
    "@anynote/api-core": "workspace:^",
    "@clack/prompts": "^0.9.0",
    "@modelcontextprotocol/sdk": "^1.0.0",
    "commander": "^14.0.0",
    "openapi-fetch": "^0.17.0",
    "picocolors": "^1.1.0",
    "zod": "^4.4.3"
  },
  "devDependencies": {
    "@anynote/tsconfig": "workspace:*",
    "@types/node": "^20",
    "tsup": "^8.3.0",
    "typescript": "^5",
    "vitest": "^4.1.7"
  }
}
```

> 依赖版本按当前仓库口径写，安装后以 lockfile 为准。`@modelcontextprotocol/sdk` 的 API 以安装版本的 README 为准 —— §7.7 的骨架可能需要按实际版本微调。

### 6.2 `apps/cli/tsconfig.json`

抄 `apps/collab/tsconfig.json`，只改 include：

```jsonc
{
  "extends": "@anynote/tsconfig/base.json",
  "compilerOptions": {
    "lib": ["ES2022"],
    "module": "NodeNext",
    "moduleResolution": "nodenext",
    "types": ["node"],
    "outDir": "dist",
    "rootDir": "src",
    "noEmit": false,
    "declaration": false,
    "sourceMap": true,
    // 源码写 `./x.ts`：`pnpm dev` 的类型擦除能直跑，tsc 产物里再改写成 `./x.js`
    "allowImportingTsExtensions": true,
    "rewriteRelativeImportExtensions": true
  },
  "include": ["src/**/*.ts"],
  "exclude": ["dist", "node_modules", "src/__tests__/**"]
}
```

### 6.3 `apps/cli/tsup.config.ts`

```ts
import { defineConfig } from "tsup";

export default defineConfig({
  entry: { anynote: "src/main.ts" },
  format: ["esm"],
  target: "node22",
  outExtension: () => ({ js: ".mjs" }),
  // 单文件产出：agent 沙箱里可以脱离 pnpm workspace 软链直接跑
  bundle: true,
  splitting: false,
  clean: true,
  sourcemap: true,
  banner: { js: "#!/usr/bin/env node" },
});
```

### 6.4 `apps/cli/vitest.config.ts`

与 `apps/collab/vitest.config.ts` 完全一致（node 环境、`clearMocks` / `restoreMocks`）。

### 6.5 turbo / biome

- `turbo.json` 无需改动：`build` / `test` / `lint` / `typecheck` 任务已存在，新包自动纳入。
- `biome.json` 无需改动：`dist` 已在 ignore 列表。

---

## 7. 核心模块设计

### 7.1 命令注册表

```ts
// apps/cli/src/core/command.ts
import type { z } from "zod";
import type { CliContext } from "./context.ts";

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export type CommandResult<T = unknown> = {
  /** --json 模式下写进信封 data 字段的结构化结果 */
  data: T;
  /** 人类模式的渲染；缺省时由 output.ts 做通用表格/键值渲染 */
  render?: (data: T, ctx: CliContext) => string;
};

export type CommandDef<S extends z.ZodType = z.ZodType> = {
  /** 空格分隔的命令路径，如 "note get"。MCP 工具名会把空格换成下划线 */
  name: string;
  /** 一行摘要，进 --help 与 manifest */
  summary: string;
  /** 给 agent 看的长描述：什么时候用、返回什么、常见失败如何处理 */
  description?: string;
  args: S;
  /** 写操作：非 TTY 且未给 --yes 时直接拒绝（exit 2） */
  mutating?: boolean;
  /** 映射到的后端端点，仅用于 manifest / 文档，运行时不读 */
  endpoint?: `${HttpMethod} /${string}`;
  /** 标注后端尚未打通的命令，manifest 与 skills 会带警告（见 §15） */
  status?: "stable" | "experimental" | "blocked";
  examples?: { cmd: string; note?: string }[];
  run: (ctx: CliContext, args: z.infer<S>) => Promise<CommandResult>;
};

/** 仅做类型固定，不做任何运行时包装——保持 registry 可被静态分析 */
export function defineCommand<S extends z.ZodType>(def: CommandDef<S>): CommandDef<S> {
  return def;
}
```

设计要点：

- `args` 是 zod schema 而非 commander option 声明 —— 因为它要被 **三个地方**消费：commander 的 option 定义（反射生成）、`z.toJSONSchema()` 喂 MCP、manifest 文档。
- `run` 是**纯函数**：一切副作用（网络、文件、时钟、stdout）都从 `ctx` 进，这是单测能不起后端的前提。
- `endpoint` / `status` 是元数据，让 skills 文档能自动标注"这条命令当前被后端缺口阻塞"。

### 7.2 运行上下文

```ts
// apps/cli/src/core/context.ts
import type { ApiClients } from "./api.ts";
import type { CredentialStore } from "../auth/store.ts";

export type CliIo = {
  out: (chunk: string) => void;
  err: (chunk: string) => void;
  /** 由 process.stdout.isTTY 决定；单测里固定为 false */
  isTTY: boolean;
};

export type CliContext = {
  api: ApiClients;
  credentials: CredentialStore;
  io: CliIo;
  /** 注入时钟，便于测试 token 过期与 lock 超时 */
  now: () => number;
  /** JSON 模式：--json 显式开启，或非 TTY 自动开启 */
  json: boolean;
  /** --yes：非交互确认 */
  yes: boolean;
  /** --dry-run：mutating 命令只打印将要发送的请求 */
  dryRun: boolean;
  version: string;
};
```

### 7.3 输出契约与退出码

**JSON 信封**（`--json`，或 stdout 非 TTY 时自动启用）：

```jsonc
// 成功
{ "ok": true, "command": "note get", "data": { "id": 1024, "title": "…", "content": "# …" } }

// 失败
{
  "ok": false,
  "command": "note set",
  "error": { "code": "A0409", "message": "版本冲突", "traceId": "abc-123", "exitCode": 5 }
}
```

- `code` 直接透传后端 `ResData.code`，agent 按码分支，不用 grep 中文文案。
- 人类模式（TTY 且未给 `--json`）走 `render`，默认渲染为对齐的键值/表格。
- **stdout 只放数据，日志与进度一律走 stderr** —— 否则 `anynote note get 1024 > note.md` 会被污染。

**退出码**：

| 码 | 常量 | 含义 | agent 应当怎么做 |
|----|------|------|-----------------|
| 0 | `OK` | 成功 | 继续 |
| 1 | `BUSINESS` | 业务失败（`code != "00000"` 且不属于下列特化） | 读 `error.message`，通常不可自动重试 |
| 2 | `USAGE` | 参数/用法错误（zod 校验失败、mutating 缺 `--yes`） | 修正命令行重试 |
| 3 | `AUTH` | 未认证或凭据失效（`A0301` / `A0350`，刷新也失败） | 提示用户跑 `anynote auth login` |
| 4 | `NETWORK` | Gateway 不可达、超时、DNS 失败 | 可退避重试；或提示用户起后端 |
| 5 | `CONFLICT` | 乐观并发冲突（`A0409`） | **重读 → 合并 → 带新 version 重试**，不要盲目覆盖 |

```ts
// apps/cli/src/core/exit.ts
export const ExitCode = {
  OK: 0, BUSINESS: 1, USAGE: 2, AUTH: 3, NETWORK: 4, CONFLICT: 5,
} as const;
export type ExitCodeValue = (typeof ExitCode)[keyof typeof ExitCode];

const CODE_MAP: Record<string, ExitCodeValue> = {
  A0301: ExitCode.AUTH,
  A0350: ExitCode.AUTH,
  A0409: ExitCode.CONFLICT,
  A0160: ExitCode.USAGE,
};

export function exitCodeFor(error: unknown): ExitCodeValue {
  if (error instanceof ApiError) return CODE_MAP[error.code] ?? ExitCode.BUSINESS;
  if (error instanceof UsageError) return ExitCode.USAGE;
  if (isNetworkError(error)) return ExitCode.NETWORK;
  return ExitCode.BUSINESS;
}
```

**上下文预算**（专门为 agent 设计，别小看这一条：note 的分页响应直接打印能把 agent 上下文冲垮）：

| 开关 | 默认 | 作用 |
|------|------|------|
| `--limit <n>` | 20 | 列表条数，映射到后端 `pageSize` |
| `--page <n>` | 1 | 后端 `pageNum` / `page` 从 1 起 |
| `--fields a,b,c` | 各命令有默认精简字段集 | 输出裁剪，避免整条 VO 刷屏 |
| `--out <file>` | 无 | 正文类结果落盘而非打印，stdout 只回文件路径与字节数 |
| `--full` | 关 | 关掉所有裁剪，输出原始响应 |

### 7.4 HTTP 层

```ts
// apps/cli/src/core/api.ts
import createClient from "openapi-fetch";
import type { paths as AiPaths } from "@anynote/api-client/src/ai";
import type { paths as AuthPaths } from "@anynote/api-client/src/auth";
import type { paths as FilePaths } from "@anynote/api-client/src/file";
import type { paths as NotePaths } from "@anynote/api-client/src/note";
import type { paths as NotifyPaths } from "@anynote/api-client/src/notify";
import type { paths as SystemPaths } from "@anynote/api-client/src/system";
import { flattenedDtoQuerySerializer } from "@anynote/api-core";

/**
 * Gateway 路由前缀与 nacos 的 anynote-gateway-dev.yml 一一对应。
 * 注意 ai 域走 `aiNio`：`/api/ai` 是 Phase 3 合并前的旧服务，已下线恒 503。
 */
const DOMAINS = {
  auth: "auth", system: "system", note: "note",
  file: "file", ai: "aiNio", notify: "notify",
} as const;

export function createApiClients(baseUrl: string, fetchImpl: typeof fetch) {
  const mk = <P extends {}>(domain: string) =>
    createClient<P>({
      baseUrl: `${baseUrl.replace(/\/$/, "")}/api/${domain}`,
      fetch: fetchImpl,
      // springdoc 的包装对象 query 必须展平，见 §2.6
      querySerializer: flattenedDtoQuerySerializer,
    });

  return {
    auth: mk<AuthPaths>(DOMAINS.auth),
    system: mk<SystemPaths>(DOMAINS.system),
    note: mk<NotePaths>(DOMAINS.note),
    file: mk<FilePaths>(DOMAINS.file),
    ai: mk<AiPaths>(DOMAINS.ai),
    notify: mk<NotifyPaths>(DOMAINS.notify),
  };
}
export type ApiClients = ReturnType<typeof createApiClients>;
```

401 自动刷新与重放走**自定义 fetch**（比 openapi-fetch 中间件更适合"换 token 后整体重发"）：

```ts
// apps/cli/src/core/api.ts（续）
export function createAuthFetch(store: CredentialStore): typeof fetch {
  return async (input, init) => {
    const token = await store.accessToken();
    const first = await fetch(input, withBearer(init, token));
    if (first.status !== 401) return first;

    // 401 只重试一次；刷新失败交由上层映射成 exit 3
    const rotated = await store.refresh();
    if (!rotated) return first;
    return fetch(input, withBearer(init, rotated.accessToken));
  };
}
```

⚠️ 重放前提：`init.body` 必须可重复读。CLI 的请求体都是字符串/Buffer，满足；**若将来加流式上传，必须先缓冲再重放**（与 BFF proxy route 缓冲 `arrayBuffer()` 同一个原因）。

### 7.5 认证与凭据存储

**凭据文件**：`~/.anynote/credentials.json`（Windows：`%APPDATA%\anynote\credentials.json`），可由 `ANYNOTE_CONFIG_DIR` 覆盖。

```jsonc
{
  "version": 1,
  "current": "default",
  "profiles": {
    "default": {
      "apiUrl": "http://localhost:8080",
      "accessToken": "…",
      "refreshToken": "…",
      "username": "alice",
      "obtainedAt": 1757600000000
    }
  }
}
```

- POSIX 下文件权限 `0o600`，父目录 `0o700`；**写入用"临时文件 + rename"原子替换**，避免并发写出半截 JSON。
- ⚠️ Windows 上 `chmod` 是 no-op，不提供等价保护 —— 必须在 `apps/cli/README.md` 与 skills 里明写，不要假装安全。
- 凭据来源优先级：`ANYNOTE_TOKEN` 环境变量 > `--profile <name>` 指定的 profile > `current` profile。
  `ANYNOTE_TOKEN` 场景（CI、agent 沙箱）**不落盘、不刷新**，过期直接 exit 3。

**环境变量**：

| 变量 | 默认 | 说明 |
|------|------|------|
| `ANYNOTE_API_URL` | `http://localhost:8080` | Gateway 地址 |
| `ANYNOTE_TOKEN` | — | 直接提供 accessToken，跳过凭据文件 |
| `ANYNOTE_PROFILE` | `default` | 等价于 `--profile` |
| `ANYNOTE_CONFIG_DIR` | 见上 | 凭据与配置目录 |
| `ANYNOTE_JSON` | — | 置 `1` 强制 JSON 输出 |

**跨进程刷新锁**（本方案最容易写错的一段，务必按此实现）：

```ts
// apps/cli/src/auth/refresh.ts
export async function refreshWithLock(store: CredentialStore): Promise<TokenPair | null> {
  const before = await store.read();

  const lock = await acquireLock(store.lockPath, { timeoutMs: 5_000, staleMs: 10_000 });
  if (!lock) {
    // 等锁超时：别人可能已经刷新成功，重读一次比自己再刷一次安全
    const after = await store.read();
    return after?.accessToken !== before?.accessToken ? after : null;
  }

  try {
    // 拿到锁后必须重读：等锁期间持锁者可能已经完成刷新
    const latest = await store.read();
    if (latest?.accessToken !== before?.accessToken) return latest;

    const pair = await callRefreshEndpoint(latest.refreshToken);
    await store.write({ ...latest, ...pair, obtainedAt: Date.now() }); // 先落盘
    return pair;
  } finally {
    await lock.release(); // 再释放锁
  }
}
```

**为什么必须这样**：后端 refresh 会轮换 refreshToken。若两个 agent 进程同时拿旧 rt 去刷，
后到的那个会拿着已作废的 rt 请求，结果是**两边都被登出**。规则只有两条：

1. 刷新前后都要重读凭据文件（"别人刷过了就直接用别人的"）。
2. 先落盘、再释放锁。

锁本身用 `fs.mkdir` 的原子性实现（Windows / POSIX 行为一致），目录里写 `{ pid, acquiredAt }`；
超过 `staleMs` 视为持锁进程已崩溃，可抢占。

### 7.6 manifest 生成器

```bash
anynote manifest --format=json      # 机器读：agent 自描述、MCP 工具定义来源
anynote manifest --format=markdown  # 人读：docs/cli/COMMANDS.md 与 skills reference
anynote manifest --format=markdown --write  # 直接写盘（CI 用）
```

JSON 形状：

```jsonc
{
  "cli": "anynote",
  "version": "0.1.0",
  "commands": [
    {
      "name": "note get",
      "summary": "按 ID 读取笔记，正文为 Markdown",
      "description": "…什么时候用 / 返回什么 / 失败怎么办…",
      "endpoint": "GET /notes/{noteId}",
      "mutating": false,
      "status": "stable",
      "args": { /* z.toJSONSchema(cmd.args) */ },
      "examples": [{ "cmd": "anynote note get 1024 --out note.md" }]
    }
  ]
}
```

⚠️ **绝不写入生成时间戳或机器名** —— 否则 CI 的 `git diff --exit-code` 永远失败。manifest 必须是输入的纯函数（这条要有单测，见 §12）。

### 7.7 MCP server

```ts
// apps/cli/src/mcp/server.ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registry } from "../core/registry.ts";

export async function startMcpServer(ctx: CliContext) {
  const server = new McpServer({ name: "anynote", version: ctx.version });

  for (const cmd of registry) {
    if (cmd.status === "blocked") continue; // 别把已知不通的端点暴露给 agent
    server.registerTool(
      cmd.name.replace(/ /g, "_"), // MCP 工具名不能有空格
      {
        description: cmd.description ?? cmd.summary,
        inputSchema: cmd.args,
        annotations: { readOnlyHint: !cmd.mutating, destructiveHint: Boolean(cmd.mutating) },
      },
      async (args) => {
        const result = await cmd.run(ctx, args);
        return { content: [{ type: "text", text: JSON.stringify(result.data) }] };
      },
    );
  }

  await server.connect(new StdioServerTransport());
}
```

⚠️ MCP 模式下 **stdout 被协议独占**，任何 `console.log` 都会破坏帧。`CliContext.io.out` 在 MCP 模式必须重定向到 stderr —— 这条要有单测。

客户端配置（放进 `apps/cli/README.md`，各 agent 自行抄）：

```jsonc
{
  "mcpServers": {
    "anynote": {
      "command": "node",
      "args": ["/abs/path/anynote/apps/cli/dist/anynote.mjs", "mcp"],
      "env": { "ANYNOTE_API_URL": "http://localhost:8080" }
    }
  }
}
```

---

## 8. 命令面（映射到真实端点）

> 端点均已核对 `openapi/specs/*.json`。`status` 列标注后端阻塞情况，依据见 §15。

### 8.1 认证 `anynote auth`

| 命令 | 端点 | 说明 |
|------|------|------|
| `auth login` | `POST /api/auth/login` | `--username` + `--password-stdin`（推荐）/ `--password`；TTY 下可交互 |
| `auth logout` | `POST /api/auth/logout` | 送 `{accessToken?, refreshToken?}`，至少一个；本地清 profile |
| `auth whoami` | `GET /api/system/user/mine` | 校验凭据是否真的可用 |
| `auth status` | — | 纯本地：当前 profile、apiUrl、token 是否存在与获取时间 |

### 8.2 知识库 `anynote base`

| 命令 | 端点 | 说明 |
|------|------|------|
| `base list` | `GET /api/note/bases` | 必填 `permissions`（默认值由 CLI 补），分页 |
| `base get <id>` | `GET /api/note/bases/{id}` | |
| `base create` | `POST /api/note/bases` | `mutating` |
| `base rm <id>` | `DELETE /api/note/bases/{id}` | `mutating`，强制 `--yes` |

### 8.3 笔记 `anynote note`（核心）

| 命令 | 端点 | 说明 |
|------|------|------|
| `note list` | `GET /api/note/notes` | ⚠️ 后端 **`knowledgeBaseId` 必填** → CLI 要求 `--base <id>`；不带 base 时退回 `GET /notes/list`（全量分页） |
| `note get <id>` | `GET /api/note/notes/{noteId}` | 默认输出 Markdown 正文到 stdout；`--json` 输出含 `version` 的结构 |
| `note create` | `POST /api/note/notes` | `--base` + `--title`（长度 3-15，zod 侧先卡） |
| `note set <id>` | `PATCH /api/note/notes/{noteId}` | `--file` / stdin 读正文；`--version` 乐观并发；冲突 exit 5 |
| `note mv <id>` | `PATCH /api/note/notes/{noteId}` | 传 `knowledgeBaseId` 即移动 |
| `note rm <id>` | `DELETE /api/note/notes/{noteId}` | `mutating`，强制 `--yes` |
| `note search` | `GET /api/note/notes/search` | ⚠️ 包装对象 query，靠 `flattenedDtoQuerySerializer` |
| `note history <id>` | `GET /api/note/notes/historyList` | 只读 |

`note set` 的推荐工作流（写进 skills）：

```bash
anynote note get 1024 --json > /tmp/n.json        # 拿 content 与 version
# …修改正文…
anynote note set 1024 --file /tmp/n.md --version "$(jq -r .data.version /tmp/n.json)"
# exit 5 → 有人先改了：重跑上面两步再合并
```

### 8.4 文档库与 RAG `anynote doc`

| 命令 | 端点 | status |
|------|------|--------|
| `doc list` | `GET /api/note/docs` | stable（包装对象 query） |
| `doc get <id>` | `GET /api/note/docs/{id}` | stable |
| `doc rm <id>` | `DELETE /api/note/docs/{id}` | stable，`mutating` |
| `doc index <id>` | `POST /api/note/docs/{id}/index` | experimental |
| `doc query <id>` | `POST /api/note/docs/{id}/query` | experimental（RAG 检索） |
| `doc upload` | `POST /api/note/docs/upload` + `PUT /api/note/docs/upload` | **blocked**，见 §15 |

### 8.5 AI `anynote ai`

| 命令 | 端点 | status |
|------|------|--------|
| `ai conv list` | `GET /api/aiNio/chat/conversations/list` | stable |
| `ai conv get <id>` | `GET /api/aiNio/chat/conversations/{id}` | stable |
| `ai translate` | `POST /api/aiNio/translate` | stable |
| `ai chat` | `POST /api/aiNio/chat/completions` | **experimental**：SSE，`--stream` 输出 NDJSON；见 §15 |

### 8.6 其它

| 命令 | 说明 |
|------|------|
| `notify list` | `GET /api/notify/notices` |
| `manifest` | §7.6 |
| `mcp` | §7.7 |
| `doctor` | 本地自检：Gateway 可达性、凭据有效性、CLI 版本、api-client 是否已生成 |
| `config path` / `config set apiUrl <url>` | 配置读写 |

---

## 9. `packages/api-core` 抽取清单

CLI 立刻需要以下已在 `apps/web` 实现的逻辑。两份维护必漂，**抽成 `packages/api-core`**（纯 TS、无 React、无 `server-only`）：

| 现位置 | 迁入 | 备注 |
|--------|------|------|
| `apps/web/src/lib/api/errors.ts` | `@anynote/api-core/errors` | `ApiError` + `unwrapEnvelope`（ResData 信封拆包） |
| `apps/web/src/lib/api/dto-query.ts` | `@anynote/api-core/query` | `flattenedDtoQuerySerializer`（§2.6 的坑） |
| `apps/web/src/features/notes/schemas.ts` 的纯 schema 部分 | `@anynote/api-core/schemas/note` | `toVersion()`、`pageBeanSchema`、note/base 的 zod schema |

执行方式：**迁移 + 在原位置 re-export**，`apps/web` 的 import 路径一行不改，靠现有 586 条前端单测兜底验证零回归。
这是一个独立 commit（`refactor(api-core): …`），不与 CLI 代码混。

---

## 10. Skills 设计

### 10.1 目录

```
.claude/skills/
├── anynote-cli/                    # 入口：安装、认证、全局契约、退出码、排错
│   ├── SKILL.md
│   └── reference/
│       ├── commands.md             # 生成物（anynote manifest --format=markdown）
│       └── recipes.md              # 手写：常见多步任务的组合配方
├── anynote-notes/                  # 笔记/知识库读写，含乐观并发工作流
│   └── SKILL.md
├── anynote-ai/                     # 对话、翻译、RAG
│   └── SKILL.md
└── anynote-dev/                    # 操作仓库本身：compose 启动、openapi 生成、测试门禁
    └── SKILL.md
```

### 10.2 SKILL.md 模板

```markdown
---
name: anynote-cli
description: 用 anynote CLI 读写 Anynote 的笔记、知识库、文档与 AI 对话。当用户要求查看/创建/修改 Anynote 笔记或知识库、检索 Anynote 内容、调用 Anynote AI，或提到 anynote 命令时使用。
---

# Anynote CLI

## 何时用
- 用户要读写 Anynote 的笔记 / 知识库 / 文档 / AI 对话
- 不要用于：改这个仓库的代码（那是普通编辑任务）、协同编辑会话

## 准备
CLI 位于 `apps/cli`，先构建一次：`pnpm --filter @anynote/cli build`
认证：`anynote auth status` 检查；未登录时提示用户自己跑 `anynote auth login`（不要代替用户输密码）

## 输出契约
所有命令支持 `--json`，非 TTY 下自动开启。信封与退出码见 reference/commands.md 顶部。
**退出码 5 = 版本冲突**：必须重读笔记、合并、带新 version 重试，禁止盲目覆盖。

## 上下文预算
列表默认 `--limit 20`；正文大时用 `--out <file>` 落盘再读，不要直接打印。

@reference/commands.md
@reference/recipes.md
```

要点：

- `description` 决定触发准确率，必须写"**什么时候**用"而不只是"是什么"。
- `reference/commands.md` 是**生成物**，SKILL.md 里只写判断规则与约束，两者职责不混。
- `anynote-dev` 值得单列：CLAUDE.md 里 "dev 必须 `--env-file=/dev/null`"、"prod 必须显式三件套" 这类**踩坑型知识**做成 skill，比让每个 agent 通读 CLAUDE.md 再自行领悟可靠得多。

### 10.3 漂移门禁

与 `openapi/specs/*.json` baseline 同思路：生成物入库，CI 重新生成后 diff 必须为空。

```yaml
# .github/workflows/test.yml 追加一个 job
  cli:
    name: CLI unit tests & manifest drift
    runs-on: ubuntu-latest
    timeout-minutes: 15
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with: { version: 9 }
      - uses: actions/setup-node@v4
        with: { node-version: '22', cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm --filter @anynote/cli test
      - run: pnpm --filter @anynote/cli build
      - run: pnpm --filter @anynote/cli manifest:write
      - name: Detect manifest drift
        run: |
          if ! git diff --exit-code docs/cli/COMMANDS.md .claude/skills/; then
            echo "::error::CLI manifest drift. 本地跑 pnpm --filter @anynote/cli manifest:write 并提交生成物。"
            exit 1
          fi
```

> 该 job **不需要后端**（manifest 只读 registry），所以可以留在快速反馈的 `test.yml` 里，与 `openapi-check.yml` 的重量级全栈门禁分开。

---

## 11. 非 Claude agent 的接入

| agent | 接入方式 | 需要我们做什么 |
|-------|----------|---------------|
| Claude Code | `.claude/skills/anynote-*` | §10 |
| Codex / dsh / Cursor / 任意 MCP 客户端 | `anynote mcp` stdio server | §7.7 + README 里的配置片段 |
| 任意能跑 shell 的 agent | `anynote <cmd> --json`；`anynote manifest --format=json` 自描述 | §7.3 / §7.6 |
| 读仓库文档的 agent | `AGENTS.md` → `CLAUDE.md` → 本目录 | 在 CLAUDE.md 的「上下文文档导航」加一行指针（M9.0 任务） |

⚠️ `AGENTS.md` 按仓库约定**保持纯指针**，不要在里面追加 CLI 规约内容。

可选（M9.4）：打成 Claude Code plugin，把 skills + `.mcp.json` 一起分发，换机器一条命令装齐。
plugin 清单格式以当时的 Claude Code 文档为准，本方案不预设其字段。

---

## 12. 测试计划

对照 CLAUDE.md「测试要求（强制）」逐条落实。全部 Vitest node 环境，**不起后端、不连中间件**，可进默认 `pnpm test`。

| 模块 | 必测点 |
|------|--------|
| `core/command.ts` + zod args | 必填缺失 / 类型错误 / 边界（`title` 长度 3-15、`pageSize` 上限） |
| `core/output.ts` | JSON 信封形状、`--fields` 裁剪、人类渲染不污染 stdout、非 TTY 自动 JSON |
| `core/exit.ts` | `A0301`/`A0350`→3、`A0409`→5、`A0160`→2、网络错误→4、未知业务码→1 |
| `core/api.ts` | baseUrl 拼接（`aiNio` 而非 `ai`）、包装对象 query 展平、401 刷新后重放**且只重放一次** |
| `auth/store.ts` | 原子写（写坏的临时文件不污染原文件）、多 profile 切换、`ANYNOTE_TOKEN` 优先级、POSIX 权限位 |
| `auth/lock.ts` | 并发获取只有一个成功、stale 锁可抢占、超时返回 null |
| `auth/refresh.ts` | **并发刷新只发一次请求**、等锁方重读得到新 token、刷新失败映射 exit 3 |
| `manifest/*` | 同输入同输出（无时间戳/机器名）、markdown 渲染稳定、`z.toJSONSchema` 转换不抛 |
| `mcp/server.ts` | `blocked` 命令不暴露、工具名无空格、**stdout 不被日志污染** |
| 各 `commands/*.ts` | 每条命令至少 1 条成功路径 + 1 条业务失败路径；`mutating` 命令验证非 TTY 缺 `--yes` 时 exit 2 且**不发请求** |

网络层打桩方式与 web 一致：**桩在 `openapi-fetch` 客户端 / 注入的 `fetch`，不 mock 全局 `fetch`**。

Bug 修复一律先写复现用例再改代码。

---

## 13. CI 集成

| workflow | 改动 |
|----------|------|
| `test.yml` | 新增 `cli` job（§10.3）。`pnpm test` 经 turbo 已自动带上新包的单测，但 manifest 漂移需要单独一步 |
| `openapi-check.yml` | **无需改动**。CLI 不产出 spec；但后端改 Controller 后若命令面受影响，由 `cli` job 的 drift 检查暴露 |

---

## 14. 安全与合规

### 14.1 必须先走 OpenSpec 提案

CLAUDE.md 的禁止清单目前写的是「前端把 token 写到 `document.cookie` / localStorage / sessionStorage」，
唯一例外是 `apps/web/src/lib/desktop/bridge.ts`（M8.2 授权）。

**CLI 把 token 写本地文件是一个新场景**，按仓库约定必须：

1. 写 `.claude/openspec/changes/2026-09-12-cli-credential-storage.md`：说明存储位置、权限、Windows 局限、刷新锁、`ANYNOTE_TOKEN` 逃生口。
2. 在 CLAUDE.md 禁止清单里按 desktop bridge 的口径加一条显式例外。
3. 同时在「上下文文档导航」加 `docs/cli/` 指针（文档维护约定要求，见 CLAUDE.md）。

**不要绕过这一步直接写代码。**

### 14.2 其它安全约束

- `--password` 明文参数会进 shell history 与 `ps` 输出：**默认路径是 `--password-stdin`**，`--password` 要打印告警到 stderr。
- 日志/错误信息里**永不打印 token**；`auth status` 只显示存在性与获取时间。
- `doctor` 输出 apiUrl 与用户名，不输出任何凭据。
- MCP 模式默认暴露只读命令；`mutating` 命令带 `destructiveHint`，是否暴露由 §16 决策 3 决定。
- CLI 不接触 `DESKTOP_EXCHANGE_KEY` / `COLLAB_TOKEN_SECRET`，与桌面壳、协同服务的凭据体系完全隔离。

---

## 15. 风险与已知阻塞

| # | 风险 | 影响 | 缓解 |
|---|------|------|------|
| 1 | **`@Operation` 注解稀疏**（note 79 ops 仅 7 条有 summary） | manifest / skills 描述质量差，agent 选错命令 | M9.0 前置补注解；CLI 侧 `summary` 手写兜底，不完全依赖 spec |
| 2 | **上传链路后端缺口**（M5.10 图片分片直传被 `@InnerAuth` 拦截；M7.6 PDF 转存同族失败） | `doc upload` / 图片上传不可用 | 标 `status: "blocked"`，不在 MCP 暴露，skills 明写"当前不可用" |
| 3 | **AI 流式受阻**（M7.6 记录 AI 流式全链路未通） | `ai chat --stream` 不可靠 | 标 `experimental`；先做非流式 `noConversation` 路径 |
| 4 | `GET /notes` 的 `knowledgeBaseId` 必填 | `note list` 无法全局列笔记 | `--base` 必填，否则自动退回 `GET /notes/list` |
| 5 | Markdown 往返有损（`textAlign` 等） | CLI 写回可能丢格式 | skills 明写；`note set` 在 stderr 提示 |
| 6 | Windows 无文件权限保护 | 凭据可被同机其它进程读 | README/skills 明写；提供 `ANYNOTE_TOKEN` 逃生口 |
| 7 | 并发刷新把会话刷没 | 多 agent 场景直接登出 | §7.5 的锁 + 重读协议，配套并发单测 |
| 8 | 大响应撑爆 agent 上下文 | agent 任务失败 | §7.3 的默认裁剪 + `--out` |
| 9 | 抽 `api-core` 动到已验收的 web 代码 | Phase 5 回归 | 迁移 + 原位 re-export，586 条前端单测兜底，独立 commit |

---

## 16. 决策点（已确认）

2026-09-12 用户指示"按本方案实施"，六项按默认选择执行；第 4 项在实施中按用户"本期先实现主要流程"的要求收窄。

| # | 决策 | 结论 | 落点 |
|---|------|------|------|
| 1 | 凭据是否落盘 | ✅ 落盘 + `ANYNOTE_TOKEN` 覆盖 | `apps/cli/src/auth/store.ts`；例外登记在 `.claude/openspec/changes/2026-09-12-cli-credential-storage.md` 与 CLAUDE.md 禁止清单 |
| 2 | 是否抽 `packages/api-core` | ✅ 抽（外加 `codes.ts`） | `packages/api-core/`；`apps/web` 四处改为再导出，595 单测全绿 |
| 3 | MCP 是否暴露写命令 | ✅ 维持"暴露 + destructiveHint" | **尚未实现**，随 M9.4 一起做 |
| 4 | 首批命令面范围 | 🔻 收窄为 **auth + base + note 全套**；doc / ai / notify 推下一期 | 用户指定"本期先实现主要流程，至少完成知识库与笔记增删改查" |
| 5 | 分发方式 | ✅ monorepo 内构建，不发 npm | `pnpm --filter @anynote/cli build` → `apps/cli/dist/anynote.mjs`（单文件，已内联全部依赖） |
| 6 | 是否进默认 `pnpm test` | ✅ 进（e2e 另走 `test:e2e`） | `turbo test` 已自动纳入；CI 另加 `cli` job 卡生成物漂移 |
