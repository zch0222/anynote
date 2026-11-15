# Changelist: M16.4 索引完整性修复

> 日期：2026-11-15（Asia/Hong_Kong） | 分支：`dev` | 基线：`731431d` 加未提交修改。
> 契约：[OpenSpec](../../.claude/openspec/changes/2026-11-15-indexing-integrity-repair.md) | 证据：[修复复验记录](../ai-refactor/M16_4_REPAIR_ACCEPTANCE.md)。

## 概览

Git 工作区共 **42 个文件**：修改 **30**，新增 **12**，删除 **0**；已跟踪修改 **+2298/-278** 行，未跟踪文件 **+3691** 行（含本清单）。
其中原验收报告是用户已提供且未改动的输入文件，本轮实际交付文件数为 **41**。本轮未提交、未切分支，基线到 HEAD 没有新增提交。

| 目录 | 修改 | 新增 |
|---|---:|---:|
| ai-service 源码、评测与测试依赖 | 13 | 4 |
| ai-service/tests | 8 | 4 |
| apps/web | 2 | 0 |
| services/note | 2 | 0 |
| infra | 1 | 0 |
| 文档与 OpenSpec | 4 | 4 |

### 验证结果

| 检查 | 实际执行命令（本机 Docker） | 结果 |
|---|---|---|
| Python 全量与 ES | 测试镜像内 `pytest -p no:cacheprovider`，配置 `INDEXING_ES_URL` | 365 passed，1 warning，72.83s；含 20 项真实 ES 回归 |
| Java 全 reactor | Maven 镜像内 `mvn -o test` | 30/30 SUCCESS；553 tests，0 failures/errors/skips；16:55 |
| 直接 PDF 初始化定向测试 | `mvn -o test -pl note -am -Dtest=DocServiceImplKnowledgeChangeTest -Dsurefire.failIfNoSpecifiedTests=false` | 3/3 passed；新增状态断言先失败后通过 |
| note 构建部署 | `mvn -o install -pl note -am -DskipTests` 后 Compose 重建 note | 18/18 reactor SUCCESS；note 容器健康 |
| Web 模型供应商 | Web 测试镜像内 `pnpm exec vitest run src/features/model-providers` | 4 文件、20 tests passed，4.94s |
| Web 修改文件 lint | Web 镜像挂载根 biome.json，`pnpm exec biome lint` 两个修改文件 | 2 files，0 errors，82ms |
| OpenAPI | Docker Node 读取六份 Gateway spec 并执行 `normalizeSpec` 后比较 baseline | 6/6 字节一致 |
| Compose | Linux Docker/Compose 工具卷中 `python infra/tests/test_compose.py -v` | 5/6；既有 Gateway 端口断言失败，未顺手修改 |
| 固定九类真实验收 | 测试镜像内 `python -m evals.run_indexing` | 19/19；唤醒 1.088536s、轮询 4.091209s；各资源清零 |
| 真实源只读探针 | 测试镜像内 `python -m evals.verify_indexing` | 1246 item / 1082 chunk，8/8；游标 235/235；临时索引清零；104.275063s |
| Git 差异 | `git diff --check` | 通过 |

完整参数、原始输出、先红后绿证据及限定条件见复验记录。真实语义评测按用户决定未执行，M16.4 保持重开；现有 Worker 未部署本次索引代码。

## ai-service：索引、检索、评测与测试依赖

