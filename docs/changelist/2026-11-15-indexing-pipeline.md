# Changelist: M16.4 索引管线与运行时 Embedding 模型配置

> 分支：`dev` | 日期：2026-11-15 | 范围：M16.4 索引管线（`ai-service` Worker / 解析 / 切分 / ES 索引 / 对账）、`services/{note,file,notify,ai}` 内部契约与运行时 Embedding 配置、`apps/web` 模型供应商设置页、`infra` 部署与迁移、OpenAPI 契约同步
> OpenSpec：[`2026-11-15-indexing-pipeline.md`](../../.claude/openspec/changes/2026-11-15-indexing-pipeline.md)、[`2026-11-15-ai-logical-model-config.md`](../../.claude/openspec/changes/2026-11-15-ai-logical-model-config.md)

## 概览

本批完成 AI 重构里程碑 **M16.4（索引管线）** 及运行时 **Embedding 逻辑模型配置**扩展，共计 **113 个文件**（已追踪修改 **56** 个：`56 files changed, 1520 insertions(+), 51 deletions(-)`；新增未追踪 **57** 个，含本清单）。

- **内部服务契约扩展**：`services/note` 增加 `@InnerAuth` 批量源文档查询、写入知识变更、Redis `anynote:knowledge:change` 事务提交后唤醒，以及资料 `DocIndexStatus.UNEXTRACTABLE(4)` 与 `KnowledgeEntityType.NOTICE`；`services/file` 新增 `@InnerAuth` 流式下载文件内容端点；`services/notify` 新增 `InternalNoticeController`（仅导出并按批量校验 `type = 1 AND status = 0 AND is_delete = 0` 的有效知识库通知），发布知识库通知后经 Feign 向 `services/note` 登记变更。
- **运行时 Embedding 配置**：新增数据库表 `a_logical_model`（持久化 `logical_name = 'embedding'` 的供应商、`model` 与 `dimensions` 绑定），`services/ai` 提供管理员端点 `GET/PUT /v1/admin/model-providers/logical/embedding`（严格校验 `dataEgressAllowed` 与 `1..2048` 维度），`apps/web` 模型供应商设置页同步增加 `EmbeddingModelSettings` 卡片。
- **离线索引 Worker 与 ES 管线（`ai-service`）**：新增独立只读容器服务 `anynote-ai-indexer` 与 CLI `worker.py`（`run` / `rebuild` / `reconcile`），内部监听 `8002` `/healthz`（无宿主端口映射）；支持 9 类知识库实体的增量同步（正文章节向量重算与纯元数据更新分离）、子进程内存/超时受限 PDF 提取、Markdown/SRT/纯文本解析、不重叠结构切分、ES `kn_item_v{N}`/`kn_chunk_v{N}` 别名切换，以及模型/维度变更版本守卫。

### 验证结果

