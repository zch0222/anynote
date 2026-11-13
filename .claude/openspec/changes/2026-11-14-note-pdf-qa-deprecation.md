# 提案：note 的 PDF 问答端点过渡期废弃

> 方案：[`docs/ai-refactor/AI_REFACTOR_PLAN.md`](../../../docs/ai-refactor/AI_REFACTOR_PLAN.md) §4.3；里程碑 [`docs/ai-refactor/AI_MILESTONES.md`](../../../docs/ai-refactor/AI_MILESTONES.md) M16.1 / M16.6

## 背景

`POST /api/note/docs/{id}/query` 的 PDF 问答依赖 `anynote-api-ai` 里的 `RagService`，后者请求 Python 的
`/api/rag/query`（Python 实际只有 `/api/rag/query/v2`，且必填 `doc_url` 未赋值），链路不可用。

M16.1 删除 `RagService` 并去掉 note 的 WebFlux 依赖，因此该端点改为过渡期废弃；PDF 问答在 M16.6 由
`POST /api/ai/rag/query/docs/v1`（检索范围限定到单个资料的一次运行）恢复。

## 契约变化

| 方法 | 路径 | 变化 |
|---|---|---|
| POST | `/api/note/docs/{id}/query` | 保留端点；不再返回 SSE。先做文档存在性与 `@RequiresDocPermissions(READ)` 校验，随后抛业务异常 |

废弃时的返回（全局异常处理，HTTP 200 + `ResData`）：

```json
{
  "code": "B0001",
  "msg": "PDF 问答功能已暂停，后续版本将恢复",
  "data": {}
}
```

- 不再把内部端点路径暴露给用户；错误文案固定为上面这一句。
- 无权访问文档时仍返回原有的权限错误（`A0300`），不泄露文档是否存在。
- 端点本身不删除：旧前端仍会调用它，直接 404 会把「功能暂停」表现成「接口不存在」；M16.9 清理时再删。

## 影响

- 旧前端（`apps/web-legacy`）的 PDF 问答由 SSE 变为一次性 JSON 错误；旧前端不再作为目标，D9 已确认不适配。
- 新前端 PDF 问答当前直接请求 AI 服务的 `/rag/query/docs/v1`（仍为「暂未实现」），M16.6 接入后恢复。
- `DocServiceImpl` 删除未使用的 `RagService`、`RemoteRagService`、`RemoteTranslateService`、`WebClient` 注入；
  `WebClientConfig` 与 note 的 `spring-boot-starter-webflux` 依赖一并删除。

## 验证计划

- note 单测：`DocServiceImpl` 废弃路径在权限校验通过后抛约定异常；权限不足时不走到废弃异常。
- 真实栈：`POST /api/note/docs/{id}/query` 返回上述 `B0001` 文案；`mvn test -pl note` 通过。
