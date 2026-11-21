# Agent 运行过程展示（M17）评估修复变更清单

## 概览

本批按 [AGENT_TRACE_VIEW_CODE_REVIEW.md](../ai-refactor/AGENT_TRACE_VIEW_CODE_REVIEW.md) 修复 B1–B8、M1–M10、L1–L5，并按 2026-11-21 拍板做破坏性升级：
去掉 Nacos 的过程展示开关；事件与过程视图行统一用 `id`；Java 去掉白名单，每种对外事件一个数据类、注册为 OpenAPI 命名 schema；
会话历史只按依赖清单复核；思考截断字数移到供应商表；运行记录新增供应商、工具调用次数与首字时间，后两项在对话界面展示。
为跑 Playwright，开发环境的凭据主密钥改放在不入库的 `infra/.env.dev.local`，dev 全栈命令改用 `--env-file infra/.env.dev.local`（H1）；
桌面与移动端用例已写好，执行说明见 [AGENT_TRACE_VIEW_E2E.md](../ai-refactor/AGENT_TRACE_VIEW_E2E.md)。
契约见 [OpenSpec 2026-11-21](../../.claude/openspec/changes/2026-11-21-agent-trace-view-repair.md)，逐项结果见评估文档第 0 节。

共 **124 个文件：新增 41、修改 81、删除 2**；**新增 5895 行、删除 1816 行**（含本文件，`git add -N . && git diff HEAD --shortstat` 复核）。
目录分布：`services/ai` 65、`ai-service` 17、`apps/web` 17、`infra` 6、`docs` 6、`services/note` 5、`.claude` 3、`openapi` 2、`services/api` 1、`README.md` 1、`CLAUDE.md` 1。

### 验证结果

| 命令 / 操作 | 实际结果 |
|---|---|
| 新增回归用例在修复前代码上运行（Python 用 `git stash` 退回源码；note 直接在原代码上跑） | Python 新增与改写的用例全部失败（`think_tag` 的「出正文 / 工具片段后断流不重试」两项原代码本就不重试，属预期）；note 的真实校验器用例复现 `HV000030`（返回 `B0001`），`authorizeCombined` 用例因格式错误的键整批抛业务异常。services/ai 的新用例依赖新类型，在原代码上编译不过，未单独留存运行时失败记录 |
| `cd ai-service && PYTHONPATH=. venv/Scripts/python.exe -m pytest -p no:warnings` | 机器空闲时连续 3 次 **489 passed、20 skipped**；与 Maven 并行的高负载下，已登记的 `test_models.py::test_first_idle_and_total_timeouts` 与 `test_indexing_pipeline.py::test_incremental_store_failure_preserves_cursor_success_time_and_doc_status` 抖动失败，单独复跑通过（修复前基线同样出现过前者失败） |
| `cd services && mvn -o test -pl ai,note -am` | **BUILD SUCCESS**：note 247、ai 128，依赖模块 common-core 56、security-core 39、security-servlet 8、swagger 1，全部通过 |
| `cd apps/web && pnpm vitest run src/features/ai src/lib/ai src/components/editor src/features/model-providers` | **41 个文件、356 项通过** |
| `cd apps/web && npx tsc --noEmit -p tsconfig.json`；仓库根 `pnpm typecheck` | 通过；`pnpm typecheck` 6 个任务全部成功 |
| `pnpm exec biome check`（14 个改动的前端文件） | 3 条提示，均为改动前版本就存在的存量问题：`model-provider-settings.tsx`、`process.test.ts` 不符合格式（原文件用制表符缩进），`process.test.ts` 导入顺序。本批未整体重排这两个文件；新增代码与其余 12 个文件无问题 |
| `pnpm exec biome check` 与 `npx tsc --noEmit -p tsconfig.json`（3 个新增 E2E 文件，`tsconfig` 覆盖 `e2e/`） | 通过，Biome 无提示 |
| `ruff check .`（ai-service） | 由 10 条降到 6 条；评估 L2 列出的两条与本批涉及文件的告警已清，剩余 6 条均在本批未改动的文件里 |
| `pnpm --filter web bundle:budget`（`NEXT_DISABLE_STANDALONE=1` 宿主机生产构建） | 通过：桌面 **307.7/310 KB**、移动端 **246.7/250 KB**、编辑器 **16.9/250 KB** |
| `pnpm openapi:generate`（note、ai、harness 镜像按本批代码重建后） | 成功；`ai.json` 新增事件数据类、过程视图、引用、用量、定位与索引水位等命名 schema，`note.json` 批量可读性请求的约束更新 |
| 本机开发库 | 执行迁移 `2026-11-21-agent-trace-view-repair.sql`；D1、D2 执行前计数均为 0，未删除任何行；本机 Nacos 两个配置按仓库文件重新发布 |
| 评估文档 8.3 真实栈核对（临时测试账号，结果在本机 `tmp/m17-repair-check/report.json`） | 三项全部符合：批量可读性端点返回 `00000` 且只含可读键；管理端列表封顶 100 条、事件 `content` 为 JSON 对象、普通用户 `A0301`；桌面与 `/m` 回放四类行齐全，撤权后显示已确认隐藏提示、思考与说明消失、不可读条目消失 |
| 生成开发用主密钥写入 `infra/.env.dev.local`，`docker compose --env-file infra/.env.dev.local ... up -d --no-deps anynote-modules-ai` 重建 ai 容器 | 容器 healthy，容器内有 `ANYNOTE_AI_CREDENTIAL_KEY`；开发库 stepfun 供应商的旧密文用新主密钥解不开 |
| Playwright 桌面与移动端用例（脚本化供应商输出思考增量） | **未执行**：用例与本机编排脚本已就绪；读取供应商配置会逐个解密 Key，stepfun 旧密文解不开会让所有运行失败，需先在设置页重新填写 stepfun 的 Key |