| 检查项 | 环境 / Scope | 结果 |
|---|---|---|
| `ai-service` 单测 | Docker `anynote/ai-service-test:local` (`pytest -v`) | **56/56 通过**（1 个既有 Starlette `BlockingPortal` 弃用告警） |
| 后端 Maven 单测 | Docker `maven:3.9.11-eclipse-temurin-21` (`mvn -o test -pl api/anynote-api-note,api/anynote-api-notify,api/anynote-api-file,note,file,notify,ai -am`) | **22/22 模块 `BUILD SUCCESS`**（核心相关模块：`note` 235、`file` 26、`ai` 51、`notify` 5；其余上游共 104；合计 **421/421 通过**，0 失败 0 跳过；默认排除 `@Tag("integration")`） |
| 前端 Vitest / TS | Docker `anynote/web-test:local` (`pnpm --filter web test && pnpm --filter web typecheck`) | **169 个测试文件 / 2047 条用例全部通过**，`tsc --noEmit` 通过 |
| 前端 Biome lint | Docker `anynote/web-test:local` (`npx biome check --formatter-enabled=false apps/web/src/features/model-providers`) | **11/11 文件 0 错误**（全仓 `biome check` 存在既有 Tab 与 2 空格格式差异，未混改无关文件） |
| OpenAPI 契约一致性 | Docker `node:22.23.2-bookworm-slim` 对比在线 `anynote-anynote-gateway-1:8080` + `normalize-cli.mjs` | **6/6 spec 字节一致**（`auth`、`system`、`note`、`file`、`ai`、`notify`） |
| Compose 回归测试 | Docker `docker:29.7-cli` (`python3 -m unittest -v infra/tests/test_compose.py`) | **5/6 通过**（`test_ai_indexer_worker_isolated_without_published_ports` 通过；1 项既有失败 `test_production_only_publishes_frontend_and_collab` 与本次无关） |
| 真实栈全链路 E2E | 本机 Docker 全栈 + 临时 Mock Embedding 服务 | **全流程通过**：RBAC/出境校验、9 类实体导出与 CJK/kNN 检索（`mooc_item`/`transcript`/`summary` 共存无碰撞）、文本/扫描 PDF 回写 `UNEXTRACTABLE(4)`、仅改标题跳过向量重算、删除清理、切维度触发版本守卫、`rebuild` 与 `reconcile` 补漏；执行于最后两笔前端 a11y/import 小修及测试数据清理前 |

## services/api/anynote-api-note

| 文件 | 状态 | 作用与原因 |
|---|---|---|
| `services/api/anynote-api-note/src/main/java/com/anynote/note/api/RemoteKnowledgeService.java` | 新增 | 声明 note 内部变更登记 Feign 客户端（`POST /internal/v1/knowledge/changes`），供 `services/notify` 发布知识库通知后调用 |
| `services/api/anynote-api-note/src/main/java/com/anynote/note/api/factory/RemoteKnowledgeFallbackFactory.java` | 新增 | `RemoteKnowledgeService` 降级工厂，记录日志并返回 `ResData.error(ResultCode.INNER_NOTE_SERVICE_ERROR)` |
| `services/api/anynote-api-note/src/main/java/com/anynote/note/api/model/dto/KnowledgeChangeRecordDTO.java` | 新增 | 跨服务写入 `n_knowledge_change` 的请求 DTO（含参数校验） |
| `services/api/anynote-api-note/src/main/resources/META-INF/spring/org.springframework.boot.autoconfigure.AutoConfiguration.imports` | 修改 | 注册 `RemoteKnowledgeFallbackFactory` 自动装配 |

## services/note

