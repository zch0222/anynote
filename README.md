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

**本机开发**：默认值足够直接启动，可跳过本步；本节适用于生产 / 对外暴露环境。

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
> **IDEA 本机跑 Java 时**用的是另一份 `infra/.env.idea`（含 `127.0.0.1` 类 host 覆盖），详见下文 "Docker 编排启动 → ⚠️ 必须先了解：环境变量文件的两种用途"。

### 1. 启动中间件

```bash
docker compose --env-file=/dev/null -f infra/docker-compose-middleware.yaml up -d
# 包含：MySQL · Redis · Nacos · Elasticsearch · MinIO · RocketMQ · Logstash · XXL-Job
# --env-file=/dev/null：避免 infra/.env.idea 被误识别污染容器，详见下文 Docker 编排章节
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

**前置要求**：Docker >= 24 + Compose Plugin、Maven、pnpm

### ⚠️ 必须先了解：环境变量文件的两种用途

`infra/` 下的 `.env` 类文件按用途分为两套，**不要混用**：

| 文件 | 用途 | 入库 | docker compose 是否读 |
|------|------|:----:|:----:|
| `infra/.env.example` | 部署 / 容器化全栈时覆盖密码、镜像 tag 等 | ✅ | ✅（拷贝为 `.env` 后自动加载） |
| `infra/.env.idea.example` | **IDEA / 宿主机直接跑 Java** 时把中间件 host 改成 `127.0.0.1` | ✅ | ❌（手动 source 或 IDEA Run Config 加载） |
| `infra/.env` | 你从 `.env.example` 拷贝出的本地实例（含密码） | ❌ | ✅ 自动 |
| `infra/.env.idea` | 你从 `.env.idea.example` 拷贝出的 IDEA 实例（含 `127.0.0.1` 覆盖） | ❌ | **绝不能**——含 `127.0.0.1` 类 host，会污染容器 |

**踩坑提示**：`.env.idea` 不会被 docker compose 自动加载（文件名不是 `.env`），但如果你不慎把它重命名成 `.env`，里面的 `ROCKETMQ_BROKER_ADVERTISE_IP=127.0.0.1` 会让 broker 容器向 namesrv 广播错误地址，结果就是其它容器内的 app 无法连接 broker，MQ listener 启动失败。所以 **dev 启动命令统一加 `--env-file=/dev/null`**，强制 compose 只使用 YAML 内置默认值。

### 1. 配置（可选）

如果默认密码足够本机用，**跳过这一步**直接看第 2 步。

```bash
# 仅当你想覆盖密码 / Nacos namespace / 镜像 tag 时
cp infra/.env.example infra/.env
$EDITOR infra/.env
```

### 2. 构建 Java 服务 JAR

```bash
pnpm services:build
# 等价于：cd services && mvn clean install -DskipTests
```

### 3. 启动全栈（推荐：dev override）

```bash
docker compose --env-file=/dev/null \
  -f infra/docker-compose.yaml \
  -f infra/docker-compose.dev.yaml \
  up -d --build
```

- `--env-file=/dev/null`：见上方"⚠️ 必须先了解"，强制 compose 忽略本地 `.env`，避免 IDEA 用 host 覆盖污染容器
- `infra/docker-compose.dev.yaml`：app 容器 `restart: "no"`，启动失败立即 `Exited`，方便 `docker logs` 排查；中间件保留原 restart 策略
- `--build`：首次或代码变更时必带；后续仅起容器可省

启动约需 60–120 秒。

### 4. 验证健康状态

```bash
# 容器状态
docker compose --env-file=/dev/null -f infra/docker-compose.yaml -f infra/docker-compose.dev.yaml ps
# 所有服务 STATUS 应显示 healthy

# 服务可用性
for port in 8080 8083 8091 18091 8095 9065 9066; do
  curl --noproxy '*' -fsS -m 2 "http://127.0.0.1:$port/actuator/health" | jq -r '.status'
done
```

### 5. 验证 OpenAPI 聚合

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

### 6. 停止与清理

```bash
# 停止全部容器（保留数据）
docker compose --env-file=/dev/null -f infra/docker-compose.yaml -f infra/docker-compose.dev.yaml down

# 同时删除数据卷（清空 MySQL / ES / MinIO / Nacos / RocketMQ store；慎用）
docker compose --env-file=/dev/null -f infra/docker-compose.yaml -f infra/docker-compose.dev.yaml down -v
```

### IDEA 本机开发（替代第 2-3 步）

如果你想在 IDEA 里逐个启动 Java 服务（而不是用容器跑 app），只起中间件即可：

```bash
# 1. 只起中间件（注意仍要 --env-file=/dev/null）
docker compose --env-file=/dev/null -f infra/docker-compose-middleware.yaml up -d

# 2. 配置 IDEA Run Configuration 的 Environment Variables：
#    选 "Load from file" → infra/.env.idea（先 cp infra/.env.idea.example infra/.env.idea）
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

所有变量均在 `infra/.env` 中设置（由 `infra/docker-compose-middleware.yaml` 和 `infra/docker-compose.yaml` 读取）。**dev 推荐用 `--env-file=/dev/null` 强制走 YAML 默认值**，避免与 `infra/.env.idea` 混淆（详见上文 "Docker 编排启动 → ⚠️ 必须先了解：环境变量文件的两种用途"）。未设置时使用括号内的默认值。

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
<type>(<scope>): <简短描述（命令式、不超过 70 字符）>

<可选 body：解释 why 与影响>
<可选 footer：BREAKING CHANGE / Closes #issue>
```

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

- **不写 `Co-Authored-By:` / `Co-authored-by:` trailer**——本项目所有 commit 保持单作者，无论是否由 AI 助手（Claude Code / Codex 等）协助生成
- body / footer 解释 *why* 与影响，不重复 *what*（diff 已经表达 what）
- 破坏性变更在 footer 写 `BREAKING CHANGE: <说明>`

**示例**

```bash
git commit -m "refactor(note): migrate javax.* to jakarta.* namespace"
git commit -m "feat(web): implement httpOnly cookie auth via BFF route"
git commit -m "chore(bom): upgrade Spring Boot to 3.3.4, Spring Cloud to 2023.0.3"

# 破坏性变更
git commit -m "refactor(ai): merge ai + ai-nio into unified services/ai module

BREAKING CHANGE: port changed from 9210 to 9065, update Nacos route config"
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
