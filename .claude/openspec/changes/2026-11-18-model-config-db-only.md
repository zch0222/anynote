# API 变更提案：模型配置去 Nacos 化（供应商与逻辑模型全部走数据库）

> 方案：[`docs/ai-refactor/AGENT_TRACE_VIEW_PLAN.md`](../../../docs/ai-refactor/AGENT_TRACE_VIEW_PLAN.md) §5.3、2026-11-18 用户拍板（C3 扩展）
>
> 2026-11-18 用户确认：去除 Nacos 中的模型配置，LLM 与逻辑模型等全部不依赖 Nacos，只用数据库配置；
> 运行期间可切换全局使用的模型，进行中的 loop 继续用开跑时的旧配置跑完，新 loop 使用新配置。

## 背景

模型供应商凭据已在 `a_model_provider`（M16.1），但逻辑模型映射仍从 Nacos `anynote.ai.models.logical`
读取（dev 环境 `logical: {}`，实际为空），管理界面只覆盖 `embedding` 一个逻辑模型。
这导致 `agent_main`/`fast` 无处可配、无法在运行期切换。本提案把逻辑模型全部收进数据库并通用化管理。

## 数据变更

`a_logical_model` 新增两列（迁移 `2026-11-18-model-config-db.sql`，同步 `anynote.sql`）：

| 列 | 类型 | 说明 |
|---|---|---|
| `reasoning_format` | varchar(32)，默认 `none` | `none` / `reasoning_content` / `reasoning` / `think_tag` |
| `reasoning_passthrough` | varchar(32)，默认 `none` | `none`（不回传）/ `empty`（空字段）/ `original`（原样回传） |

## 管理端点（仅 `ADMIN_X`）

Embedding 专用端点退役，通用化：

| 方法与路径 | 说明 |
|---|---|
| `GET /v1/admin/model-providers/logical/{logicalName}` | 查询单个逻辑模型配置；`logicalName` 限定 `agent_main` / `fast` / `embedding` |
| `PUT /v1/admin/model-providers/logical/{logicalName}` | 更新；`reasoning_format`/`reasoning_passthrough` 仅接受三个合法值（否则 `A0160`） |

`EmbeddingModelConfigVO/DTO` 更名为通用 `LogicalModelConfigVO/DTO`（含 `logicalName`、`providerKey`、
`model`、`dimensions`（仅 embedding 校验 1..2048）、`reasoningFormat`、`reasoningPassthrough`、
`enabled`、`version`）。启用校验沿用：供应商存在、启用、（embedding）允许数据出境、模型名非空。
旧 `GET/PUT /logical/embedding` 路径删除，无兼容别名（与 M16.2 破坏性升级口径一致；当前无生产环境）。

## 快照合并去 Nacos

`GET /internal/v1/model-providers/snapshot`（`@InnerAuth`）：`logicalModels` **只**来自
`a_logical_model` 全表（按 `logical_name` 升序），不再读 `ModelCatalogProperties`；
`ModelCatalogProperties`、Nacos `anynote.ai.models.logical` 与 `mapping-version` 配置段删除。
版本号取 `providersVersion + ΣlogicalVersion + retrievalVersion`。快照校验规则不变：
未启用的逻辑模型、停用供应商、数据出境限制照旧在 Python `resolve()` 拒绝。

## 运行期切换语义

Python `RunManager.create()` 每次运行向 Java 拉一次快照并固定在 `RunContext.model_snapshot`
（现状即如此，无需改动核心循环）：进行中的 loop 继续使用开跑快照，新运行读到新配置。
Java 侧 `snapshot()` 每次实时查库，无缓存。管理员更新配置立即对新运行生效。

## 前端

设置页「模型供应商」分区的 `embedding-model-settings` 卡片改为通用逻辑模型卡片组：
`agent_main`（主模型）、`fast`（压缩模型）、`embedding`（向量模型）各一张卡，共用一个组件；
embedding 卡保留维度与数据出境警示，agent_main/fast 卡增加推理输出格式与回传方式两个下拉
（选项文案：`不输出` / `reasoning_content 字段` / `reasoning 字段` / `正文 <think> 标签`；
`不回传` / `回传空字段` / `原样回传`）。桌面与移动端共用（现状机制）。

## 部署迁移

仓库内 Nacos 初始化文件删除 `anynote.ai.models` 段；**已运行环境需手动**：在 Nacos UI 删除该段、
在设置页为 `agent_main`/`fast` 配置模型（M17.6 前模型本就因主密钥缺失不可用，无切换风险窗口）。

## 验证

- Java JUnit：通用端点权限、参数校验（推理格式枚举、维度范围）、快照不再读 Nacos、
  embedding 专属校验仍生效、fallback 返回。
- Python pytest：快照解析新字段、`resolve()` 不变行为、`think_tag` 等格式解析。
- 前端 Vitest：三张卡片渲染与提交载荷。
- `pnpm openapi:check` baseline 同步。
