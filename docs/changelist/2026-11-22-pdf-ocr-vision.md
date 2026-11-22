# 2026-11-22 PDF OCR 与视觉按页读取

## 概览

本批实现 PDF OCR 索引、schema 4、第八个知识工具、临时多模态图片通道、Java 历史/Trace、管理页视觉开关及真实栈验收；不新增公开 REST 端点。

- 文件：**新增 15、修改 85、删除 0，共 100 个**（含本清单）；合计 **+4861 / -187 行**，其中跟踪文件 +1919/-187，新增文件 2942 行。
- 分布：`ai-service` 59、`services` 21、`apps/web` 7、`infra` 5、文档/根规约 6、OpenSpec 1、OpenAPI 1。
- 编写及复核时 `git diff --stat origin/dev...HEAD` 为空，随后按模块拆分提交；初始未跟踪方案文档已纳入本批。
- P0–P3 已实现，核心 OCR/rebuild/真实视觉精读通过；真实语义评测与概括题引用/稳定性未关闭，详见 `docs/ai-refactor/AI_MILESTONES.md` M18。

### 验证结果

| 命令 / 验收 | 实际结果 |
|---|---|
| `INDEXING_ES_URL=http://127.0.0.1:9200 .venv-test/Scripts/python.exe -m pytest` | 两轮 **556 passed**；最终复跑 555 passed、1 个既有同时间戳索引用例失败，单独复跑通过 |
| `INDEXING_ES_URL=http://127.0.0.1:9200 .venv-test/Scripts/python.exe -m pytest tests/test_indexing_es_integration.py` | **21 passed**，含真实 RapidOCR/schema 4 对账 |
| `mvn -o test -pl ai -am` | reactor **BUILD SUCCESS**，AI 模块 **132 passed** |
| `pnpm --filter web test` | **2157 passed、2 failed**；均为既有任务日期控件 5s 超时，两个文件单独复跑 **45/45 passed** |
| 模型配置 3 个 Vitest 文件 | **20 passed** |
| `pnpm typecheck` | **6/6 tasks passed** |
| `pnpm exec biome check <本批 7 个前端文件>` | 通过，无修复 |
| `pnpm check` | 失败：全仓既有虚拟环境/tmp/历史文件共 333 errors；其自动写入造成的无关格式 diff 已精确反向清理 |
| `pnpm openapi:generate` / 重生成哈希核对 | 成功；再次生成哈希不变；`openapi:check` 仅因本批未提交 baseline diff 返回非零 |
| Linux `test`、indexer、Harness 镜像构建 | 全部成功；宿主机单测未迁入 Docker |
| schema 4 rebuild / `doc:77` | 成功；`INDEXED(0)`、mixed、16 页、19 个 OCR/transcript 片段，页码 1–16 |
| 真实供应商 smoke | 受控图片返回 `ANYNOTE VISION 42` |
| 真实视觉精读、权限负例与审计 | 第 3 页颜色/位置人工核对正确，引用 `[1]`；无权限调用 `NOT_FOUND`；历史/Trace dispatchId 对账，无图片字节 |
| `pdf-ocr-vision.spec.ts` Playwright | **1/1 passed**，覆盖深浅色和两种勾选状态 |

## ai-service

### OCR、索引与检索

