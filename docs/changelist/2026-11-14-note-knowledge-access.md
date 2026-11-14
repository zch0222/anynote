# 2026-11-14 AI 模块 M16.3：note 知识访问层与变更游标

> 里程碑：[`docs/ai-refactor/AI_MILESTONES.md`](../ai-refactor/AI_MILESTONES.md) M16.3
> 契约：[`.claude/openspec/changes/2026-11-14-note-knowledge-access.md`](../../.claude/openspec/changes/2026-11-14-note-knowledge-access.md)
> 方案：[`docs/ai-refactor/KNOWLEDGE_RETRIEVAL_PLAN.md`](../ai-refactor/KNOWLEDGE_RETRIEVAL_PLAN.md) §4–§6
> 分支：`dev`（按用户要求未新切分支）

## 概览

| 指标 | 数值 |
|---|---|
| 变更文件 | 88 个：新增 63 / 修改 25 / 删除 0（含本清单） |
| 已跟踪文件行数 | +363 / −148（`git diff --shortstat`，不含新增文件） |
| 新增文件行数 | 7016 行（按 `git ls-files --others --exclude-standard` 逐文件统计，含本清单 156 行） |
| 主要目录分布 | `services/note` 75 个（主代码 49、测试 26）、`services/api` 与 `services/ai` 4 个、`infra` 2 个、契约/生成物/文档 7 个 |

note 服务新增 `/internal/v1/knowledge` 下 9 个内部端点，成为检索范围、指定用户可读性、权威正文、目录、结构化查询、源文档导出和变更游标的唯一提供方；笔记、资料、慕课详情权限收拢到 `KnowledgeAccessService`；新增 `n_knowledge_change` 表，并在八类实体的既有写路径上与业务写入同事务登记变更；AI 保存视频总结后经 Feign 登记变更。

### 验证结果

| 命令 / 场景 | 实际结果 |
|---|---|
| Docker 全 reactor `mvn test` | 30 个模块全部 SUCCESS；`services/note` 230/230（含本批写路径变更用例），`services/ai` 46/46 |
| Docker 全 reactor `mvn clean install -DskipTests` | 30 个模块全部 SUCCESS |
| Docker 事务集成测试 `KnowledgeChangeServiceImplIntegrationTest` | 1/1：真实 Spring/MySQL 下提交的变更可查、业务异常后回滚不留记录；结束后 `n_knowledge_change` 为 0 行 |
| 权限矩阵 `access-matrix.json` | 59 条用例（笔记 18、资料 14、慕课 14、任务 7、知识库 6）全部通过 |
| Docker 真实栈 E2E（Gateway/Auth/note/file/MySQL/Redis/MinIO） | 通过：八类实体导出与结构化查询、缺内部签名与缺用户令牌拒绝、跨用户不可读、任务提交与退回、字幕时间范围、资料索引状态回写不产生变更、重新索引，以及笔记、资料、慕课、条目、知识库的删除游标。E2E 在最后一次实现改动后执行（note 镜像 22:16 构建晚于 22:10 的最后实现修改）；其后只有测试新增、import 与 Javadoc 整理，未重跑 |
| OpenAPI | Docker 内标准 `openapi/generate.sh`：5 份 baseline 重写后字节不变；`note.json` 写回时 Windows 绑定挂载返回 `EINVAL`，改为在容器内用同一 `normalize-cli.mjs` 输出到临时文件逐字节比对，6 份均与工作区 baseline 一致。`note.json` 相对 `HEAD`：新增 9 个路径、28 个 schema、1 个标签，删除与修改 0 |
| 测试数据清理 | 以 26 个 `M16.3测试` 账号与其 11 个知识库为锚点，单事务按显式 id 删除 MySQL 23 张表共 638 行（含 `n_knowledge_change` 198 行，均属测试知识库，未整表清空），另删 Redis 57 个键、MinIO 14 个对象、ES `note` 索引 18 篇；M16.0/M16.1 的 13 个账号未动 |

## services/note：知识访问层（新增）

