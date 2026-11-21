# 运行过程展示（M17）Playwright 端到端验收说明

> 日期：2026-11-21
> 状态：**已通过**（2026-11-21 执行，桌面与移动端用例 2/2 通过，六项通过标准全绿）。执行中发现并修复两处测试侧问题（脚本化供应商未剥 `<untrusted-evidence>` 包裹、检索查询与库名重叠命中自身），并统一「用时」口径（`run.finished` 下发服务端 `durationMs`，前端优先采用），变更清单见 [docs/changelist/2026-11-21-agent-trace-view-e2e.md](../changelist/2026-11-21-agent-trace-view-e2e.md)。stepfun 的 Key 已在新主密钥下重新填写，§2.2 前置已满足。
> 依据：[评估文档](./AGENT_TRACE_VIEW_CODE_REVIEW.md) M8 的验收标准「M17.4 计划中的 Playwright 桌面与移动端用例补齐：用脚本化供应商输出思考增量」；[方案](./AGENT_TRACE_VIEW_PLAN.md) M17.4 验收行。
> 范围：只验收对话界面的过程展示链路，不调用外部模型；结果写回 [AI_MILESTONES.md](./AI_MILESTONES.md) M17 节与评估文档第 0 节。

## 1. 验收内容

### 1.1 本次覆盖

| 检查项 | 对应评估条目 | 在哪一步断言 |
|---|---|---|
| 思考增量在运行中实时出现，每块整段展示，不被拆成碎行 | B3、M8 | §4.2 第 3、6 步 |
| 运行中桌面显示全部行，移动端只显示最新一行 | M8 | §4.2 第 3 步 |
| 完成后收起为一行，含用时、首字时间、工具调用次数与活动摘要 | M6、L5 | §4.2 第 5 步 |
| 播报区内容与整轮控件一致 | M8 | §4.2 第 5 步 |
| 工具行的目标（知识库名）和尾注（条数、耗时） | M4、M7 | §4.2 第 6 步 |
| 结果条目链接，桌面与移动端各自的路由 | M8 | §4.2 第 6 步 |
| 重新进入会话后，按落库的过程视图回放出一样的内容 | B7 | §4.2 第 7 步 |
| 思考按 `original` 回传给下一轮模型请求 | M5 | §4.3 第 1 项 |
| 运行记录存下工具调用次数与首字时间 | M6、L5 | §4.3 第 2 项 |

### 1.2 不在本次范围

| 内容 | 由哪里覆盖 |
|---|---|
| 断流记为失败、中止记为已停止、减少动态效果不播放动画、计时不播报 | Vitest 组件与状态层用例（评估文档 8.2，已通过） |
| 无权访问时隐藏思考的提示、不可读结果条目不出现 | 8.3 第 3 项真实栈核对（已完成） |
| 两个账号同时提问各看各的思考、断流不重复正文 | 8.4 第 2、3 项，属 M17.6，需要真实推理模型 |
| 管理控制台逐轮查看 Trace | M17.5，未开始 |

## 2. 环境与前置条件

### 2.1 运行环境

| 项 | 要求 |
|---|---|
| 前端 | 宿主机生产构建 `http://localhost:3107`（`apps/web` 下 `pnpm start -p 3107`） |
| 后端 | 本机 Docker dev 全栈，命令带 `--env-file infra/.env.dev.local`；`anynote-modules-ai` 容器里有 `ANYNOTE_AI_CREDENTIAL_KEY` |
| 管理员账号 | `tmp/m17-repair-check/state.json` 的 `admin`（8.3 核对时建的临时系统管理员，角色 `ADMIN_X`），编排脚本用它调管理端接口 |
| 浏览器 | Playwright 两个 project：`chromium`（Desktop Chrome）跑 `agent-process.spec.ts`，`mobile`（Pixel 5）跑 `mobile-agent-process.spec.ts` |

### 2.2 执行前必须重新填写 stepfun 的 Key

每次智能体运行开始时，`services/ai` 读取全部供应商配置，读取过程会逐个解密 API Key（`ModelProviderServiceImpl.snapshot` → `toProviderVO`）。
开发库里 stepfun 的密文是用旧主密钥加密的，换成 `infra/.env.dev.local` 里的新主密钥后解不开。只要有一条解不开，所有运行都会失败，包括本次的脚本化模型。