| 文件 | 状态 | 作用与原因 |
|---|---|---|
| `services/note/src/main/java/com/anynote/note/controller/KnowledgeController.java` | 修改 | 新增 `@InnerAuth POST /internal/v1/knowledge/documents/batch` 与 `@InnerAuth POST /internal/v1/knowledge/changes` |
| `services/note/src/main/java/com/anynote/note/enums/DocIndexStatus.java` | 修改 | 新增状态 `UNEXTRACTABLE(4)`（不可提取文本/扫描件）并扩展状态码解析校验 |
| `services/note/src/main/java/com/anynote/note/enums/KnowledgeEntityType.java` | 修改 | 新增 `NOTICE("notice", "notice")` 枚举，用于登记与导出知识库通知变更 |
| `services/note/src/main/java/com/anynote/note/model/bo/KnowledgeRef.java` | 修改 | 支持 `notice:<id>` 格式校验与解析 |
| `services/note/src/main/java/com/anynote/note/model/dto/KnowledgeDocumentBatchDTO.java` | 新增 | 批量读取源文档请求 DTO（`refs` 最多 100 条、`includeBody` 默认 `true`） |
| `services/note/src/main/java/com/anynote/note/model/vo/KnowledgeDocumentBatchVO.java` | 新增 | 批量源文档响应 VO（`documents` 与 `missingRefs`） |
| `services/note/src/main/java/com/anynote/note/service/KnowledgeChangeService.java` | 修改 | 新增写入变更接口方法及状态校验约束说明 |
| `services/note/src/main/java/com/anynote/note/service/KnowledgeEntityService.java` | 修改 | 新增 `batchGet` 接口方法 |
| `services/note/src/main/java/com/anynote/note/service/impl/KnowledgeChangeServiceImpl.java` | 修改 | 在业务事务 `afterCommit` 后向 Redis `anynote:knowledge:change` 发布唤醒消息（失败不回滚）；支持 `recordExternalChange`；扩展 `indexStatus` 范围校验至 `0..4` |
| `services/note/src/main/java/com/anynote/note/service/impl/KnowledgeEntityServiceImpl.java` | 修改 | 实现 `batchGet` 按 `ref` 批量读取（不存在或不归属者入 `missingRefs`） |
| `services/note/src/main/java/com/anynote/note/service/impl/KnowledgeQueryServiceImpl.java` | 修改 | 资料索引状态筛选范围同步放宽至包含 `UNEXTRACTABLE(4)` |
| `services/note/src/test/java/com/anynote/note/controller/KnowledgeControllerTest.java` | 修改 | 覆盖 `batchDocuments` 与 `recordChange` 端点委托及 `@InnerAuth` 配置断言 |
| `services/note/src/test/java/com/anynote/note/service/impl/KnowledgeChangeServiceImplTest.java` | 修改 | 覆盖事务提交后 Redis 唤醒发送/失败吞并、`UNEXTRACTABLE(4)` 回写及外部变更登记 |
| `services/note/src/test/java/com/anynote/note/service/impl/KnowledgeEntityServiceImplTest.java` | 修改 | 覆盖 `batchGet` 命中与 `missingRefs` 分流及空体开关 |
| `services/note/src/test/java/com/anynote/note/service/impl/KnowledgeQueryServiceImplTest.java` | 修改 | 覆盖按 `indexStatus = 4` 查询资料分支 |

## services/file

| 文件 | 状态 | 作用与原因 |
|---|---|---|
| `services/file/src/main/java/com/anynote/file/controller/InternalFileController.java` | 新增 | 提供 `@InnerAuth GET /internal/v1/files/content?objectName=...` 流式下载文件内容 |
| `services/file/src/main/java/com/anynote/file/plugin/FilePlugin.java` | 修改 | 抽象对象流读取接口 `openObjectStream` 与默认/实现约定 |
| `services/file/src/main/java/com/anynote/file/plugin/impl/HuaweiFilePlugin.java` | 修改 | 实现华为 OBS `openObjectStream` 对接 |
| `services/file/src/main/java/com/anynote/file/plugin/impl/MinIOFilePlugin.java` | 修改 | 实现 MinIO `openObjectStream`（先校验对象存在/可读再返回流） |
| `services/file/src/main/java/com/anynote/file/service/FileService.java` | 修改 | 声明 `openFileStream` 接口与异常校验规范 |
| `services/file/src/main/java/com/anynote/file/service/impl/FileServiceImpl.java` | 修改 | 实现 `objectName` 判空（`A0160`）与底层流异常收敛（`B0001`） |
| `services/file/src/test/java/com/anynote/file/controller/InternalFileControllerTest.java` | 新增 | 验证内部流式下载端点 `@InnerAuth(isUser = false)` 及响应流写入 |
| `services/file/src/test/java/com/anynote/file/plugin/impl/MinIOFilePluginTest.java` | 修改 | 覆盖 `openObjectStream` 成功与缺失对象抛错分支 |
| `services/file/src/test/java/com/anynote/file/service/impl/FileServiceImplTest.java` | 修改 | 覆盖空 `objectName` 拒绝与底层读取失败兜底 |

## services/notify