| 文件 | 状态 | 作用与原因 |
|---|---|---|
| `services/note/src/main/java/com/anynote/note/controller/KnowledgeController.java` | 新增 | 9 个内部端点；用户端点用 `@InnerAuth(isUser = true)`，变更、导出、索引状态、总结登记只要内部签名，供 Python 检索与索引 worker 调用 |
| `services/note/src/main/java/com/anynote/note/service/KnowledgeAccessService.java` | 新增 | 定义替指定用户计算详情权限、列表可见、检索可读、批量授权与检索范围的契约，取代各处从当前请求取用户 |
| `services/note/src/main/java/com/anynote/note/service/impl/KnowledgeAccessServiceImpl.java` | 新增 | 收拢笔记、资料、慕课三套详情规则并实现 D10 交集与 D16 超管默认范围；慕课只按实际成员关系，不加超管特判 |
| `services/note/src/main/java/com/anynote/note/service/KnowledgeEntityService.java` | 新增 | 定义八类实体统一源文档的读取、按类型游标导出与分页读取契约 |
| `services/note/src/main/java/com/anynote/note/service/impl/KnowledgeEntityServiceImpl.java` | 新增 | 组装统一源文档与正文/元数据两个 SHA-256 版本；字幕经 file 服务读取、总结经 AI 服务读取，同一条目多条正文取最新一条 |
| `services/note/src/main/java/com/anynote/note/service/KnowledgeContentService.java` | 新增 | 定义可读实体的正文范围读取契约 |
| `services/note/src/main/java/com/anynote/note/service/impl/KnowledgeContentServiceImpl.java` | 新增 | 实现标题/行/SRT 时间范围与统一 offset 续读，单次 20,000 字符，不可读与不存在统一返回同一文案 |
| `services/note/src/main/java/com/anynote/note/service/KnowledgeOutlineService.java` | 新增 | 定义知识库目录、慕课直属条目与 Markdown 大纲的读取契约 |
| `services/note/src/main/java/com/anynote/note/service/impl/KnowledgeOutlineServiceImpl.java` | 新增 | 节点先逐条可读性确认再计数分页，避免分页结果泄露不可读条目数量 |
| `services/note/src/main/java/com/anynote/note/service/KnowledgeQueryService.java` | 新增 | 定义八类实体白名单查询与 `MY_TASKS` 命名查询契约 |
| `services/note/src/main/java/com/anynote/note/service/impl/KnowledgeQueryServiceImpl.java` | 新增 | 校验过滤器、日期与排序白名单，权限过滤后再计数与截断；超管默认查询按实际成员角色复核内容 |
| `services/note/src/main/java/com/anynote/note/service/KnowledgeChangeService.java` | 新增 | 定义同事务登记变更、游标分页、资料索引状态回写与视频总结登记契约 |
| `services/note/src/main/java/com/anynote/note/service/impl/KnowledgeChangeServiceImpl.java` | 新增 | 写入 `n_knowledge_change` 并按主键游标分页；索引状态回写不产生变更，避免与 worker 形成循环 |
| `services/note/src/main/java/com/anynote/note/mapper/KnowledgeChangeMapper.java` | 新增 | 声明游标分页与最新游标两个查询 |
| `services/note/src/main/resources/mapper/KnowledgeChangeMapper.xml` | 新增 | 两个新增 SELECT 使用显式 `resultMap`，满足新增 SQL 映射约束 |
| `services/note/src/main/java/com/anynote/note/datascope/aspect/RequiresMoocPermissionsAspect.java` | 新增 | 替代通用 `n:mooc:*` 判定，在 note 内调用统一权限服务，避免 note 经 HTTP 调用自身；参数上下文与异常沿用原通用切面 |
| `services/note/src/main/java/com/anynote/note/constant/KnowledgeErrorConstants.java` | 新增 | 集中 OpenSpec §5 中用户已确认的错误文案 |
| `services/note/src/main/java/com/anynote/note/enums/KnowledgeEntityType.java` | 新增 | 八种实体类型与六种 ref 前缀的解析，非法值统一抛参数错误 |
| `services/note/src/main/java/com/anynote/note/enums/KnowledgeSubtype.java` | 新增 | 字幕、总结两种条目附属类型的解析与实体类型映射 |
| `services/note/src/main/java/com/anynote/note/enums/KnowledgeOperation.java` | 新增 | 固定 `CREATE`/`UPDATE`/`DELETE` 三种变更操作 |
| `services/note/src/main/java/com/anynote/note/enums/KnowledgeQueryName.java` | 新增 | 命名查询白名单，目前仅 `MY_TASKS` |
| `services/note/src/main/java/com/anynote/note/model/bo/KnowledgeRef.java` | 新增 | 解析 `ref + subtype` 并校验 id，统一实体引用的构造与基础类型换算 |
| `services/note/src/main/java/com/anynote/note/utils/KnowledgeMarkdownUtil.java` | 新增 | 提取 ATX 标题（跳过代码块）并按原始换行截取行范围，供正文与大纲共用 |
| `services/note/src/main/java/com/anynote/note/model/po/KnowledgeChangePO.java` | 新增 | 映射 `n_knowledge_change` |
| `services/note/src/main/java/com/anynote/note/model/dto/KnowledgeScopeDTO.java` | 新增 | 检索范围请求：显式知识库与实体 ref |
| `services/note/src/main/java/com/anynote/note/model/dto/KnowledgeAuthorizeDTO.java` | 新增 | 批量授权请求，限制 1–100 项 |
| `services/note/src/main/java/com/anynote/note/model/dto/KnowledgeContentDTO.java` | 新增 | 正文读取请求：标题、行、字幕时间与 offset |
| `services/note/src/main/java/com/anynote/note/model/dto/KnowledgeOutlineDTO.java` | 新增 | 目录请求：根实体、父条目与分页 |
| `services/note/src/main/java/com/anynote/note/model/dto/KnowledgeQueryDTO.java` | 新增 | 结构化查询请求：实体、命名查询、过滤器、排序、条数与计数开关 |
| `services/note/src/main/java/com/anynote/note/model/dto/KnowledgeExportDTO.java` | 新增 | 导出请求：实体类型、知识库、游标与扫描上限 |
| `services/note/src/main/java/com/anynote/note/model/dto/KnowledgeIndexStatusDTO.java` | 新增 | 资料索引状态回写请求 |
| `services/note/src/main/java/com/anynote/note/model/vo/KnowledgeScopeVO.java` | 新增 | 检索范围响应：超管标记、默认范围标记与知识库成员范围 |
| `services/note/src/main/java/com/anynote/note/model/vo/KnowledgeAuthorizationVO.java` | 新增 | 批量授权响应外壳，与输入同序 |
| `services/note/src/main/java/com/anynote/note/model/vo/KnowledgeAuthorizationItemVO.java` | 新增 | 单项授权结果；不可读项不带版本与知识库 |
| `services/note/src/main/java/com/anynote/note/model/vo/KnowledgeContentVO.java` | 新增 | 正文片段、截断标记、续读偏移与版本元数据 |
| `services/note/src/main/java/com/anynote/note/model/vo/KnowledgeOutlineVO.java` | 新增 | 目录节点分页，标题节点带行定位 |
| `services/note/src/main/java/com/anynote/note/model/vo/KnowledgeQueryVO.java` | 新增 | 查询行与可选计数 |
| `services/note/src/main/java/com/anynote/note/model/vo/KnowledgeChangePageVO.java` | 新增 | 变更页、`nextCursor` 与 `latestCursor` |
| `services/note/src/main/java/com/anynote/note/model/vo/KnowledgeExportVO.java` | 新增 | 导出页、`nextAfterId` 与 `hasMore` |
| `services/note/src/main/java/com/anynote/note/model/vo/KnowledgeSourceDocumentVO.java` | 新增 | OpenSpec §1.2 统一源文档，含 ACL、版本与来源时间 |