### 2.3 测试账号与数据

- 账号：`global-setup.ts` 每次执行注册一个新账号 `e2e<10 位十六进制>`，桌面和移动端用例共用。新注册账号没有知识库（开发库最近 5 个 `e2e*` 账号当前的有效知识库数都是 0），所以运行时 `kb_list` 只会列出用例自己建的那一个。
- 知识库：每个 project 在 `beforeAll` 新建 `M17过程-<8 位十六进制>`，库里没有笔记；`afterAll` 删除本次会话和这个知识库。
- 提问固定为 `M17PROCESS 本次可以检索几个知识库？`。

## 3. 脚本化模型

`tmp/m17-repair-check/scripted_provider.py` 在 `python:3.12.14-slim` 容器里运行，接入 Harness 所在的 Docker 网络，提供 OpenAI 兼容的流式接口 `/v1/chat/completions`，模型名 `anynote-m17-process`。
它按请求里工具结果消息的条数判断是第几轮，最多三轮：

| 轮次 | 思考增量（拼起来的全文） | 之后的输出 |
|---|---|---|
| 1 | 先看看本次可以检索哪些知识库，再决定从哪里找答案。（4 段） | 调用 `kb_list`，无参数 |
| 2 | 知识库列表已经拿到，在这个库里检索一下相关内容。（3 段） | 调用 `kb_search`：关键词 `M17过程展示`，`kb_ids` 取上一轮 `kb_list` 返回的第一个知识库，`mode` 为 `keyword` |
| 3 | 列表里的知识库足够回答，据此作答并标注引用。（3 段） | 纯文本回答「本次可以检索的知识库共 1 个[1]。」 |

- 思考增量每段间隔 0.6 秒，每轮至少持续 1.8 秒，保证用例能看到「运行中」的状态。
- 回答里的 `[1]` 对应 `kb_list` 登记的第一条证据，也就是本次的知识库。
- `GET /control/requests` 返回每次请求里 assistant 工具调用消息带的 `reasoning_content`，供 §4.3 核对思考回传。

## 4. 执行步骤

在仓库根目录执行：

```powershell
python tmp/m17-repair-check/run_e2e.py
```

两份用例只在设置了 `E2E_AGENT_PROCESS=1` 时运行，并且依赖编排脚本临时配置的供应商。直接用 Playwright 跑，要么被跳过，要么因 `agent_main` 停用而失败。

### 4.1 编排脚本做的事

1. 备份 `a_logical_model` 里 `agent_main` 这一行，生成逐字段恢复的 `UPDATE` 语句，存到 `tmp/m17-repair-check/agent_main_restore.sql`。
2. 启动脚本化模型容器 `anynote-m17-process-<6 位十六进制>`，探测到接口可用再往下走（最多等 10 秒）。
3. 用管理员账号经网关新增临时供应商：

   | 字段 | 值 |
   |---|---|
   | `providerKey` | `m17-process-<8 位十六进制>` |
   | `baseUrl` | `http://<容器名>:8000/v1` |
   | `apiKey` | `sk-m17-local-only`（本地占位，不对应任何真实服务） |
   | `models` | `["anynote-m17-process"]` |
   | `dataEgressAllowed` / `enabled` | `true` / `true` |
   | `processReasoningMaxChars` | `8000` |

4. 把 `agent_main` 改为指向它：模型 `anynote-m17-process`，推理格式 `reasoning_content`，回传方式 `original`，启用。
5. 以 `E2E_BASE_URL=http://localhost:3107`、`E2E_AGENT_PROCESS=1` 运行两份用例，输出写入 `tmp/m17-repair-check/e2e.log`。
6. 用例跑完后做 §4.3 的两项核对。
7. 不论成功失败，都执行 §4.4 的恢复与清理。

### 4.2 用例步骤（桌面、移动端各跑一次）