| 文件 | 状态 | 作用与原因 |
|---|---|---|
| `ai-service/indexing/parsers/ocr.py` | 新增 | 封装 RapidOCR 响应和有界 ONNX 线程，避免引擎结构泄漏及默认全核初始化耗尽虚拟内存 |
| `ai-service/indexing/parsers/pdf_render.py` | 新增 | 共用受限 PDF 渲染、实际图片区域和旋转/CropBox 归一化，并先消费大队列结果避免 JPEG 渲染死锁 |
| `ai-service/indexing/parsers/pdf.py` | 修改 | 实现逐页文本层、整页/区域 OCR、坐标合并去重及页级来源，同时修正大解析结果的队列读取顺序 |
| `ai-service/indexing/models.py` | 修改 | 增加页数、内容形态、提取版本和片段来源字段，贯穿解析与 ES 载荷 |
| `ai-service/indexing/chunking.py` | 修改 | 切分规则升 v2，禁止不同提取方式或图片区域合并并保留来源 |
| `ai-service/indexing/adapters.py` | 修改 | 将 OCR 开关、超时、内存、页数和区域限制传入 PDF 解析器 |
| `ai-service/indexing/pipeline.py` | 修改 | OCR 片段写 transcript 权威性和文档元数据，并允许开启 OCR 后重试历史不可提取条目 |
| `ai-service/indexing/es_store.py` | 修改 | 升级 schema 4 映射、激活版本守卫和 PDF 提取版本完整性核对 |
| `ai-service/retrieval/models.py` | 修改 | 增加检索来源字段及已确认 OCR/视觉提示常量 |
| `ai-service/retrieval/index_reader.py` | 修改 | 查询文档内容形态、片段提取来源并补片段命中的 item 元数据 |
| `ai-service/retrieval/search.py` | 修改 | `kb_search` 返回 contentMode、extractionMode 和 sourceRegionId 供模型判断原页价值 |
| `ai-service/retrieval/evidence.py` | 修改 | 视觉证据按内容版本参与位置去重，避免同页更新后复用旧证据 |
| `ai-service/retrieval/session.py` | 修改 | 注入运行配置/工作区、预留视觉页预算并对无依赖历史图片清单 fail-closed |
| `ai-service/tools/knowledge/kb_read.py` | 修改 | OCR 读取增加已确认提示，零片段 PDF 不再空成功 |

### 视觉工具与 Harness

| 文件 | 状态 | 作用与原因 |
|---|---|---|
| `ai-service/tools/knowledge/kb_view_doc.py` | 新增 | 按能力、出域、权限、版本和预算读取当前 PDF 页面，输出文本/区域/证据及一次性图像附件 |
| `ai-service/tools/knowledge/args.py` | 修改 | 增加 camelCase 页码的 `kb_view_doc` 参数模型，禁止整本无页码读取 |
| `ai-service/tools/knowledge/common.py` | 修改 | 增加 FileClient/渲染器装配和可热更新实例级渲染限流器 |
| `ai-service/tools/knowledge/__init__.py` | 修改 | 注册第八个只读知识工具 |
| `ai-service/harness/models.py` | 修改 | 增加图片安全元数据、内存附件、发送记录、工作区 PDF 缓存和历史字段，字节排除序列化 |
| `ai-service/harness/action/registry.py` | 修改 | ToolOutput 支持执行期视觉附件而文本结果保持纯 JSON |
| `ai-service/harness/action/plane.py` | 修改 | 传递视觉附件、真实 call_id、运行配置和工作区，并在观察中只保留安全元数据 |
| `ai-service/harness/action/policy.py` | 修改 | 行动绑定携带视觉工具所需运行快照和调用标识 |
| `ai-service/harness/context/builder.py` | 修改 | 图片只进入最近一次工具交换后的一个 user 多模态请求，先扣图片预算并生成无字节 Manifest/dispatch |
| `ai-service/harness/loop.py` | 修改 | 记录实际 dispatch、关联 trace.model、下发历史清单并在终态清理 JPEG/PDF 字节 |
| `ai-service/harness/trace/middleware.py` | 修改 | 在模型调用前发射不含字节的 `trace.visual` |
| `ai-service/harness/runtime.py` | 修改 | 装配 FileClient、渲染限流、OCR 运行标记和视觉历史 |
| `ai-service/harness/view/middleware.py` | 修改 | 过程视图按 `pages` 显示视觉工具结果计数 |
| `ai-service/core/config.py` | 修改 | 增加 OCR 与视觉读取全部热更新参数，默认关闭 |
| `ai-service/models/catalog.py` | 修改 | 逻辑模型快照增加默认 false 的 supportsVision |
| `ai-service/models/openai_compatible.py` | 修改 | 未声明视觉能力时在 HTTP 请求前拒绝 image content parts |
| `ai-service/clients/file.py` | 修改 | 区分下载超限并仅对随机 RemoteProtocolError 做最多三次尝试，保证 rebuild 可恢复 |
| `ai-service/agents/knowledge_retrieval/agent.yaml` | 修改 | 契约升 4 并加入 `kb_view_doc` |
| `ai-service/agents/knowledge_retrieval/instructions.md` | 修改 | 增加 OCR/视觉使用、防注入和数字引用格式规则 |
| `ai-service/evals/run_retrieval.py` | 修改 | 评测装配补 FileClient，避免只有生产装配支持视觉工具 |
| `ai-service/evals/verify_indexing.py` | 修改 | 独立完整性探针核对 PDF 提取规则版本 |