## services/note：既有入口与写路径接入（修改）

| 文件 | 状态 | 作用与原因 |
|---|---|---|
| `services/note/src/main/java/com/anynote/note/service/impl/NoteServiceImpl.java` | 修改 | `getNotePermissions` 委托统一权限计算（行为不变）；新建、删除登记笔记变更 |
| `services/note/src/main/java/com/anynote/note/service/NoteChangePublisher.java` | 修改 | 公开保存与协同写回共用的发布点先登记笔记 `UPDATE`，两条写入路径同口径 |
| `services/note/src/main/java/com/anynote/note/service/impl/DocServiceImpl.java` | 修改 | `getDocPermissions` 委托统一计算；两种创建与删除加事务并登记变更，新建不再发送旧 RAG 索引消息 |
| `services/note/src/main/java/com/anynote/note/listener/DocMessageListener.java` | 修改 | 删除调用不存在 RAG 端点的索引代码，重新索引消息只登记资料 `UPDATE`；英文名翻译保持不变 |
| `services/note/src/main/java/com/anynote/note/service/impl/MoocServiceImpl.java` | 修改 | 慕课各入口改用 `@RequiresMoocPermissions`；慕课、条目增删改与字幕回写同事务登记变更 |
| `services/note/src/main/java/com/anynote/note/service/impl/MoocItemServiceImpl.java` | 修改 | 条目详情改用 note 内慕课权限切面，与慕课入口同一判定 |
| `services/note/src/main/java/com/anynote/note/datascope/annotation/RequiresMoocPermissions.java` | 修改 | 由空注解补全为带权限阈值、id 属性名与参数名的运行时注解，供新切面读取 |
| `services/note/src/main/java/com/anynote/note/service/impl/KnowledgeBaseServiceImpl.java` | 修改 | 知识库新建、更新、删除登记变更，更新补事务 |
| `services/note/src/main/java/com/anynote/note/service/impl/NoteTaskServiceImpl.java` | 修改 | 任务新建、更新登记任务变更；提交与退回改笔记权限时同时登记笔记与任务 `UPDATE` |