| 步骤 | 操作 | 断言 |
|---|---|---|
| 1 | 打开对话页：桌面 `/ai/chat?baseId=<kbId>`，移动端 `/m/ai/chat/new?baseId=<kbId>` | — |
| 2 | 输入提问并点「发送」 | `POST .../v1/agent/runs` 返回 200，`Content-Type` 为 `text/event-stream` |
| 3 | 运行中（30 秒内） | 前端状态里这条消息仍在流式输出，过程条目至少 3 条；整轮控件文字以「思考中 · 」开头；过程行桌面至少 3 行，移动端恰好 1 行。截图 `process-streaming.png` |
| 4 | 等运行结束（60 秒内） | 终态 `ANSWERED`，没有错误；`toolCalls` 为 2；`firstOutputMs` 是数字；拿到会话 ID |
| 5 | 完成后不做操作 | 整轮控件文字匹配 `已完成，用时 N 秒 · 首字 X.X 秒 · 工具调用 2 次 · 检索 1 次`（「检索 1 次」是活动摘要，只统计 `kb_search`、`kb_read`、`kb_grep`）；播报区文字与整轮控件完全相同；过程区已收起，看不到工具行 |
| 6 | 点整轮控件展开 | 思考行 3 条，文字依次等于 §3 表格三轮的全文；工具行 2 条：第 1 条「列出可访问的知识库」，尾注 `1 个知识库 · X.X 秒`；第 2 条「检索知识库· M17过程展示 · <知识库名>」，尾注 `命中 0 条 · X.X 秒`。点开第 1 条工具行，结果条目链接桌面为 `/notes/<kbId>/overview`，移动端为 `/m/notes/<kbId>`。截图 `process-completed.png` |
| 7 | 重新进入会话：桌面 `/ai/chat/<会话ID>`，移动端 `/m/ai/chat/<会话ID>` | 整轮控件文字与第 5 步完全相同；没有「部分内容你已无权访问」的提示；第 6 步的断言全部再过一遍。截图 `process-replay.png` |

截图在 `apps/web/e2e/.output/` 下各用例的目录里。

### 4.3 用例跑完后的核对

1. **思考回传**：脚本化模型记录的每次请求里，assistant 工具调用消息带的思考应为：第 1 轮无，第 2 轮是第 1 轮的全文，第 3 轮是第 1、2 轮的全文，顺序一致。
2. **运行记录**：`a_agent_run` 中供应商为临时 `providerKey` 的记录恰好 2 条（桌面、移动端各一条），`outcome` 都是 `ANSWERED`，`tool_calls` 都是 2，`first_output_ms` 都不为空。

### 4.4 恢复与清理

| 对象 | 处理 | 怎么确认 |
|---|---|---|
| `agent_main` | 执行备份的 `UPDATE`，恢复为 stepfun / step-5-preview、推理格式 `none`、回传 `original`、停用，`version`、`update_by`、`update_time` 也恢复原值 | 重新读出整行，与备份前逐字段相同 |
| 临时供应商 | 经管理端接口删除 | 表中查不到这个 `providerKey` |
| 脚本化模型容器 | `docker rm -f` | — |
| 本次会话、临时知识库 | 用例 `afterAll` 删除 | — |

恢复后 `agent_main` 的推理格式仍是 `none`，符合评估文档「8.4 完成前不给任何逻辑模型配置推理格式」的要求；推理格式只在本次运行期间临时打开。

以下内容保留不删：`global-setup.ts` 注册的 `e2e*` 账号（和其他 E2E 一致）；2 条 `a_agent_run` 运行记录及其事件，作为验收证据（删会话只删会话本身，不会连带删除运行记录）。

## 5. 通过标准

下列各项全部满足才算通过，结果写在 `tmp/m17-repair-check/e2e-report.json`：

| 字段 | 含义 |
|---|---|
| `playwrightPassed` | 两份用例全部通过（桌面 1 条、移动端 1 条） |
| `reasoningPassthroughOk` | §4.3 第 1 项成立 |
| `agentRunsOk` | §4.3 第 2 项成立 |
| `agentMainRestored` | `agent_main` 与备份前逐字段相同 |
| `providerDeleted` | 临时供应商已删除 |
| `containerRemoved` | 脚本化模型容器已删除 |

产物：

- `tmp/m17-repair-check/e2e.log`：Playwright 完整输出
- `tmp/m17-repair-check/e2e-report.json`：上表各项结果、模型请求记录、运行记录
- `tmp/m17-repair-check/agent_main_restore.sql`：`agent_main` 恢复语句
- `apps/web/e2e/.output/`：三张截图（桌面、移动端各一组）
