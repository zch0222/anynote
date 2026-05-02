# 后端鉴权链路与暴露面清单

## 目的

本文档用于说明当前后端 9 个服务的鉴权链路、公共安全组件职责，以及服务绕过网关直连时的风险边界。

## 当前鉴权体系结论

当前项目不是把全部鉴权都放在 Spring Security 过滤链里，而是分成了三层：

1. 网关入口鉴权
   - 入口在 [services/gateway/src/main/java/com/anynote/gateway/filter/AuthFilter.java](/Users/zch/code/anynote/anynote/services/gateway/src/main/java/com/anynote/gateway/filter/AuthFilter.java)
   - 作用：
     - 白名单路径直接放行
     - 非白名单路径强制校验 `ACCESS_TOKEN`
     - 通过 [TokenUtil.java](/Users/zch/code/anynote/anynote/services/common/anynote-common-security/src/main/java/com/anynote/common/security/token/TokenUtil.java) 解析 JWT 并回 Redis 取登录态
     - 管理端 URL 再追加管理员角色校验
     - 将 `ACCESS_TOKEN`、`DETAILS_USER_ID` 透传到下游服务

2. 服务内业务权限校验
   - 主要依赖：
     - `TokenUtil#getLoginUser()`
     - `@RequiresPermissions`
     - `@RequiresNotePermissions`
     - `@RequiresKnowledgeBasePermissions`
     - `@RequiresWhisperTaskPermissions`
     - 以及 `common-datascope` 中的数据权限切面
   - 这些校验分散在 service/aspect 层，不依赖 Spring Security 的 URL 规则

3. 内部服务调用校验
   - 主要依赖 `@InnerAuth`
   - Servlet 侧切面：
     - [InnerAuthAspect.java](/Users/zch/code/anynote/anynote/services/common/anynote-common-security/src/main/java/com/anynote/common/security/aspect/InnerAuthAspect.java)
   - WebFlux 侧切面：
     - [InnerAuthWebfluxAspect.java](/Users/zch/code/anynote/anynote/services/common/anynote-common-security/src/main/java/com/anynote/common/security/aspect/InnerAuthWebfluxAspect.java)
   - 作用：
     - 校验 `FROM_SOURCE=INNER`
     - 校验 HMAC 签名
     - 必要时要求携带用户 token

## 公共安全配置职责

### `SecurityConfig`

文件：
- [services/common/anynote-common-security/src/main/java/com/anynote/common/security/config/SecurityConfig.java](/Users/zch/code/anynote/anynote/services/common/anynote-common-security/src/main/java/com/anynote/common/security/config/SecurityConfig.java)

职责：
- 仅在 Servlet/MVC 服务生效
- 关闭 CSRF
- 使用无状态 Session
- `anyRequest().permitAll()`

结论：
- 它不是当前项目的“业务鉴权入口”
- 它只是避免 Spring Security 默认把 MVC 服务拦成必须登录

### `ReactiveSecurityConfig`

文件：
- [services/common/anynote-common-security/src/main/java/com/anynote/common/security/config/ReactiveSecurityConfig.java](/Users/zch/code/anynote/anynote/services/common/anynote-common-security/src/main/java/com/anynote/common/security/config/ReactiveSecurityConfig.java)

职责：
- 仅在 WebFlux 服务生效
- 仅在服务自身没有声明 `SecurityWebFilterChain` 时生效
- 关闭 CSRF
- `anyExchange().permitAll()`

结论：
- 它也不是当前项目的“业务鉴权入口”
- 它只是 Reactive 服务的兜底安全链
- 当前实现会允许所有请求通过

### 网关自定义安全链

文件：
- [services/gateway/src/main/java/com/anynote/gateway/security/SecurityConfig.java](/Users/zch/code/anynote/anynote/services/gateway/src/main/java/com/anynote/gateway/security/SecurityConfig.java)

职责：
- 给网关自己提供 `SecurityWebFilterChain`
- 当前同样是 `permitAll()`

结论：
- 网关真正的外部请求鉴权不在 Spring Security 规则里
- 而是在 `AuthFilter` 这个 `GlobalFilter` 里

## 网关层现状

### 外部入口

网关是当前默认外部入口，端口见项目文档为 `8080`。

### 文档聚合

