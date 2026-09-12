# Anynote

多模块学习笔记平台，支持笔记管理、知识库、AI 问答、文件存储、课程管理等功能。基于 Monorepo 架构，包含 Java 微服务后端、Next.js 前端和 Python AI 服务。

| 技术栈 | 版本 |
|--------|------|
| Java · Spring Boot | 21 · 3.3.4 |
| Spring Cloud / Alibaba | 2023.0.3 / 2023.0.3.4 |
| Next.js · React · TypeScript | 15.5 · 19 · 5 |
| Python · FastAPI · LangChain | 3.x · 0.116 · 0.3 |

---

## 目录结构

```
anynote/
├── apps/
│   ├── web/                  前端 Next.js 15 应用（Phase 5 重写，M0-M8 已完成）
│   ├── web-legacy/           旧前端 Next.js 13.5（用户当前实际访问的版本，不在 workspace 内）
│   ├── collab/               协同编辑 WebSocket 服务（Node，:1234）
│   └── desktop/              Tauri 2 桌面壳（构建需 Rust 工具链，见其 README）
├── packages/
│   ├── api-client/           自动生成的 TypeScript API 客户端（禁止手改）
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

## 启动指南

仓库支持三种启动方式，按使用频率列出。**先看 [环境变量文件总览](#环境变量文件总览必读)**，再挑场景。

| 场景 | 适用 | 关键差异 |
|------|------|---------|
| [A. Dev Docker 全栈](#场景-adev-docker-全栈推荐日常使用) | 日常本机开发，最快 | `--env-file=/dev/null` + `docker-compose.dev.yaml` override |
| [B. IDEA / 宿主机跑 Java](#场景-bidea--宿主机跑-java混合模式) | 想在 IDE 里 debug Java 服务 | 只起中间件，IDEA Run Config 接 `.env.idea` |
| [C. 生产部署](#场景-c生产部署) | 对外暴露的环境 | `--env-file infra/.env` + prod override + 容器外 Nginx |

### 环境变量文件总览（必读）

环境配置按容器部署、IDEA Java 与宿主机前端三种用途分开，**不要混用**：

| 文件 | 用途 | 入库 | docker compose 默认会读？ |
|------|------|:----:|:----:|
| `infra/.env.example` | 生产密码、域名、镜像标签样板（必填值留空） | ✅ | ❌ |
| `infra/.env.idea.example` | **IDEA / 宿主机直接跑 Java** 时把中间件 host 改成 `127.0.0.1` | ✅ | ❌ |
| `infra/.env` | 从生产样板拷贝出的部署实例 | ❌ | 生产命令显式 `--env-file infra/.env` |
| `infra/.env.idea` | IDEA Java 的宿主机地址配置 | ❌ | **不能交给 Compose** |
| `apps/web/.env.example` → `.env.local` | 宿主机 Next.js 开发，`.env.local` 不入库 | 样板 ✅ | ❌，由 Next.js 加载 |

**踩坑提示**：`.env.idea` 文件名不是 `.env`，所以 docker compose 默认不会加载。但如果你不慎把它重命名成 `.env`，里面的 `ROCKETMQ_BROKER_ADVERTISE_IP=127.0.0.1` 会让 broker 容器向 namesrv 广播错误地址，结果是其它容器内的 app 无法连接 broker，MQ listener 启动失败。

**强制约束**：

- **场景 A（dev）**：所有 `docker compose` 命令统一加 `--env-file=/dev/null`，强制 compose 只使用 YAML 内置默认值。
- **场景 C（prod）**：必须读 `infra/.env`（含真密码），**不要加** `--env-file=/dev/null`。

---

### 场景 A：Dev Docker 全栈（推荐日常使用）

> Next.js、协同服务、9 个 Java 服务和中间件进入 Compose。Java JAR 仍需预先构建；Python AI 独立运行，由 `AI_FASTAPI_ADDRESS` 指向其内网地址。

**前置**：Docker >= 24 + Compose >= 2.24.4、Maven / JDK 21。前端依赖和生产构建全部在镜像内完成。下列 shell 命令在 Linux / macOS / WSL 执行；Windows 原生 Compose 的空环境文件用 `--env-file=NUL`。

#### A.1 构建 Java 服务 JAR

```bash
pnpm services:build
# 等价于：cd services && mvn clean install -DskipTests
```

#### A.2 启动全栈

```bash
docker compose --env-file=/dev/null \
  -f infra/docker-compose.yaml \
  -f infra/docker-compose.dev.yaml \
  up -d --build
```

- `--env-file=/dev/null`：强制 compose 忽略本地 `.env`，避免 IDEA 用 host 覆盖污染容器
- `docker-compose.dev.yaml`：app 容器 `restart: "no"`，启动失败立即 `Exited`，方便 `docker logs` 排查；中间件保留原 restart 策略
- `--build`：首次或代码变更时必带；后续仅起容器可省
- 浏览器访问 `http://localhost:3000/login`；先停止占用 3000 的宿主机 `next start` / `next dev`。前端健康检查访问 `/login`。前端镜像不含 Nginx。
- 前端默认运行生产构建；只重建前端可用同一组 `-f` 参数执行 `up -d --build --no-deps anynote-web`。构建与运行目录隔离，不挂载宿主机 `.next`。

启动约需 60–120 秒。

#### A.3 验证健康状态

