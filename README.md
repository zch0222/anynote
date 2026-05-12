# Anynote

多模块学习笔记平台，支持笔记管理、知识库、AI 问答、文件存储、课程管理等功能。基于 Monorepo 架构，包含 Java 微服务后端、Next.js 前端和 Python AI 服务。

| 技术栈 | 版本 |
|--------|------|
| Java · Spring Boot | 21 · 3.3.4 |
| Spring Cloud / Alibaba | 2023.0.3 / 2023.0.3.4 |
| Next.js · React · TypeScript | 13.5 · 18 · 5 |
| Python · FastAPI · LangChain | 3.x · 0.116 · 0.3 |

---

## 目录结构

```
anynote/
├── apps/
│   └── web-legacy/           前端 Next.js 13.5 应用（当前活跃）
├── packages/
│   ├── api-client/           自动生成的 TypeScript API 客户端（禁止手改）
│   ├── ui/                   共享 React 组件库
│   └── tsconfig/             共享 TypeScript 配置
├── services/                 Java Spring Cloud 微服务
│   ├── gateway/              API 网关（:8080）
│   ├── auth/                 认证服务（:8083）
│   ├── system/               用户/权限（:8091）
│   ├── note/                 笔记/知识库（:18091）
│   ├── file/                 文件服务（:8095）
│   ├── ai/                   AI 服务 SSE（:9065）
│   ├── notify/               通知服务（:9066）
│   ├── job/                  定时任务（:8093）
│   ├── manage/               管理后台（:18092）
│   ├── api/                  Feign 接口定义
│   ├── common/               共享库
│   └── bom/                  Maven BOM（统一版本管理）
├── ai-service/               Python FastAPI AI 服务（:8000）
├── infra/                    Docker Compose + SQL 初始化
└── openapi/                  OpenAPI 规范与客户端生成脚本
```

---

## 快速启动

### 0. 配置环境变量

```bash
cp infra/.env.example infra/.env
```

用编辑器打开 `infra/.env`，**至少修改以下项**再启动：

| 变量 | 说明 | 风险 |
|------|------|------|
| `JWT_SECRET` | JWT 签名密钥，默认 `yxlm`（4字符，极弱） | 认证绕过 |
| `XXL_JOB_ADMIN_ACCESSTOKEN` | 任务调度器通信 Token | 任务执行权限 |
| `MYSQL_ROOT_PASSWORD` | MySQL root 密码 | 数据库 |
| `MYSQL_APP_PASSWORD` | 应用账户密码 | 数据库 |
| `MINIO_ROOT_PASSWORD` | 对象存储密码 | 文件存储 |

生成安全的随机密钥：
```bash
openssl rand -hex 32
```

> **注意**：默认值仅供本机开发使用，禁止在对外暴露的环境中使用默认值。

### 1. 启动中间件

```bash
docker compose -f infra/docker-compose-middleware.yaml up -d
# 包含：MySQL · Redis · Nacos · Elasticsearch · MinIO · RocketMQ · Logstash · XXL-Job
```

> Nacos 配置中心：`http://localhost:8848/nacos`（默认账密 `nacos / nacos`）

### 2. 启动 Java 后端

```bash
# 构建全部服务（首次或依赖变更时）
cd services && mvn clean install -DskipTests

# 各服务 IDEA 启动，或通过 CLI
cd services && mvn spring-boot:run -pl gateway
```

### 3. 启动 Python AI 服务

```bash
cd ai-service
pip install -r requirements.txt
uvicorn app:app --reload --host 0.0.0.0 --port 8000
```

### 4. 启动前端

```bash
pnpm install
pnpm --filter web-legacy dev
# 访问 http://localhost:3000
```

### 5. 更新 API 客户端类型（后端接口变更后）

```bash
# 需要后端已启动
pnpm openapi:generate
```

---

## Docker 编排启动

> 适用场景：本地完整集成测试、不想在宿主机安装 Java/Python 环境。

**前置要求**：Docker >= 24 + Compose Plugin、Maven

