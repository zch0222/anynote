# Docker 部署说明

启动步骤统一维护在 [仓库 README](../../README.md#启动指南)，网络架构见 [部署网络图](../../docs/deployment-network.md)。需要 Docker Engine >= 24、Compose >= 2.24.4。

- 日常全栈：`--env-file=/dev/null` + `infra/docker-compose.yaml` + `infra/docker-compose.dev.yaml`，包含 Next.js 前端与协同服务。
- 容器 HMR：再叠加 `infra/docker-compose.web-dev.yaml`。只挂载源代码，依赖和 `.next` 不与宿主机共享。
- IDEA：中间件配置叠加 `infra/docker-compose.middleware-idea.yaml`，Java 导入 `infra/.env.idea`，宿主机前端读取 `apps/web/.env.local`。
- 生产：显式 `--env-file infra/.env` + base + `infra/docker-compose.prod.yaml`。配置必须填写生产域名、密钥、镜像标签和 Nacos 配置目录；不要用 dev 配置发版。

容器中不带 Nginx。容器外 Nginx 代理页面及 `/api/*` 到 Next.js 3000，`/collab/*` 到协同服务 1234。生产的 Java 和中间件端口不发布到宿主机。

Java 镜像仍由 `infra/Dockerfile.local` 拷贝预构建 JAR。Next.js 通过 `infra/Dockerfile.web` 从源代码构建 standalone，专属 `.dockerignore` 排除凭据、宿主机依赖和构建产物。协同服务使用 `infra/Dockerfile.collab`。

MySQL 首次启动运行 `docker/mysql/init/00-import-sql.sh`。dev 的 `nacos-init` 导入开发 baseline；prod 的导入容器属于 `ops` profile，只在明确 `run --rm nacos-init` 时运行。持久化数据包括 `collab-data`，生产不要执行 `down -v`。