| 文件 | 状态 | 作用与原因 |
|---|---|---|
| `services/notify/src/main/java/com/anynote/notify/constant/NotifyErrorConstants.java` | 新增 | 集中声明已确认的内部通知访问与校验错误文案常量 |
| `services/notify/src/main/java/com/anynote/notify/controller/InternalNoticeController.java` | 新增 | 新增 `@InnerAuth POST /internal/v1/notices/{export,batch}` 内部端点 |
| `services/notify/src/main/java/com/anynote/notify/handler/InternalNoticeExceptionHandler.java` | 新增 | 局部异常处理器，确保内部端点 HMAC 鉴权与参数错误返回统一 `ResData` 且不影响公开通知控制器 |
| `services/notify/src/main/java/com/anynote/notify/mapper/NoticeMapper.java` | 修改 | 声明知识库通知分页导出与批量查询 Mapper 方法 |
| `services/notify/src/main/java/com/anynote/notify/model/dto/KnowledgeNoticeBatchDTO.java` | 新增 | 批量查询通知 IDs（`1..100`）请求 DTO |
| `services/notify/src/main/java/com/anynote/notify/model/dto/KnowledgeNoticeExportDTO.java` | 新增 | 分页游标导出通知请求 DTO（`afterId`、`limit 1..200`） |
| `services/notify/src/main/java/com/anynote/notify/model/po/KnowledgeNoticeExportPO.java` | 新增 | 映射 `ntc_notice` JOIN `ntc_knowledge_base_notice` 的数据库实体 |
| `services/notify/src/main/java/com/anynote/notify/model/vo/KnowledgeNoticeBatchVO.java` | 新增 | 批量通知导出结果 VO（`documents` 与 `missingIds`） |
| `services/notify/src/main/java/com/anynote/notify/model/vo/KnowledgeNoticeExportVO.java` | 新增 | 游标分页通知导出结果 VO（`documents`、`nextAfterId`、`hasMore`） |
| `services/notify/src/main/java/com/anynote/notify/model/vo/KnowledgeNoticeVO.java` | 新增 | 单条有效知识库通知导出载荷 VO（含 `ref`、`knowledgeBaseId`、`title`、`content`、`version`） |
| `services/notify/src/main/java/com/anynote/notify/service/KnowledgeNoticeService.java` | 新增 | 知识库通知导出业务接口 |
| `services/notify/src/main/java/com/anynote/notify/service/impl/KnowledgeNoticeServiceImpl.java` | 新增 | 仅导出 `type = 1 AND status = 0 AND is_delete = 0` 的有效通知，跨过已关闭行推进导出游标并在批量查询中把无效项列入 `missingIds` |
| `services/notify/src/main/java/com/anynote/notify/service/impl/NoticeServiceImpl.java` | 修改 | 发布 `type = 1` 知识库通知后注册事务 `afterCommit`，尽力向 `services/note` 登记 `NOTICE CREATE`（失败只记日志） |
| `services/notify/src/main/resources/mapper/NoticeMapp.xml` | 修改 | 新增显式 `<resultMap id="KnowledgeNoticeResultMap">` 与两条知识库通知导出/批量 SELECT |
| `services/notify/src/test/java/com/anynote/notify/controller/InternalNoticeControllerTest.java` | 新增 | MockMvc 验证内部签名校验（403/A0301 文案）、非法 JSON、参数越界与成功委托 |
| `services/notify/src/test/java/com/anynote/notify/service/impl/KnowledgeNoticeServiceImplTest.java` | 新增 | 验证游标推进、无有效行时推进游标防停滞以及批量 `missingIds` 计算 |
| `services/notify/src/test/java/com/anynote/notify/service/impl/NoticeServiceImplTest.java` | 新增 | 验证发布知识库通知事务提交后触发变更登记，以及 Feign 异常时仅降级记录警告不回滚 |

## services/ai