## Python Harness（ai-service）

| 文件 | 状态 | 作用与原因 |
|---|---|---|
| `ai-service/harness/view/middleware.py` | 修改 | 过程投影重写：每块缓冲整段发出（B3）；结果只取本次调用的 `evidence_ids`（B4）；登记检索范围知识库、各工具对象标签与占位规则（M7、M4）；恢复 `summary`/`hitCount`/`retryable` 并统一 `id`（M3、F1）；收尾补发失败的工具结束事件（L4）；首字时间与依赖清单 |
| `ai-service/harness/view/events.py` | 修改 | 工具调用记录增加 `retryable`，供结束事件输出 |
| `ai-service/harness/loop.py` | 修改 | 投影挂到本次运行的 `RunContext.process_view`，删除共享实例字段与死分支（B1）；重试片段计尝试次数、中断时结束思考块（M6）；修复提示先生成再进 `AFTER_VERIFY`（M6）；该轮思考记入 `ToolExchange`（M5）；`run.finished` 带工具调用次数与首字时间（F5） |
| `ai-service/harness/models.py` | 修改 | `ModelChunk.retry_attempt`、`Observation.evidence_ids`（不进上下文）、`ToolExchange.reasoning`、`RunContext.scope_knowledge_bases/process_view`、`ChatMessage.dependencies`；删除历史引用的 `ref/subtype`（D6） |
| `ai-service/harness/trace/middleware.py` | 修改 | 全文一直开启：`blobs` 从清单对象取原文并按运行去重（B2）；本轮用量、首字时间、尝试次数、错误原文、修复提示（M6） |
| `ai-service/harness/context/manifest.py` | 修改 | `content` 设 `exclude=True`，任何序列化都不带原文（B2） |
| `ai-service/harness/context/builder.py` | 修改 | 该轮有思考时挂到 assistant 工具调用消息的 `reasoning_content`，由适配器按回传方式处理（M5） |
| `ai-service/harness/action/plane.py` | 修改 | 观察记下本次调用登记的证据编号（B4） |
| `ai-service/harness/verify/framework.py` | 修改 | `VerificationReport.repair_hint`，让 Trace 记下实际追加的修复提示（M6） |
| `ai-service/models/openai_compatible.py` | 修改 | 用 `body_emitted`/`reasoning_emitted` 判定重试，重试前发带尝试序号的片段（B5、M6）；`think_tag` 判定阶段扣住的前缀在收尾时作为正文（L2）；修正 `_split_open_tail` 注释与回传说明 |
| `ai-service/retrieval/session.py` | 修改 | 历史只按依赖清单复核（D6、M10）；开跑时记录检索范围知识库名称（M7）；预取工具事件改用 `id`；补导入 `ChatMessage`（L2） |
| `ai-service/core/config.py` | 修改 | 删除三个过程展示开关与 `process_reasoning_max_chars`（D3、M6） |
| `ai-service/tests/test_harness_view.py` | 新增 | 并发不串流（B1）、合并拼接与条数上限、中断前发完（B3）、调用归属与零命中（B4）、事件契约字段（M3）、失败占位（M4）、可见集与标签（M7）、收尾补发（L4）、运行指标（F5） |
| `ai-service/tests/test_trace_fulltext.py` | 修改 | 改为全文一直开启的口径：清单不含原文、`blobs` 每哈希一次、`ManifestEntry` 序列化无原文（B2）；首字时间与尝试次数、错误原文、修复提示、本轮用量（M6） |
| `ai-service/tests/test_models.py` | 修改 | 三种格式 × 三种断流位置的重试矩阵与无输出重试（B5）；`<` 原样输出（L2）；经 Harness 验证三种回传方式（M5）；补完原先没有断言的回传用例 |
| `ai-service/tests/test_harness_loop.py` | 修改 | 去掉开关参数、删除「开关关闭不发思考」用例；思考拼接断言；把缺陷当预期的计数断言改为 0（B4）；字段改为 `id` |
| `ai-service/tests/test_retrieval_session.py` | 修改 | 历史复核改为依赖清单口径（含无引用但依赖不可读、慕课附属类型、fail-closed、无依赖不复核）；检索范围知识库登记 |

