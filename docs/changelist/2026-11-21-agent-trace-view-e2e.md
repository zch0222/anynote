# Agent 运行过程展示（M17）Playwright 端到端验收与「用时」口径统一变更清单

## 概览

执行 [AGENT_TRACE_VIEW_E2E.md](../ai-refactor/AGENT_TRACE_VIEW_E2E.md) 的编排验收：脚本化供应商容器输出三轮思考增量与两次工具调用，
桌面（chromium）与移动端（Pixel 5）用例各跑一次。首轮发现两处测试侧问题并修复后，验收暴露出产品层「用时」口径不一致
（实时视图用客户端墙钟、回放用落库 `duration_ms`，同一运行完成时显示 7 秒、重进显示 5 秒），随即将口径统一为
`run.finished` 事件下发服务端 `durationMs`，前端优先采用。共 **8 个文件改动**（含本文件）。

### 验证结果

| 命令 / 操作 | 实际结果 |
|---|---|
| `python tmp/m17-repair-check/run_e2e.py`（最终轮） | 退出码 0，六项通过标准全绿：桌面/移动端用例 2/2 通过（`e2e.log`）；思考按 `original` 逐轮回传；`a_agent_run` 恰好 2 条临时供应商记录均 `ANSWERED`、`tool_calls=2`、`first_output_ms` 非空；`agent_main` 逐字段恢复、临时供应商与容器已清 |
| 第 7 步回放逐字断言 | 实时与回放整轮控件文字完全相同（`duration_ms` 7539/7033 → 两侧同样渲染），无需归一化 |
| `cd services && mvn -o test -pl ai -Dtest=AgentRunServiceImplTest` | 通过 |
| `cd apps/web && npx vitest run src/features/ai/__tests__/use-chat-stream.test.tsx` | 23 项通过 |
| `pnpm exec biome check`（3 个改动前端文件） | 无提示 |
| `pnpm openapi:generate`（ai 镜像重建后） | 成功；`ai.json` 仅 `AgentRunFinishedEventVO` 增加 `durationMs` 字段 |
| 宿主机生产构建 `cd apps/web && pnpm build` | 编译与类型检查通过、37 页全部生成；standalone 产物收集因 Windows symlink 权限报 EPERM（`next start` 只用常规 `.next`，不影响本次验收；Docker 构建在 Linux 环境无此问题） |

### 执行中发现并修复的问题（按发现顺序）

1. **脚本化供应商解析崩溃**：harness 把工具结果包成 `<untrusted-evidence>\n{...}\n</untrusted-evidence>` 再下发（`ai-service/harness/context/builder.py:305`），
   `scripted_provider.py` 的 `listed_kb_id` 直接 `json.loads(content)` 抛 `JSONDecodeError`，SSE 流在发完思考增量后断开、工具调用帧未发出，
   两次运行均 `FAILED`。修复为从首个 `{` 起 `raw_decode`（可绕过包裹与「完整结果引用」尾行）。
2. **检索尾注不符**：原查询 `M17过程展示` 与库名 `M17过程-<hex>`、库详情有词面重叠，知识库自身经 item+lexical 通道命中（`命中 1 条`）。
   查询改为与两者均不相交的 `ZXQ9 未收录词条`，空库稳定 `命中 0 条`。
3. **「用时」口径不一致**（产品侧，本次统一）：`run.finished` 事件不带 `durationMs`，实时视图只能用 `Date.now() - startedAtMs`
   客户端墙钟（含 SSE/BFF 链路开销，本次约 +1.6 秒）；落库与回放用服务端 `now - started_at`（`AgentRunServiceImpl.persistFinished`）。
   统一为持久化时把同一 `durationMs` 回填进转发的事件数据，前端优先采用、缺失时回退墙钟。

## Java AI 服务（services/ai）

| 文件 | 状态 | 作用与原因 |
|---|---|---|
| `services/ai/src/main/java/com/anynote/ai/model/vo/AgentRunFinishedEventVO.java` | 修改 | 新增 `durationMs` 字段与 `@Schema` 说明（与运行记录及过程视图落库值一致） |
| `services/ai/src/main/java/com/anynote/ai/service/impl/AgentRunServiceImpl.java` | 修改 | `persistFinished` 在算出落库 `durationMs` 后回填到 `finished` VO，转发事件与落库同源 |
| `services/ai/src/test/java/com/anynote/ai/service/impl/AgentRunServiceImplTest.java` | 修改 | 断言转发的 `run.finished` 携带非空非负 `durationMs` |

## 前端（apps/web）

| 文件 | 状态 | 作用与原因 |
|---|---|---|
| `apps/web/src/features/ai/use-chat-stream.ts` | 修改 | `run.finished` 时 `durationMs` 优先取 `event.data.durationMs`，缺失回退 `Date.now() - startedAtMs` |
| `apps/web/src/features/ai/__tests__/use-chat-stream.test.tsx` | 修改 | 「run.finished 带回…」用例补 `durationMs: 4500` 与断言 |
| `apps/web/e2e/support/agent-process.ts` | 修改 | `SEARCH_QUERY` 改为 `ZXQ9 未收录词条`，与知识库名/详情不相交，保证空库 `命中 0 条` |

## 测试编排（tmp，不入库产物）

| 文件 | 状态 | 作用与原因 |
|---|---|---|
| `tmp/m17-repair-check/scripted_provider.py` | 修改 | 新增 `tool_json()`：从首个 `{` 起 `raw_decode`，兼容 harness 的 `<untrusted-evidence>` 包裹与「完整结果引用」尾行；`SEARCH_QUERY` 与前端同步 |

## 生成物与文档

| 文件 | 状态 | 作用与原因 |
|---|---|---|
| `openapi/specs/ai.json` | 修改 | `pnpm openapi:generate` 重生 baseline：`AgentRunFinishedEventVO` 增加 `durationMs` |
| `docs/ai-refactor/AGENT_TRACE_VIEW_E2E.md` | 修改 | 状态由「待执行」更新为已通过 |
| `docs/ai-refactor/AI_MILESTONES.md` | 修改 | M17 节「未完成」行更新为 Playwright 用例已通过 |
| `docs/changelist/2026-11-21-agent-trace-view-e2e.md` | 新增 | 本文件 |