网关聚合了多个服务的 OpenAPI 文档：
- [services/gateway/src/main/resources/application.yml](/Users/zch/code/anynote/anynote/services/gateway/src/main/resources/application.yml)

当前聚合服务包括：
- `auth`
- `system`
- `note`
- `file`
- `ai`
- `notify`

### 白名单

白名单由 `security.ignore.whites` 提供：
- [SecurityIgnoreProperties.java](/Users/zch/code/anynote/anynote/services/gateway/src/main/java/com/anynote/gateway/properties/SecurityIgnoreProperties.java)

说明：
- 白名单具体值不在仓库静态文件里，而是运行时配置
- `AuthFilter` 会对这些路径直接放行

### 管理端 URL 限制

管理端 URL 规则来自 `security.manage.urls`：
- [AuthFilter.java](/Users/zch/code/anynote/anynote/services/gateway/src/main/java/com/anynote/gateway/filter/AuthFilter.java)

说明：
- 命中该规则的请求，即使 token 有效，也还要满足管理员角色校验

## 服务清单

| 服务 | 端口 | Web 类型 | 当前主要鉴权位置 | 直连风险判断 |
|---|---:|---|---|---|
| gateway | 8080 | Reactive | `AuthFilter` | 网关本身承担外部入口鉴权 |
| auth | 8083 | Servlet | 主要是开放登录/刷新 token 能力 | 直连通常是预期暴露，但仍受业务接口设计约束 |
| system | 8091 | Servlet | `@InnerAuth` + `TokenUtil` + 数据权限切面 | Spring Security 层默认放行，绕过网关直连存在暴露面 |
| note | 18091 | Servlet | `@InnerAuth` + 多类 `@Requires*Permissions` + `TokenUtil` | 业务权限丰富，但 URL 层默认放行，绕过网关直连仍有风险 |
| file | 8095 | Servlet | 多个控制器接口带 `@InnerAuth` | 内部接口较多，绕过网关直连风险较高 |
| ai | 9065 | Reactive | `@InnerAuth` + WebFlux 权限切面 + `TokenUtil` | 当前兜底安全链放行全部请求，依赖业务层权限切面 |
| notify | 9066 | Reactive | `TokenUtil` + 通知相关业务逻辑 | 当前兜底安全链放行全部请求，若接口未额外校验则可直连 |
| job | 8093 | Servlet | 业务接口较少，更多是任务执行器职责 | URL 层默认放行，需依赖接口本身约束和部署隔离 |
| manage | 18092 | Servlet | 主要依赖网关管理端 URL 规则 + 下游服务权限 | 若绕过网关直连，本服务自身 URL 层默认放行 |

## 逐服务说明

### gateway

关键文件：
- [AuthFilter.java](/Users/zch/code/anynote/anynote/services/gateway/src/main/java/com/anynote/gateway/filter/AuthFilter.java)
- [SecurityConfig.java](/Users/zch/code/anynote/anynote/services/gateway/src/main/java/com/anynote/gateway/security/SecurityConfig.java)

特点：
- Spring Security 链默认放行
- 真正认证入口在 `AuthFilter`
- 因此“是否鉴权”取决于是否经过网关

### auth

关键文件：
- [TokenController.java](/Users/zch/code/anynote/anynote/services/auth/src/main/java/com/anynote/auth/controller/TokenController.java)
- [TokenUtil.java](/Users/zch/code/anynote/anynote/services/common/anynote-common-security/src/main/java/com/anynote/common/security/token/TokenUtil.java)

特点：
- 负责登录、发 token、刷新 token
- 通常本身就需要对外暴露一部分匿名入口

### system

关键文件：
- [SysUserController.java](/Users/zch/code/anynote/anynote/services/system/src/main/java/com/anynote/system/controller/SysUserController.java)
- [SysConfigController.java](/Users/zch/code/anynote/anynote/services/system/src/main/java/com/anynote/system/controller/SysConfigController.java)
- [SysPermissionRuleController.java](/Users/zch/code/anynote/anynote/services/system/src/main/java/com/anynote/system/controller/SysPermissionRuleController.java)

特点：
- 多个内部接口显式使用 `@InnerAuth`
- 业务服务层大量通过 `TokenUtil` 获取当前用户
- URL 层没有“未登录默认拒绝”

### note

