---
name: anynote-dev
description: 在 anynote 仓库里跑本地全栈、生成 OpenAPI 类型、执行测试与门禁的操作手册，包含几个会静默踩坑的强制约束（compose 的 --env-file、集成测试标签、生成物提交）。当需要启动/重启 Anynote 后端或前端、重新生成 API 类型、跑单测或端到端门禁时使用。
---

# Anynote 仓库操作手册

只覆盖"怎么把它跑起来、怎么验证"，规范与架构以 [`CLAUDE.md`](../../../CLAUDE.md) 为准。

## 启动全栈（dev）

```bash
docker compose --env-file=/dev/null \
  -f infra/docker-compose.yaml \
  -f infra/docker-compose.dev.yaml \
  up -d --build
```

⚠️ **`--env-file=/dev/null` 不能省**。`infra/.env.idea` 是给"IDEA 在宿主机跑 Java"用的，
里面有 `127.0.0.1` 一类 host 覆盖；被 compose 自动加载后 `ROCKETMQ_BROKER_ADVERTISE_IP=127.0.0.1`
会让 broker 广播错误地址，容器里的 app 连不上 broker，现象是启动卡住而不是报错。

⚠️ 生产部署是另一套命令（显式 `--env-file infra/.env` + `docker-compose.prod.yaml`），
不要把 dev override 带上去。

健康检查：

```bash
curl -sf http://localhost:8080/actuator/health     # Gateway
curl -sf http://localhost:1234/healthz             # 协同服务是 /healthz，不是 actuator
```

## 改了 Java 后端之后

容器镜像是从**已构建的 jar**打的（`infra/Dockerfile.local`），所以必须先 mvn 再 compose：

```bash
cd services && mvn -o install -pl <模块> -am -DskipTests
cd .. && docker compose --env-file=/dev/null \
  -f infra/docker-compose.yaml -f infra/docker-compose.dev.yaml \
  up -d --build anynote-modules-<模块>
```

⚠️ 离线仓库里 `mvn clean` 可能因为缺 `maven-clean-plugin` 直接失败，**去掉 `clean`** 即可。

## 改了 Controller / DTO 注解之后

```bash
pnpm openapi:generate     # 需要后端在跑
```

⚠️ 必须把 `openapi/specs/*.json` 一起提交。CI 的 `openapi-check.yml` 会拿 baseline 做 diff，
漏提交直接阻断。`packages/api-client/src/` 是 gitignore 的派生产物，不要手改。

## 测试

```bash
pnpm test                                   # 全仓单测（Java 除外），进 CI
cd services && mvn -o test -pl <模块>        # Java 单测
pnpm --filter @anynote/cli test             # CLI 单测
```

需要真实环境、**不进**默认 `pnpm test` 与 CI 的：

```bash
pnpm --filter @anynote/cli test:e2e   # 需要全栈 + 先 build CLI
pnpm --filter web test:e2e            # Playwright
pnpm --filter web bundle:budget       # 首屏 JS ≤ 300KB
pnpm --filter web lighthouse:budget   # 性能 ≥ 90 / 无障碍 ≥ 95
```

⚠️ 新写的 `@SpringBootTest` **必须加 `@Tag("integration")`**，否则会混进默认单测流程，
在没有中间件的 CI 上必然失败。

## CLI 的生成物

改了 `apps/cli/src/commands/**` 之后：

```bash
pnpm --filter @anynote/cli build
pnpm --filter @anynote/cli manifest:write
git diff --exit-code docs/cli/COMMANDS.md .claude/skills/anynote-cli/reference/
```

生成物必须一起提交，CI 的 `cli` job 会卡 diff。

## 提交

- commit message 用中文写描述与 body（`type` / `scope` 保持英文）
- 一次只动一个 service / package，跨语言不要混在一个 commit
- 不直接 push `main`，不 force push，不提交生成的 `packages/api-client/src/`
