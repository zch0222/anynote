# 提案：模型供应商凭据基础设施（服务内部配置快照端点）

> 方案：[`docs/ai-refactor/AI_REFACTOR_PLAN.md`](../../../docs/ai-refactor/AI_REFACTOR_PLAN.md)（P1 决策）、[`docs/ai-refactor/AI_MILESTONES.md`](../../../docs/ai-refactor/AI_MILESTONES.md) M16.1「配置」条

## 背景

M16.1 的 P1 决策（已拍板）要求把「模型供应商 + 凭据」的配置从散落的 Redis `sys_config` 收拢到
services/ai 管理的业务库：apiKey 使用 **AES-GCM** 加密后入库，主密钥只通过 services/ai 的
**环境变量**注入；Python AI 服务不再各自持有供应商凭据，而是通过 services/ai 的**内部端点**拉取
一份解密后的配置快照。Nacos 只保留非敏感映射（逻辑模型名 → 供应商/模型名）与映射版本。

本提案只覆盖 services/ai 侧的凭据基础设施（建表、加解密、快照/写入/删除三个内部端点），
不改变现有对外 AI 端点，也不改网关路由：`/internal/v1/model-providers/**` 由网关直接不匹配，
外部请求无法到达；内部调用仍走 `from-source: inner` + `X-Internal-Timestamp` + `X-Internal-Sign`
（HMAC-SHA256）的 `@InnerAuth` 校验。

## 数据表

新表 `a_model_provider`，迁移脚本 `infra/sql/migrations/2026-11-14-ai-model-provider.sql`，
建表语句同步到 `infra/sql/anynote.sql`。

| 列 | 类型 | 说明 |
|---|---|---|
| `id` | bigint unsigned，自增主键 | |
| `provider_key` | varchar(64)，唯一键 `uk_provider_key` | 供应商标识 |
| `display_name` | varchar(128) | 展示名 |
| `protocol` | varchar(32)，默认 `openai_compatible` | 协议类型 |
| `base_url` | varchar(512) | 接口基地址 |
| `api_key_cipher` | varchar(2048) | API Key 密文：`Base64(iv \|\| ciphertext \|\| tag)`，iv 12 字节、tag 128 位 |
| `models` | json | 模型名数组 |
| `data_egress_allowed` | tinyint，默认 0 | 是否允许数据出境 |
| `enabled` | tinyint，默认 1 | 是否启用 |
| `version` | bigint，默认 1 | 每次更新 +1 |
| `create_by` / `update_by` | bigint unsigned，默认 0 | 内部端点不区分操作者，写 0 |
| `create_time` / `update_time` | datetime，默认 `CURRENT_TIMESTAMP` | `update_time` 带 `ON UPDATE` |

快照的 `version` 由**全表行 `version` 的最大值**与 Nacos `mappingVersion` 拼接：
`${providersVersion}:${mappingVersion}`；空表时 `providersVersion` 为 0。

## 契约

三个端点均在 services/ai，路径前缀 `/internal/v1/model-providers`，全部挂 `@InnerAuth`。
内部调用需带：`from-source: inner`、`X-Internal-Timestamp`、`X-Internal-Sign`。

### 1. `GET /internal/v1/model-providers/snapshot`

无请求体。响应 `ResData<ModelProviderSnapshotVO>`：

```json
{
  "code": "00000",
  "msg": "操作成功",
  "data": {
    "version": "9:7",
    "providers": [
      {
        "providerKey": "openai",
        "displayName": "OpenAI",
        "protocol": "openai_compatible",
        "baseUrl": "https://api.openai.com/v1",
        "apiKey": "sk-…（明文，仅内部内存使用）",
        "models": ["gpt-4o", "gpt-4o-mini"],
        "dataEgressAllowed": true,
        "enabled": true
      },
      {
        "providerKey": "backup",
        "displayName": "备用供应商",
        "protocol": "openai_compatible",
        "baseUrl": "https://backup.example.com/v1",
        "apiKey": "sk-…",
        "models": ["chat-model"],
        "dataEgressAllowed": false,
        "enabled": false
      }
    ],
    "logicalModels": {
      "fast": { "provider": "openai", "model": "gpt-4o-mini" }
    }
  }
}
```

- `providers` 含停用行（`enabled=false`），由调用方自行决定是否使用；顺序按主键升序。
- `logicalModels` 原样取自 Nacos `anynote.ai.models.logical`；未配置时为 `{}`。
- `apiKey` 是解密后的明文，只允许内部调用方在内存中使用，禁止落盘或写日志。

### 2. `POST /internal/v1/model-providers`

请求体 `ModelProviderUpsertDTO`：

| 字段 | 约束 | 说明 |
|---|---|---|
| `providerKey` | `@NotBlank`，≤64 | 供应商标识；存在则更新、不存在则新增 |
| `displayName` | `@NotBlank`，≤128 | 展示名 |
| `protocol` | 可空，≤32 | 为空时：新增用 `openai_compatible`，更新保留原值 |
| `baseUrl` | `@NotBlank`，≤512 | 接口基地址 |
| `apiKey` | `@NotBlank` | **明文入参**；服务端加密后写 `api_key_cipher`，每次更新都重新加密 |
| `models` | 可空 | 模型名数组；为空时新增写 `[]`，更新保留原值 |
| `dataEgressAllowed` | 可空 | 为空时新增按 `false`，更新保留原值 |
| `enabled` | 可空 | 为空时新增按 `true`，更新保留原值 |