| 文件 | 状态 | 作用与原因 |
|---|---|---|
| `services/ai/src/main/java/com/anynote/ai/controller/ModelProviderAdminController.java` | 修改 | 新增管理员端 `GET/PUT /v1/admin/model-providers/logical/embedding` 接口 |
| `services/ai/src/main/java/com/anynote/ai/mapper/LogicalModelConfigMapper.java` | 新增 | `a_logical_model` MyBatis Mapper 接口 |
| `services/ai/src/main/java/com/anynote/ai/model/dto/EmbeddingModelConfigUpdateDTO.java` | 新增 | 更新 Embedding 逻辑模型配置请求 DTO（`providerKey`、`model`、`dimensions`） |
| `services/ai/src/main/java/com/anynote/ai/model/po/LogicalModelConfigPO.java` | 新增 | `a_logical_model` 表映射 PO |
| `services/ai/src/main/java/com/anynote/ai/model/vo/EmbeddingModelConfigVO.java` | 新增 | 运行时 Embedding 配置响应 VO（含供应商显示名与 `dataEgressAllowed` 状态） |
| `services/ai/src/main/java/com/anynote/ai/properties/ModelCatalogProperties.java` | 修改 | 补充内置默认/目录字段以支持逻辑 Embedding 默认兜底说明 |
| `services/ai/src/main/java/com/anynote/ai/service/LogicalModelService.java` | 新增 | 运行时逻辑模型配置业务接口 |
| `services/ai/src/main/java/com/anynote/ai/service/impl/LogicalModelServiceImpl.java` | 新增 | 校验供应商存在性、`dataEgressAllowed` 与 `dimensions` 范围（`1..2048`），读写 `a_logical_model` |
| `services/ai/src/main/java/com/anynote/ai/service/impl/ModelProviderServiceImpl.java` | 修改 | 停用或关闭供应商 `dataEgressAllowed`、删除被引用的供应商时联动校验 `a_logical_model` 引用一致性 |
| `services/ai/src/main/resources/mapper/LogicalModelConfigMapper.xml` | 新增 | 显式 `<resultMap id="LogicalModelConfigResultMap">` 与 upsert/select SQL |
| `services/ai/src/test/java/com/anynote/ai/controller/ModelProviderAdminControllerTest.java` | 修改 | 覆盖管理员读取/更新 Embedding 配置及非管理员拒绝分支 |
| `services/ai/src/test/java/com/anynote/ai/service/impl/LogicalModelServiceImplTest.java` | 新增 | 覆盖维度越界、未开启数据出境供应商拒绝、供应商缺失与正常保存更新 |
| `services/ai/src/test/java/com/anynote/ai/service/impl/ModelProviderServiceImplTest.java` | 修改 | 覆盖供应商关联 `embedding` 逻辑模型时的联动约束 |

## ai-service（Python 索引 Worker 与管线）