## Java AI 服务（services/ai）

| 文件 | 状态 | 作用与原因 |
|---|---|---|
| `services/ai/src/main/java/com/anynote/ai/run/AgentRunEventTypes.java` | 新增 | 对外事件类型到数据类的登记表，取代白名单：未登记类型不转发，字段靠类裁剪（E4、M9） |
| `services/ai/src/main/java/com/anynote/ai/run/AgentRunEventWhitelist.java` | 删除 | 按 E4 去掉字段白名单 |
| `services/ai/src/main/java/com/anynote/ai/run/AgentRunProcessView.java` | 修改 | 落库视图改为强类型行 `{type, id}`（B7、F1），按事件数据类累积；收尾时按上限截断并标注、运行中工具行标为失败（M6、L4）；去掉 `reasoningChars` |
| `services/ai/src/main/java/com/anynote/ai/run/ProcessViewRecheck.java` | 修改 | 整段会话依赖去重后每 100 条批量复核（M2）；三条路径都返回只含契约字段的 `AgentProcessViewVO`（M1） |
| `services/ai/src/main/java/com/anynote/ai/run/IndexWatermarkClient.java` | 修改 | 索引水位改为强类型 `AgentIndexWatermarkVO`，蛇形字段按类登记字段解析（E4/F3） |
| `services/ai/src/main/java/com/anynote/ai/service/impl/AgentRunServiceImpl.java` | 修改 | 转发链路强类型化：入站按类型解析、出站发数据类；开跑时解析逻辑模型绑定的供应商与截断上限（E6）；写入供应商、工具调用次数、首字时间（E2/F5）；历史下发依赖清单（D6）；引用与用量改强类型 |
| `services/ai/src/main/java/com/anynote/ai/service/impl/AgentRunAdminServiceImpl.java` | 修改 | 事件 `content` 用 Jackson `readTree` 输出（B8）；每页最多 100 条与新列表字段（L5）；详情过程视图强类型 |
| `services/ai/src/main/java/com/anynote/ai/service/impl/ModelProviderServiceImpl.java` | 修改 | 新增与更新写入思考截断字数；`resolveLogicalModel` 解析逻辑模型绑定的供应商（E6） |
| `services/ai/src/main/java/com/anynote/ai/service/ModelProviderService.java` | 修改 | 新增 `resolveLogicalModel` 接口 |
| `services/ai/src/main/java/com/anynote/ai/controller/ChatController.java` | 修改 | 会话详情改为一次批量复核整段会话（M2） |
| `services/ai/src/main/java/com/anynote/ai/controller/AgentRunAdminController.java` | 修改 | 每页条数参数说明补上限 |
| `services/ai/src/main/java/com/anynote/ai/harness/HarnessClient.java` | 修改 | Agent 运行事件解析为入站信封 `HarnessRunEventVO` |
| `services/ai/src/main/java/com/anynote/ai/harness/vo/HarnessRunEventVO.java` | 新增 | Python 事件入站信封，`data` 暂存原始 JSON 供按类型解析 |
| `services/ai/src/main/java/com/anynote/ai/harness/vo/HarnessTraceDependenciesVO.java` | 新增 | `trace.dependencies` 数据类，避免用 Map 读依赖清单 |
| `services/ai/src/main/java/com/anynote/ai/config/AgentRunEventSchemaConfig.java` | 新增 | 把事件数据类注册为 OpenAPI 命名 schema（E3、M9） |
| `services/ai/src/main/java/com/anynote/ai/model/bo/LogicalModelProviderBO.java` | 新增 | 逻辑模型绑定的供应商与截断字数 |
| `services/ai/src/main/java/com/anynote/ai/model/vo/AgentRunStartedEventVO.java` | 新增 | `run.started` 数据类 |
| `services/ai/src/main/java/com/anynote/ai/model/vo/AgentStateEventVO.java` | 新增 | `state` 数据类 |
| `services/ai/src/main/java/com/anynote/ai/model/vo/AgentToolStartedEventVO.java` | 新增 | `tool.started` 数据类（`id/name/summary/target`） |
| `services/ai/src/main/java/com/anynote/ai/model/vo/AgentToolFinishedEventVO.java` | 新增 | `tool.finished` 数据类（含 `hitCount/retryable/result`） |
| `services/ai/src/main/java/com/anynote/ai/model/vo/AgentReasoningDeltaEventVO.java` | 新增 | `reasoning.delta` 数据类 |
| `services/ai/src/main/java/com/anynote/ai/model/vo/AgentReasoningFinishedEventVO.java` | 新增 | `reasoning.finished` 数据类 |
| `services/ai/src/main/java/com/anynote/ai/model/vo/AgentStepNoteEventVO.java` | 新增 | `step.note` 数据类 |
| `services/ai/src/main/java/com/anynote/ai/model/vo/AgentModelRetryEventVO.java` | 新增 | `model.retry` 数据类（新增 `id`） |
| `services/ai/src/main/java/com/anynote/ai/model/vo/AgentTextDeltaEventVO.java` | 新增 | `text.delta` 数据类 |
| `services/ai/src/main/java/com/anynote/ai/model/vo/AgentErrorEventVO.java` | 新增 | `error` 数据类 |
| `services/ai/src/main/java/com/anynote/ai/model/vo/AgentRunFinishedEventVO.java` | 新增 | `run.finished` 数据类（新增 `toolCalls/firstOutputMs`） |
| `services/ai/src/main/java/com/anynote/ai/model/vo/AgentHeartbeatEventVO.java` | 新增 | `heartbeat` 空数据类 |
| `services/ai/src/main/java/com/anynote/ai/model/vo/AgentCitationVO.java` | 新增 | 引用（事件、落库与会话详情共用） |
| `services/ai/src/main/java/com/anynote/ai/model/vo/AgentUsageVO.java` | 新增 | token 用量（事件、运行记录与管理端共用） |
| `services/ai/src/main/java/com/anynote/ai/model/vo/AgentLocatorVO.java` | 新增 | 定位，只保留 F3 确认的 17 个字段 |
| `services/ai/src/main/java/com/anynote/ai/model/vo/AgentIndexWatermarkVO.java` | 新增 | 索引状态快照与水位字段 |
| `services/ai/src/main/java/com/anynote/ai/model/vo/AgentToolTargetVO.java` | 新增 | 工具行对象 |
| `services/ai/src/main/java/com/anynote/ai/model/vo/AgentToolResultVO.java` | 新增 | 工具结果摘要 |
| `services/ai/src/main/java/com/anynote/ai/model/vo/AgentToolResultItemVO.java` | 新增 | 结果条目（新增 `kbId`，E1） |
| `services/ai/src/main/java/com/anynote/ai/model/vo/AgentProcessItemVO.java` | 新增 | 过程视图行（落库与浏览器共用，只含契约字段） |
| `services/ai/src/main/java/com/anynote/ai/model/vo/AgentProcessViewVO.java` | 新增 | 发给浏览器的过程视图（命名 schema，M1、M9） |
| `services/ai/src/main/java/com/anynote/ai/model/vo/AgentRunEventVO.java` | 修改 | `data` 改为按类型的数据对象，不再是 Map |
| `services/ai/src/main/java/com/anynote/ai/model/vo/ChatMessageVO.java` | 修改 | 引用改强类型；过程视图改为 `AgentProcessViewVO` 且不从落库原文直接转换，只由复核设置 |
| `services/ai/src/main/java/com/anynote/ai/model/vo/AgentRunStatusVO.java` | 修改 | 引用与用量改强类型 |
| `services/ai/src/main/java/com/anynote/ai/model/vo/AgentRunAdminVO.java` | 修改 | 用量改强类型；新增供应商、工具调用次数、首字时间（E2、L5） |
| `services/ai/src/main/java/com/anynote/ai/model/vo/AgentRunAdminDetailVO.java` | 修改 | 过程视图改强类型 |
| `services/ai/src/main/java/com/anynote/ai/model/vo/ModelProviderAdminVO.java` | 修改 | 返回思考截断字数 |
| `services/ai/src/main/java/com/anynote/ai/model/dto/HarnessRunRequestDTO.java` | 修改 | 历史消息新增 `dependencies`，删除引用的 `ref/subtype`（D6） |
| `services/ai/src/main/java/com/anynote/ai/model/dto/ModelProviderCreateDTO.java` | 修改 | 思考截断字数必填，500–200000，报错用 G2 确认文案 |
| `services/ai/src/main/java/com/anynote/ai/model/dto/ModelProviderUpdateDTO.java` | 修改 | 同上 |
| `services/ai/src/main/java/com/anynote/ai/model/po/AgentRunPO.java` | 修改 | 新增 `provider/toolCalls/firstOutputMs` |
| `services/ai/src/main/java/com/anynote/ai/model/po/ModelProviderPO.java` | 修改 | 新增 `processReasoningMaxChars` |
| `services/ai/src/main/resources/mapper/AgentRunMapper.xml` | 修改 | resultMap 与两条查询补三列 |
| `services/ai/src/main/resources/mapper/ModelProviderMapper.xml` | 修改 | resultMap 与基础列补截断字数 |
| `services/ai/src/test/resources/fixtures/agent-process-view.json` | 新增 | 跨栈共享样例：固定事件序列累积后的落库视图（B7） |
| `services/ai/src/test/resources/fixtures/agent-process-view.hidden.json` | 新增 | 跨栈共享样例：上面样例在部分依赖不可读时的隐藏视图（B7、M1） |
| `services/ai/src/test/java/com/anynote/ai/run/AgentRunProcessViewTest.java` | 新增 | 累积结果等于共享样例、截断、运行中工具行兜底 |
| `services/ai/src/test/java/com/anynote/ai/run/AgentRunEventTypesTest.java` | 新增 | 未登记类型不解析、嵌套字段与定位字段由类裁剪 |
| `services/ai/src/test/java/com/anynote/ai/run/AgentRunEventWhitelistTest.java` | 删除 | 白名单已删除 |
| `services/ai/src/test/java/com/anynote/ai/run/ProcessViewRecheckTest.java` | 修改 | 三条路径只含契约字段、隐藏视图等于共享样例、批量次数、降级 |
| `services/ai/src/test/java/com/anynote/ai/run/IndexWatermarkClientTest.java` | 修改 | 断言改为强类型水位 |
| `services/ai/src/test/java/com/anynote/ai/service/impl/AgentRunAdminServiceImplTest.java` | 新增 | 列表筛选与分页上限、详情留痕、事件边界与 JSON 节点、运行不存在不留痕（B8、L5） |
| `services/ai/src/test/java/com/anynote/ai/service/impl/AgentRunServiceImplTest.java` | 修改 | 事件输入改 JSON 文本；新增强类型转发与字段裁剪、供应商上限截断与运行指标落库、历史依赖下发用例 |
| `services/ai/src/test/java/com/anynote/ai/service/impl/ModelProviderServiceImplTest.java` | 修改 | 截断字数写入与 `resolveLogicalModel` |
| `services/ai/src/test/java/com/anynote/ai/controller/AgentRunAdminControllerTest.java` | 修改 | 新增真实 Jackson 序列化用例：`content` 可按路径取到内部字段（B8） |
| `services/ai/src/test/java/com/anynote/ai/controller/ModelProviderAdminControllerTest.java` | 修改 | 请求体补新字段；越界与缺失时返回已确认报错 |
| `services/ai/src/test/java/com/anynote/ai/config/AgentRunEventSchemaConfigTest.java` | 新增 | 事件数据类全部注册为命名 schema |
| `services/ai/src/test/java/com/anynote/ai/harness/HarnessClientTest.java` | 修改 | 断言入站信封与原始数据 |
| `services/ai/src/test/java/com/anynote/ai/model/vo/ChatMessageVOTest.java` | 修改 | 引用强类型；落库过程视图不直接下发 |

