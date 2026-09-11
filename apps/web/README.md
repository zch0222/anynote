# Anynote Web

Next.js 15 + React 19，认证和业务 API 经同源 BFF。完整启动步骤见 [仓库 README](../../README.md#启动指南)，网络图见 [部署网络](../../docs/deployment-network.md)。

推荐通过 Compose 的 `anynote-web` 服务运行：生产构建、依赖和静态资源随镜像发布，运行时只有 Node，不含 Nginx。需要热更新时叠加 `infra/docker-compose.web-dev.yaml`。

宿主机开发（仓库根目录）：

```bash
pnpm install --frozen-lockfile
cp apps/web/.env.example apps/web/.env.local
pnpm openapi:generate
pnpm --filter web dev
```

使用宿主机开发前停止占用 3000 的前端容器。Gateway 和协同服务需分别在 8080、1234 就绪；IDEA 与 Docker 模式的后端不要重复启动。

`pnpm --filter web build` 使用 webpack 并生成 standalone（monorepo tracing root 为仓库根）。直接运行产物需配套 public 和 `.next/static`，由 Dockerfile 完成拷贝。不要在正在运行的宿主机 `next start` 旁覆盖同一个 `.next`。

`NEXT_PUBLIC_*` 是构建期配置，生产域名变化要重建镜像。`INTERNAL_API_URL`、`COLLAB_TOKEN_SECRET` 是运行时服务端配置；Web 模式禁止配置 `DESKTOP_EXCHANGE_KEY`。
