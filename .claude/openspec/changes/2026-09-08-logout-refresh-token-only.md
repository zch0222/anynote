# API 变更：允许仅凭 refreshToken 登出

## 背景与授权

M2.1 的 BFF 使用 `at` / `rt` HttpOnly Cookie。`at` 过期后浏览器可能只剩 `rt`，原 `LogoutDTO` 强制要求 `accessToken`，无法撤销剩余的 refreshToken。2026-09-08 用户明确选择“修改方案，允许后端仅凭 rt 登出”。

## 已确认契约

| 方法 | Gateway 路径 | 变更 |
|------|--------------|------|
| POST | `/api/auth/logout` | `accessToken`、`refreshToken` 均可单独提供，至少一个非空白；兼容原有 access-only 和双 token 请求 |

```json
{ "refreshToken": "当前会话的 refreshToken" }
```

- DTO 校验与 Service 校验同时执行“至少一个非空白”规则；不把校验辅助属性暴露到 JSON 或 OpenAPI。
- 复用 `TokenUtil.logout(at, rt)`：只删除传入且验签有效的 token 对应 Redis 键；不扩大为用户全部会话登出。
- 仅有 `rt` 时只撤销该 refreshToken，不推断或批量删除未提供的 accessToken。
- 两个 token 都缺失/空白属于参数错误；已过期、非法或不存在的非空 token 仍按原契约幂等处理。
- BFF 仅从 Cookie 读取凭据，缺失的字段直接省略；无需刷新。两枚 Cookie 均不存在时仅做幂等本地清理。
- 所有认证写请求继续执行 Origin 校验，Cookie 保持 `HttpOnly; Secure; SameSite=Strict; Path=/`；响应正文不含 token。
- 刷新流程仍按用户决定暂缓，此变更不采纳任何提前刷新阈值或刷新锁调整。

## 验证计划

先补充并运行旧实现的失败用例，再修改代码：DTO 空值组合、Service 的 refresh-only 委托、TokenUtil 的 refresh-only 精确删键与失效凭据幂等，以及 BFF refresh-only Cookie 转发。

Controller 与 DTO 的 OpenAPI 注解同步更新，经真实 Springdoc 输出更新 auth baseline，再生成 TypeScript 类型并验证前端单测、类型检查与构建。实际运行结果在实现后回填。

## 2026-09-08 核验结果

- 接手时后端实现及 DTO/Service/TokenUtil 单测已在工作区；auth 的 45 个成功用例报告时间为 23:32。本轮 Maven 离线依赖不齐，联网测试申请被自动审批服务 503 故障拒绝，未宣称本轮后端重跑通过。
- BFF refresh-only 用例先复现 HTTP 401，修正后省略缺失的 accessToken，仅调用 `/logout` 撤销 Cookie 中的 refreshToken，两枚 Cookie 均清除。
- 运行中的真实 Springdoc 已提供新契约；经现有 normalize-cli 与 openapi-typescript 重生六份类型，仅 auth baseline 的登出字段/描述变化，辅助校验属性未进入契约。
- 前端 149 个单测、web/api-client 类型检查和源码 lint 通过。生产构建受现有 Google Fonts 下载失败阻断；刷新及浏览器完整验收继续暂缓。详细记录见 `docs/refactor/FRONTEND_MILESTONES.md` §5。

## 2026-09-09 复验与运行时修复

权限恢复后，136 个相关 Java 单测、149 个前端单测、20 个 OpenAPI 工具单测、生产构建及原始契约生成均通过。真实链路发现默认 Spring Security LogoutFilter 截获 `/logout` 并返回 302；先补安全过滤链失败用例，再关闭默认表单登出，让现有 Controller 执行 token 撤销。此修复不改变已确认的请求/响应契约。

修复后的 8 个真实 HTTP 认证集成测试全部通过，包含双 Cookie 和仅 rt 登出、旧 refresh 的 HTTP 401/A0311、rt-only 不额外撤销 access。浏览器注册/登录交互验证通过；刷新并发及存储面板完整验收仍未完成。镜像重建因 Docker Hub 超时失败，本地 auth 容器经用户批准更新 JAR 并重启；重新创建容器前需重建镜像。详见里程碑 §5。