```bash
# 容器状态
docker compose --env-file=/dev/null \
  -f infra/docker-compose.yaml -f infra/docker-compose.dev.yaml ps
# 所有服务 STATUS 应显示 healthy

# 服务可用性
for port in 8080 8083 8091 18091 8095 9065 9066; do
  curl --noproxy '*' -fsS -m 2 "http://127.0.0.1:$port/actuator/health" | jq -r '.status'
done

# 协同编辑服务（Node，非 Spring，健康检查路径不同）
curl --noproxy '*' -fsS -m 2 http://127.0.0.1:1234/healthz
```

> `anynote-collab` 是 `apps/web` 的 `/docs` 协同编辑所依赖的 WebSocket 服务。它不连
> Nacos / MySQL，文档状态落在自己的 `collab-data` 卷里。`COLLAB_TOKEN_SECRET` 必须与
> 前端的同名环境变量一致，否则所有握手都会 401（错误只出现在 collab 容器日志里）。

#### A.4 验证 OpenAPI 聚合

```bash
# 6 个 service spec 都应 > 2KB
for svc in auth system note file ai notify; do
  size=$(curl --noproxy '*' -sf "http://127.0.0.1:8080/$svc/v3/api-docs" | wc -c)
  echo "  $svc: $size bytes"
done

# 重新生成 TS 类型并验证类型检查
pnpm openapi:generate
pnpm --filter @anynote/api-client typecheck
```

#### A.5 前端容器热更新（可选）

```bash
docker compose --env-file=/dev/null -f infra/docker-compose.yaml -f infra/docker-compose.dev.yaml -f infra/docker-compose.web-dev.yaml up -d --build --no-deps anynote-web
```

`src/`、`public/` 和 Next/TS 配置只读挂载，依赖、生成类型与 `.next` 留在容器。修改依赖、锁文件或 OpenAPI baseline 后重新 build。恢复生产构建时去掉 `web-dev` 覆盖文件，仍需 `up -d --build --no-deps anynote-web`；切换构建目标不能只用 `restart`。

#### A.6 停止与清理

```bash
# 停止全部容器（保留数据）
docker compose --env-file=/dev/null \
  -f infra/docker-compose.yaml -f infra/docker-compose.dev.yaml down

# 同时删除数据卷（清空 MySQL / ES / MinIO / Nacos / RocketMQ store；慎用）
docker compose --env-file=/dev/null \
  -f infra/docker-compose.yaml -f infra/docker-compose.dev.yaml down -v
```

---

### 场景 B：IDEA / 宿主机跑 Java（混合模式）

> 想在 IDEA 里逐个 debug Java 服务，中间件 / Python / 前端跑在本机便利环境里。

#### B.1 准备 IDEA 用环境变量

```bash
cp infra/.env.idea.example infra/.env.idea
# 文件内容默认就够本机用；需要改 JWT_SECRET 等再编辑
```

#### B.2 只起中间件

```bash
docker compose --env-file=/dev/null -f infra/docker-compose-middleware.yaml -f infra/docker-compose.middleware-idea.yaml up -d
# 包含：MySQL · Redis · Nacos · Elasticsearch · MinIO · RocketMQ · Logstash · XXL-Job
```

> Nacos 控制台：`http://localhost:8848/nacos`（账密 `nacos / nacos`）

#### B.3 在 IDEA Run Configuration 接入 `.env.idea`

每个 Spring 服务的 Run Configuration → Environment Variables → "Load from file" 选 `infra/.env.idea`，然后用 IDEA 启动 `gateway` / `auth` / `system` / `note` / `file` / `ai` / `notify` 主类。

也可以走 shell：

```bash
set -a; . infra/.env.idea; set +a
cd services && mvn spring-boot:run -pl gateway
```

#### B.4 启动 Python AI 服务

```bash
cd ai-service
pip install -r requirements.txt
uvicorn app:app --reload --host 0.0.0.0 --port 8000
```

#### B.5 启动前端

```bash
pnpm install
cp apps/web/.env.example apps/web/.env.local
pnpm openapi:generate  # Gateway 就绪后从真实契约派生类型
pnpm --filter web dev
# 访问 http://localhost:3000
```

宿主机前端启动前，停掉 `anynote-web` 容器以释放 3000。协同服务可以单独启动：

```bash
docker compose --env-file=/dev/null -f infra/docker-compose.yaml -f infra/docker-compose.dev.yaml up -d --build --no-deps anynote-collab
```

IDEA 模式和 Docker Java 模式不要同时运行同名服务；切回 Docker 全栈时去掉 `middleware-idea` 覆盖文件并重新创建 broker。前端配置放 `apps/web/.env.local`，Java 配置放 `infra/.env.idea`，两者均不提供给镜像构建。

#### B.6 更新 API 客户端类型（后端接口变更后）

```bash
pnpm openapi:generate    # 需要 gateway 已起
pnpm --filter @anynote/api-client typecheck
```

---

### 场景 C：生产部署

部署拓扑：容器外 Nginx 终止 TLS → Next.js BFF / 协同 WebSocket → Docker 内网 Java 服务与中间件。Compose 不创建 Nginx。生产必须合并 `docker-compose.prod.yaml`，不能单独使用 base 或 dev 覆盖文件。

#### C.1 准备发布配置

