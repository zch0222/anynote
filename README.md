# Anynote

多模块学习笔记平台，Monorepo 架构。

| 技术栈 | 版本 |
|--------|------|
| Java · Spring Boot | 21 · 3.3.4 |
| Spring Cloud / Alibaba | 2023.0.3 / 2023.0.1.0 |
| Next.js · React · TypeScript | 15 · 19 · 5 |
| Python · FastAPI · LangChain | 3.x · 0.116 · 0.3 |

---

## 目录结构

```
anynote/
├── apps/
│   └── web/                  前端 Next.js 15 应用
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
├── openapi/
│   ├── generate.sh           API 客户端生成脚本
│   ├── specs/                抓取的 OpenAPI JSON 规范
│   └── WORKFLOW.md           API-First 开发流程
└── .claude/
    ├── context/              AI 编程助手上下文速查
    └── openspec/             API 变更提案归档
```

---

## 快速启动

### 1. 启动中间件

```bash
docker compose -f infra/docker-compose-middleware.yaml up -d
# 启动：MySQL · Redis · Nacos · Elasticsearch · MinIO · RocketMQ
```

> Nacos 配置中心地址：`http://localhost:8848/nacos`（默认账密 nacos/nacos）

### 2. 启动 Java 后端

```bash
# 构建全部服务（首次或依赖变更时）
cd services && mvn clean install -DskipTests

# 各服务 IDEA / CLI 启动，或
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
pnpm --filter web dev
# 访问 http://localhost:3000
```

### 5. 更新 API 客户端类型（后端接口变更后）

```bash
# 需要后端已启动
pnpm openapi:generate
```

---

## 常用命令速查

| 命令 | 说明 |
|------|------|
| `pnpm dev` | 启动全部前端应用（Turborepo） |
| `pnpm build` | 构建全部前端应用 |
| `pnpm check` | Biome 格式化 + lint（自动修复） |
| `pnpm openapi:generate` | 从后端 Swagger 生成 TypeScript 类型 |
| `pnpm services:build` | 构建全部 Java 服务（跳过测试） |
| `cd services && mvn clean install -pl note -am -DskipTests` | 构建单个 Java 服务及其依赖 |

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
- 直接向 `main` 提交仅限 merge commit，不做 feature 开发
- `dev` 保持可运行状态；`phase/*` / `feat/*` 分支允许 WIP 提交
- 每个 Phase 完成流程：`phase/*` → `dev`（`--no-ff`）→ `main`（`--no-ff`）→ Tag

### Commit 格式（Conventional Commits）

```
<type>(<scope>): <简短描述>

[可选正文]

[Co-Authored-By: ...]
```

| type | 用途 |
|------|------|
| `feat` | 新功能 |
| `fix` | Bug 修复 |
| `refactor` | 重构（不改变外部行为） |
| `docs` | 文档变更 |
| `chore` | 构建脚本、依赖、配置 |
| `test` | 测试相关 |
| `perf` | 性能优化 |

**示例：**
```
feat(note): 添加知识库分享链接功能

fix(gateway): 修复 CORS 预检请求 401 问题

refactor(auth): JWT 刷新逻辑提取为独立 Service

chore: merge phase/5-frontend-rewrite → dev
```

### 版本 Tag 规范

| Tag | 对应 Phase |
|-----|-----------|
| `v0.1.0` | Phase 0 — Monorepo 基础设施 |
| `v0.2.0` | Phase 1 — OpenAPI Contract First |
| `v0.3.0` | Phase 2 — Maven BOM 重构 |
| `v0.4.0` | Phase 3 — Spring Boot 3 升级 |
| `v0.5.0` | Phase 4 — 服务层重构 |
| `v0.6.0` | Phase 5 — 前端完全重写（待完成） |
| `v0.7.0` | Phase 6 — Python AI 服务现代化 |
| `v1.0.0` | Phase 7 — OpenSpec 集成 |

---

## API 开发流程（API-First）

1. 在 `.claude/openspec/changes/` 创建变更提案文档（`YYYY-MM-DD-<描述>.md`）
2. 后端实现接口，Controller 加 `@Operation` 注解
3. 运行 `pnpm openapi:generate` 更新 TypeScript 类型
4. 前端基于生成类型实现调用

详见 [`openapi/WORKFLOW.md`](openapi/WORKFLOW.md)。

**Swagger UI 地址（本地）：**

| 服务 | 地址 |
|------|------|
| 聚合文档 | http://localhost:8080/swagger-ui.html |
| 认证服务 | http://localhost:8083/swagger-ui.html |
| 系统服务 | http://localhost:8091/swagger-ui.html |
| 笔记服务 | http://localhost:18091/swagger-ui.html |
| 文件服务 | http://localhost:8095/swagger-ui.html |
| AI 服务  | http://localhost:9065/swagger-ui.html |
| Python AI | http://localhost:8000/docs |

---

## 代码规范

### Java

- 包结构：`com.anynote.<module>.{controller, service, service/impl, mapper, model/{po,dto,vo}, config}`
- 响应统一用 `ResData<T>` 包装；`code="00000"` 为成功
- Feign Fallback 一律 `return ResData.error(ResCode.INNER_*_SERVICE_ERROR)`，不抛异常
- 内部服务间调用须通过 `@InnerAuth` 验证 HMAC-SHA256 签名

### 前端

- 数据获取：TanStack Query（`use<X>Query` / `use<X>Mutation`）
- API 调用只使用 `packages/api-client/src/` 下生成的函数，禁止手写 fetch/axios
- 样式只用 Tailwind CSS，不写内联 style
- 服务端组件（RSC）优先；需要交互的组件加 `'use client'`

### Python

- 类型注解用 Pydantic v2（`X | None` 代替 `Optional[X]`）
- 配置通过 `core/config.py` 的 `Settings(BaseSettings)` 读取环境变量
- 每个端点加 `tags`、`summary`、`responses` 注解

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

## AI 编程助手

本项目对 **Claude Code** 和 **Codex** 均有上下文支持：

- `.claude/context/backend.md` — 后端架构速查
- `.claude/context/frontend.md` — 前端架构速查
- `.claude/context/api-contracts.md` — API 契约规范
- `AGENTS.md` — Codex 格式完整项目上下文
