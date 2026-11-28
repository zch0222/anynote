# Changelist：管理端 Agent 运行聚合统计接口（M20.0）

> 范围：`bd4900a` ~ `ba2b03d`（OpenSpec 提案、数据库索引、`services/ai` 统计接口实现、OpenAPI baseline 同步）
> 方案与契约：[`docs/manage/MANAGE_PLAN.md`](../manage/MANAGE_PLAN.md) §6、[`.claude/openspec/changes/2026-11-27-agent-run-admin-stats.md`](../../.claude/openspec/changes/2026-11-27-agent-run-admin-stats.md)

## 概览

- 共 18 个文件：新增 9、修改 9、删除 0；合计约 +1090 / -6 行（不含方案文档本体）。
- 分布：`services/ai` 后端实现与测试（12）、`infra/sql` 迁移（2）、`openapi/specs` 生成物（1）、OpenSpec 提案（1）、`docs/manage` 里程碑勾选（2）。

### 验证结果

| 命令 | 结果 |
|------|------|
| `cd services && mvn -o test -pl ai` | 通过，140 个测试全绿 |
| `pnpm openapi:check` | 通过，生成后 `openapi/specs/` 零漂移 |
| `docker compose` 重建 `anynote-modules-ai` 并健康检查 | 通过，容器 `healthy` |
| `openapi/specs/ai.json` 语义 diff 审计 | 仅新增 `/v1/admin/agent-runs/stats` 路径与 5 个关联 schema，无既有契约变更 |

## services/ai（后端统计实现）

| 文件 | 状态 | 作用与原因 |
|------|------|-----------|
| `controller/AgentRunAdminController.java` | 修改 | 新增 `GET /v1/admin/agent-runs/stats` 端点，先走 `SystemAdminGuard` 再委派 service，管理后台概览看板唯一取数口 |
| `service/AgentRunAdminService.java` | 修改 | 接口新增 `getStats` 签名，保持 controller/service 分层惯例 |
| `service/impl/AgentRunAdminServiceImpl.java` | 修改 | 统计核心：默认 7 天窗口、90 天上限、HOUR/DAY 粒度归一化、服务端时区分桶补零、nearest-rank P95、token_usage JSON 汇总、provider+model 分组；测试用构造器注入 Clock/ZoneId 以固定时间 |
| `mapper/AgentRunMapper.java` | 修改 | 新增 `selectAdminStatsRows` 声明，按时间窗一次性取出聚合所需投影行 |
| `resources/mapper/AgentRunMapper.xml` | 修改 | 新增 `AgentRunStatsRowResultMap` 与对应 SQL，遵守新增 SQL 必须 resultMap 的仓库约定 |
| `model/bo/AgentRunStatsRowBO.java` | 新增 | 投影行 BO：避免用 `Map<String, Object>` 承载查询结果 |
| `model/vo/AgentRunAdminStatsVO.java` | 新增 | 统计响应 VO：运行/状态计数、四类 token、avg/P95 耗时、avgToolCalls、outcomes/models/series |
| `model/vo/AgentRunOutcomeCountVO.java` | 新增 | outcome 分布桶 VO |
| `model/vo/AgentRunModelBucketVO.java` | 新增 | provider+model 分组桶 VO，旧数据 null 不合成展示文案 |
| `model/vo/AgentRunTimeBucketVO.java` | 新增 | 时间桶 VO：bucketStart/总数/成败计数/token/均耗时 |
| `security/SystemAdminGuard.java` | 修改 | `ADMIN_ONLY_MESSAGE` 统一为「只有系统管理员可以访问管理接口」，消除检索参数/Trace 接口报错文不对题 |
| `controller/AgentRunAdminControllerTest.java` | 修改 | 新增 stats 端点参数传递与非超管拦截用例 |
| `security/SystemAdminGuardTest.java` | 修改 | 同步统一文案断言 |
| `service/impl/AgentRunAdminServiceImplTest.java` | 修改 | 新增统计边界单测：空数据零值、跨度超限 A0160、非法时间格式、按小时/按天聚合、P95、NULL 忽略 |

## infra/sql（统计索引迁移）

| 文件 | 状态 | 作用与原因 |
|------|------|-----------|
| `migrations/2026-11-27-agent-run-started-index.sql` | 新增 | 幂等迁移：`a_agent_run` 加 `idx_agent_run_started_outcome(started_at, outcome)`，支撑时间窗扫描与聚合 |
| `anynote.sql` | 修改 | 同步全量建表脚本中的同一索引，保持新装库与迁移库一致 |

## openapi（生成物）

| 文件 | 状态 | 作用与原因 |
|------|------|-----------|
| `openapi/specs/ai.json` | 修改 | **生成物**：`pnpm openapi:generate` 从运行中网关拉取，CI `openapi-check` 卡 diff；评审看 Controller 注解而非本文件 |

## OpenSpec 与文档

| 文件 | 状态 | 作用与原因 |
|------|------|-----------|
| `.claude/openspec/changes/2026-11-27-agent-run-admin-stats.md` | 新增 | 契约提案：时间窗默认/上限、粒度归一化、P95 口径、错误文案等全部拍板项的唯一来源 |
| `docs/manage/MANAGE_MILESTONES.md` | 修改 | 勾选 M20.0 任务清单，标记验收完成 |

## 审计要点

1. **`AgentRunAdminServiceImpl#getStats` 的聚合口径**：P95 用 nearest-rank、均值忽略 NULL、无样本返回 0——与 OpenSpec 拍板逐条对账，最易出偏差。
2. **`AgentRunMapper.xml` 的 `selectAdminStatsRows`**：时间窗 + outcome 过滤走新联合索引，确认无隐式类型转换导致索引失效。
3. **统计接口不写 `a_agent_trace_access`**：只读聚合不触碰隐私查阅审计，与详情/事件接口的留痕行为形成对照，属有意设计。
4. **`SystemAdminGuard` 文案变更**影响全部管理接口的报错断言，注意下游（含 `apps/web` 旧供应商页）是否有硬编码旧文案。