### 1. 构建 Java 服务 JAR

```bash
cd services && mvn clean package -DskipTests && cd ..
```

### 2. 启动全栈

```bash
# 首次或代码变更时加 --build
docker compose -f infra/docker-compose.yaml up -d --build
```

后端服务启动约需 60–120 秒（依赖 Nacos、Elasticsearch、RocketMQ 健康后才启动）。

### 3. 验证健康状态

```bash
docker compose -f infra/docker-compose.yaml ps
# 所有服务 STATUS 应显示 healthy

curl --noproxy '*' -fsS http://127.0.0.1:8080/actuator/health | jq .
```

### 4. 停止与清理

```bash
# 停止全部容器
docker compose -f infra/docker-compose.yaml down

# 同时删除数据卷（慎用，会清空 MySQL / ES / MinIO 数据）
docker compose -f infra/docker-compose.yaml down -v
```

### 5. Nginx 反向代理（对外暴露）

所有容器端口均绑定 `127.0.0.1`，不直接对外暴露。生产环境通过 Nginx 统一转发：

```
外网 443/80
  └── Nginx
        ├── /api/aiNio/  →  127.0.0.1:8080  （SSE，关闭缓冲）
        ├── /api/        →  127.0.0.1:8080  （普通 API）
        └── /            →  127.0.0.1:3000  （前端）
```

配置模板见 [`infra/nginx/nginx.conf`](infra/nginx/nginx.conf)，复制后替换域名和证书路径即可。

**SSE 关键配置**（`/api/aiNio/` 路由，含 AI 流式对话和语音转写状态推送）：

```nginx
location /api/aiNio/ {
    proxy_pass          http://127.0.0.1:8080;
    proxy_buffering     off;       # 必须：关闭缓冲，否则 SSE 数据流被批量缓存
    proxy_cache         off;
    proxy_read_timeout  3600s;     # SSE 连接持续时间较长
    proxy_http_version  1.1;
    proxy_set_header    Connection '';
    add_header          X-Accel-Buffering no always;
}
```

---

### 环境变量

所有变量均在 `infra/.env` 中设置（由 `infra/docker-compose-middleware.yaml` 和 `infra/docker-compose.yaml` 读取）。未设置时使用括号内的默认值。

#### 必须修改（安全敏感）

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `JWT_SECRET` | `yxlm` | JWT 签名密钥，建议 `openssl rand -hex 32` 生成 |
| `MYSQL_ROOT_PASSWORD` | `AnynoteRoot123` | MySQL root 密码（Nacos / XXL-Job 初始化使用） |
| `MYSQL_APP_PASSWORD` | `Anynote*1832` | 应用账户密码（所有微服务使用） |
| `MINIO_ROOT_PASSWORD` | `AnynoteMinio123` | MinIO 对象存储密码 |
| `XXL_JOB_ADMIN_ACCESSTOKEN` | `default_token` | XXL-Job 调度中心通信 Token |

#### 应用运行配置

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `SPRING_PROFILES_ACTIVE` | `dev` | Spring Profile（`dev` / `prod`） |
| `JAVA_OPTS` | `-Xms256m -Xmx512m` | 所有 Java 服务共享的 JVM 参数 |
| `AI_FASTAPI_ADDRESS` | `http://host.docker.internal:8000` | Python AI 服务地址；容器内部署时改为容器名 |
| `APP_IMAGE_PREFIX` | `anynote` | Docker 镜像名前缀 |
| `APP_DOCKERFILE` | `infra/Dockerfile.local` | 构建用 Dockerfile 路径 |

#### 数据库（MySQL）

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `MYSQL_DATABASE` | `anynote` | 应用主数据库名 |
| `MYSQL_APP_USER` | `anynote` | 应用账户名 |
| `NACOS_DB_NAME` | `anynote_config` | Nacos 配置数据库名 |
| `XXL_JOB_DB_NAME` | `anynote_xxl_job` | XXL-Job 数据库名 |
| `MYSQL_PORT` | `3306` | 宿主机映射端口 |