## note 服务与 Feign API（services/note、services/api）

| 文件 | 状态 | 作用与原因 |
|---|---|---|
| `services/note/src/main/java/com/anynote/note/model/dto/KnowledgeAuthorizeBatchDTO.java` | 修改 | `@NotBlank` 误标在列表上导致每次校验失败（B6），改为 `@NotEmpty` + `@Size(max=100)` + `List<@NotBlank String>`，沿用既有确认文案 |
| `services/api/anynote-api-note/src/main/java/com/anynote/note/api/model/dto/KnowledgeAuthorizeBatchDTO.java` | 修改 | 同上，去掉列表上的 `@Valid` |
| `services/note/src/main/java/com/anynote/note/service/impl/KnowledgeAccessServiceImpl.java` | 修改 | 单个键格式错误或实体不存在只判这一条不可读，不让整批失败（B6） |
| `services/note/src/main/java/com/anynote/note/service/KnowledgeAccessService.java` | 修改 | 接口说明同步 |
| `services/note/src/test/java/com/anynote/note/controller/KnowledgeControllerTest.java` | 修改 | 真实校验器 + 全局异常处理器：合法 `00000`，空列表、空白键、101 条 `A0160` |
| `services/note/src/test/java/com/anynote/note/service/impl/KnowledgeAccessServiceImplTest.java` | 修改 | 可读笔记、他人私有笔记、字幕、知识库、已删除实体、格式错误的键 |