### 依赖与测试

| 文件 | 状态 | 作用与原因 |
|---|---|---|
| `ai-service/requirements/online.in` | 修改 | 显式声明 pypdfium2 和 JPEG 编码所需的 Pillow |
| `ai-service/requirements/indexing.in` | 修改 | 显式声明 pypdfium2 与 rapidocr_onnxruntime 固定版本 |
| `ai-service/requirements/online-linux.lock.txt` | 修改·生成物 | 按文件头 `uv pip compile` 命令生成 Linux 在线锁文件；无专门 diff CI，评审看 `.in` |
| `ai-service/requirements/online-windows.lock.txt` | 修改·生成物 | 按文件头命令生成 Windows 在线锁文件，供宿主机测试 |
| `ai-service/requirements/indexing-linux.lock.txt` | 修改·生成物 | 生成包含 RapidOCR/ONNX/OpenCV 的 Linux 索引锁文件 |
| `ai-service/requirements/indexing-windows.lock.txt` | 修改·生成物 | 生成 Windows 索引锁文件，保持宿主与 Linux 口径分组 |
| `ai-service/requirements/test-linux.lock.txt` | 修改·生成物 | 由 `requirements/test.in` 重生成测试依赖，含 OCR 传递链 |
| `ai-service/tests/pdf_samples.py` | 新增 | 受控生成文本、实际/未使用图片、重复绘制、旋转和 CropBox PDF 样本 |
| `ai-service/tests/test_pdf_ocr.py` | 新增 | 覆盖 OCR 页面规则、去重、真实 RapidOCR、坐标、资源限制及队列顺序 |
| `ai-service/tests/test_kb_view_doc.py` | 新增 | 覆盖视觉权限、出域、版本、预算、缓存、错误文案和并发 |
| `ai-service/tests/test_visual_channel.py` | 新增 | 覆盖图片只发送一次、事件无字节及 JPEG/PDF 终态释放 |
| `ai-service/tests/knowledge_fakes.py` | 修改 | 增加文档、文件和视觉运行测试替身及第八工具装配 |
| `ai-service/tests/test_config.py` | 修改 | 固定 OCR/视觉默认关闭及 Nacos 参数名 |
| `ai-service/tests/test_evals_verify_indexing.py` | 修改 | 验证提取版本缺失不能通过完整性核验 |
| `ai-service/tests/test_indexing_clients.py` | 修改 | 验证协议错误恢复和持续失败三次停止 |
| `ai-service/tests/test_indexing_es_integration.py` | 修改 | 增加真实 ES/RapidOCR 的 schema 4 元数据发布测试 |
| `ai-service/tests/test_indexing_outline_pdf.py` | 修改 | 更新 schema 4 映射与提取版本断言 |
| `ai-service/tests/test_indexing_parsers_chunking.py` | 修改 | 适配先读队列的超时替身并保持超时分类 |
| `ai-service/tests/test_indexing_pipeline.py` | 修改 | 覆盖历史不可提取重试、OCR 权威性和文档元数据 |
| `ai-service/tests/test_knowledge_retrieval_agent.py` | 修改 | 固定 Agent 4、八工具和数字引用格式 |
| `ai-service/tests/test_knowledge_tools.py` | 修改 | 覆盖检索来源字段、OCR 读取提示和零片段原因 |
| `ai-service/tests/test_models.py` | 修改 | 验证视觉能力防线零上游调用及多模态原样发送 |
| `ai-service/tests/test_retrieval_session.py` | 修改 | 验证无权限依赖的历史图片清单 fail-closed |
| `ai-service/tests/test_runtime.py` | 修改 | 更新真实运行装配的第八工具预期 |

## services