| 文件 | 状态 | 作用与原因 |
|---|---|---|
| `ai-service/clients/_internal.py` | 新增 | 公共 `@InnerAuth` HMAC 签名 HTTP 客户端基座（供 file/knowledge/notify 内部客户端共用） |
| `ai-service/clients/file.py` | 新增 | 调用 `services/file` 流式下载文件二进制（`GET /internal/v1/files/content`） |
| `ai-service/clients/knowledge.py` | 新增 | 调用 `services/note` 游标导出、拉取 `n_knowledge_change`、批量读取文档与回写 `doc` 索引状态 |
| `ai-service/clients/notify.py` | 新增 | 调用 `services/notify` 分页导出与批量校验有效知识库通知 |
| `ai-service/core/config.py` | 修改 | 增加 `ANYNOTE_NOTE_URL`、`ANYNOTE_FILE_URL`、`ANYNOTE_NOTIFY_URL`、`ANYNOTE_ES_URL`、`ANYNOTE_INDEXER_HEALTH_PORT` 等配置项 |
| `ai-service/indexing/__init__.py` | 新增 | `indexing` 包入口 |
| `ai-service/indexing/models.py` | 新增 | 定义 9 类源文档模型、`ParsedSection`、`ChunkPayload`、游标/分页模型（含 `canonical_key` 区分共享 `ref` 子类型与 Jackson `null` 容错校验） |
| `ai-service/indexing/adapters.py` | 新增 | 统一适配 9 类实体导出与按 `ref` 批量抓取，合并 `note` 与 `notify` 来源 |
| `ai-service/indexing/parsers/__init__.py` | 新增 | 解析器分发入口（Markdown / PDF / SRT / 纯文本） |
| `ai-service/indexing/parsers/markdown.py` | 新增 | 基于标题层级切分 Markdown 文档节与标题路径（忽略代码块中 `#`） |
| `ai-service/indexing/parsers/pdf.py` | 新增 | 子进程隔离执行 `pdfplumber` 提取 PDF 页面文本，限制内存（512MB）与超时并识别扫描版（`UNEXTRACTABLE(4)`） |
| `ai-service/indexing/parsers/plain_text.py` | 新增 | 纯文本 / 笔记摘要兜底解析 |
| `ai-service/indexing/parsers/srt.py` | 新增 | SRT 字幕解析（提取时间轴与纯文本对白，按段落组织结构） |
| `ai-service/indexing/chunking.py` | 新增 | 按文档结构与 token 上限切分不重叠切片并保留标题路径与行/页位置 |
| `ai-service/indexing/es_store.py` | 新增 | 管理 ES `kn_item_v{N}`/`kn_chunk_v{N}` mapping（内置 `cjk` 分析器、`dense_vector` 按需启用）、`kn_item`/`kn_chunk` 别名、原子切换、`kn_meta` 版本/游标持久化及版本冲突拦截 |
| `ai-service/indexing/pipeline.py` | 新增 | 核心索引引擎：内容 hash vs 元数据 hash 分离（仅权限/标题变更跳过 `_embed`）、删除与权限收紧处理、扫描 PDF 状态回写、`rebuild` 与 `reconcile` 对账、水位推进与延迟指标 |
| `ai-service/models/catalog.py` | 修改 | 增加 `resolve_embedding()`，实时读取运行时 `a_logical_model` 配置并校验供应商启用与 `dataEgressAllowed` |
| `ai-service/models/openai_compatible.py` | 修改 | 增加批量 `_embed` 向量化客户端能力与异常处理 |
| `ai-service/requirements/indexing.in` | 修改 | 增加 `elasticsearch[async]==8.7.0`、`pdfplumber`、`redis` 依赖 |
| `ai-service/requirements/indexing-linux.lock.txt` | 修改 | 重新编译的 Linux 索引 Worker 依赖锁文件（含 `aiohttp==3.14.5` 等） |
| `ai-service/requirements/test.in` | 修改 | 测试依赖引入 `-r indexing.in` 以覆盖 Worker 与管线 |
| `ai-service/requirements/test-linux.lock.txt` | 修改 | 同步锁定 Linux 测试环境依赖 |
| `ai-service/worker.py` | 新增 | 索引 Worker CLI 主入口（`run` / `rebuild` / `reconcile [--kb-id ID]`），校验 `ANYNOTE_INTERNAL_SECRET`，启动内网 `/healthz` 探针，监听 Redis `anynote:knowledge:change` 唤醒与定时轮询 |
| `ai-service/tests/test_indexing_clients.py` | 新增 | 单测内部签名请求头、Jackson `null` 游标兼容、文件/通知/知识客户端契约 |
| `ai-service/tests/test_indexing_models_embedding.py` | 新增 | 单测运行时 Embedding 解析、出境拦截与无配置退化分支 |
| `ai-service/tests/test_indexing_parsers_chunking.py` | 新增 | 单测 Markdown / PDF（含空白页扫描件识别与超时保护）/ SRT / 纯文本解析及不重叠切分 |
| `ai-service/tests/test_indexing_pipeline.py` | 新增 | 单测 9 类适配器、仅改元数据免重嵌、删除清理、`mooc_item`/`transcript`/`summary` 同 `ref` 不碰撞、扫描 PDF 状态回写与对账 |
| `ai-service/tests/test_indexing_worker.py` | 新增 | 单测缺 `ANYNOTE_INTERNAL_SECRET` 拒启、版本冲突触发 `/healthz` 503 与 CLI 分发 |

## apps/web（管理员运行时 Embedding 配置页面）