## services/note：测试

| 文件 | 状态 | 作用与原因 |
|---|---|---|
| `services/note/src/test/resources/knowledge/access-matrix.json` | 新增 | 实体 × 权限串 × 角色 × 列表范围的共享权限矩阵，M16.5 Python 预过滤测试读取同一文件 |
| `services/note/src/test/java/com/anynote/note/service/impl/KnowledgeAccessServiceImplMatrixTest.java` | 新增 | 动态读取矩阵逐条断言详情权限、列表可见与最终可读性 |
| `services/note/src/test/java/com/anynote/note/service/impl/KnowledgeAccessServiceImplTest.java` | 新增 | 覆盖超管默认/显式范围、非成员显式范围、批量授权顺序与隐藏版本、附属内容继承、未归档笔记、非法 ref |
| `services/note/src/test/java/com/anynote/note/service/impl/KnowledgeEntityServiceImplTest.java` | 新增 | 覆盖八类源文档读取、版本、多条正文取最新、总结取最新、导出游标与 `hasMore` |
| `services/note/src/test/java/com/anynote/note/service/impl/KnowledgeContentServiceImplTest.java` | 新增 | 覆盖标题与行范围、截断续读、字幕时间重叠、不可读与非法范围文案 |
| `services/note/src/test/java/com/anynote/note/service/impl/KnowledgeOutlineServiceImplTest.java` | 新增 | 覆盖分页前过滤不可读节点、大纲顺序与行定位、页大小超限 |
| `services/note/src/test/java/com/anynote/note/service/impl/KnowledgeQueryServiceImplTest.java` | 新增 | 覆盖权限过滤后计数、白名单拒绝、`MY_TASKS`、未归档笔记与超管默认查询复核 |
| `services/note/src/test/java/com/anynote/note/service/impl/KnowledgeChangeServiceImplTest.java` | 新增 | 覆盖变更写入格式、空页游标、索引状态校验与总结登记的知识库解析 |
| `services/note/src/test/java/com/anynote/note/service/impl/KnowledgeChangeServiceImplIntegrationTest.java` | 新增 | `@Tag("integration")` 真实库验证变更随业务事务提交与回滚，自行清理提交行 |
| `services/note/src/test/java/com/anynote/note/controller/KnowledgeControllerTest.java` | 新增 | 覆盖五个用户端点与四个服务间端点的委托，并断言各端点 `@InnerAuth` 的 `isUser` 取值 |
| `services/note/src/test/java/com/anynote/note/datascope/aspect/RequiresMoocPermissionsAspectTest.java` | 新增 | 固定慕课切面写入权限上下文与低于阈值抛未授权的既有行为 |
| `services/note/src/test/java/com/anynote/note/listener/DocMessageListenerTest.java` | 新增 | 断言重新索引消息只登记资料 `UPDATE` |
| `services/note/src/test/java/com/anynote/note/service/impl/DocServiceImplGetDocPermissionsTest.java` | 新增 | 固定资料作者取最大值、匿名取第五位、超管 MANAGE 的既有规则 |
| `services/note/src/test/java/com/anynote/note/service/impl/DocServiceImplKnowledgeChangeTest.java` | 新增 | 断言两种创建与删除登记资料变更，并保留英文名翻译消息 |
| `services/note/src/test/java/com/anynote/note/service/impl/MoocServiceImplKnowledgeChangeTest.java` | 新增 | 断言慕课增删改、条目单个/批量新建、更新、级联删除与字幕回写的变更，未删除时不登记 |
| `services/note/src/test/java/com/anynote/note/service/impl/KnowledgeBaseServiceImplKnowledgeChangeTest.java` | 新增 | 断言知识库新建、更新、删除登记变更，更新失败不登记 |
| `services/note/src/test/java/com/anynote/note/service/impl/NoteServiceImplKnowledgeChangeTest.java` | 新增 | 断言笔记新建与删除按所属知识库登记变更 |
| `services/note/src/test/java/com/anynote/note/service/impl/NoteTaskServiceImplKnowledgeChangeTest.java` | 新增 | 断言任务新建、更新、提交与退回登记的笔记和任务变更 |
| `services/note/src/test/java/com/anynote/note/utils/KnowledgeMarkdownUtilTest.java` | 新增 | 覆盖代码块中的井号不算标题与行边界保留 |
| `services/note/src/test/java/com/anynote/note/service/NoteChangePublisherTest.java` | 修改 | 适配新构造参数并断言保存时登记笔记 `UPDATE` |
| `services/note/src/test/java/com/anynote/note/service/impl/NoteServiceImplGetNotePermissionsTest.java` | 修改 | 注入真实 `KnowledgeAccessServiceImpl`，原有用例不改即验证委托后行为不变 |
| `services/note/src/test/java/com/anynote/note/service/impl/NoteServiceImplCollabGrantTest.java` | 修改 | 注入真实 `KnowledgeAccessServiceImpl`，协同准入用例走委托后的权限计算 |
| `services/note/src/test/java/com/anynote/note/service/impl/KnowledgeBaseServiceImplDeleteTest.java` | 修改 | 注入变更服务桩，适配删除路径新增的依赖 |
| `services/note/src/test/java/com/anynote/note/service/impl/NoteCollabServiceImplTest.java` | 修改 | 适配 `NoteChangePublisher` 新构造参数 |
| `services/note/src/test/java/com/anynote/note/service/impl/NoteServiceImplDeleteNoteTest.java` | 修改 | 注入变更服务桩并适配发布器构造参数 |
| `services/note/src/test/java/com/anynote/note/service/impl/NoteServiceImplEditNoteTest.java` | 修改 | 适配 `NoteChangePublisher` 新构造参数 |