## 前端（apps/web）

| 文件 | 状态 | 作用与原因 |
|---|---|---|
| `apps/web/src/lib/ai/process.ts` | 修改 | 行统一 `id`；结果条目带 `kbId`；秒数、完成行与工具行尾部文案（C1、C2、G1） |
| `apps/web/src/features/ai/components/process/process-area.tsx` | 修改 | 工具行耗时与失败标识、去掉空分隔符（M4）；结果条目链接沿用引用路由（M8、E1）；移动端运行中只显示最新一行；礼貌播报且计时不播报；`motion-safe` 动画；完成行带首字时间与工具调用次数（G1） |
| `apps/web/src/features/ai/use-chat-stream.ts` | 修改 | 思考增量按动画帧合并写入；断流记失败、中止记已停止（M8）；读取运行指标；回放按 `id` 恢复 |
| `apps/web/src/features/ai/components/message-item.tsx` | 修改 | 传入运行指标与桌面 / 移动端变体 |
| `apps/web/src/features/model-providers/schemas.ts` | 修改 | 供应商思考截断字数：默认 8000、解析与 G2 校验文案 |
| `apps/web/src/features/model-providers/use-model-providers.ts` | 修改 | 请求体带截断字数 |
| `apps/web/src/features/model-providers/components/model-provider-settings.tsx` | 修改 | 表单新增「思考截断字数」与说明（F2 确认文案），只加字段、未重排原文件 |
| `apps/web/src/lib/ai/__tests__/process.test.ts` | 修改 | 字段改 `id`；秒数、完成行、工具行尾部、结果条目字段 |
| `apps/web/src/features/ai/components/process/__tests__/process-area.test.tsx` | 修改 | 耗时、失败标识、无多余分隔符、桌面与移动链接、移动端最新一行、动画类、播报区 |
| `apps/web/src/features/ai/__tests__/use-chat-stream.test.tsx` | 修改 | 回放 Java 共享样例（含隐藏视图，B7）；断流与中止状态；动画帧合并；运行指标 |
| `apps/web/src/features/model-providers/__tests__/model-provider-settings.test.tsx` | 修改 | 默认值、说明文案与越界报错 |
| `apps/web/src/features/model-providers/__tests__/schemas.test.ts` | 修改 | 截断字数解析与校验 |
| `apps/web/src/features/model-providers/__tests__/use-model-providers.test.tsx` | 修改 | 请求体字段 |
| `apps/web/src/features/model-providers/__tests__/logical-model-settings.test.tsx` | 修改 | 供应商样例补新字段 |
| `apps/web/e2e/support/agent-process.ts` | 新增 | M8 要求的 Playwright 用例共享逻辑：流式中桌面全部行 / 移动端最新一行、完成行与播报、展开后思考与工具行、结果条目链接、重新进入会话回放一致；`E2E_AGENT_PROCESS=1` 才运行 |
| `apps/web/e2e/agent-process.spec.ts` | 新增 | 桌面入口，只在 `chromium` project 运行 |
| `apps/web/e2e/mobile-agent-process.spec.ts` | 新增 | 移动端入口，按文件名只在 `mobile` project 运行 |

