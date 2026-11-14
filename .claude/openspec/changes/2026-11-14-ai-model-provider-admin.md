# 提案：模型供应商系统管理员 CRUD 与管理页面

> 方案：[`docs/ai-refactor/AI_REFACTOR_PLAN.md`](../../../docs/ai-refactor/AI_REFACTOR_PLAN.md) §5.5、[`docs/ai-refactor/AI_MILESTONES.md`](../../../docs/ai-refactor/AI_MILESTONES.md) M16.2
>
> 2026-11-14 用户确认：无生产环境，本次不保留过渡期适配；供应商需在运行期 CRUD，新增系统管理员外部接口和桌面、移动端管理页面。

## 背景与边界

M16.1 已提供内部快照及内部新增/删除接口。本提案把供应商写操作收拢到系统管理员外部接口，内部仅保留 Python 使用的快照读取。外部接口永不返回 `apiKey` 或其密文。

系统管理员按现有 `SysUser.isAdminX` 判定，即角色 `ADMIN_X`。查询与修改均要求该角色；前端隐藏入口不替代后端鉴权。逻辑模型映射仍由 Nacos 管理，不在本提案中增加映射 CRUD。

## 外部契约

服务内路径前缀为 `/v1/admin/model-providers`，经网关与 BFF 后位于 `/api/ai/v1/admin/model-providers`。

| 方法与路径 | 请求 | 成功响应 |
|---|---|---|
| `GET /v1/admin/model-providers` | 无 | `ResData<List<ModelProviderAdminVO>>` |
| `GET /v1/admin/model-providers/{providerKey}` | 路径标识 | `ResData<ModelProviderAdminVO>` |
| `POST /v1/admin/model-providers` | `ModelProviderCreateDTO` | `ResData<ModelProviderAdminVO>` |
| `PUT /v1/admin/model-providers/{providerKey}` | `ModelProviderUpdateDTO` | `ResData<ModelProviderAdminVO>` |
| `DELETE /v1/admin/model-providers/{providerKey}` | 路径标识 | `ResData<String>`，值为 `SUCCESS` |

`ModelProviderAdminVO` 字段：`providerKey`、`displayName`、`protocol`、`baseUrl`、`models`、`dataEgressAllowed`、`enabled`、`version`、`createTime`、`updateTime`。不包含 API Key、密文或内部主键。

新增字段：`providerKey`、`displayName`、`baseUrl`、`apiKey` 必填；`protocol` 固定支持 `openai_compatible`；`models`、`dataEgressAllowed`、`enabled` 可空并采用既有默认值。

更新采用整体替换：`displayName`、`protocol`、`baseUrl`、`models`、`dataEgressAllowed`、`enabled` 使用请求值；`apiKey` 为空白时保留原凭据，非空时重新加密。路径中的 `providerKey` 是更新对象的唯一标识，不在请求体中重复传递。

## 错误契约

| 场景 | code | msg |
|---|---|---|
| 非 `ADMIN_X` 查询或修改 | `A0301` | 只有系统管理员可以管理模型供应商 |
| 新增标识重复 | `B0001` | 供应商标识已存在 |
| 查询、更新或删除的记录不存在 | `A0404` | 模型供应商不存在 |
| 新增缺少 API Key | `A0160` | 请输入 API Key |
| 地址不是有效 HTTP/HTTPS URL | `A0160` | 接口基地址必须是有效的 HTTP 或 HTTPS 地址 |
| 其他字段校验失败 | `A0160` | 沿用对应字段的 Bean Validation 文案 |

## 内部契约调整

- 保留 `GET /internal/v1/model-providers/snapshot`，继续使用 `@InnerAuth`。
- 删除 `POST /internal/v1/model-providers` 与 `DELETE /internal/v1/model-providers/{providerKey}`，避免绕过管理员边界。
- Python 每次新运行获取一次快照；运行中的配置不随 CRUD 改变，新运行读取最新配置。

## 页面

设置页新增“模型供应商”分区，桌面 `/settings/providers`、移动端 `/m/settings/providers`，仅 `ADMIN_X` 可见。两端均提供列表、新增、编辑、启停、数据出域设置与删除确认；编辑页不回显 API Key，留空表示保留。

## 验证

- Java：管理员与两个非管理员角色、CRUD 成功路径、重复标识、不存在记录、更新保留或替换 Key、响应无凭据。
- 前端：hooks 的请求与缓存失效、表单校验、管理员入口、非管理员拒绝态、桌面与移动端 CRUD 交互。
- 真实栈：重新生成 `openapi/specs/ai.json`，确认旧内部写端点消失、新外部端点及命名 schema 完整；通过 BFF 完成管理员 CRUD，并用普通用户确认所有端点被拒绝。