## services/api 与 services/ai：视频总结登记

| 文件 | 状态 | 作用与原因 |
|---|---|---|
| `services/api/anynote-api-note/src/main/java/com/anynote/note/api/RemoteMoocService.java` | 修改 | 新增 `recordSummaryChange` Feign 方法调用 note 的总结登记端点 |
| `services/api/anynote-api-note/src/main/java/com/anynote/note/api/factory/RemoteMoocFallbackFactory.java` | 修改 | 新方法降级返回 `INNER_NOTE_SERVICE_ERROR`，不抛异常以免破坏熔断器 |
| `services/ai/src/main/java/com/anynote/ai/service/impl/ChatServiceImpl.java` | 修改 | 视频总结在本地短事务内插入后登记 note 变更，登记失败回滚本地插入，外层沿用原日志处理 |
| `services/ai/src/test/java/com/anynote/ai/service/impl/ChatServiceImplTest.java` | 修改 | 断言总结落库后以内部调用标识登记变更 |

## infra 与契约

| 文件 | 状态 | 作用与原因 |
|---|---|---|
| `infra/sql/migrations/2026-11-14-note-knowledge-change.sql` | 新增 | 幂等创建 `n_knowledge_change`（主键游标、`(kb,id)` 与 `(type,id)` 索引），需手动执行 |
| `infra/sql/anynote.sql` | 修改 | 同步全量建库脚本中的 `n_knowledge_change` DDL |
| `.claude/openspec/changes/2026-11-14-note-knowledge-access.md` | 新增 | 实现前固定实体标识、权限口径、9 个端点、变更写路径与已确认错误文案 |
| `openapi/specs/note.json` | 修改·生成物 | 标准 `openapi/generate.sh` 产出；新增 9 个内部路径与 28 个 schema、无删除，`openapi-check` 会卡 baseline diff |