| 文件 | 状态 | 作用与原因 |
|---|---|---|
| `services/api/anynote-api-ai/src/main/java/com/anynote/ai/api/model/po/ChatMessage.java` | 修改 | 持久化图片发送清单 JSON，不保存图片字节 |
| `services/ai/src/main/java/com/anynote/ai/model/vo/AgentVisualDispatchVO.java` | 新增 | 定义一次模型请求图片清单的强类型事件/历史结构 |
| `services/ai/src/main/java/com/anynote/ai/model/vo/AgentVisualImageVO.java` | 新增 | 定义来源、页码、版本、尺寸和哈希等单图安全元数据 |
| `services/ai/src/main/java/com/anynote/ai/model/vo/AgentRunFinishedEventVO.java` | 修改 | `run.finished` 增加强类型 visualDispatches |
| `services/ai/src/main/java/com/anynote/ai/model/vo/ChatMessageVO.java` | 修改 | 历史消息解析并返回图片发送元数据 |
| `services/ai/src/main/java/com/anynote/ai/model/dto/HarnessRunRequestDTO.java` | 修改 | Java 向 Python 历史只传图片清单不传字节 |
| `services/ai/src/main/java/com/anynote/ai/controller/ChatController.java` | 修改 | 历史权限隐藏或无法复核时同步清空图片清单 |
| `services/ai/src/main/java/com/anynote/ai/service/impl/AgentRunServiceImpl.java` | 修改 | 强类型裁剪 `trace.visual`、保存助手清单并转发历史元数据 |
| `services/ai/src/main/java/com/anynote/ai/model/po/LogicalModelConfigPO.java` | 修改 | 映射 supports_vision 数据库列 |
| `services/ai/src/main/java/com/anynote/ai/model/dto/LogicalModelConfigUpdateDTO.java` | 修改 | 管理请求增加 supportsVision 及 OpenAPI 描述 |
| `services/ai/src/main/java/com/anynote/ai/model/vo/LogicalModelConfigVO.java` | 修改 | 管理响应暴露视觉能力声明 |
| `services/ai/src/main/java/com/anynote/ai/model/vo/ModelProviderSnapshotVO.java` | 修改 | Python 快照增加 supportsVision |
| `services/ai/src/main/java/com/anynote/ai/service/impl/LogicalModelServiceImpl.java` | 修改 | 仅 agent_main 可开启视觉，其他逻辑名复用已确认参数错误 |
| `services/ai/src/main/java/com/anynote/ai/service/impl/ModelProviderServiceImpl.java` | 修改 | 快照装配视觉能力并默认 false |
| `services/ai/src/main/resources/mapper/LogicalModelConfigMapper.xml` | 修改 | resultMap 和列清单补 supports_vision，避免新增裸映射 |
| `services/ai/src/main/resources/mapper/ChatMessageMapper.xml` | 修改 | resultMap 和列清单补 visual_dispatches |
| `services/ai/src/test/java/com/anynote/ai/controller/ChatControllerTest.java` | 新增 | 验证历史撤权/不可复核时图片清单同步清空 |
| `services/ai/src/test/java/com/anynote/ai/model/vo/ChatMessageVOTest.java` | 修改 | 验证持久化清单转强类型且无图片字节 |
| `services/ai/src/test/java/com/anynote/ai/service/impl/AgentRunServiceImplTest.java` | 修改 | 验证视觉 Trace 裁剪、完成落库和历史清单 |
| `services/ai/src/test/java/com/anynote/ai/service/impl/LogicalModelServiceImplTest.java` | 修改 | 验证视觉默认 false 及仅主模型可开启 |
| `services/ai/src/test/java/com/anynote/ai/service/impl/ModelProviderServiceImplTest.java` | 修改 | 验证 Java 快照视觉字段一致 |

## apps/web

