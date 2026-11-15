# Changelist: M16.5 检索通道与工具

> 分支：`dev` | 日期：2026-11-15 | 范围：`ai-service` 检索层与七个知识工具、Harness 内核的工具交互与诊断、索引管线回补（任务成员 / 不重叠切分 / 条目大纲摘要 / PDF 标题与双栏）、检索层评测；`services/note` 任务成员 ACL 与统计端点；`services/ai` 数据库检索参数；`infra` 依赖、编排与迁移；OpenAPI 同步
> OpenSpec：[`2026-11-15-knowledge-retrieval-tools.md`](../../.claude/openspec/changes/2026-11-15-knowledge-retrieval-tools.md) | 验收记录：[`AI_MILESTONES.md` M16.5](../ai-refactor/AI_MILESTONES.md#m165-检索通道与工具)

## 概览

共 **106 个文件**：已追踪修改 **51** 个（`git diff --shortstat`：`51 files changed, 1252 insertions(+), 104 deletions(-)`）；新增未追踪 **55** 个（含本清单，其余 54 个合计 6093 行）。

| 目录 | 修改 | 新增 |
|---|---:|---:|
| `ai-service/`（源码） | 17 | 30（`retrieval/` 12、`tools/` 11、`evals/` 6、`indexing/outline.py`） |
| `ai-service/tests/` | 2 | 10 |
| `ai-service/requirements/` | 6 | 0 |
| `services/note` | 12 | 2 |
| `services/ai` | 3 | 10 |
| `infra/` | 6 | 1 |
| `openapi/specs/` | 2 | 0 |
| 文档与 OpenSpec | 3 | 2 |
| 合计 | 51 | 55 |

### 验证结果

| 检查项 | 环境 / 命令 | 结果 |
|---|---|---|
| Python 单测 | Docker `anynote/ai-service-test:local`，`pytest` | **258 passed**，1 个既有 Starlette 弃用告警 |
| Java 单测 | Docker `maven:3.9.11-eclipse-temurin-21`，`mvn -o install -pl note,ai -am` | BUILD SUCCESS；`note` **242/242**、`ai` **64/64**（上游模块一并执行通过） |
| 共享权限矩阵 | Python `tests/test_retrieval_prefilter.py` 读取 `services/note/.../access-matrix.json` | 59 条用例在显式范围、默认范围两组参数化下全部通过 |
| 数据库迁移 | dev MySQL 执行 `2026-11-15-ai-retrieval-setting.sql` 两次 | 建表成功，重复执行无错 |
| 索引重建 | `docker exec anynote-anynote-ai-indexer-1 python worker.py rebuild` | 旧 v1 被 schema 守卫拒绝后重建；`kn_item_v2` 1231 条、`kn_chunk_v2` 962 条，`schema_version=2` |
| 检索层评测 | `python -m evals.seed` + `python -m evals.run_retrieval`（compose 网络内） | 24 题；基线前十召回 **1.0**（目标 0.85）；**权限泄漏 0**；计数 2/2；同义改写题 0（未配置嵌入，单列） |
| 工具真实栈 | 以真实用户令牌调用七个工具（临时脚本，未入库） | 全部走通；越权、范围外读取返回「知识内容不存在或不可读」 |
| 降级 | 同上脚本，ES / note 地址改为不可达 | ES 不可达：`kb_search`、库范围 `kb_grep` 返回「检索通道不可用」，其余照常；note 不可达：14 次调用全部 `KNOWLEDGE_ACCESS_UNAVAILABLE` |
| 检索参数生效 | 直接写入 / 删除 `a_retrieval_setting` 后读取模型快照 | 快照 `version` `0:1 → 3:1 → 0:1`，`rrfK` `60 → 30 → 60` |
| PDF 解析耗时 | M16.0 样本，`--cpus=1`，三次中位数 | 15 页论文 3.66 秒；扫描件标记无法提取文本 |
| OpenAPI | Docker `node:22.23.2-bookworm-slim` 拉取 6 份 spec 并经 `normalize-cli.mjs` 归一化 | 仅 `note.json`、`ai.json` 变化，其余 4 份字节一致 |
| Compose 回归 | Docker `docker:29.7-cli`，`python3 -m unittest -v infra/tests/test_compose.py` | 5/6；失败项为 M16.4 已记录的既有断言 `test_production_only_publishes_frontend_and_collab` |

## ai-service：检索层（`retrieval/`）

| 文件 | 状态 | 作用与原因 |
|---|---|---|
| `ai-service/retrieval/__init__.py` | 新增 | 包说明 |
| `ai-service/retrieval/settings.py` | 新增 | 随模型快照下发的检索参数模型，缺省值与 Java 默认值一致；`/authorize` 每批 100 条作为常量（note 硬上限，不入表） |
| `ai-service/retrieval/models.py` | 新增 | note 用户端点（scope/authorize/content/outline/query/stats）的响应模型、片段命中与融合候选结构，以及已确认的给模型提示常量 |
| `ai-service/retrieval/prefilter.py` | 新增 | 第一段权限：按 Java 检索可读口径把范围翻译为 ES 过滤；作者条款不受成员关系限制，超管仅显式范围用超管口径，排除通知，附调用方收窄 |
| `ai-service/retrieval/query_analysis.py` | 新增 | 确定性查询特征分析（引号、长数字、代码样式、短词 / 完整问句）决定全文与语义权重，支持 keyword/semantic 模式 |
| `ai-service/retrieval/fusion.py` | 新增 | 应用层 RRF（ES 8.7 无 RRF）、权威性系数、每实体限量 |
| `ai-service/retrieval/rerank.py` | 新增 | 重排接口与开关；没有重排协议实现，打开时跳过并标记 `unavailable` |
| `ai-service/retrieval/evidence.py` | 新增 | 运行内证据编号 E1/E2…，同一位置多次命中复用编号 |
| `ai-service/retrieval/text.py` | 新增 | UTF-16 续读偏移（对齐 Java 字符）、字面查找、笔记站内链接解析 |
| `ai-service/retrieval/index_reader.py` | 新增 | `kn_item/kn_chunk/kn_meta` 只读查询：三路召回、相邻片段、按页读取、索引复核、上级引用、短语候选 |
| `ai-service/retrieval/session.py` | 新增 | 每运行一次取范围、两段权限、显式范围与超管默认范围复核、note/ES 错误归类（note 故障为不可降级错误）、运行结束释放的中间件 |
| `ai-service/retrieval/search.py` | 新增 | `kb_search` 管线：三路召回 → 融合 → 限量 → 重排 → 第二段权限与丢弃比例 → 相邻扩展（不重复补入）→ 证据；区分语义通道「关闭」与「不可用」 |

## ai-service：七个知识工具（`tools/knowledge/`）

| 文件 | 状态 | 作用与原因 |
|---|---|---|
| `ai-service/tools/__init__.py` | 新增 | 包说明 |
| `ai-service/tools/knowledge/__init__.py` | 新增 | `register_knowledge_tools` 一次注册七个只读工具，M16.6 接入 Agent 时使用 |
| `ai-service/tools/knowledge/args.py` | 新增 | 七个工具的参数模型与跨字段校验（范围互斥、二选一、日期顺序），引用格式含 `notice:` 以便统一按不存在处理 |
| `ai-service/tools/knowledge/common.py` | 新增 | 工具上下文、紧凑 JSON 输出、条目键拆分、全文按行读取（资料从索引拼回，其余从 note 续读到结束） |
| `ai-service/tools/knowledge/kb_list.py` | 新增 | 可访问知识库及四类内容数量，调用 note `/stats`；显式空范围不调用 |
| `ai-service/tools/knowledge/kb_outline.py` | 新增 | note 目录/大纲，深度展开慕课章节；资料按标题或页从索引分组；超管默认范围过滤实体节点 |
| `ai-service/tools/knowledge/kb_search.py` | 新增 | 混合检索工具，结果只列证据编号与定位，正文在证据层 |
| `ai-service/tools/knowledge/kb_grep.py` | 新增 | 单实体或单知识库的字面查找，库范围先用短语匹配缩小候选再经第二段权限 |
| `ai-service/tools/knowledge/kb_read.py` | 新增 | 按标题/行/页/时间读取；按 `readMaxChars` 截断并给出 Java 字符续读位置；资料从索引读取 |
| `ai-service/tools/knowledge/kb_query.py` | 新增 | 结构化查询；显式范围或带 `kb_ids` 时客户端二次过滤，数据不完整时不给近似计数 |
| `ai-service/tools/knowledge/kb_related.py` | 新增 | 六种结构关系（包含、下级、附属、我的提交、笔记链接、同级），结果均经可读性确认 |

## ai-service：Harness 内核

| 文件 | 状态 | 作用与原因 |
|---|---|---|
| `ai-service/harness/models.py` | 修改 | 新增类型化 `RunScope`（Q7）与 `ToolExchange`；证据增加知识库/权威性/滞后/检索字段；行动结果与观察增加只进 Trace 的 `diagnostics`；运行记录工具交互 |
| `ai-service/harness/context/builder.py` | 修改 | 在问题后按 OpenAI 格式编入 `tool_calls` 与 `tool` 消息（不可信定界，超预算从最早一轮截断内容、保留配对）并写入清单；运行提示里的范围序列化 |
| `ai-service/harness/loop.py` | 修改 | 记录每轮工具交互；`FatalActionError` 以其类别失败、文案沿用已有提示；有工具交互时按含知识库内容调用模型（数据出域判定） |
| `ai-service/harness/action/plane.py` | 修改 | 新增 `FatalActionError` 并不吞掉；行动绑定运行范围与模型快照；透传 `diagnostics` |
| `ai-service/harness/action/policy.py` | 修改 | `BoundAction` 增加 `scope`、`model_snapshot`，供检索会话取范围与参数快照 |
| `ai-service/harness/action/registry.py` | 修改 | `ToolOutput` 增加 `diagnostics` |
| `ai-service/harness/trace/middleware.py` | 修改 | `trace.action` 带上各行动的 `diagnostics`（检索候选与分数、丢弃比例），不进浏览器事件 |
| `ai-service/models/catalog.py` | 修改 | 模型快照解析 `retrieval` 检索参数，缺失时用默认值 |
| `ai-service/clients/_internal.py` | 修改 | `InternalServiceError` 携带 ResData `code`，用于区分「不存在或不可读」「参数错误」与服务故障 |
| `ai-service/clients/knowledge.py` | 修改 | 新增带 `accessToken` 的用户端点：scope、authorize、content、outline、query、stats |

## ai-service：索引管线回补

| 文件 | 状态 | 作用与原因 |
|---|---|---|
| `ai-service/indexing/parsers/pdf.py` | 修改 | 改用 pdfplumber 提取（P2），pypdf 只读书签；书签优先，否则按字号识别标题；中线留白时先左后右读双栏；纯函数部分可单测 |
| `ai-service/indexing/outline.py` | 新增 | 确定性条目大纲与摘要（首行标题、去重小标题、正文开头 N 字），以及只替换摘要标题 |
| `ai-service/indexing/es_store.py` | 修改 | schema 升到 2：`outline/summary/task_member_ids` 映射与写入、`kn_meta` 记录并校验 `schema_version`；只改元数据时同步任务成员并替换摘要标题 |
| `ai-service/indexing/chunking.py` | 修改 | 删除重叠切分，片段首尾相接（Q5/R4） |
| `ai-service/indexing/models.py` | 修改 | ACL 与片段载荷增加 `task_member_ids` |
| `ai-service/indexing/pipeline.py` | 修改 | 写入大纲与摘要、片段携带任务成员，去掉重叠参数 |
| `ai-service/core/config.py` | 修改 | 删除 `chunk_overlap_chars`，新增 `summary_body_chars`（默认 200） |

## ai-service：检索层评测（`evals/`，不进默认 pytest）

| 文件 | 状态 | 作用与原因 |
|---|---|---|
| `ai-service/evals/__init__.py` | 新增 | 包说明 |
| `ai-service/evals/corpus_v1.json` | 新增 | 固定语料：2 个身份、2 个知识库、11 篇埋好事实的笔记、1 个任务 |
| `ai-service/evals/datasets/retrieval_v1.jsonl` | 新增 | 24 题：关键词、无答案、同义改写、权限负例、清单与计数，用语料键而非环境 id |
| `ai-service/evals/seed.py` | 新增 | 经网关公开接口注册账号、建库、加成员、写笔记、建任务；随机账号密码只写本地输出 |
| `ai-service/evals/run_retrieval.py` | 新增 | 以各身份经行动面执行 `kb_search`/`kb_query`，映射回语料键并汇总 |
| `ai-service/evals/metrics.py` | 新增 | 前十召回、泄漏、计数正确率与基线判定（同义改写不计入基线） |
| `ai-service/.gitignore` | 修改 | 忽略 `evals/output/`（含评测账号），并补上缺失的行尾换行 |

## ai-service：测试

| 文件 | 状态 | 作用与原因 |
|---|---|---|
| `ai-service/tests/es_dsl.py` | 新增 | 测试用 ES 查询子集求值器，使预过滤测试校验的是实际生成的 DSL |
| `ai-service/tests/knowledge_fakes.py` | 新增 | note 客户端、索引读取器、嵌入器替身与运行构造器 |
| `ai-service/tests/test_retrieval_prefilter.py` | 新增 | 读取共享权限矩阵逐条校验预过滤；超管默认范围、作者兼成员、未归档、通知与收窄 |
| `ai-service/tests/test_retrieval_ranking.py` | 新增 | RRF、权威性、每实体限量、查询特征、重排开关 |
| `ai-service/tests/test_retrieval_evidence_text.py` | 新增 | 证据去重、相邻扩展与不重复补入、定位符、UTF-16 偏移、字面查找、链接解析 |
| `ai-service/tests/test_retrieval_session.py` | 新增 | 范围只取一次、批量授权分片、错误归类、ES 错误、快照默认值、客户端请求头 |
| `ai-service/tests/test_knowledge_tools.py` | 新增 | 七个工具经行动面的成功与失败路径、降级、超管默认复核、会话释放 |
| `ai-service/tests/test_context_tool_exchange.py` | 新增 | tool 消息编译与截断、循环回灌工具结果、`diagnostics` 只进 Trace、不可降级错误 |
| `ai-service/tests/test_indexing_outline_pdf.py` | 新增 | 大纲摘要、不重叠切分、标题/分栏/书签纯函数与真实 PDF、schema 守卫、元数据更新 |
| `ai-service/tests/test_evals_metrics.py` | 新增 | 评测指标、数据集与语料键一致性、用例解析 |
| `ai-service/tests/test_indexing_parsers_chunking.py` | 修改 | 去掉已删除的 `chunk_overlap_chars` 参数 |
| `ai-service/tests/test_indexing_pipeline.py` | 修改 | 内存 ES 替身接受大纲、摘要与任务成员 |

## ai-service：依赖（锁文件为生成物）

| 文件 | 状态 | 作用与原因 |
|---|---|---|
| `ai-service/requirements/online.in` | 修改 | 在线进程新增 `elasticsearch[async]==8.7.0`（与索引组同版本），检索在在线进程执行 |
| `ai-service/requirements/online-linux.lock.txt` | 修改·生成物 | 按锁文件头的 `uv pip compile` 命令重生成，新增 ES 客户端及 aiohttp 依赖链 |
| `ai-service/requirements/online-windows.lock.txt` | 修改·生成物 | 同上（Windows 平台） |
| `ai-service/requirements/indexing-linux.lock.txt` | 修改·生成物 | 重生成后只有 `via` 注释变化 |
| `ai-service/requirements/indexing-windows.lock.txt` | 修改·生成物 | 重生成后补齐此前缺失的 `[async]` 依赖链（aiohttp 等）与 `via` 注释 |
| `ai-service/requirements/test-linux.lock.txt` | 修改·生成物 | 重生成后只有 `via` 注释变化 |

## services/note

| 文件 | 状态 | 作用与原因 |
|---|---|---|
| `services/note/src/main/java/com/anynote/note/model/vo/KnowledgeSourceDocumentVO.java` | 修改 | ACL 新增 `taskMemberIds`（Q4/R1），供索引预过滤判定任务成员 |
| `services/note/src/main/java/com/anynote/note/service/impl/KnowledgeEntityServiceImpl.java` | 修改 | 任务源文档填写管理与提交权限成员（Wrapper 查询，无新增 XML SQL），成员计入 `metaVersion` |
| `services/note/src/main/java/com/anynote/note/service/impl/NoteTaskServiceImpl.java` | 修改 | 新建任务异步插完成员后登记 `task UPDATE`，否则索引可能停在空成员列表 |
| `services/note/src/main/java/com/anynote/note/service/impl/KnowledgeBaseServiceImpl.java` | 修改 | 新成员加入知识库补任务成员后，每个任务登记 `task UPDATE` |
| `services/note/src/main/java/com/anynote/note/model/dto/KnowledgeStatsDTO.java` | 新增 | `/stats` 请求 |
| `services/note/src/main/java/com/anynote/note/model/vo/KnowledgeStatsVO.java` | 新增 | `/stats` 响应；嵌套类命名为 `KnowledgeBaseStats`，避免与 `KnowledgeScopeVO.KnowledgeBase` 的 schema 名冲突 |
| `services/note/src/main/java/com/anynote/note/service/KnowledgeQueryService.java` | 修改 | 声明 `stats` |
| `services/note/src/main/java/com/anynote/note/service/impl/KnowledgeQueryServiceImpl.java` | 修改 | 按范围逐库统计四类直属可读内容与最晚更新时间，口径同 `/query`；抽出单库分页读取复用 |
| `services/note/src/main/java/com/anynote/note/controller/KnowledgeController.java` | 修改 | 新增 `@InnerAuth(isUser = true) POST /internal/v1/knowledge/stats` |
| `services/note/src/test/java/com/anynote/note/service/impl/KnowledgeEntityServiceImplTest.java` | 修改 | 任务成员 ACL 与元数据版本、非任务实体为空 |
| `services/note/src/test/java/com/anynote/note/service/impl/NoteTaskServiceImplKnowledgeChangeTest.java` | 修改 | 异步成员插入完成后才登记 `task UPDATE` |
| `services/note/src/test/java/com/anynote/note/service/impl/KnowledgeBaseServiceImplKnowledgeChangeTest.java` | 修改 | 加入知识库后每个任务登记一次 |
| `services/note/src/test/java/com/anynote/note/service/impl/KnowledgeQueryServiceImplTest.java` | 修改 | 统计计数、显式范围传递、空时间、超管默认按普通用户 |
| `services/note/src/test/java/com/anynote/note/controller/KnowledgeControllerTest.java` | 修改 | `/stats` 契约与 `isUser = true` 断言 |

## services/ai：检索参数

| 文件 | 状态 | 作用与原因 |
|---|---|---|
| `services/ai/src/main/java/com/anynote/ai/model/po/RetrievalSettingPO.java` | 新增 | 单行表 `a_retrieval_setting` 实体 |
| `services/ai/src/main/java/com/anynote/ai/mapper/RetrievalSettingMapper.java` | 新增 | `selectSetting` 读取单行 |
| `services/ai/src/main/resources/mapper/RetrievalSettingMapper.xml` | 新增 | 新增 SELECT 使用显式 `resultMap` |
| `services/ai/src/main/java/com/anynote/ai/model/vo/RetrievalSettingVO.java` | 新增 | 管理接口与快照共用的参数视图 |
| `services/ai/src/main/java/com/anynote/ai/model/dto/RetrievalSettingUpdateDTO.java` | 新增 | 整体更新请求，全部字段必填 |
| `services/ai/src/main/java/com/anynote/ai/service/RetrievalSettingService.java` | 新增 | 服务接口 |
| `services/ai/src/main/java/com/anynote/ai/service/impl/RetrievalSettingServiceImpl.java` | 新增 | 默认值、范围校验（越界返回已确认的「检索参数超出允许范围」）、首次插入与版本递增 |
| `services/ai/src/main/java/com/anynote/ai/controller/RetrievalSettingAdminController.java` | 新增 | `GET/PUT /v1/admin/retrieval-settings`，仅 `ADMIN_X`；方法名避开 `get/update`，不改变既有接口的 operationId |
| `services/ai/src/main/java/com/anynote/ai/model/vo/ModelProviderSnapshotVO.java` | 修改 | 快照新增 `retrieval` |
| `services/ai/src/main/java/com/anynote/ai/service/impl/ModelProviderServiceImpl.java` | 修改 | 快照合并检索参数，版本计入数值部分；保留原构造器兼容既有单测 |
| `services/ai/src/test/java/com/anynote/ai/service/impl/RetrievalSettingServiceImplTest.java` | 新增 | 默认值、首次插入、版本递增、越界、默认大于上限、缺字段 |
| `services/ai/src/test/java/com/anynote/ai/controller/RetrievalSettingAdminControllerTest.java` | 新增 | 管理员准入、操作人传递、缺字段校验、非管理员拒绝 |
| `services/ai/src/test/java/com/anynote/ai/service/impl/ModelProviderServiceImplTest.java` | 修改 | 快照合并检索参数与默认值 |

## infra

| 文件 | 状态 | 作用与原因 |
|---|---|---|
| `infra/sql/migrations/2026-11-15-ai-retrieval-setting.sql` | 新增 | 幂等建表 `a_retrieval_setting`，无记录时按默认值下发，因此不插数据 |
| `infra/sql/anynote.sql` | 修改 | 同步建表语句 |
| `infra/docker-compose.yaml` | 修改 | `anynote-ai-harness` 显式配置 `NOTE_SERVICE_URL`、`ES_URL` 并依赖 ES 健康 |
| `infra/docker-compose.prod.yaml` | 修改 | 生产覆盖同步两项环境变量 |
| `infra/docker/nacos/configs/anynote-ai-indexer.yml` | 修改 | 删除 `chunk-overlap-chars`，新增 `summary-body-chars: 200` |
| `infra/Dockerfile.ai-service` | 修改 | test 阶段复制共享权限矩阵到与 CI 相同的相对位置，Python 测试找不到时失败而非跳过 |
| `infra/Dockerfile.ai-service.dockerignore` | 修改 | 放行该矩阵文件进入构建上下文 |

## OpenAPI（生成物）

| 文件 | 状态 | 作用与原因 |
|---|---|---|
| `openapi/specs/note.json` | 修改·生成物 | 新增 `/internal/v1/knowledge/stats` 与 `KnowledgeStatsDTO`、`KnowledgeStatsVO`、`KnowledgeBaseStats`、`ResDataKnowledgeStatsVO`；`Acl` 新增 `taskMemberIds`。由网关在线 spec 经 `normalize-cli.mjs` 生成，CI `openapi-check.yml` 卡 diff |
| `openapi/specs/ai.json` | 修改·生成物 | 新增 `/v1/admin/retrieval-settings` 与 3 个 schema；`ModelProviderSnapshotVO` 新增 `retrieval`。来源同上 |

## 文档与 OpenSpec

| 文件 | 状态 | 作用与原因 |
|---|---|---|
| `.claude/openspec/changes/2026-11-15-knowledge-retrieval-tools.md` | 新增 | 本批契约：任务成员 ACL 与变更登记、`/stats`、检索参数表/接口/快照、Python 侧口径 |
| `docs/ai-refactor/AI_MILESTONES.md` | 修改 | M16.5 任务勾选、拍板、执行结果、偏差、验证与待补（含检索参数管理页面待补） |
| `docs/ai-refactor/README.md` | 修改 | 状态与「下一步」推进到 M16.6 |
| `CLAUDE.md` | 修改 | 上下文导航中的 AI 重构状态同步 |
| `docs/changelist/2026-11-15-knowledge-retrieval-tools.md` | 新增 | 本清单 |

## 审计要点

1. **预过滤口径**（`retrieval/prefilter.py`）：决定什么内容能被召回，直接关系权限泄漏。对照 Java `KnowledgeAccessServiceImpl` 看三类实体的互斥/取最大规则，以及「作者条款不看成员关系」「超管只在 `explicit` 条目用超管口径」两项拍板；共享矩阵测试是主要证据。
2. **第二段与按引用读取**（`retrieval/session.py` 的 `gate`/`ordinary_check`/`call_note`）：note 故障一律按权限无法确认结束运行；超管默认范围依赖索引复核，ES 不可用时这类调用会失败。
3. **Harness 内核改动**（`harness/context/builder.py`、`loop.py`、`action/plane.py`）：工具结果首次进入模型上下文，看 tool 消息的不可信定界、截断不拆配对、`containsKnowledge` 判定是否随之变化。
4. **索引 schema 升级**（`indexing/es_store.py`）：部署后必须执行一次 `worker.py rebuild`，否则 worker 健康检查返回 503；片段不重叠与 PDF 解析换库都会改变已有索引内容。
5. **任务成员变更登记**（`NoteTaskServiceImpl`、`KnowledgeBaseServiceImpl`）：异步线程中调用自带事务的 `record`，看登记时机是否在成员插入之后。
6. **检索参数下发**（`ModelProviderServiceImpl.snapshot`）：版本计入数值部分；运行中的循环只读开始时的快照。