```bash
cp infra/.env.example infra/.env
chmod 600 infra/.env
# 编辑并填满所有空值：真实密码、COLLAB_TOKEN_SECRET、NACOS_NAMESPACE、APP_IMAGE_TAG、MINIO_VERSION。
# 密钥建议用 openssl rand -hex 32 独立生成。
```

`NEXT_PUBLIC_APP_URL=https://你的域名`（无尾斜杠），`NEXT_PUBLIC_COLLAB_WS_URL=wss://你的域名/collab`。它们是**构建参数**；域名变更必须重新构建前端镜像。容器启动会校验构建值与运行配置一致，防止页面仍连接 localhost。协同密钥只在运行时注入 web/collab，不能作为 build arg；纯 Web 部署保持 `DESKTOP_EXCHANGE_KEY` 未配置。

所有生产命令显式使用 `--env-file infra/.env`，避免当前工作目录影响环境加载。缺少必要变量时 Compose 在启动前报错。`APP_IMAGE_TAG` 使用唯一发布标签，`MINIO_VERSION` 固定已验证的 RELEASE 标签。已有数据卷的数据库密码不会因更改 `.env` 自动修改，轮换时需同步数据库账户。

#### C.2 准备生产 Nacos 配置

生产覆盖文件关闭默认 dev 配置自动导入，并将 Spring 的配置导入切换到 `application-prod.yml` 和 `<spring.application.name>-prod.yml`，不再读取 JAR 中硬编码的 `application-dev.yml`。

1. 启动中间件，创建 `NACOS_NAMESPACE` 对应的生产 namespace。
2. 在 `NACOS_PROD_CONFIG_DIR`（宿主机绝对路径）准备 `DEFAULT_GROUP` 下的 `application-prod.yml` 及各服务 `*-prod.yml`。以 `infra/docker/nacos/configs/` 为结构参考，检查数据库、Redis、对象存储、AI 地址、第三方密钥、日志和权限配置；不要把 dev 配置原样发布。
3. 从可信运维环境访问 Nacos API/控制台后手动导入，或显式运行下面的 `nacos-init`。普通 `up` 不重写配置。

```bash
docker compose --env-file infra/.env -f infra/docker-compose.yaml -f infra/docker-compose.prod.yaml up -d mysql redis nacos elasticsearch rocketmq-namesrv rocketmq-broker logstash minio xxl-job-admin
docker compose --env-file infra/.env -f infra/docker-compose.yaml -f infra/docker-compose.prod.yaml run --rm nacos-init
```

生产不发布 Nacos / Elasticsearch 等管理端口。这些中间件沿用单机可信 Docker 网络模式；不要把不可信容器加入 `anynote-net`。如有跨主机中间件或多租户运维要求，需要另外配置中间件认证与 TLS。Python AI 仍是独立服务，`AI_FASTAPI_ADDRESS` 必须指向可达的内网地址。

#### C.3 构建并启动

```bash
pnpm services:build
docker compose --env-file infra/.env -f infra/docker-compose.yaml -f infra/docker-compose.prod.yaml build
docker compose --env-file infra/.env -f infra/docker-compose.yaml -f infra/docker-compose.prod.yaml up -d --no-build --wait
docker compose --env-file infra/.env -f infra/docker-compose.yaml -f infra/docker-compose.prod.yaml ps
```

前端在多阶段镜像内安装锁文件依赖、从入库 OpenAPI baseline 生成类型、运行 webpack 构建，最终只拷贝 standalone、静态资源与 public。无需宿主机 `node_modules`、`.next` 或运行中的 Gateway；构建需要 npm/基础镜像与 Google 字体下载网络。运行用户为 `node`，带健康检查、退出自动重启及日志轮转。生产 Java/中间件仅有 Docker 内网端口。

使用镜像仓库时配置 `APP_IMAGE_PREFIX` 和 `APP_IMAGE_TAG`，在构建机 `build` / `push`，部署机 `pull` 后 `up -d --no-build --wait`。仅升级前端：

```bash
docker compose --env-file infra/.env -f infra/docker-compose.yaml -f infra/docker-compose.prod.yaml up -d --build --no-deps --wait anynote-web
```

单实例替换存在短暂重连窗口；需要无中断发布时部署两套独立 release 后由外部 Nginx 切换 upstream，不共享 `.next`。

#### C.4 安装容器外 Nginx

模板：[`infra/nginx/nginx.conf`](infra/nginx/nginx.conf) 与 [`infra/nginx/snippets/sse-common.conf`](infra/nginx/snippets/sse-common.conf)。Nginx >= 1.25.1，把主配置放进 `http {}` 下加载的目录，snippet 放 `/etc/nginx/snippets/`，替换域名和证书后执行 `nginx -t` 再 reload。

| 外部路径 | 宿主机 upstream | 说明 |
|---|---|---|
| `/`、`/_next/*` | `127.0.0.1:3000` | Next.js 页面与静态资源 |
| `/api/*` | `127.0.0.1:3000` | BFF 登录、Cookie、代理及 SSE；关闭缓冲 |
| `/collab/*` | `127.0.0.1:1234` | 去掉 `/collab/` 前缀并保留 Upgrade；不记录含令牌的请求 URL |

`/api/` 不能转发到 8080：新前端需要先经过 BFF，内部才请求 `http://anynote-gateway:8080`。使用 HTTPS 保持 Secure Cookie；请求 Host/Origin 必须与配置的站点来源一致。Next 自己设置静态缓存头，不对错误响应强加长期缓存。