| 文件 | 状态 | 作用与原因 |
|---|---|---|
| `apps/web/src/features/model-providers/components/logical-model-settings.tsx` | 修改 | 仅 agent_main 显示已确认“支持页面图像输入”开关 |
| `apps/web/src/features/model-providers/schemas.ts` | 修改 | 表单和响应 schema 增加 supportsVision 并默认 false |
| `apps/web/src/features/model-providers/use-model-providers.ts` | 修改 | 保存逻辑模型时提交视觉能力值 |
| `apps/web/src/features/model-providers/__tests__/logical-model-settings.test.tsx` | 修改 | 覆盖开关显示范围、选中状态和提交值 |
| `apps/web/src/features/model-providers/__tests__/schemas.test.ts` | 修改 | 覆盖后端配置回填视觉值 |
| `apps/web/src/features/model-providers/__tests__/use-model-providers.test.tsx` | 修改 | 覆盖主模型和 Embedding 请求中的视觉字段 |
| `apps/web/e2e/pdf-ocr-vision.spec.ts` | 新增 | 真实浏览器核对深浅色、两种勾选状态及开关仅主模型可见 |

## infra 与 OpenAPI

| 文件 | 状态 | 作用与原因 |
|---|---|---|
| `infra/Dockerfile.ai-service` | 修改 | indexer/test 镜像安装 OpenCV 所需 libgl/glib/libxcb，修复 Linux RapidOCR 导入 |
| `infra/docker/nacos/configs/anynote-ai-indexer.yml` | 修改 | 登记 OCR 热更新参数且默认关闭 |
| `infra/docker/nacos/configs/anynote-ai-harness.yml` | 修改 | 登记视觉页数、下载、渲染和图片预算参数且默认关闭 |
| `infra/sql/migrations/2026-11-22-pdf-ocr-vision.sql` | 新增 | 手动迁移 supports_vision 与 visual_dispatches 两列 |
| `infra/sql/anynote.sql` | 修改 | 全量 schema 同步两个新列 |
| `openapi/specs/ai.json` | 修改·生成物 | 由 `pnpm openapi:generate` 从真实 Springdoc 生成，CI 会卡 baseline diff；评审看 Java 注解源头 |

## 文档与契约

| 文件 | 状态 | 作用与原因 |
|---|---|---|
| `.claude/openspec/changes/2026-11-22-pdf-ocr-vision.md` | 新增 | 登记模型配置、破坏性索引升级、已确认文案和验证计划 |
| `docs/ai-refactor/PDF_OCR_VISION_PLAN.md` | 新增 | 记录本批实施方案及当前验收未关闭项 |
| `docs/ai-refactor/KNOWLEDGE_RETRIEVAL_PLAN.md` | 修改 | 废止扫描 PDF 不 OCR 的旧非目标并同步第八工具 |
| `docs/ai-refactor/AI_REFACTOR_PLAN.md` | 修改 | 同步在线指定页渲染、内存边界和八工具环境契约 |
| `docs/ai-refactor/AI_MILESTONES.md` | 修改 | M18 如实记录性能、真实验收、失败及未关闭条件 |
| `CLAUDE.md` | 修改 | 更新八工具、M18 与 OCR/视觉方案导航，避免规约指针漂移 |
| `docs/changelist/2026-11-22-pdf-ocr-vision.md` | 新增 | 汇总本批实际文件、验证和审计重点，供评审定位风险 |

## 审计要点

1. **OCR 完整性**：重点看 `pdf.py` 的实际图片检测、区域 OCR、去重和失败整篇中止，不能退回“有文本就跳过图片”。
2. **权限与版本**：`kb_view_doc.py` 必须在任何下载前完成能力/出域/gate，旧索引文本不得与当前图像拼成同源证据。
3. **图片生命周期**：ContextBuilder、RunWorkspace、Java 历史和 Trace 只能保存元数据；图片只进入紧随工具调用的一次请求。
4. **schema 4 与进程隔离**：激活版本、PDF 提取规则、RLIMIT、页数/像素/字节限制和队列读取顺序都属于重建与稳定性关键路径。
5. **未关闭验收**：真实语义评测未配置 Embedding 而无法执行；概括题第一次引用格式不合格、复验 NO_PROGRESS，不能用视觉题通过替代这些条件。

## 最终复核

写完后已重跑 `git status --porcelain | sort`、`git diff --stat`、`git diff --stat origin/dev...HEAD`、`git ls-files --others --exclude-standard` 和 `git diff --check`：85 修改、15 新增、0 删除；跟踪文件 +1919/-187，新增文件含本清单共 2942 行，总计 +4861/-187；编写及复核时已提交到分支的 diff 为空，whitespace 检查通过。