| 文件 | 状态 | 作用与原因 |
|---|---|---|
| `apps/web/src/features/model-providers/query-keys.ts` | 修改 | 新增 `modelProviderQueryKeys.embedding` 查询键 |
| `apps/web/src/features/model-providers/schemas.ts` | 修改 | 新增 `EmbeddingModelConfig` 与表单校验/转换工具函数 |
| `apps/web/src/features/model-providers/use-model-providers.ts` | 修改 | 新增 `useEmbeddingConfigQuery` 与 `useUpdateEmbeddingConfigMutation`（走 `@anynote/api-client` + BFF） |
| `apps/web/src/features/model-providers/components/embedding-model-settings.tsx` | 新增 | 管理员 Embedding 模型配置卡片（展示仅限开启出境供应商提示、维度输入校验、错误展示与保存反馈） |
| `apps/web/src/features/model-providers/components/model-provider-settings.tsx` | 修改 | 在模型供应商设置页挂载 `EmbeddingModelSettings` 并整理导入顺序 |
| `apps/web/src/features/model-providers/__tests__/embedding-model-settings.test.tsx` | 新增 | 组件单测：加载状态、禁用出境供应商警告条、表单提交与错误反馈 |
| `apps/web/src/features/model-providers/__tests__/model-provider-settings.test.tsx` | 修改 | 覆盖页面中同时渲染供应商列表与 Embedding 配置卡片 |
| `apps/web/src/features/model-providers/__tests__/schemas.test.ts` | 修改 | 覆盖 Embedding 模型表单空值、维度范围与映射转换单测 |
| `apps/web/src/features/model-providers/__tests__/use-model-providers.test.tsx` | 修改 | 覆盖逻辑 Embedding 查询与更新 hook 及缓存失效行为 |

## infra（部署、Nacos、数据库迁移与编排测试）

| 文件 | 状态 | 作用与原因 |
|---|---|---|
| `infra/Dockerfile.ai-service` | 修改 | 新增 `indexing-dependencies` 与非 root 只读运行阶段 `indexer`（`CMD ["python", "worker.py", "run"]`） |
| `infra/docker-compose.yaml` | 修改 | 新增 `anynote-ai-indexer` 服务（`read_only: true`、`cap_drop: [ALL]`、`no-new-privileges: true`、内网 `/healthz` 健康检查、不映射宿主端口） |
| `infra/docker-compose.dev.yaml` | 修改 | dev 环境挂载或配置 `anynote-ai-indexer` 覆盖（依赖服务就绪后启动） |
| `infra/docker-compose.prod.yaml` | 修改 | 生产环境注入 `ANYNOTE_INTERNAL_SECRET` 等约束及仅内网运行配置 |
| `infra/docker/nacos/configs/anynote-ai-indexer.yml` | 新增 | `anynote-ai-indexer` 的 Nacos 配置文件（内部服务地址、ES、Redis 与轮询间隔等） |
| `infra/sql/migrations/2026-11-15-ai-logical-model.sql` | 新增 | 幂等创建 `a_logical_model` 表的数据库迁移脚本（dev 库已执行） |
| `infra/sql/anynote.sql` | 修改 | 同步全量建库 SQL 中的 `a_logical_model` 表定义 |
| `infra/tests/test_compose.py` | 修改 | 新增 `test_ai_indexer_worker_isolated_without_published_ports` 回归用例，锁定只读安全边界与无宿主端口暴露 |

## OpenAPI 与生成物

| 文件 | 状态 | 作用与原因 |
|---|---|---|
| `openapi/specs/ai.json` | 修改·生成物 | `openapi/generate.sh` 从在线网关拉取并经 `normalize-cli.mjs` 归一化（新增 `/v1/admin/model-providers/logical/embedding` GET/PUT 与相关 schema） |
| `openapi/specs/file.json` | 修改·生成物 | `normalize-cli.mjs` 归一化同步（内部流式端点与现有 spec 保持一致） |
| `openapi/specs/note.json` | 修改·生成物 | 新增 `/internal/v1/knowledge/documents/batch` 与 `/internal/v1/knowledge/changes` 路径及 schema |
| `openapi/specs/notify.json` | 修改·生成物 | 新增 `/internal/v1/notices/{export,batch}` 内部端点与 `KnowledgeNotice*` schema |