默认 Nginx 与 Docker 同机，两个入口只绑定回环。如 Nginx 在另一台内网主机，将 `WEB_BIND_IP` / `COLLAB_BIND_IP` 改成 **Docker 主机的私网 IP**，upstream 同步修改，防火墙只允许 Nginx 来源访问 3000/1234，TLS 仍在 Nginx 终止。只有 Nginx 对客户端暴露 80/443。

网络架构图与访问链路见 [`docs/deployment-network.md`](docs/deployment-network.md)。

#### C.5 验证与持久化

访问 `https://你的域名/login`，确认所有 JS/CSS 返回 200；验证登录失败提示、成功后 Cookie/用户资料、`/docs` 协同连接和 SSE。自动检查命令见「测试」节。没有真实域名、证书和生产 Nacos 配置前，只能完成本地容器验证，不能把它记作生产发版验收。

MySQL、Redis、MinIO、Elasticsearch、RocketMQ、协同文档均保留命名卷。尤其 `collab-data` 存储协同文档，备份时停写或使用一致性快照；前端产物无数据卷，每次发布来自新镜像。MySQL 用 `mysqldump`、MinIO 用 `mc mirror` 做异地备份，保留 Nacos 配置备份。生产不要执行 `down -v`。

---
## 环境变量参考

