# Contributing to Anynote

## 代码规范

### Java

- 包结构：`com.anynote.<module>.{controller, service, service/impl, mapper, model/{po,dto,vo}, config}`
- 响应统一用 `ResData<T>` 包装；`code="00000"` 为成功
- Feign Fallback 一律 `return ResData.error(ResCode.INNER_*_SERVICE_ERROR)`，不抛异常
- 内部服务间调用须通过 `@InnerAuth` 验证 HMAC-SHA256 签名

### 前端

- 新功能写在 `apps/web/`（Next.js 15）；`apps/web-legacy/` 只修线上 bug，不加新功能
- 数据获取：TanStack Query（`use<X>Query` / `use<X>Mutation`）
- API 调用只使用 `packages/api-client/src/` 下生成的函数，不手写 fetch/axios
- 样式只用 Tailwind CSS，不写内联 style
- 服务端组件（RSC）优先；需要交互的组件加 `'use client'`
- Token 只存 httpOnly Cookie。唯一例外是 `lib/desktop/bridge.ts`（Tauri 桌面壳），
  由里程碑 M8.2 明确授权，且写入前会校验确实处在桌面壳中
- 重依赖（编辑器整包、yjs / y-websocket、pdfjs、ReactFlow）一律
  `dynamic(..., { ssr: false })` 懒加载；加完跑 `pnpm --filter web bundle:budget`
  确认没把首屏 JS 顶出 300KB 预算

### 端到端与性能（改动涉及页面时）

除单测外，涉及关键路径的改动还应本地跑一遍（需生产构建 + 真实后端栈）：

```bash
pnpm --filter web build && pnpm --filter web test:e2e
pnpm --filter web bundle:budget
pnpm --filter web lighthouse:budget
```

三者都不进默认 `pnpm test` 与 CI，细节见 [`README.md` 的「测试」节](README.md#测试)。

### Python

- 类型注解用 Pydantic v2（`X | None` 代替 `Optional[X]`）
- 配置通过 `core/config.py` 的 `Settings(BaseSettings)` 读取环境变量
- 每个端点加 `tags`、`summary`、`responses` 注解

---

## API 开发流程（API-First）

1. 在 `.claude/openspec/changes/` 创建变更提案文档（`YYYY-MM-DD-<描述>.md`）
2. 后端实现接口，Controller 加 `@Operation` 注解
3. 运行 `pnpm openapi:generate` 更新 TypeScript 类型
4. 前端基于生成类型实现调用

详见 [`openapi/WORKFLOW.md`](openapi/WORKFLOW.md)。

---

## AI 编程助手

本项目为 Claude Code 和 Codex 提供上下文支持：

- `.claude/context/backend.md` — 后端架构速查
- `.claude/context/frontend.md` — 前端架构速查
- `.claude/context/api-contracts.md` — API 契约规范
- `AGENTS.md` — Codex 格式完整项目上下文
- `apps/desktop/README.md` — 桌面壳的令牌交换流程与构建前置条件
