# 提案：M16.4 索引管线与服务间内部端点扩展

> 方案：[`docs/ai-refactor/KNOWLEDGE_RETRIEVAL_PLAN.md`](../../../docs/ai-refactor/KNOWLEDGE_RETRIEVAL_PLAN.md) §5、[`docs/ai-refactor/AI_MILESTONES.md`](../../../docs/ai-refactor/AI_MILESTONES.md) M16.4
>
> 2026-11-15 用户确认：扫描版 PDF 新增 `DocIndexStatus.UNEXTRACTABLE(4)`；PDF 下载走 `services/file` `@InnerAuth` 流式端点；增量拉取补齐批量读取端点；第三批知识库通知由 `services/notify` 导出并向 `services/note` 登记变更；新增 Redis Pub/Sub 唤醒通道 `anynote:knowledge:change`；Index Worker 以独立只读容器 `anynote-ai-indexer` 部署。

## 内部契约扩展

### 1. `services/note`

1. **`DocIndexStatus` 枚举扩展**：新增 `UNEXTRACTABLE(4)`（无法提取文本，如扫描版 PDF）。`PUT /internal/v1/knowledge/docs/{id}/index-status` 与结构化查询 `indexStatus` 校验范围同步扩展至 `0..4`。
2. **`KnowledgeEntityType` 扩展**：新增 `NOTICE("notice", "notice")` 用于在 `n_knowledge_change` 中记录知识库通知变更。
3. **增量 Redis 唤醒**：`KnowledgeChangeServiceImpl.record(...)` 在业务事务提交后（`afterCommit`），向 Redis 频道 `anynote:knowledge:change` 发送尽力而为的唤醒消息（失败只记日志，不回滚事务）。
4. **按 `ref` 批量读取源文档**：`POST /internal/v1/knowledge/documents/batch`（`@InnerAuth`）
   - 请求 `KnowledgeDocumentBatchDTO`：`refs`（非空，最多 100 条）、`includeBody`（默认 `true`）。
   - 响应 `ResData<KnowledgeDocumentBatchVO>`：`{ documents, missingRefs }`，复用 `KnowledgeEntityService.get(...)`。
5. **写入知识变更记录**：`POST /internal/v1/knowledge/changes`（`@InnerAuth`）
   - 请求 `KnowledgeChangeRecordDTO`：`entityType`、`entityId`、`knowledgeBaseId`、`operation`。
   - 供 `services/notify` 等内部服务在发布知识库通知后写入统一游标 `n_knowledge_change`。

### 2. `services/file`

- **内部流式下载文件内容**：`GET /internal/v1/files/content?objectName=...`（`@InnerAuth`）
  - 优先打开对象输入流校验存在性与可读性；对象名为空返回 `A0160`（`对象名称不能为空`），对象不存在或读取失败返回 `B0001`（`文件对象不存在或读取失败`）。
  - 返回 `application/octet-stream` `StreamingResponseBody`，统一兼容 MinIO 与华为 OBS，Worker 不直接持有对象存储凭据。

### 3. `services/notify`

- 新增 `InternalNoticeController`（`/internal/v1/notices`）及局部异常处理器 `InternalNoticeExceptionHandler`（`@RestControllerAdvice(assignableTypes = InternalNoticeController.class)`），确保不改变原有通知接口行为的前提下，内部 `@InnerAuth` 与参数校验返回统一 `ResData`。
- **`POST /internal/v1/notices/export`**（`@InnerAuth`）：按 `afterId`、`limit`（`1..200`）分页导出有效知识库通知（`type = 1 AND status = 0 AND is_delete = 0`，关联 `ntc_knowledge_base_notice`），扫描游标跨过已关闭行以推进 `nextAfterId`。
- **`POST /internal/v1/notices/batch`**（`@InnerAuth`）：按 `ids`（`1..100`）批量查询有效知识库通知，返回 `{ documents, missingIds }`（已关闭或逻辑删除的条目不返回，进入 `missingIds` 供索引侧清理）。
- **`NoticeServiceImpl.publishNotice()`**：发布 `type = 1` 知识库通知且事务提交后，通过 Feign 调用 `services/note` `POST /internal/v1/knowledge/changes` 登记 `NOTICE CREATE`（失败仅记日志，对账任务兜底）。
- MyBatis XML 查询均显式声明 `<resultMap id="KnowledgeNoticeResultMap">`。

## Elasticsearch 与索引 Worker（`ai-service`）

- 物理索引名 `kn_item_v{N}`、`kn_chunk_v{N}` 带版本号，读取与写入通过 alias `kn_item`、`kn_chunk` 访问；版本元数据与增量游标持久化在 `kn_meta`（`active`、`cursor` 文档）。同一 `ref` 下的不同 `subtype`（如 `mooc_item` 与 `transcript`/`summary`）在索引侧通过 `canonical_key`（`{ref}#{subtype}` / `item_key`）区分存储与删除。
- 全文使用 ES 8.7 内置 `cjk` 分析器；ACL 字段（`kb_id`、`create_by`、`permissions`、`data_scope`、`readable`）在 `kn_item` 与 `kn_chunk` 冗余存储；同时新增运行时逻辑模型 `a_logical_model`（`logical_name = 'embedding'`）与管理员端接口 `GET/PUT /v1/admin/model-providers/logical/embedding`。
- 向量字段 `embedding`（`dense_vector`，`1..2048` 维）仅在激活 Embedding 时创建与写入；模型或维度与 `kn_meta` 激活值不一致时拒绝混写并提示执行 `worker.py rebuild`。
- `worker.py` 提供 `run`（内部 `/healthz` 探针 + Redis `anynote:knowledge:change` 订阅 + 定时游标轮询）、`rebuild`（新建物理索引并原子切 alias）和 `reconcile [--kb-id ID]`。
- Compose 新增只读无特权容器 `anynote-ai-indexer`，`infra/docker/nacos/configs/anynote-ai-indexer.yml` 提供配置，不映射任何宿主端口。

## 验证

- Java 各受影响模块（`anynote-api-note`、`services/note`、`services/file`、`services/notify`、`services/ai`）单测与接口契约测试。
- Python `ai-service` 单测（含 `pdfplumber`、`elasticsearch`、adapter/parser/chunker/pipeline）及 Compose 回归测试 `infra/tests/test_compose.py`。
- 基于本地 Docker 真实栈（MySQL、Nacos、Redis、MinIO、ES 8.7）执行 OpenAPI 聚合再生、全量重建、扫描版 PDF 回写 `UNEXTRACTABLE(4)`、元数据仅变更跳过重嵌、删档与权限收紧清理、以及知识库通知索引验证。