| 文件 | 状态 | 增/删行 | 作用与原因 |
|---|---|---:|---|
| `ai-service/core/config.py` | 修改 | +1/-1 | 把默认轮询恢复为方案要求的 3 秒，统一 Worker 调度口径。 |
| `ai-service/evals/indexing_admin.py` | 新增 | +475/-0 | 限定知识库与引用读取，提供字幕/总结补种、确定性向量及按 manifest 归属的数据库、对象、令牌和旧 ES 精确清理。 |
| `ai-service/evals/indexing_corpus_v1.json` | 新增 | +9/-0 | 定义固定九类目标语料与长代码、表格、字幕和三种 PDF 样本，供真实验收复用。 |
| `ai-service/evals/run_indexing.py` | 新增 | +765/-0 | 串联九类真实夹具、隔离重建、两轮对账、权限与标题分支、Redis/轮询时延和清零复核。 |
| `ai-service/evals/verify_indexing.py` | 新增 | +274/-0 | 提供真实源只读探针，使用隔离 ES 重建与两次对账并独立核验、精确清理。 |
| `ai-service/indexing/chunking.py` | 修改 | +154/-20 | 按类型保留代码和表格原子块，组包相邻普通块并按时间切字幕，同时传播源行号。 |
| `ai-service/indexing/es_store.py` | 修改 | +567/-72 | 检查逐项写入、保护新旧代际，核验分片与版本，恢复别名快照并实现可读状态和水位持久化。 |
| `ai-service/indexing/models.py` | 修改 | +7/-1 | 为解析块增加类型和章节边界，为片段载荷增加源行范围以支持准确定位。 |
| `ai-service/indexing/parsers/markdown.py` | 修改 | +134/-20 | 识别段落、列表、图片、代码、表格与章节起点，避免原子块被截断或跨标题合并。 |
| `ai-service/indexing/pipeline.py` | 修改 | +209/-37 | 以源与索引完整性决定跳过或补建，使用标题路径向量输入，提交重建后回写资料状态并维护水位。 |
| `ai-service/requirements/test.in` | 修改 | +2/-0 | 仅为固定验收测试补充 PyMySQL 与 MinIO 驱动，生产 Worker 依赖不变。 |
| `ai-service/requirements/test-linux.lock.txt` | 修改（生成物） | +16/-1 | 由 Docker 内 `uv pip compile` 锁定测试驱动及传递依赖，保证测试镜像可重复构建。 |
| `ai-service/retrieval/index_reader.py` | 修改 | +22/-8 | 在所有 item/chunk 读取路径要求可读状态，并带回片段源行定位字段。 |
| `ai-service/retrieval/models.py` | 修改 | +2/-0 | 为片段命中模型增加起止源行字段，承载 Markdown 引用位置。 |
| `ai-service/retrieval/prefilter.py` | 修改 | +1/-0 | 增加 readable=true 公共过滤，排除删除及权限更新中的不可读片段。 |
| `ai-service/retrieval/search.py` | 修改 | +5/-1 | 向证据 locator 输出 startLine/endLine，使源行范围传到检索结果。 |
| `ai-service/worker.py` | 修改 | +70/-53 | 先建立 Nacos 配置再装配 ES，并在健康响应增加水位且关闭异常建立的资源。 |

## ai-service：回归测试

| 文件 | 状态 | 增/删行 | 作用与原因 |
|---|---|---:|---|
| `ai-service/tests/es_dsl.py` | 修改 | +5/-0 | 补充测试 ES DSL 的可读状态默认值和脚本支持，适配真实查询过滤。 |
| `ai-service/tests/test_evals_indexing.py` | 新增 | +265/-0 | 验证固定样本、上传与变更签名、分页导出及种子原始异常保留，防止夹具误报。 |
| `ai-service/tests/test_evals_indexing_admin.py` | 新增 | +220/-0 | 验证参数化清理、资源归属、引用隔离、确定性向量及令牌精确清零。 |
| `ai-service/tests/test_evals_verify_indexing.py` | 新增 | +91/-0 | 验证独立完整性核对及清理名称边界，防止探针误删业务索引。 |
| `ai-service/tests/test_indexing_es_integration.py` | 新增 | +591/-0 | 使用真实 ES 覆盖 bulk 单项故障、对账修复、模型迁移与别名响应丢失及失败恢复。 |
| `ai-service/tests/test_indexing_outline_pdf.py` | 修改 | +51/-12 | 覆盖 schema/规则版本守卫、可读状态和元数据更新，并补齐别名查询替身。 |
| `ai-service/tests/test_indexing_parsers_chunking.py` | 修改 | +167/-2 | 验证原子块、普通块合并边界、源行号、60 秒字幕窗口和 5 秒间隔。 |
| `ai-service/tests/test_indexing_pipeline.py` | 修改 | +487/-4 | 覆盖水位、完整性修复、标题与权限分支、重建提交前后状态和扫描件重复对账。 |
| `ai-service/tests/test_indexing_worker.py` | 修改 | +182/-16 | 验证 Nacos 先加载、非默认 ES 参数、异常资源释放及健康接口字段白名单。 |
| `ai-service/tests/test_knowledge_tools.py` | 修改 | +27/-0 | 验证工具拒读不可读条目和片段，保持检索读取边界。 |
| `ai-service/tests/test_retrieval_evidence_text.py` | 修改 | +13/-0 | 验证 Markdown 源行号进入证据 locator，确保定位输出正确。 |
| `ai-service/tests/test_retrieval_prefilter.py` | 修改 | +89/-2 | 覆盖各检索入口的可读过滤及关闭语义时不发起向量调用。 |

## services/note：PDF 创建初始化

| 文件 | 状态 | 增/删行 | 作用与原因 |
|---|---|---:|---|
| `services/note/src/main/java/com/anynote/note/service/impl/DocServiceImpl.java` | 修改 | +1/-0 | 直接 PDF 创建初始化 `NOT_INDEXED(3)`，避免 MySQL 因 `index_status` 无默认值拒绝整次上传。 |
| `services/note/src/test/java/com/anynote/note/service/impl/DocServiceImplKnowledgeChangeTest.java` | 修改 | +7/-1 | 捕获真实入库 Doc 并断言初始索引状态，覆盖本次真实复现的缺失字段。 |