## 契约生成物（openapi）

| 文件 | 状态 | 作用与原因 |
|---|---|---|
| `openapi/specs/ai.json` | 修改 | **生成物**（`pnpm openapi:generate`，CI `openapi-check.yml` 卡 diff）：事件数据类与过程视图等命名 schema、引用 / 用量强类型、管理端新字段、供应商截断字数 |
| `openapi/specs/note.json` | 修改 | **生成物**：批量可读性请求的约束 |

## 基础设施（infra）

| 文件 | 状态 | 作用与原因 |
|---|---|---|
| `infra/sql/migrations/2026-11-21-agent-trace-view-repair.sql` | 新增 | `a_agent_run` 三列与 `a_model_provider.process_reasoning_max_chars`，手动执行 |
| `infra/sql/anynote.sql` | 修改 | 全量建表语句同步上述列 |
| `infra/docker/nacos/configs/anynote-ai-harness.yml` | 修改 | 删除三个过程展示开关与 `process-reasoning-max-chars`（D3、M6） |
| `infra/.env.dev.local.example` | 新增 | dev 全栈环境变量样板，只含 `ANYNOTE_AI_CREDENTIAL_KEY`；实际文件 `.env.dev.local` 被 `.env.*.local` 规则忽略，主密钥不入库（H1） |
| `infra/docker-compose.dev.yaml` | 修改 | 头部注释的启动命令改为 `--env-file infra/.env.dev.local` |
| `infra/docker/README.md` | 修改 | 同上，dev 命令改用 `.env.dev.local` |

