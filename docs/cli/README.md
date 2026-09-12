# Anynote CLI（`@anynote/cli`）

> 文档版本：v1.1 | 创建 2026-09-12 | 最近更新 2026-09-12
> 状态：**M9.0-M9.3 已实施并通过真实栈端到端验收**；知识库与笔记的增删改查闭环可用，doc / ai / MCP 推下一期。
> 关联文档：[CLI_PLAN.md](./CLI_PLAN.md)（技术方案与代码骨架） · [CLI_MILESTONES.md](./CLI_MILESTONES.md)（里程碑与实施偏差） · [CHANGELIST.md](./CHANGELIST.md)（本期改动审计表） · [COMMANDS.md](./COMMANDS.md)（命令速查，生成物）
> 上游约束：[`CLAUDE.md`](../../CLAUDE.md)、[`README.md` 测试节](../../README.md#测试)、[`openapi/WORKFLOW.md`](../../openapi/WORKFLOW.md)

## 这是什么

Anynote 的**第四个前端**，与 `apps/web`（浏览器）、`apps/desktop`（Tauri 壳）、`apps/web-legacy`（旧版）并列：
一个让**人类在终端**、以及**各类 AI agent**（Claude Code / Codex / dsh / Cursor 等）操作 Anynote 的命令行客户端。

它解决两类问题：

| 使用者 | 场景 | 接入方式 |
|--------|------|----------|
| Claude Code | 读写笔记、检索知识库、跑仓库开发流 | `.claude/skills/anynote-*`（内含命令速查） |
| Codex / dsh / Cursor / 任意支持 MCP 的 agent | 同上 | `anynote mcp`（stdio MCP server） |
| 任意能跑 shell 的 agent | 同上 | `anynote <cmd> --json` + 固定退出码 |
| 人类 | 终端里快速改笔记、批量导出 | 人类可读输出（TTY 下默认） |

**核心设计**：一份命令注册表（registry），派生四个出口 —— CLI 解析、skills 文档、MCP 工具、Markdown 文档。
文档全部是生成物并受 CI diff 门禁保护，杜绝 skills 与真实命令漂移（与 `openapi/specs/*.json` baseline 同思路）。

## 目录

| 文档 | 内容 |
|------|------|
| [CLI_PLAN.md](./CLI_PLAN.md) | 目标与非目标、既有事实盘点、架构、技术选型与被否方案、目录结构、工程配置、七个核心模块的代码骨架、命令面映射表、skills 设计、测试计划、CI、安全合规、风险、待拍板决策点 |
| [CLI_MILESTONES.md](./CLI_MILESTONES.md) | M9.0-M9.4 的执行状态、**与方案的偏差**、实现期发现的缺陷、验收记录 |
| [CHANGELIST.md](./CHANGELIST.md) | 本期新增/修改文件的逐条说明，按 git diff 编写，供人工审计 |
| [COMMANDS.md](./COMMANDS.md)（生成物） | `anynote manifest --format=markdown` 的输出，**不要手改**；CI 卡 diff |

## 30 秒上手

```bash
pnpm --filter @anynote/cli build          # 产出单文件 dist/anynote.mjs
node apps/cli/dist/anynote.mjs auth login --username alice --password-stdin < pw.txt
node apps/cli/dist/anynote.mjs base list --json
node apps/cli/dist/anynote.mjs note get 1024 > note.md
node apps/cli/dist/anynote.mjs note set 1024 --file note.md --version 1757000000000
```

agent 侧只需要知道三件事：`--json` 输出信封、退出码表、`anynote manifest --format=json` 自描述。
三者的权威定义都在 [CLI_PLAN.md §7.3](./CLI_PLAN.md#73-输出契约与退出码)。

## 当前状态

- ✅ **可用**：认证、知识库（增删改查）、笔记（增删改查 + 移动）、`manifest` / `doctor` / `config path`。
  单测 137 条、真实栈端到端 32 条全绿。
- ❌ **本期未做**：文档库与 RAG、AI 对话、通知、文件上传（后端缺口见 [CLI_PLAN.md §15](./CLI_PLAN.md#15-风险与已知阻塞)）、`anynote mcp`。
- ⚠️ 凭据明文落盘，**Windows 上没有文件权限保护**；边界与理由见
  [`.claude/openspec/changes/2026-09-12-cli-credential-storage.md`](../../.claude/openspec/changes/2026-09-12-cli-credential-storage.md)。
- ⚠️ 实施期与方案有 10 处偏差，以 [CLI_MILESTONES.md](./CLI_MILESTONES.md) 为准。