#### 缓存（Redis）

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `REDIS_PASSWORD` | _(空)_ | 留空禁用认证，非空时自动启用 `requirepass` |
| `REDIS_PORT` | `6379` | 宿主机映射端口 |

#### 配置中心（Nacos）

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `NACOS_NAMESPACE` | `0587fa28-1301-43db-a7a1-599c00fc3f70` | 命名空间 ID，需与 Nacos 控制台一致 |
| `NACOS_GROUP` | `DEFAULT_GROUP` | 配置导入分组 |
| `NACOS_USERNAME` | `nacos` | Nacos 控制台账户 |
| `NACOS_PASSWORD` | `nacos` | Nacos 控制台密码 |
| `NACOS_HTTP_PORT` | `8848` | HTTP 端口 |
| `NACOS_GRPC_PORT` | `9848` | gRPC 端口 |
| `NACOS_RAFT_PORT` | `9849` | Raft 端口 |

#### 对象存储（MinIO）

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `MINIO_ROOT_USER` | `anynote` | MinIO 管理员用户名 |
| `MINIO_API_PORT` | `9000` | API 端口 |
| `MINIO_CONSOLE_PORT` | `9001` | 控制台端口 |

#### 消息队列（RocketMQ）

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `ROCKETMQ_NAMESRV_PORT` | `9876` | NameServer 端口 |
| `ROCKETMQ_BROKER_PORT` | `10911` | Broker 监听端口 |
| `ROCKETMQ_BROKER_FAST_PORT` | `10909` | Broker Fast 端口 |
| `ROCKETMQ_BROKER_HA_PORT` | `10912` | Broker HA 端口 |
| `ROCKETMQ_BROKER_BIND_IP` | `127.0.0.1` | 宿主机绑定 IP |
| `ROCKETMQ_BROKER_ADVERTISE_IP` | `rocketmq-broker` | Broker 对外广播地址（容器间通信用服务名） |
| `ROCKETMQ_BROKER_JAVA_OPT_EXT` | `-Xms256m -Xmx256m -Xmn128m -XX:MaxDirectMemorySize=128m` | Broker JVM 参数 |

#### 搜索（Elasticsearch）与日志（Logstash）

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `ELASTICSEARCH_PORT` | `9200` | ES HTTP 端口 |
| `ELASTICSEARCH_TRANSPORT_PORT` | `9300` | ES Transport 端口 |
| `ES_JAVA_OPTS` | `-Xms384m -Xmx384m -XX:MaxDirectMemorySize=128m` | ES JVM 参数 |
| `LOGSTASH_TCP_PORT` | `4560` | Logstash TCP 输入端口（日志收集） |
| `LOGSTASH_BEATS_PORT` | `5044` | Logstash Beats 端口 |
| `LOGSTASH_API_PORT` | `9600` | Logstash 监控 API 端口 |

#### 任务调度（XXL-Job）

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `XXL_JOB_PORT` | `10086` | XXL-Job Admin 宿主机映射端口 |

#### Java 服务宿主机端口（可选覆盖）

| 变量 | 默认值 | 服务 |
|------|--------|------|
| `GATEWAY_PORT` | `8080` | API 网关 |
| `AUTH_PORT` | `8083` | 认证服务 |
| `SYSTEM_PORT` | `8091` | 用户/权限服务 |
| `NOTE_PORT` | `18091` | 笔记服务 |
| `FILE_PORT` | `8095` | 文件服务 |
| `AI_NIO_PORT` | `9065` | AI SSE 服务 |
| `MANAGE_PORT` | `18092` | 管理后台 |
| `NOTIFY_PORT` | `9066` | 通知服务 |
| `JOB_PORT` | `8093` | 定时任务执行器 |

#### 中间件镜像版本（可选锁定）

