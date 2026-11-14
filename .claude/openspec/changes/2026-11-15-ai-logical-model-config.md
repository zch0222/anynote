# 提案：运行时 Embedding 模型绑定与管理页面

> 方案：[`docs/ai-refactor/AI_REFACTOR_PLAN.md`](../../../docs/ai-refactor/AI_REFACTOR_PLAN.md)、[`docs/ai-refactor/AI_MILESTONES.md`](../../../docs/ai-refactor/AI_MILESTONES.md) M16.4
>
> 2026-11-15 用户确认：供应商凭据继续复用 `a_model_provider`，新增运行时逻辑模型配置表 `a_logical_model` 与管理员配置端点，在设置页「模型供应商」（桌面 `/settings/providers`、移动端 `/m/settings/providers`）新增 Embedding 模型配置卡片。

## 背景

M16.1/M16.2 将模型供应商目录与凭据收拢至 `a_model_provider` 与 `/v1/admin/model-providers`，但逻辑模型映射（如 `embedding`）此前仅由 Nacos 静态配置 `anynote.ai.models.logical` 读取。为支持在运行期开启/关闭向量索引及切换 Embedding 模型与维度，需要提供数据库持久化、快照合并与系统管理员页面。

## 数据表

新增 `infra/sql/migrations/2026-11-15-ai-logical-model.sql`，同步至 `infra/sql/anynote.sql`：

| 列 | 类型 | 说明 |
|---|---|---|
| `id` | bigint unsigned，自增主键 | |
| `logical_name` | varchar(64)，唯一键 `uk_logical_name` | 逻辑用途标识（如 `embedding`） |
| `provider_key` | varchar(64)，可空 | 关联 `a_model_provider.provider_key` |
| `model_name` | varchar(128)，可空 | 供应商侧模型名称 |
| `dimensions` | int，可空 | 期望向量维度，范围 `1..2048`（ES 8.7 上限），空表示自动探测 |
| `enabled` | tinyint，默认 0 | 是否启用（0 停用 1 启用） |
| `version` | bigint，默认 1 | 每次更新 +1 |
| `create_by` / `update_by` | bigint unsigned，默认 0 | 操作管理员 |
| `create_time` / `update_time` | datetime | 创建与更新时间 |

## 管理员外部契约

复用 `/v1/admin/model-providers` 前缀（网关 `/api/ai/v1/admin/model-providers`），均由 `SystemAdminGuard` 要求 `ADMIN_X`：

| 方法与路径 | 请求 | 成功响应 |
|---|---|---|
| `GET /v1/admin/model-providers/logical/embedding` | 无 | `ResData<EmbeddingModelConfigVO>` |
| `PUT /v1/admin/model-providers/logical/embedding` | `EmbeddingModelConfigUpdateDTO` | `ResData<EmbeddingModelConfigVO>` |

### `EmbeddingModelConfigUpdateDTO` 校验规则

- `enabled`：布尔值，非空。
- `dimensions`：可空；非空时必须处于 `1..2048`（否则返回 `A0160`：`向量维度必须在 1 到 2048 之间`）。
- 当 `enabled = true` 时：
  - `providerKey` 非空（`请选择模型供应商`）且存在于 `a_model_provider`（不存在返回 `A0404`：`所选模型供应商不存在`）；
  - 供应商必须处于启用态 `enabled = 1`（否则返回 `B0001`：`所选模型供应商已停用`）；
  - 供应商必须允许数据出境 `data_egress_allowed = 1`（否则返回 `B0001`：`所选供应商未允许数据出境，无法用于知识向量索引`）；
  - `model` 非空（`请选择 Embedding 模型`），支持从供应商 `models` 中选择或手动输入模型名（不强制限制必须在 `models` 列表内）。

## 内部快照合并规则

`GET /internal/v1/model-providers/snapshot` 保持 `@InnerAuth` 与既有字段兼容：

- `logicalModels` 中的 `LogicalModel` 扩展可选字段 `enabled`（默认 `true`）和 `dimensions`（可空）。
- 若 `a_logical_model` 中存在 `logical_name = "embedding"` 记录：
  - 无论 `enabled` 为 `true` 或 `false`，都将数据库记录写入 `logicalModels["embedding"]`（覆盖 Nacos 静态配置）；
  - `snapshot.version` 的主版本部分取 `max(providersVersion, logicalConfigVersion)`，确保修改 `embedding` 配置后快照版本号立即变化。

## 前端页面

- 在 `apps/web/src/features/model-providers/components/model-provider-settings.tsx` 内新增 `EmbeddingModelSettings` 卡片，因此桌面 `/settings/providers` 与移动端 `/m/settings/providers` 自动共用且仅 `ADMIN_X` 可见。
- 当所选供应商 `dataEgressAllowed === false` 时显示警示文案：`所选供应商未允许数据出境，无法用于知识向量索引`。
- 遵循 OpenAPI Contract-First，同步更新 `openapi/specs/ai.json` 与前端类型。
