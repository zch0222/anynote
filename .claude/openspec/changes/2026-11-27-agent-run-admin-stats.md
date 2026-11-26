# API 变更提案：M20 Agent 运行管理统计接口

> 方案：[`docs/manage/MANAGE_PLAN.md`](../../../docs/manage/MANAGE_PLAN.md) §6.1；里程碑：[`docs/manage/MANAGE_MILESTONES.md`](../../../docs/manage/MANAGE_MILESTONES.md) M20.0
>
> 2026-11-27 用户确认统计口径：P95 使用 nearest-rank（排序后取 `ceil(0.95 * n)` 项）；
> 时间序列缺失桶补零；`HOUR` / `DAY` 按服务端系统时区分桶（容器固定 `Asia/Shanghai`）；
> 平均值忽略 `NULL` 且空数据集返回 0；`succeededRuns` / `failedRuns` / `cancelledRuns` 按运行状态
> `COMPLETED` / `FAILED` / `CANCELLED` 统计，`outcomes` 仅表达结果分布；`startedFrom > startedTo` 返回 `A0160`。

## 背景与范围

服务管理后台一期的 `/ai/overview` 需要只读运行聚合数据。现有 `GET /v1/admin/agent-runs` 只支持分页列表，
缺少时间窗内的状态汇总、Token 汇总、耗时均值与 P95、模型分布和按时间分桶趋势。本提案在 `services/ai`
以非破坏性方式新增一个管理端统计端点，并补齐按开始时间范围查询所需的联合索引。

## 对外端点

所有路径是 AI 服务内路径。Gateway 沿用既有 `/api/ai/**` 与 `StripPrefix=2`，外部路径为
`/api/ai/v1/admin/agent-runs/stats`，本提案不新增 Gateway 路由。

| 方法 | 服务内路径 | 说明 |
|---|---|---|
| GET | `/v1/admin/agent-runs/stats` | 查询 Agent 运行聚合统计，仅 `ADMIN_X` 可访问 |

## 查询参数

| 参数 | 必填 | 说明 |
|---|---|---|
| `startedFrom` | 否 | ISO-8601 开始时间下界；缺省为 `startedTo` 往前 7 天 |
| `startedTo` | 否 | ISO-8601 开始时间上界；缺省为当前时间 |
| `granularity` | 否 | 时间桶粒度：`HOUR` 或 `DAY`；未传时跨度不超过 48 小时按 `HOUR`，否则按 `DAY` |

约束：

- 时间跨度最大 90 天；超过 90 天或 `startedFrom > startedTo` 返回 `A0160`。
- `granularity` 只接受 `HOUR` / `DAY`（服务端按大小写不敏感归一化）；其他值返回 `A0160`。
- 该接口为只读聚合，不写 `a_agent_trace_access`。

## 响应结构

返回 `ResData<AgentRunAdminStatsVO>`：

```json
{
  "code": "00000",
  "msg": "操作成功",
  "data": {
    "totalRuns": 12,
    "runningRuns": 1,
    "succeededRuns": 10,
    "failedRuns": 1,
    "cancelledRuns": 0,
    "promptTokens": 12000,
    "completionTokens": 3000,
    "reasoningTokens": 800,
    "totalTokens": 15000,
    "avgDurationMs": 4200,
    "p95DurationMs": 9000,
    "avgFirstOutputMs": 700,
    "p95FirstOutputMs": 1600,
    "avgToolCalls": 1.5,
    "outcomes": [
      { "outcome": "ANSWERED", "count": 9 },
      { "outcome": "NOT_FOUND", "count": 1 }
    ],
    "models": [
      { "provider": "stepfun", "model": "step-3", "runs": 12, "totalTokens": 15000 }
    ],
    "series": [
      {
        "bucketStart": "2026-11-20T00:00:00.000+08:00",
        "totalRuns": 3,
        "succeededRuns": 3,
        "failedRuns": 0,
        "totalTokens": 4200,
        "avgDurationMs": 3800
      }
    ]
  }
}
```

强类型 schema：

| Schema | 字段 |
|---|---|
| `AgentRunAdminStatsVO` | `totalRuns`、`runningRuns`、`succeededRuns`、`failedRuns`、`cancelledRuns`、`promptTokens`、`completionTokens`、`reasoningTokens`、`totalTokens`、`avgDurationMs`、`p95DurationMs`、`avgFirstOutputMs`、`p95FirstOutputMs`、`avgToolCalls`、`outcomes`、`models`、`series` |
| `AgentRunOutcomeCountVO` | `outcome`、`count` |
| `AgentRunModelBucketVO` | `provider`、`model`、`runs`、`totalTokens` |
| `AgentRunTimeBucketVO` | `bucketStart`、`totalRuns`、`succeededRuns`、`failedRuns`、`totalTokens`、`avgDurationMs` |

统计口径：

- `runningRuns` / `succeededRuns` / `failedRuns` / `cancelledRuns` 分别统计 `state` 为 `RUNNING` / `COMPLETED` / `FAILED` / `CANCELLED` 的运行。
- `outcomes` 只统计非空 `outcome`，按次数降序、次数相同按结果名升序返回。
- Token 聚合读取 `token_usage` JSON 中的 `promptTokens` / `completionTokens` / `reasoningTokens` / `totalTokens`，字段缺失按 0 处理。
- `avgDurationMs`、`avgFirstOutputMs`、`avgToolCalls` 忽略 `NULL`；无任何有效样本时返回 0。毫秒均值四舍五入为整数。
- P95 使用 nearest-rank；无任何有效样本时返回 0。
- `series` 在请求时间范围内按服务端系统时区对齐到小时或自然日，缺失桶补零。
- `models` 按 `provider + model` 分组；旧数据中未回填的供应商或模型保持 `NULL`，不合成展示文案。

## 数据变更

| 表 | 变更 |
|---|---|
| `a_agent_run` | 新增联合索引 `idx_agent_run_started_outcome(started_at, outcome)` |

迁移文件：`infra/sql/migrations/2026-11-27-agent-run-started-index.sql`，手动执行并同步 `infra/sql/anynote.sql`。
迁移脚本通过 `information_schema.STATISTICS` 判断后动态执行，重复运行不报错。

## 既有文案统一

`SystemAdminGuard.ADMIN_ONLY_MESSAGE` 从供应商专用文案统一为“只有系统管理员可以访问管理接口”，
覆盖模型供应商、逻辑模型、检索参数与运行 Trace 全部管理端点；同步更新既有单测断言。

## 验证

- Java JUnit 5 + Mockito 纯单测覆盖：非超管拦截、空数据集零值返回、跨度超限报错、起止倒置报错、
  非法粒度报错、按小时/按天聚合、缺失桶补零、P95 nearest-rank、NULL 平均值忽略与 Token 汇总。
- `cd services && mvn -o test -pl ai` 全绿。
- 后端运行后执行 `pnpm openapi:generate`，提交更新后的 `openapi/specs/ai.json`；`pnpm openapi:check` 无漂移。
