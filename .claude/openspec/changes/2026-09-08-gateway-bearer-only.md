# Gateway 仅接受 Bearer 认证 [Breaking Change]

## 已确认的范围

2026-09-08 用户确认：补充 Bearer，并直接去除对 `accessToken` 的兼容。此决定覆盖 API 契约规范中默认保留兼容过渡期的要求。

- 浏览器到新前端 BFF：仍按 M2 使用 `at` / `rt` HttpOnly Cookie。
- BFF / 外部客户端到 Gateway：私有路由仅接受 `Authorization: Bearer <access token>`；不从旧 `accessToken` 请求头、Cookie 或 query 参数读取凭据。
- 缺失、格式非法、重复 Authorization 或失效 token：保持现有 HTTP 401 + ResData 错误格式。
- Gateway 校验成功后按现有内部协议注入已验证的 `accessToken` 和 `user_id`，移除外部 Authorization；外部传入的同名旧头不能替代 Bearer，也不能覆盖已验证身份。
- 公开白名单与管理路由权限规则保持现有行为。
- OpenAPI 安全方案同步为 HTTP Bearer / JWT，保留方案名 `Authorization`，通过生成脚本更新六份 baseline。

## 影响

这是明确批准的不兼容变更。`apps/web-legacy` 的 client-request / server-request 与部分 SSE 调用仍发送旧请求头，切换 Gateway 后其私有请求会失败。本次不擅自迁移旧前端，不部署正在服务用户的环境。内部 Feign 请求头及 token DTO 中名为 `accessToken` 的字段仍属于内部协议/数据，不是 Gateway 的旧认证兼容入口。

## 验证

已先运行新增测试复现旧实现不符合预期，再修改实现。

- `AuthFilterTest`：20 个用例通过，覆盖 Bearer 大小写、空白与格式边界、重复头、旧头拒绝、旧头无法回退、无效 token、身份头覆盖、白名单和管理路由。
- `SwaggerAutoConfigurationTest`：1 个用例通过，校验 HTTP Bearer/JWT 与全局安全需求。
- `mvn -B -pl gateway,common/anynote-common-swagger -am test`：含相关依赖共 109 个单测通过。
- `mvn -B install -DskipTests`：31 个 Maven reactor 项目构建成功。
- 按 README 的 dev compose 命令启动本地栈，9 个 Java 服务健康；真实 Gateway 的 4 组无效凭据请求均返回 HTTP 401 / `A0350`。
- `pnpm openapi:generate`：六份真实 spec 重生，逐份与 HEAD 做结构比较，确认仅 `components.securitySchemes.Authorization` 从 API Key 变为 HTTP Bearer/JWT。
- `pnpm check`、`pnpm typecheck` 通过；另直接运行 `pnpm --filter @anynote/api-client typecheck` 通过。

本变更已分模块提交：Gateway `57bf8b3`，OpenAPI 与 baseline `216a930`，均位于 `phase/5.2-auth-bff`；本次未合并到 `dev` 或 `main`。BFF 尚未实现；局部刷新锁模型的时序风险需结合完整刷新流程评估，已撤回将缓存调整列为开工前置的结论，详见 `docs/refactor/FRONTEND_MILESTONES.md` M2.1。