容器变量在 `infra/.env` 中设置，宿主机前端变量在 `apps/web/.env.local` 中设置（由 `infra/docker-compose-middleware.yaml` 与 `infra/docker-compose.yaml` 读取）。**dev 推荐用 `--env-file=/dev/null` 强制走 YAML 默认值**，避免与 `infra/.env.idea` 混淆（详见 [环境变量文件总览](#环境变量文件总览必读)）。未设置时使用括号内的默认值。

### 必须修改（安全敏感）

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `JWT_SECRET` | `yxlm` | JWT 签名密钥，建议 `openssl rand -hex 32` 生成 |
| `MYSQL_ROOT_PASSWORD` | `AnynoteRoot123` | MySQL root 密码（Nacos / XXL-Job 初始化使用） |
| `MYSQL_APP_PASSWORD` | `Anynote*1832` | 应用账户密码（所有微服务使用） |
| `MINIO_ROOT_PASSWORD` | `AnynoteMinio123` | MinIO 对象存储密码 |
| `XXL_JOB_ADMIN_ACCESSTOKEN` | `default_token` | XXL-Job 调度中心通信 Token |

### 应用运行配置

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `SPRING_PROFILES_ACTIVE` | `dev` | Spring Profile（`dev` / `prod`） |
| `JAVA_OPTS` | `-Xms256m -Xmx512m` | 所有 Java 服务共享的 JVM 参数 |
| `AI_FASTAPI_ADDRESS` | `http://host.docker.internal:8000` | Python AI 服务地址；容器内部署时改为容器名 |
| `APP_IMAGE_PREFIX` | `anynote` | Docker 镜像名前缀 |
| `APP_IMAGE_TAG` | `local` | 生产必须显式设置发布标签 |
| `NEXT_PUBLIC_APP_URL` | `http://localhost:3000` | 公开来源，构建时内联，生产要求 HTTPS |
| `NEXT_PUBLIC_COLLAB_WS_URL` | `ws://localhost:1234` | 生产为同源 `wss://域名/collab` |
| `COLLAB_TOKEN_SECRET` | 开发密钥 | 生产必须独立生成至少 32 字符，web/collab 共用 |
| `WEB_BIND_IP` / `COLLAB_BIND_IP` | `127.0.0.1` | 只发布外部 Nginx 所需入口 |
| `WEB_PORT` / `COLLAB_PORT` | `3000` / `1234` | 改动后同步 Nginx upstream |
| `APP_DOCKERFILE` | `infra/Dockerfile.local` | 构建用 Dockerfile 路径 |

### 数据库（MySQL）

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `MYSQL_DATABASE` | `anynote` | 应用主数据库名 |
| `MYSQL_APP_USER` | `anynote` | 应用账户名 |
| `NACOS_DB_NAME` | `anynote_config` | Nacos 配置数据库名 |
| `XXL_JOB_DB_NAME` | `anynote_xxl_job` | XXL-Job 数据库名 |
| `MYSQL_PORT` | `3306` | 宿主机映射端口 |

### 缓存（Redis）

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `REDIS_PASSWORD` | _(空)_ | 留空禁用认证，非空时自动启用 `requirepass` |
| `REDIS_PORT` | `6379` | 宿主机映射端口 |

### 配置中心（Nacos）

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `NACOS_NAMESPACE` | `0587fa28-1301-43db-a7a1-599c00fc3f70` | 命名空间 ID，需与 Nacos 控制台一致 |
| `NACOS_GROUP` | `DEFAULT_GROUP` | 配置导入分组 |
| `NACOS_USERNAME` | `nacos` | Nacos 控制台账户 |
| `NACOS_PASSWORD` | `nacos` | Nacos 控制台密码 |
| `NACOS_HTTP_PORT` | `8848` | HTTP 端口 |
| `NACOS_GRPC_PORT` | `9848` | gRPC 端口 |
| `NACOS_RAFT_PORT` | `9849` | Raft 端口 |

### 对象存储（MinIO）

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `MINIO_ROOT_USER` | `anynote` | MinIO 管理员用户名 |
| `MINIO_API_PORT` | `9000` | API 端口 |
| `MINIO_CONSOLE_PORT` | `9001` | 控制台端口 |

### 消息队列（RocketMQ）

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `ROCKETMQ_NAMESRV_PORT` | `9876` | NameServer 端口 |
| `ROCKETMQ_BROKER_PORT` | `10911` | Broker 监听端口 |
| `ROCKETMQ_BROKER_FAST_PORT` | `10909` | Broker Fast 端口 |
| `ROCKETMQ_BROKER_HA_PORT` | `10912` | Broker HA 端口 |
| `ROCKETMQ_BROKER_BIND_IP` | `127.0.0.1` | 宿主机绑定 IP |
| `ROCKETMQ_BROKER_ADVERTISE_IP` | `rocketmq-broker` | Broker 对外广播地址（容器间通信用服务名） |
| `ROCKETMQ_BROKER_JAVA_OPT_EXT` | `-Xms256m -Xmx256m -Xmn128m -XX:MaxDirectMemorySize=128m` | Broker JVM 参数 |

### 搜索（Elasticsearch）与日志（Logstash）

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `ELASTICSEARCH_PORT` | `9200` | ES HTTP 端口 |
| `ELASTICSEARCH_TRANSPORT_PORT` | `9300` | ES Transport 端口 |
| `ES_JAVA_OPTS` | `-Xms384m -Xmx384m -XX:MaxDirectMemorySize=128m` | ES JVM 参数 |
| `LOGSTASH_TCP_PORT` | `4560` | Logstash TCP 输入端口（日志收集） |
| `LOGSTASH_BEATS_PORT` | `5044` | Logstash Beats 端口 |
| `LOGSTASH_API_PORT` | `9600` | Logstash 监控 API 端口 |

### 任务调度（XXL-Job）

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `XXL_JOB_PORT` | `10086` | XXL-Job Admin 宿主机映射端口 |

### Java 服务宿主机端口（可选覆盖）

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

### 中间件镜像版本（可选锁定）

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

### 旧前端（`apps/web-legacy/.env`）

| 变量 | 示例值 | 说明 |
|------|--------|------|
| `NEXT_PUBLIC_BASE_URL` | `https://api.example.com` | 后端 API 基础地址 |
| `NEXT_PUBLIC_VDITOR_CDN` | `https://unpkg.com/vditor/dist` | Vditor 编辑器 CDN 地址 |
| `NEXT_PUBLIC_ICP` | _(空)_ | ICP 备案号（页脚展示，可留空） |

### 新前端（`apps/web/.env.local`）

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `INTERNAL_API_URL` | `http://localhost:8080` | BFF 转发到网关的地址（**服务端专用**，不进浏览器包） |
| `NEXT_PUBLIC_APP_URL` | `http://localhost:3000` | 浏览器侧的自身源，用于 Origin 校验 |
| `NEXT_PUBLIC_COLLAB_WS_URL` | `ws://localhost:1234` | 协同服务地址；容器化部署应指向 Nginx 上的 ws 反代路径 |
| `COLLAB_TOKEN_SECRET` | `anynote-collab-dev-secret` | 签发协同令牌的 HMAC 密钥，**必须与 `anynote-collab` 容器一致**，生产必改 |
| `DESKTOP_EXCHANGE_KEY` | _(未设置)_ | 桌面端令牌交换密钥。**纯 Web 部署不要配**——不配即关闭该端点 |
| `DESKTOP_ALLOWED_ORIGINS` | `tauri://localhost,...` | 允许调用令牌交换的来源，仅在上一项已配置时生效 |

> `DESKTOP_EXCHANGE_KEY` 是唯一会把真实 Token 交给页面 JS 的开关（供 Tauri 桌面壳使用，
> 见 [`apps/desktop/README.md`](apps/desktop/README.md)）。Web 部署保持不配置，
> 否则一次 XSS 就能把 Token 取走。

---

## 常用命令速查

| 命令 | 说明 |
|------|------|
| `pnpm dev` | 启动全部前端应用（Turborepo） |
| `pnpm build` | 构建全部前端应用 |
| `pnpm check` | Biome 格式化 + lint |
| `pnpm openapi:generate` | 从后端 Swagger 生成 TypeScript 类型 |
| `pnpm openapi:check` | 生成 + 与 baseline diff（与 CI 同行为） |
| `pnpm typecheck` | turbo typecheck（含 `@anynote/api-client`） |
| `pnpm services:build` | = `cd services && mvn clean install -DskipTests` |
| `cd services && mvn clean install -pl note -am -DskipTests` | 构建单个 Java 服务及其依赖 |
| `pnpm test` | 全仓前端测试（Turborepo，含 `apps/web` 与 `apps/collab`） |
| `cd services && mvn clean test` | 全部 Java 模块单测 |
| `pnpm --filter web test:e2e` | Playwright 端到端（需生产构建 + 真实后端栈，见「测试」节） |
| `pnpm --filter web bundle:budget` | 产物体积预算判定（需先 build） |
| `pnpm --filter web lighthouse:budget` | Lighthouse 质量门禁（需生产前端在跑） |
| `pnpm --filter @anynote/desktop dev` | 启动 Tauri 桌面壳（需 Rust 工具链） |

---

## 测试

部署配置回归：`node --test infra/web/config.test.mjs`；Linux/WSL 下运行 `python3 -m unittest discover -s infra/tests -v` 检查生产端口、环境隔离、必填配置和 HMR 挂载。

本地部署冒烟（会创建随机测试账号并在结束时撤销会话，账号记录保留）：

```bash
python3 infra/tests/smoke_web.py http://localhost:3000 --ws ws://localhost:1234
# 验证生产 HTTPS/WSS 配置，连接当前开发后端，临时代理容器在结束后自动清理：
docker build -f infra/Dockerfile.web --build-arg NEXT_PUBLIC_APP_URL=https://localhost:3443 --build-arg NEXT_PUBLIC_COLLAB_WS_URL=wss://localhost:3443/collab -t anynote/anynote-web:prod-check .
sh infra/tests/proxy-smoke.sh
```


### 技术栈

| 层 | 框架 | 测试位置 |
|----|------|---------|
| Java | JUnit 5 + Mockito + AssertJ（由 `spring-boot-starter-test` 提供） | `services/<module>/src/test/java/com/anynote/<module>/` |
| Java（Reactive） | 额外 `reactor-test`（StepVerifier） | `gateway` / `ai` |
| 前端 | Vitest + Testing Library + jsdom | `apps/web/src/**/__tests__/` 或同名 `*.test.ts(x)` |
| 前端（构建期脚本） | Vitest（node 环境） | `apps/web/scripts/lib/__tests__/*.test.mjs` |
| 前端（端到端） | Playwright（Chromium） | `apps/web/e2e/*.spec.ts` |
| 协同服务 | Vitest（node 环境） | `apps/collab/src/__tests__/` |

`spring-boot-starter-test` 在父 pom [`services/pom.xml`](services/pom.xml) 的 `<dependencies>` 中统一声明，所有模块自动继承，新增模块无需改 pom。

### 单测与集成测试的划分

Java 测试按 JUnit 5 tag 分两类：

| 类型 | 标记 | 依赖 | 默认是否执行 |
|------|------|------|------------|
| 纯单测 | 无 | 仅 Mockito 打桩，不连外部服务 | ✅ 是（CI 每个 PR 都跑） |
| 集成测试 | `@Tag("integration")` | MySQL / Redis / Nacos / RocketMQ / MinIO | ❌ 否（surefire 默认排除） |

排除规则在父 pom：`<excludedGroups>${test.excluded.groups}</excludedGroups>`，属性默认值为 `integration`。

> **新写 `@SpringBootTest` 必须同时加 `@Tag("integration")`**，否则会混入默认单测流程，在没有中间件的 CI 上必然失败。

### 运行

```bash
# 前端
pnpm test                                   # 全仓（Turborepo）
pnpm --filter web test                      # 仅 apps/web
pnpm --filter web test:watch                # watch 模式
pnpm --filter web test:integration:auth     # 真实本地认证链路（需先启动生产前端与后端）

# 端到端与性能（都需要「生产构建 + 真实后端栈」，不进默认 pnpm test 与 CI）
pnpm --filter web build                     # 先出生产产物
pnpm --filter web test:e2e                  # Playwright 20 条用例（关键路径 + 笔记编辑器回归 + 协同双端同步）
pnpm --filter web bundle:budget             # 产物体积预算（超标退出码非零）
pnpm --filter web lighthouse:budget         # Lighthouse 门禁（需生产前端在跑）

# Java 单测
cd services && mvn clean test               # 全部模块
cd services && mvn test -pl auth -am        # 单模块

# Java 集成测试（需先起中间件，见「场景 B」）
cd services && mvn test -pl file -am -Dtest.excluded.groups=
```

> `-pl <module>` 必须搭配 `-am`：模块间通过 `com.anynote:*` SNAPSHOT 互相依赖，本地 `~/.m2` 未安装过这些产物时会直接卡在依赖解析失败。

认证集成测试单独使用 `apps/web/vitest.auth-integration.config.ts`，不会进入默认 `pnpm test` 或无中间件的 CI。先启动本地 Gateway/Auth/System/Redis，再执行 `pnpm --filter web build` 和 `pnpm --filter web start`；测试固定访问 `http://localhost:3000` 与 `http://localhost:8080`。每次创建一个随机 `e2e` 前缀的本地测试账号，结束时撤销创建的会话，账号记录保留；不要用于生产环境。覆盖注册、登录、Cookie 属性、Origin 校验、Bearer、路由保护与两种登出路径。浏览器页面交互和刷新并发验收另行执行。

### 端到端与性能门禁（M8.3）

三项都跑在**生产构建 + 真实 Docker 栈**上，与 `test:integration:auth` 同属「需要真实链路」的一类，**不进默认 `pnpm test`，也不进无中间件的 CI**。

| 命令 | 内容 | 门槛 |
|------|------|------|
| `pnpm --filter web test:e2e` | 登录 / 创建笔记 / 编辑保存 / AI 流式 / PDF 上传 / 暗色切换 6 条关键路径，笔记编辑器的高度、保存冲突与代码块回归，外加协同编辑的双上下文实时同步，共 20 条 | 全绿 |
| `pnpm --filter web bundle:budget` | 各路由首屏 JS（含各级 layout chunk）与编辑器整包的 gzip 体积 | 首屏 ≤ 300KB、编辑器 ≤ 250KB |
| `pnpm --filter web lighthouse:budget` | `/login`、`/dashboard`、`/notes`、`/docs`、`/ai/chat` 五条路由 | Performance ≥ 90、Accessibility ≥ 95 |

移动端（M10.x，方案见 [`docs/mobile/`](docs/mobile/)）另有一套同口径门禁：

| 命令 | 内容 | 门槛 |
|------|------|------|
| `pnpm --filter web test:e2e -- --project=mobile` | Pixel 5 视口下的移动端关键路径 | 全绿 |
| `pnpm --filter web bundle:budget` | 同一条命令：`/m/*` 路由按**路径段**单独分桶判定 | `/m/*` 首屏 ≤ 250KB，其余仍 ≤ 300KB |
| `pnpm --filter web lighthouse:budget:mobile` | `/login`、`/m/dashboard`、`/m/notes`、`/m/docs`、`/m/ai/chat` | Performance ≥ 85、Accessibility ≥ 95 |

移动端 Performance 门槛低于桌面是**口径差异不是退化**：Lighthouse 移动预设自带 4× CPU 降速与 150ms RTT 节流，
同一份产物在移动口径下必然低于桌面分数（理由见 [`docs/mobile/MOBILE_PLAN.md`](docs/mobile/MOBILE_PLAN.md) D8）。

注意事项：

- **E2E 每轮新建一个随机 `e2e` 前缀账号**并把登录态存到 `apps/web/e2e/.auth/`（已 gitignore）。账号不删（后端无注销端点），不要在生产环境跑。
- **协同用例需要 `anynote-collab` 容器在跑**，否则 `/docs` 停在「连接中」。
- **Lighthouse 必须用官方 desktop 预设**（脚本里已固定）。只设 `formFactor: "desktop"` 而不换节流参数，量到的是「桌面页面跑在移动 4G + 4 倍 CPU 降速下」的分数，与桌面门槛对不上。
- 需要登录的路由靠 E2E 攒下的 `state.json` 提供 Cookie，所以 **Lighthouse 要在 E2E 之后跑**。
- 跑之前确认没有旧的 `next start` 占着 3000 端口：同一 `.next` 上并行两个实例会产出引用不存在 chunk 的 HTML。

### 前端测试基建

| 文件 | 作用 |
|------|------|
| [`apps/web/vitest.config.ts`](apps/web/vitest.config.ts) | jsdom 环境、`@` 别名、JSX transform；排除 vendored 的 `src/components/ui` |
| [`apps/web/vitest.setup.ts`](apps/web/vitest.setup.ts) | 注册 jest-dom matcher 与用例间 DOM cleanup |
| [`apps/web/src/test/render.tsx`](apps/web/src/test/render.tsx) | `renderWithProviders` / `renderHookWithProviders` / `createTestQueryClient`，测 TanStack Query hook 用这套包装 |
| [`apps/web/playwright.config.ts`](apps/web/playwright.config.ts) | E2E 配置：串行执行、复用已在跑的生产前端、失败留 trace 与截图 |
| [`apps/web/e2e/global-setup.ts`](apps/web/e2e/global-setup.ts) | 每轮建临时账号并存 `storageState`，用例默认带登录态 |

### CI

[`.github/workflows/test.yml`](.github/workflows/test.yml) 在所有 PR 与 `dev` / `main` push 上跑两个并行 job：

| Job | 命令 | 说明 |
|-----|------|------|
| `java` | `mvn clean test` | 集成测试被自动排除，无需 docker 全栈；失败时上传 surefire 报告 |
| `web` | `pnpm test` | vitest 跑在 jsdom 中，不依赖后端 |

与 [`openapi-check.yml`](.github/workflows/openapi-check.yml) 分开：后者需要起全栈、耗时长，仅在 `services/**` 或 `openapi/**` 变更时触发。

### 覆盖要求

代码改动必须附带单元测试，必测 / 可豁免范围与各栈写法约定见 [`CLAUDE.md` 的「测试要求」节](./CLAUDE.md#测试要求强制)。

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
| 5 | 前端完全重写（Next.js 15） | 🟡 M0-M8 已完成，发版待定（见 [`docs/refactor/FRONTEND_MILESTONES.md`](docs/refactor/FRONTEND_MILESTONES.md)） |
| 6 | Python AI 服务现代化 | ✅ v0.7.0 |
| 7 | OpenSpec 集成（AI 上下文） | ✅ v1.0.0 |

---

## Git 工作流

> **本节是本项目 Git 规约的单一来源**。其他文档（`CLAUDE.md` 等）均引用本节，不另行维护。

### 分支模型

```
main          ← 稳定发布分支，每个 Phase 完成后合并，打版本 Tag
  └── dev     ← 集成分支，所有 topic 分支合并目标
        ├── phase/<n>-<描述>   ← 每个重构阶段的独立分支
        ├── feat/<描述>        ← 新功能分支
        ├── fix/<描述>         ← Bug 修复分支
        ├── docs/<描述>        ← 文档变更分支
        └── chore/<描述>       ← 构建 / 依赖 / 配置变更分支
```

**规则：**
- `main` 受保护，**禁止直接 push、禁止 force push**；仅接受来自 `dev` 的 merge commit
- `dev` 保持可运行状态；topic 分支生命周期短，合并后立即删除
- Topic 分支均从 `dev` 切出；完成后 `--no-ff` 合并回 `dev`
- Phase 完成流程：`phase/<n>` → `dev`（`--no-ff`）→ `main`（`--no-ff`）→ Tag

### Commit 格式（Conventional Commits）

```
<type>(<scope>): <简短描述（中文、不超过 50 字）>

<可选 body：中文，解释 why 与影响>
<可选 footer：BREAKING CHANGE / Closes #issue>
```

**描述与 body 一律用中文**。`type` / `scope` 是格式标识，保持英文小写；技术名词（类名、方法名、依赖名、配置项、命令）保留原文不翻译。

**type 取值**

| type | 用途 |
|------|------|
| `feat` | 新功能 |
| `fix` | Bug 修复 |
| `refactor` | 重构（不改外部行为） |
| `docs` | 文档变更 |
| `chore` | 构建 / 依赖 / 目录调整 |
| `test` | 新增或修改测试 |
| `perf` | 性能优化 |
| `ci` | CI / CD 配置 |

**scope 取值**（对应模块或顶层目录）

```
后端服务：gateway · auth · system · note · file · ai · notify · job · manage
共享：    bom · common · api
前端：    web · web-legacy · api-client · ui
Python：  ai-service
基础设施：infra · openapi · docs
```

scope 可省略（如纯顶层文档变更），但有具体作用域时必须填。

### 提交粒度

- **一次 commit 只动一个 service 或一个 package**，跨语言改动**不要混进同一个 commit**（Java 改动和前端改动分开提）
- 自动生成的文件（如 `packages/api-client/src/`）不提交，由 CI 生成
- topic 分支内允许 WIP commit，合并到 `dev` 前用 `git rebase -i` 整理为清晰原子 commit

### Commit Message 约定

- **一律使用中文撰写**描述与 body；`type` / `scope` 保持英文小写，技术名词保留原文
- **不写 `Co-Authored-By:` / `Co-authored-by:` trailer**——本项目所有 commit 保持单作者，无论是否由 AI 助手（Claude Code / Codex 等）协助生成
- body / footer 解释 *why* 与影响，不重复 *what*（diff 已经表达 what）
- 破坏性变更在 footer 写 `BREAKING CHANGE: <说明>`

**示例**

```bash
git commit -m "refactor(note): 将 javax.* 命名空间迁移到 jakarta.*"
git commit -m "feat(web): 通过 BFF 路由实现 httpOnly cookie 认证"
git commit -m "chore(bom): 升级 Spring Boot 至 3.3.4、Spring Cloud 至 2023.0.3"
git commit -m "test(auth): 补充 TokenUtil 的 refresh 与 logout 单元测试"

# 破坏性变更
git commit -m "refactor(ai): 合并 ai 与 ai-nio 为统一的 services/ai 模块

BREAKING CHANGE: 端口由 9210 改为 9065，需同步更新 Nacos 路由配置"
```

### 版本 Tag 策略

`main` 每次合并对应一个 Phase 验收点，按语义化版本打 Tag：

```
v0.1.0 ← Phase 0 完成（Monorepo 基础设施）
v0.2.0 ← Phase 1 完成（OpenAPI Contract）
v0.3.0 ← Phase 2 完成（Maven BOM）
v0.4.0 ← Phase 3 完成（Spring Boot 3 升级）
v0.5.0 ← Phase 4 完成（服务层重构）
v0.6.0 ← Phase 5 完成（前端重写）
v0.7.0 ← Phase 6 完成（Python AI 现代化）
v1.0.0 ← Phase 7 完成（全量验收）
```

非 Phase 节点的 `dev → main` 合并不强制打 Tag。打 Tag 命令：

```bash
git tag -a v0.X.0 -m "Phase X: <简短描述> complete"
git push origin v0.X.0
```

### 日常工作流速查

```bash
# 1. 开始一个 topic
git checkout dev && git pull --ff-only origin dev
git checkout -b feat/<描述>          # 或 fix/* / docs/* / chore/* / phase/*

# 2. 原子提交
git add <具体文件>                    # 不用 git add . 或 -A
git commit -m "feat(<scope>): ..."

# 3. 中途同步 dev（多人协作时）
git fetch origin && git rebase origin/dev

# 4. 合并回 dev
git checkout dev
git merge --no-ff feat/<描述> -m "chore: merge feat/<描述> → dev"
git push origin dev

# 5. 清理 topic 分支
git branch -d feat/<描述>
git push origin --delete feat/<描述>   # 若已推送远端

# 6. Phase 完成发布到 main
git checkout main
git merge --no-ff dev -m "release: v0.X.0 <Phase 描述> complete"
git tag -a v0.X.0 -m "Phase X complete"
git push origin main --tags
```

### 禁止操作清单

- ❌ 直接 push `main` 或对 `main` 做 force push
- ❌ 对已 push 的公共分支（`dev` / `main`）做 history 改写（`rebase`、`reset --hard`、`commit --amend`）
- ❌ 跳过钩子（`--no-verify`）或绕过签名（`--no-gpg-sign`）
- ❌ commit message 含 `Co-Authored-By:` trailer
- ❌ 跨语言混合 commit（Java + 前端 / Python 改动放同一个 commit）
- ❌ 用 `git add .` / `git add -A` 整目录批量暂存（容易混入 `.env`、构建产物）
- ❌ 提交自动生成文件（`packages/api-client/src/*`、`*.class`、`target/`、`.next/`、`__pycache__/`）

---

## 参与贡献

详见 [CONTRIBUTING.md](CONTRIBUTING.md)。

## License

[MIT](LICENSE)