## apps/web：Embedding 配置说明

| 文件 | 状态 | 增/删行 | 作用与原因 |
|---|---|---:|---|
| `apps/web/src/features/model-providers/__tests__/embedding-model-settings.test.tsx` | 修改 | +13/-0 | 验证已确认的停用语义说明和无障碍关联在配置卡片中显示。 |
| `apps/web/src/features/model-providers/components/embedding-model-settings.tsx` | 修改 | +7/-0 | 增加已确认的停用后保留向量、重开需对账说明，解释开关的实际行为。 |

## infra：Nacos 默认值

| 文件 | 状态 | 增/删行 | 作用与原因 |
|---|---|---:|---|
| `infra/docker/nacos/configs/anynote-ai-indexer.yml` | 修改 | +1/-1 | 将仓库 Nacos 索引轮询配置同步为 3 秒，与运行时默认一致。 |

## 文档与 OpenSpec

| 文件 | 状态 | 增/删行 | 作用与原因 |
|---|---|---:|---|
| `.claude/openspec/changes/2026-11-15-indexing-integrity-repair.md` | 新增 | +93/-0 | 记录已确认契约、跨服务失败边界和验收授权，约束实施与审查。 |
| `CLAUDE.md` | 修改 | +1/-1 | 更新 AI 文档入口与修复验收状态，避免沿用历史通过结论。 |
| `docs/ai-refactor/AI_MILESTONES.md` | 修改 | +22/-3 | 保留历史记录并标明九类、时延已通过及真实语义未执行，M16.4 保持重开。 |
| `docs/ai-refactor/KNOWLEDGE_RETRIEVAL_PLAN.md` | 修改 | +29/-19 | 统一新代际写入、重建核验、版本、标题重嵌、结构分块与健康水位方案。 |
| `docs/ai-refactor/M16_4_ACCEPTANCE_AUDIT.md` | 新增（用户输入，未改） | +492/-0 | 用户提供的原始失败验收报告，任务开始时已未跟踪，本轮未修改。 |
| `docs/ai-refactor/M16_4_REPAIR_ACCEPTANCE.md` | 新增 | +293/-0 | 归档测试、固定九类、真实源探针、实际时延、失败历史、可重跑命令与独立清零证据。 |
| `docs/ai-refactor/README.md` | 修改 | +6/-3 | 更新索引修复状态与验收文档入口，避免后续里程碑引用失实通过记录。 |
| `docs/changelist/2026-11-15-indexing-integrity-repair.md` | 新增 | +123/-0 | 按实际 Git 状态逐文件说明修复范围、增删行和验证结果，保留审计快照。 |

## 审计要点

1. bulk 单项失败、可读状态与代际清理顺序直接影响索引完整性，优先看 store 和真实 ES 故障测试。
2. 别名与 active 响应丢失时恢复完整快照，恢复不确定时保留被引用索引并拒绝混写；激活后源状态失败不承诺跨服务回滚。
3. schema 3 与两种规则版本会拒绝旧索引混写，发布新版前须执行 rebuild；现有应用 Worker 尚未部署本次索引代码。
4. 标题参与向量后标题变化会重嵌，权限-only 仍跳过；模型关闭与物理 profile 保留语义需同时审查 UI 和状态机。
5. 九类验收只在测试镜像使用 MySQL/MinIO 驱动；直接补种和物理删除必须限定 manifest 归属，通知由系统创建时不能按临时用户过滤。
6. 新增错误及日志模板已获确认；真实语义评测未执行，不能把确定性向量结果包装成语义质量通过。

## 生成物与统计依据

`requirements/test-linux.lock.txt` 由 Docker 内 `uv pip compile --python-version 3.12 --python-platform x86_64-manylinux_2_28 requirements/test.in -o requirements/test-linux.lock.txt` 生成，测试镜像构建会直接使用；评审应看 `test.in` 的依赖来源。固定语料 JSON 为人工定义；评测日志和运行 JSON 位于被忽略的 `tmp/m16-4-repair/`，不是待提交产物。

本次没有修改 OpenAPI baseline、API 客户端等派生代码。开写及写完均复核 `git status --porcelain | sort`、`git diff --stat`、`git diff --numstat`、`git diff --stat 731431d...HEAD`、`git ls-files --others --exclude-standard`；未跟踪文件行数按实际文件统计，原始审计输入从本轮交付数中单列扣除。
