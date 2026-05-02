# 后端架构速查

> 语言：Java 21 · Spring Boot 3.3.4 · Spring Cloud 2023.0.3 · Spring Cloud Alibaba 2023.0.1.0

---

## 服务一览

| 服务目录          | artifactId                    | 端口   | 职责                          |
|-------------------|-------------------------------|--------|-------------------------------|
| `services/gateway`  | anynote-gateway               | 8080   | API 网关：路由、JWT 验证、CORS、XSS 过滤 |
| `services/auth`     | anynote-auth                  | 8083   | 认证：登录、注册、Token 签发  |
| `services/system`   | anynote-modules-system        | 8091   | 用户、角色、权限、租户管理    |
| `services/note`     | anynote-modules-note          | 18091  | 笔记、知识库、文档、MOOC、视频 |
| `services/file`     | anynote-modules-file          | 8095   | 文件上传/下载（Huawei OBS/MinIO） |
| `services/ai`       | anynote-modules-ai-nio        | 9065   | AI 对话（SSE）、RAG、Whisper、翻译 |
| `services/notify`   | anynote-modules-notify        | 9066   | 消息通知、站内信              |
| `services/job`      | anynote-modules-job           | 8093   | XXL-Job 任务执行              |
| `services/manage`   | anynote-modules-manage        | 18092  | 管理后台业务逻辑              |

---

## 关键共享库（`services/common/`）

| 模块                          | 职责                                     |
|-------------------------------|------------------------------------------|
| `anynote-common-core`         | 异常体系、ResData、ResCode、工具类、常量  |
| `anynote-common-security`     | Spring Security 配置、JWT、@InnerAuth AOP、Feign 拦截器 |
| `anynote-common-redis`        | Redis 操作封装、配置缓存                  |
| `anynote-common-swagger`      | Springdoc OpenAPI 3 自动配置             |
| `anynote-common-datascope`    | 数据权限 AOP                             |

---

## 认证流程

```
客户端 → Gateway AuthFilter
  → 白名单跳过
  → 从 Header 取 accessToken
  → Redis 查询 LoginUser
  → 转发时注入 user_id header（移除原始 accessToken）
  
内部服务间调用（Feign）:
  → FeignRequestInterceptor 自动添加：
    - from-source: inner
    - X-Internal-Timestamp: <毫秒时间戳>
    - X-Internal-Sign: HMAC-SHA256(<secret>, <timestamp>)
  → @InnerAuth 注解验证上述三个头
```

---

## 模块间依赖（Feign 接口位于 `services/api/`）

```
manage  →  system-api (RemoteUserService)
note    →  file-api, system-api, ai-api
ai      →  file-api, note-api（已解耦，TODO Phase 4 MQ）
auth    →  system-api (RemoteUserService.getUserInfo)
```

---

## 响应格式规范

```json
{
  "code": "00000",          // ResCode 枚举 code 字段
  "msg": "操作成功",
  "data": { ... }
}
```

错误示例：`{"code":"A0301","msg":"访问未授权","data":null}`

常用 ResCode：

| 枚举值                   | code    | 含义               |
|--------------------------|---------|--------------------|
| SUCCESS                  | 00000   | 成功               |
| UNAUTHORIZED_ERROR       | A0301   | 未授权             |
| ACCESS_TOKEN_NOT_FOUND   | A0350   | 缺少 accessToken   |
| USER_REQUEST_PARAM_ERROR | A0160   | 请求参数错误       |
| BUSINESS_ERROR           | B0001   | 业务错误           |
| INNER_SERVICE_ERROR      | B0400   | 内部服务调用失败   |

---

## 构建与运行

```bash
# 构建全部（跳过测试）
cd services && mvn clean install -DskipTests

# 构建单个服务
mvn clean install -pl note -am -DskipTests

# 中间件（MySQL/Redis/Nacos/ES/MinIO/RocketMQ）
docker compose -f infra/docker-compose-middleware.yaml up -d

# 完整部署
./mvnw clean package -DskipTests
docker compose -f infra/docker-compose.yaml up -d
```

---

## 包结构约定

```
com.anynote.<module>.
  ├── controller/    HTTP 层，仅参数校验 + 调用 service
  ├── service/       业务逻辑接口
  ├── service/impl/  业务逻辑实现
  ├── mapper/        MyBatis Plus Mapper
  ├── model/
  │   ├── po/        持久化对象（与表一一对应）
  │   ├── dto/       请求 DTO
  │   └── vo/        响应 VO
  └── config/        Spring 配置
```

---

## 数据库迁移

SQL 文件位于 `infra/sql/`，手动执行或通过 init 脚本导入。MyBatis Plus 开启了自动填充（createTime/updateTime）。

---

## 配置中心

运行时配置全部存于 **Nacos**，`services/*/src/main/resources/bootstrap.yml` 只包含 Nacos 连接信息。本地开发默认连接 `localhost:8848`。