| 变量 | 默认值 |
|------|--------|
| `MYSQL_VERSION` | `8.0.42` |
| `REDIS_VERSION` | `6.2-alpine` |
| `NACOS_VERSION` | `v2.4.3` |
| `ELASTICSEARCH_VERSION` | `8.7.0` |
| `LOGSTASH_VERSION` | `8.7.0` |
| `ROCKETMQ_VERSION` | `5.3.0` |
| `MINIO_VERSION` | `latest` |
| `XXL_JOB_ADMIN_VERSION` | `2.5.0` |
| `CURL_VERSION` | `8.10.1` |

#### 前端（`apps/web-legacy/.env`）

| 变量 | 示例值 | 说明 |
|------|--------|------|
| `NEXT_PUBLIC_BASE_URL` | `https://api.example.com` | 后端 API 基础地址 |
| `NEXT_PUBLIC_VDITOR_CDN` | `https://unpkg.com/vditor/dist` | Vditor 编辑器 CDN 地址 |
| `NEXT_PUBLIC_ICP` | _(空)_ | ICP 备案号（页脚展示，可留空） |

---

## 常用命令速查

| 命令 | 说明 |
|------|------|
| `pnpm dev` | 启动全部前端应用（Turborepo） |
| `pnpm build` | 构建全部前端应用 |
| `pnpm check` | Biome 格式化 + lint |
| `pnpm openapi:generate` | 从后端 Swagger 生成 TypeScript 类型 |
| `cd services && mvn clean install -pl note -am -DskipTests` | 构建单个 Java 服务及其依赖 |

---

## API 文档

Swagger UI 地址（本地启动后访问）：

| 服务 | 地址 |
|------|------|
| 聚合文档（网关） | http://localhost:8080/swagger-ui.html |
| 认证服务 | http://localhost:8083/swagger-ui.html |
| 系统服务 | http://localhost:8091/swagger-ui.html |
| 笔记服务 | http://localhost:18091/swagger-ui.html |
| 文件服务 | http://localhost:8095/swagger-ui.html |
| AI 服务 | http://localhost:9065/swagger-ui.html |
| Python AI | http://localhost:8000/docs |

API 开发遵循 API-First 流程，详见 [`openapi/WORKFLOW.md`](openapi/WORKFLOW.md)。

---

## 项目进度

| Phase | 内容 | 状态 |
|-------|------|------|
| 0 | Monorepo 基础设施 | ✅ v0.1.0 |
| 1 | OpenAPI Contract First | ✅ v0.2.0 |
| 2 | Maven BOM 重构 | ✅ v0.3.0 |
| 3 | Spring Boot 3 / Java 21 升级 | ✅ v0.4.0 |
| 4 | 服务层重构（异常/REST/HMAC） | ✅ v0.5.0 |
| 5 | 前端完全重写（Next.js 15） | 🔲 待开始 |
| 6 | Python AI 服务现代化 | ✅ v0.7.0 |
| 7 | OpenSpec 集成（AI 上下文） | ✅ v1.0.0 |

---

## Git 工作流

### 分支模型

```
main          ← 稳定发布分支，每个 Phase 完成后合并，打版本 Tag
  └── dev     ← 集成分支，Feature/Phase 分支合并目标
        └── phase/<n>-<描述>   ← 每个重构阶段的独立分支
        └── feat/<描述>        ← 新功能分支
        └── fix/<描述>         ← Bug 修复分支
```

**规则：**
- 直接向 `main` 提交仅限 merge commit
- `dev` 保持可运行状态
- Phase 完成流程：`phase/*` → `dev`（`--no-ff`）→ `main`（`--no-ff`）→ Tag

### Commit 格式（Conventional Commits）

```
<type>(<scope>): <简短描述>
```

| type | 用途 |
|------|------|
| `feat` | 新功能 |
| `fix` | Bug 修复 |
| `refactor` | 重构 |
| `docs` | 文档变更 |
| `chore` | 构建/配置 |
| `test` | 测试 |
| `perf` | 性能优化 |

---

## 参与贡献

详见 [CONTRIBUTING.md](CONTRIBUTING.md)。

## License

[MIT](LICENSE)