## 文档与约束

| 文件 | 状态 | 作用与原因 |
|---|---|---|
| `.claude/openspec/changes/2026-11-21-agent-trace-view-repair.md` | 新增 | 本批破坏性契约变更与拍板记录 |
| `.claude/openspec/changes/2026-11-18-agent-trace-view.md` | 修改 | 指向修复提案，订正原「已通过」表述（L1） |
| `docs/ai-refactor/AGENT_TRACE_VIEW_CODE_REVIEW.md` | 修改 | 新增第 0 节修复记录：拍板结论、逐项结果与偏差；M8 行指向 E2E 说明 |
| `docs/ai-refactor/AI_MILESTONES.md` | 修改 | M17 节补修复记录与 8.3 真实栈核对结果；Playwright 未完成原因更新并指向 E2E 说明 |
| `docs/ai-refactor/AGENT_TRACE_VIEW_PLAN.md` | 修改 | 文档头同步修复状态 |
| `docs/ai-refactor/README.md` | 修改 | 导航行同步修复状态，新增 E2E 说明一行 |
| `docs/changelist/2026-11-21-agent-trace-view-repair.md` | 新增 | 本文件 |
| `docs/ai-refactor/AGENT_TRACE_VIEW_E2E.md` | 新增 | Playwright 端到端验收说明：脚本化模型三轮输出、编排脚本临时配置与原样恢复、逐步断言与通过标准 |
| `CLAUDE.md` | 修改 | 新增约束：Java 原则上不用 `Map<String, Object>`（E4）；dev 命令改用 `--env-file infra/.env.dev.local` 并说明主密钥缺失或更换的后果；导航行同步修复状态并指向 E2E 说明 |
| `README.md` | 修改 | 场景 A 改用 `infra/.env.dev.local`：环境变量文件总览补两行、新增「A.0 准备 dev 环境文件」，场景 A 各条命令同步；场景 B 命令不启动 ai 容器，仍用 `/dev/null` |
| `.claude/skills/anynote-dev/SKILL.md` | 修改 | 操作手册的 dev 命令与 `--env-file` 警告同步 |