- 更新时 `version = 原 version + 1`；新增时 `version = 1`。
- 请求体校验失败返回 `A0160`（Servlet 参数校验由全局异常处理器转换）。
- 成功响应 `ResData<String>`，`data` 为**操作完成后的快照版本号**（与 `GET snapshot` 的 `version` 同源），
  例如：

```json
{ "code": "00000", "msg": "操作成功", "data": "10:7" }
```

### 3. `DELETE /internal/v1/model-providers/{providerKey}`

- 硬删除；成功：

```json
{ "code": "00000", "msg": "操作成功", "data": "SUCCESS" }
```

- 记录不存在：HTTP 200，`code=A0404`，`msg="模型供应商不存在: <providerKey>"`。

## 主密钥与热更新

- 主密钥：环境变量 `ANYNOTE_AI_CREDENTIAL_KEY`，值为 **Base64 编码的 32 字节**。
  - 缺失、不是合法 Base64 或长度不是 32 字节时，加/解密抛 `B0001`
    “模型供应商凭据主密钥未配置或格式不正确”。
  - 密钥在每次加/解密时读取（构造时不校验），因此未配置主密钥不会阻断 services/ai 启动，
    只有真正读写凭据时才报错。
  - 主密钥不落数据库、不写 Nacos、不进日志、不随快照下发。
- 加密：`AES/GCM/NoPadding`，每次加密随机生成 12 字节 iv，tag 128 位；
  密文格式 `Base64(iv || ciphertext || tag)`。
- 凭据热更新：更新供应商后该行 `version+1`，快照 `version` 随之变化；调用方轮询快照或按版本比对
  决定是否刷新内存中的供应商目录。
- 映射热更新：Nacos 修改 `anynote.ai.models.logical` 时同时递增 `anynote.ai.models.mapping-version`，
  快照 `version` 的 `mappingVersion` 段随之变化。
- 主密钥轮换需要更新 services/ai 的环境变量并重启进程（环境变量不参与 Nacos 热刷新），
  轮换后既有密文需按新主密钥重新加密。

## Nacos 非敏感映射

对应 `ModelCatalogProperties`（`@ConfigurationProperties(prefix = "anynote.ai.models")`）：

```yaml
anynote:
  ai:
    models:
      mapping-version: 7
      logical:
        fast:
          provider: openai
          model: gpt-4o-mini
        reasoning:
          provider: openai
          model: gpt-4o
```

- 本配置**不含任何凭据**；凭据只在业务库中（AES-GCM 密文）。
- 本提案不预置任何供应商或映射数据，Nacos 配置由部署侧另行补充。

## 错误码

| 场景 | code | msg |
|---|---|---|
| 成功 | `00000` | 操作成功 |
| 主密钥未配置/格式错误 | `B0001` | 模型供应商凭据主密钥未配置或格式不正确 |
| 凭据密文非法/解密失败（错误密钥、密文被篡改） | `B0001` | 模型供应商凭据解密失败 |
| 删除的供应商不存在 | `A0404` | 模型供应商不存在: `<providerKey>` |
| 请求体字段校验失败 | `A0160` | 由全局异常处理器输出具体字段错误 |
| 内部签名校验失败 | `A0301` | 没有内部访问权限/内部调用签名验证失败（`InnerAuthAspect`） |

## 数据库与迁移

- `infra/sql/migrations/2026-11-14-ai-model-provider.sql`：幂等建表脚本（`CREATE TABLE IF NOT EXISTS`）。
- `infra/sql/anynote.sql`：末尾追加同一段 DDL，并注明已同步到迁移脚本。
- 手工执行，无 Flyway/Liquibase；两处语句保持一致。

## 验证

本次由纯单测覆盖（JUnit 5 + Mockito，不连数据库、不启动 Spring 容器）：

- `AesGcmCipherTest`：加解密往返、错误主密钥失败、密文篡改失败、主密钥缺失/长度错误/非 Base64 报错。
- `ModelProviderServiceImplTest`：空表快照为 `0:0`；有数据快照的解密、最大版本计算与 Nacos 映射合并；
  upsert 新增（`version=1`、apiKey 加密落库、可空字段默认值）；upsert 更新（`version+1`、保留未传字段、
  新 apiKey 重新加密）；delete 命中/未命中/空标识。
- `ModelProviderControllerTest`：standalone MockMvc 覆盖三个端点的成功路径与 POST 缺参 400、
  DELETE 不存在 `A0404`。
- 待部署侧补充：真实栈验证需要 `a_model_provider` 建表、Nacos `anynote.ai.models` 配置与
  `ANYNOTE_AI_CREDENTIAL_KEY` 环境变量，本次未执行（任务约束为不运行构建）。
- 本提案不修改网关路由与 OpenAPI baseline；新增内部端点会进入 services/ai 自身的 springdoc 输出，
  聚合与 baseline 的更新由后续任务统一处理。