> 说明：`packages/api-client/src/*.ts` 属于 `.gitignore` 忽略的派生产物，由 `openapi-typescript` 从上述 4+2 份 `openapi/specs/*.json` 重新派生（未入库）。

## 文档与 OpenSpec

| 文件 | 状态 | 作用与原因 |
|---|---|---|
| `.claude/openspec/changes/2026-11-15-ai-logical-model-config.md` | 新增 | 记录运行时 Embedding 逻辑模型表、管理员接口、权限/出境校验与前端页面契约 |
| `.claude/openspec/changes/2026-11-15-indexing-pipeline.md` | 新增 | 记录 M16.4 内部端点扩展、ES 版本化索引结构、Redis 唤醒与 `anynote-ai-indexer` 架构提案 |
| `docs/ai-refactor/AI_MILESTONES.md` | 修改 | 勾选 M16.4 全部任务项，回写完成时间、执行结果、偏差、本机 Docker 验证表与发现的既有问题 |
| `docs/ai-refactor/README.md` | 修改 | 状态更新为 `M16.0–M16.4 已完成（2026-11-15），M16.5 可开工` |
| `CLAUDE.md` | 修改 | 按文档维护约定同步上下文导航中的 `docs/ai-refactor/` 里程碑完成状态 |
| `docs/changelist/2026-11-15-indexing-pipeline.md` | 新增 | 本逐文件审计清单与验证证据（对照 Git 实际状态核验） |

## 审计要点

1. **内部鉴权与权限隔离边界**：`services/{note,file,notify}` 新增的内部端点均使用 `@InnerAuth`（服务间 HMAC 签名，不需要用户令牌）；Worker 部署于内网容器 `anynote-ai-indexer`，不对外暴露端口且启动前强制要求配置 `ANYNOTE_INTERNAL_SECRET`，否则拒绝启动。
2. **数据出境管控不留绕过口**：`LogicalModelServiceImpl` 绑定 Embedding 供应商、以及 `ModelProviderServiceImpl` 停用/修改出境开关或删除供应商时均校验证实 `dataEgressAllowed == true`；Python 侧 `resolve_embedding()` 在执行向量化前同样再次核对启用与出境标志，未启用数据出境时拒绝发送知识内容进行向量化。
3. **同一 `ref` 子类型隔离与幂等核对**：M16.3 对 `mooc_item`、`transcript`、`summary` 均以 `mooc_item:<id>` 作为基础 `ref`，索引管线在 `kn_item` 主键、切片 `item_key` 及删除清理上统一使用 `{ref}#{subtype}`（即 `canonical_key`），避免三者互相覆盖或误删。
4. **内容/元数据双版本与版本守卫**：仅修改标题或 ACL 等元数据时按内容哈希直接跳过 `_embed` 并仅更新元数据字段；切换运行时 Embedding 模型或维度导致与 `kn_meta` 激活映射不一致时，管线拒绝混写并将 `/healthz` 置为 `503`，提示人工执行 `worker.py rebuild` 原子切换版本别名。
5. **跨服务通知登记最终一致性**：`NoticeServiceImpl.publishNotice()` 使用 `afterCommit` 尽力向 `services/note` 登记 `NOTICE CREATE`（失败仅告警不破坏通知发布），漏记场景由 `worker.py reconcile` 定期核对与 `KnowledgeNoticeServiceImpl` 游标导出兜底补齐。
6. **未修改的既有问题（按范围约束保留并提示确认）**：
   - `infra/tests/test_compose.py` 中 `test_production_only_publishes_frontend_and_collab` 与现网 `docker-compose.prod.yaml` 暴露 `anynote-gateway` 的现状冲突；
   - `apps/web` 中既有 `DOC_INDEXED = 1` 常量与后端 `DocIndexStatus.INDEXED(0)` 不一致（M16.4 未涉及既有上传 UI）；
   - `apps/web/src` 原有 TS/TSX 文件普遍使用 Tab 缩进，与仓库根 `biome.json` 的 2 空格规则存在全仓级既有格式差异。