## 审计要点

1. **并发隔离（B1）**：`Harness` 上已无每次运行的可变状态，投影只经 `RunContext.process_view` 传递；`test_concurrent_runs_on_one_harness_do_not_cross` 是唯一覆盖并发的用例，改动循环或中间件链时重点看。
2. **对外字段只由类决定（E4）**：`AgentRunEventTypes` 是转发入口，新增事件或字段必须同时加数据类；`AgentLocatorVO` 只保留 17 个定位键，Python 新增定位键要同步，否则浏览器收不到。
3. **回放复核（M1、M2）**：`ChatMessageVO.from` 不再转换落库过程视图，会话详情只能经 `ProcessViewRecheck.recheckAll` 设置；note 不可用时只丢弃有依赖的视图。
4. **重试判定（B5）**：`body_emitted` 一旦置位就禁止重放；`think_tag` 下只有状态机吐出的正文才置位，改状态机时连同三种格式的矩阵用例一起看。
5. **破坏性变更面**：事件字段 `blockId/callId/noteId` 改为 `id`，`model.retry` 增加 `id`，历史请求删除 `ref/subtype`，供应商新增与更新多一个必填字段；前端、CLI 之外没有其他消费方（全仓检索确认）。dev 全栈命令改为 `--env-file infra/.env.dev.local`，新克隆需先从样板拷贝，主密钥更换后已保存的供应商 Key 需重新填写。
6. **用户可见文案**：本批新增文案均为 2026-11-21 确认清单（工具行耗时、失败标识、实体类型中文名、截断标注、完成行、播报、供应商表单三条），集中在 `process.ts`、`harness/view/middleware.py`、供应商 DTO 与 `schemas.ts`。
