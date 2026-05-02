# AGENTS.md — Anynote 项目上下文

本文件供 **Codex（OpenAI）** 等 AI 编程助手读取，提供项目整体上下文、命令和代码规范。

---

## 项目概览

Anynote 是一个多模块学习笔记平台，采用 Monorepo 组织，包含三个主要技术栈：

| 目录            | 技术栈                                      | 职责                         |
|-----------------|---------------------------------------------|------------------------------|
| `services/`     | Java 21 · Spring Boot 3.3.4 · Spring Cloud  | 微服务后端（9 个服务）        |
| `apps/web/`     | Next.js 15 · React 19 · TypeScript          | 前端 Web 应用                |
| `ai-service/`   | Python 3 · FastAPI · LangChain 0.3          | AI/LLM 服务（RAG、Whisper）   |

---

## 快速启动命令

### 前端

```bash
# 安装依赖
pnpm install

# 开发服务器
pnpm --filter web dev

# 生产构建
pnpm --filter web build

# 重新生成 API 客户端类型（需后端运行）
pnpm openapi:generate
```

### 后端（Java）

```bash
# 构建全部服务（跳过测试）
cd services && mvn clean install -DskipTests

# 构建单个服务（以 note 为例）
cd services && mvn clean install -pl note -am -DskipTests

# 启动中间件（MySQL / Redis / Nacos / ES / MinIO / RocketMQ）
docker compose -f infra/docker-compose-middleware.yaml up -d
```

### AI 服务（Python）

```bash
cd ai-service
pip install -r requirements.txt
uvicorn app:app --reload --host 0.0.0.0 --port 8000
```

---

## 后端服务一览

| 服务目录          | 端口   | 职责                                  |
|-------------------|--------|---------------------------------------|
| `services/gateway`  | 8080   | API 网关：路由、JWT 验证、CORS       |
| `services/auth`     | 8083   | 认证：登录、注册、Token 签发         |
| `services/system`   | 8091   | 用户、角色、权限、租户管理           |
| `services/note`     | 18091  | 笔记、知识库、文档、MOOC、视频       |
| `services/file`     | 8095   | 文件上传/下载（Huawei OBS / MinIO）  |
| `services/ai`       | 9065   | AI 对话（SSE）、RAG、Whisper、翻译   |
| `services/notify`   | 9066   | 消息通知、站内信                     |
| `services/job`      | 8093   | XXL-Job 任务执行                     |
| `services/manage`   | 18092  | 管理后台业务逻辑                     |

---

## 前端目录结构

```
apps/web/src/
├── app/           Next.js App Router 页面（路由组：auth、dashboard）
├── components/    通用组件（shadcn/ui 原子组件 + 业务组件）
├── features/      功能模块（note、kb、ai、auth 各自独立）
├── hooks/         全局 React hooks
├── lib/
│   ├── api-client/  自动生成的 TypeScript API 客户端（禁止手写）
│   └── utils.ts
├── store/         Zustand UI 状态
└── types/         全局类型声明
```

---

## 代码规范

### Java 后端

- **包结构**：`com.anynote.<module>.{controller,service,service/impl,mapper,model/{po,dto,vo},config}`
- **响应格式**：统一用 `ResData<T>` 包装，`code="00000"` 表示成功
- **Feign 接口**：位于 `services/api/` 下，每个服务一个子模块
- **Fallback**：`FallbackFactory` 中一律 `return ResData.error(ResCode.INNER_*_SERVICE_ERROR)`，不抛异常
- **内部调用安全**：内部 Feign 调用自动添加 HMAC 签名头，`@InnerAuth` 注解验证
- **OpenAPI 注解**：Controller 类加 `@Tag(name="...")`；方法加 `@Operation(summary="...")`
- **异常处理**：业务异常抛 `BusinessException`，全局处理器统一转 `ResData`

### 前端

- **数据获取**：TanStack Query，`use<X>Query` / `use<X>Mutation` 命名
- **API 调用**：仅使用 `lib/api-client/` 下生成的函数，不手写 fetch/axios
- **状态管理**：服务端状态用 TanStack Query；UI 状态用 Zustand
- **样式**：Tailwind CSS，不使用内联 style
- **组件**：服务端组件（RSC）优先；交互逻辑加 `'use client'`
- **认证**：token 存 httpOnly Cookie，通过 Next.js API Route (BFF) 转发

### Python AI 服务

- **配置**：通过 `core/config.py` 的 `Settings(BaseSettings)` 读取环境变量
- **依赖注入**：使用 `get_settings()` 的 `lru_cache` 单例
- **类型**：Pydantic v2（`X | None` 代替 `Optional[X]`）
- **路由注解**：每个端点加 `tags`、`summary`、`responses`

---

## API 契约规范

### 响应格式

```json
{ "code": "00000", "msg": "操作成功", "data": { ... } }
```

业务错误也返回 HTTP 200，通过 `code` 字段区分（`A0160`=参数错误，`B0001`=业务错误，等）。

### REST 命名

- 路径用名词，不用动词（`/user/{id}/ban` 而非 `/banUser`）
- 列表用 `/list`，子资源操作用 `/{id}/action`
- 分页参数：`pageNum`（从1起）、`pageSize`

### API 变更流程

1. 在 `.claude/openspec/changes/` 创建变更提案文档（参考模板）
2. 后端实现并添加 OpenAPI 注解
3. 运行 `pnpm openapi:generate` 更新前端类型
4. 详见 `openapi/WORKFLOW.md`

---

## 关键约定

- **配置中心**：运行时配置全部存 Nacos，`bootstrap.yml` 只含 Nacos 连接信息
- **数据库迁移**：SQL 文件在 `infra/sql/`，手动执行；MyBatis Plus 自动填充 `createTime`/`updateTime`
- **禁止**修改 `packages/api-client/src/` 下的生成文件
- **禁止**在 FallbackFactory 中抛异常（应 return `ResData.error(...)`）
- **提交格式**：遵循 Conventional Commits（`feat:`、`fix:`、`refactor:` 等前缀）

---

## 相关文档

| 文档                                  | 内容                        |
|---------------------------------------|-----------------------------|
| `.claude/context/backend.md`          | 后端架构速查                |
| `.claude/context/frontend.md`         | 前端架构速查                |
| `.claude/context/api-contracts.md`    | API 契约详细规范            |
| `.claude/openspec/README.md`          | OpenSpec 使用说明           |
| `openapi/WORKFLOW.md`                 | API-First 开发流程          |
| `.claude/openspec/changes/`           | API 变更提案归档            |