## 文档

| 文件 | 状态 | 作用与原因 |
|---|---|---|
| `docs/ai-refactor/AI_MILESTONES.md` | 修改 | 勾选 M16.3 任务并回写验收记录、与方案的偏差和未修改的既有问题 |
| `docs/ai-refactor/README.md` | 修改 | 状态更新为 M16.0–M16.3 完成、M16.4 可开工 |
| `CLAUDE.md` | 修改 | 同步 `docs/ai-refactor/` 导航中的里程碑状态 |
| `docs/ai-refactor/M16_3_HANDOFF.md` | 新增 | M16.3 暂停时的交接记录与续作依据；内容停留在暂停时点，完成状态以本清单与里程碑验收记录为准 |
| `docs/changelist/2026-11-14-note-knowledge-access.md` | 新增 | 按实际 Git 结果提供本批逐文件审计清单与验证证据 |

## 审计要点

1. **权限收拢不改现有行为**：`getNotePermissions`、`getDocPermissions` 与慕课切面都委托 `KnowledgeAccessServiceImpl`，重构前行为由单测与 59 条矩阵固定；慕课按实际成员关系计算，与原 Feign 通用判定一致，没有新增超管特权。
2. **检索交集与超管口径（D10/D16）**：检索可读 = 列表可见 ∩ 详情 ≥ 4；超管默认范围只含自己加入的知识库，只有显式知识库或实体才扩展；默认结构化查询按实际成员角色复核，不会因超管详情权限 7 读到他人私密笔记。
3. **用户身份与服务间端点边界**：`scope/authorize/content/outline/query` 要求签名且要求用户令牌；`changes/export/index-status/summary-changes` 只要签名、可读任意内容，只给索引 worker 用（启用索引时的独立密钥要求在 M16.4 落实）。
4. **变更与业务同事务**：所有登记都在既有写事务内，多处方法为此补了 `@Transactional`；事务回滚不留记录已由真实库集成测试验证。AI 总结是跨服务调用，极端情况下 note 可能多一条变更而 AI 回滚，按契约由后续导出当前源状态消化。
5. **不可读与不存在不可区分**：授权对不可读项不返回版本与知识库，正文对两种情况返回同一 `A0404` 文案，目录与查询在计数和分页前过滤，避免泄露存在性与数量。
6. **验证口径**：E2E 未覆盖直接 `POST /docs/pdfs` 创建（既有 `index_status` 无默认值导致插入先失败），该路径与协同写回、批量新建条目、退回的变更由单测覆盖；AI 端总结登记仅单测覆盖，E2E 直接调用了 note 端点。