关键文件：
- [KnowledgeBaseController.java](/Users/zch/code/anynote/anynote/services/note/src/main/java/com/anynote/note/controller/KnowledgeBaseController.java)
- [DocController.java](/Users/zch/code/anynote/anynote/services/note/src/main/java/com/anynote/note/controller/DocController.java)
- [MoocController.java](/Users/zch/code/anynote/anynote/services/note/src/main/java/com/anynote/note/controller/MoocController.java)

特点：
- 是权限切面最密集的服务之一
- 同时存在 `@InnerAuth` 控制器接口和多种业务权限注解
- 即便如此，服务级 URL 链仍不是默认拒绝模型

### file

关键文件：
- [FileController.java](/Users/zch/code/anynote/anynote/services/file/src/main/java/com/anynote/file/controller/FileController.java)

特点：
- 控制器中多个入口直接标注 `@InnerAuth`
- 更偏向内部文件服务
- 不适合裸露给外部直连

### ai

关键文件：
- [ChatController.java](/Users/zch/code/anynote/anynote/services/ai/src/main/java/com/anynote/ai/nio/controller/ChatController.java)
- [WhisperController.java](/Users/zch/code/anynote/anynote/services/ai/src/main/java/com/anynote/ai/nio/controller/WhisperController.java)
- [ContextWebFilter.java](/Users/zch/code/anynote/anynote/services/common/anynote-common-security/src/main/java/com/anynote/common/security/filter/webflux/ContextWebFilter.java)

特点：
- 依赖 WebFlux 上下文传递 token 与用户信息
- 业务权限主要落在 service/aspect
- 目前若绕过网关直连，Spring Security 默认不会先把请求挡住

### notify

关键文件：
- [NoticeController.java](/Users/zch/code/anynote/anynote/services/notify/src/main/java/com/anynote/notify/controller/NoticeController.java)
- [NotificationController.java](/Users/zch/code/anynote/anynote/services/notify/src/main/java/com/anynote/notify/controller/NotificationController.java)

特点：
- 当前 reactive 兜底安全链是 `permitAll`
- 是否需要登录，取决于业务方法是否显式取 token 或校验用户

### job

关键文件：
- [MoocJobController.java](/Users/zch/code/anynote/anynote/services/job/src/main/java/com/anynote/controller/MoocJobController.java)

特点：
- 更偏任务执行器，不应作为通用外部服务暴露
- 依赖部署隔离、注册中心、调度中心配合

### manage

关键文件：
- [ManageUserController.java](/Users/zch/code/anynote/anynote/services/manage/src/main/java/com/anynote/manage/controller/ManageUserController.java)
- [ManageCacheController.java](/Users/zch/code/anynote/anynote/services/manage/src/main/java/com/anynote/manage/controller/ManageCacheController.java)

特点：
- 当前“管理端鉴权”主要依赖网关 `security.manage.urls` 规则
- 如果直接访问 `manage` 服务自身端口，就绕过了这层网关限制

## 风险总结

当前安全模型的核心假设是：

- 外部流量先经过网关
- 网关用 `AuthFilter` 做 token 鉴权
- 服务内部再做细粒度权限和内部签名校验

因此当前最需要注意的风险是：

1. 多数服务的 Spring Security URL 规则并不是默认拒绝，而是默认放行
2. 如果服务端口在网络层可被外部直接访问，可能绕过网关入口鉴权
3. `manage` 的管理员限制目前主要在网关规则，不在 `manage` 服务自身
4. `ReactiveSecurityConfig` 当前是全放行兜底链，只适合验收和启动兼容，不适合作为最终最小权限模型

## 建议

1. 明确“只有网关可对外暴露，业务服务仅内网可达”的部署边界
2. 将 `ReactiveSecurityConfig` 从全放行收紧到仅放行：
   - `/actuator/**`
   - `/v3/api-docs/**`
   - `/swagger-ui/**`
3. 评估 `manage`、`notify`、`ai` 是否需要补服务内 URL 级认证
4. 对关键服务补一份“允许匿名访问接口清单”，避免只靠网关白名单隐式控制

## 备注

本文档基于当前代码仓库静态分析生成，不等价于完整渗透测试结果。  
其中 `security.ignore.whites`、`security.manage.urls` 的最终值取决于运行时 Nacos 配置。
