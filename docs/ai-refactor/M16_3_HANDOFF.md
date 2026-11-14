# M16.3 note 知识访问层：暂停交接

> 交接时间：2026-11-14
> 当前分支：`dev`
> 状态：**实现与主要验证已完成，里程碑尚未关闭；用户要求暂停后续开发**
>
> 本文是任务交接记录，不代表 M16.3 已完成，也不替代最终的 changelist 和里程碑验收记录。

## 1. 当前结论

M16.3 的主体代码、内部端点、变更记录表、单元测试、真实事务测试和一轮完整 Docker E2E 已完成并通过。
当前仍有以下收尾工作未做：

1. 全 reactor `mvn test` 没有最终结果；联网重跑被用户暂停时主动停止。
2. 全 reactor 构建没有最终执行。
3. `AI_MILESTONES.md` 的 M16.3 任务尚未勾选，验收记录尚未回写。
4. `docs/changelist/2026-11-14-note-knowledge-access.md` 尚未生成。
5. `docs/ai-refactor/README.md` 与 `CLAUDE.md` 的 M16.3 状态尚未更新。
6. 多轮验证产生的账号、业务数据、Redis 数据、MinIO 对象及临时日志尚未清理。
7. 未提交、未切分支、未 push。

**暂停时不要让其它 agent 直接勾选 M16.3 完成。**

## 2. 用户已确认的契约，不得重新猜测

| 项目 | 用户选择 |
|---|---|
| 内部接口 | 方案 A：统一 `/internal/v1/knowledge` |
| 权限收拢 | 方案 A：既有详情行为不变；检索使用“列表可见且详情可读”的交集 |
| 导出与正文 | 方案 A：游标导出、标题/行/字幕时间范围、单次 20,000 Java 字符 |
| 结构化查询 | 方案 B：八类实体均支持通用白名单查询，另有 `MY_TASKS` |
| 视频总结 | 按推荐：AI 写总结后调用 note 登记；只取最新一条有效总结 |
| 错误文案 | 使用 `.claude/openspec/changes/2026-11-14-note-knowledge-access.md` §5 的已确认文案 |
| Docker 验证 | 允许在 dev MySQL 执行新迁移并创建、清理测试数据 |

其它已确定边界：

- `scope`、`authorize`、`content`、`outline`、`query` 使用 `@InnerAuth(isUser = true)`。
- `changes`、`export`、`docs/{id}/index-status`、`mooc-items/{moocItemId}/summary-changes` 只使用内部签名。
- D10：慕课检索同时满足列表可见与详情可读。
- D16：超管默认范围与普通成员相同；只有显式知识库或实体才使用超管范围。默认结构化查询必须按实际成员角色复核内容，不能因超管详情权限为 7 而读取同库他人私密笔记。
- 慕课通用权限的实际 Feign 调用只传 `userId` 并查真实成员关系，**没有超管特判**。不得根据调研中的概括给慕课新增管理员特权。
- 字幕经 file 服务读取；PDF 正文不从 note 的范围读取端点返回。
- 批量授权最多 100 个实体；导出每轮最多扫描 200 个基础实体；变更页最多 500 条；目录/查询页最大 100 条。
- AI 总结变更登记失败会回滚 AI 本地总结插入。极端情况下允许出现 note 多一条变更、AI 回滚，后续导出当前源状态即可消化。
- 新增或手写 MyBatis SELECT 使用显式 `resultMap`；当前 `KnowledgeChangeMapper.xml` 已落实。

## 3. 已完成实现

### 3.1 契约、数据库与内部端点

已新增：

- `.claude/openspec/changes/2026-11-14-note-knowledge-access.md`
- `infra/sql/migrations/2026-11-14-note-knowledge-change.sql`
- `services/note/src/main/java/com/anynote/note/controller/KnowledgeController.java`
- `services/note/src/main/resources/mapper/KnowledgeChangeMapper.xml`
- `infra/sql/anynote.sql` 中同步的 `n_knowledge_change` DDL
- `openapi/specs/note.json` 中 9 个内部路径，无旧路径删除

端点：

- `POST /internal/v1/knowledge/scope`
- `POST /internal/v1/knowledge/authorize`
- `POST /internal/v1/knowledge/content`
- `POST /internal/v1/knowledge/outline`
- `POST /internal/v1/knowledge/query`
- `GET /internal/v1/knowledge/changes`
- `POST /internal/v1/knowledge/export`
- `PUT /internal/v1/knowledge/docs/{id}/index-status`
- `POST /internal/v1/knowledge/mooc-items/{moocItemId}/summary-changes`

已在 Docker MySQL 执行：

- 新增的 `2026-11-14-note-knowledge-change.sql`
- 仓库既有的 `2026-09-25-note-collab-state.sql`，解决删除笔记时表不存在的问题

### 3.2 权限、实体与查询服务

新增服务及实现：

- `KnowledgeAccessService` / `KnowledgeAccessServiceImpl`
- `KnowledgeEntityService` / `KnowledgeEntityServiceImpl`
- `KnowledgeContentService` / `KnowledgeContentServiceImpl`
- `KnowledgeOutlineService` / `KnowledgeOutlineServiceImpl`
- `KnowledgeQueryService` / `KnowledgeQueryServiceImpl`
- `KnowledgeChangeService` / `KnowledgeChangeServiceImpl`

已完成：

- 笔记、资料、慕课详情权限收拢，现有笔记和资料入口委托统一计算。
- 慕课 `@RequiresMoocPermissions` 与新切面替代原通用 `n:mooc:*` 判定，避免 note 通过 HTTP 调用自身。
- 八类统一源文档、正文/元数据两个版本、ACL、父级和来源时间。
- 默认与显式检索范围、批量授权、不可读项不返回版本。
- Markdown 标题和行范围、SRT 时间范围、统一 offset 续读。
- 知识库目录、慕课直属条目、Markdown 大纲。
- 八类实体白名单查询、日期/状态过滤、稳定排序、权限过滤后计数与 limit。
- `MY_TASKS` 返回本人提交状态、笔记和历史版本。
- 同一慕课条目存在多条历史正文时，读取层按 `updateTime`、`id` 选择最新一条；没有改既有写入逻辑。

共享权限矩阵：

- `services/note/src/test/resources/knowledge/access-matrix.json`
- 当前 Java 动态测试读取；M16.5 的 Python 预过滤测试应继续读取同一文件。

### 3.3 变更写路径

`n_knowledge_change` 记录 `CREATE / UPDATE / DELETE`，已与下列写入接入：

- 笔记：新建、保存、协同写回、删除、任务提交和退回的权限变化。
- 资料：两种创建、删除、手动重新索引。
- 慕课：新建、更新、删除。
- 条目：单个/批量新建、更新、批量删除。
- 字幕：Whisper 回写。
- 任务：实际存在的新建、更新、提交和退回；没有虚构任务删除端点。
- 知识库：新建、更新、删除。
- 视频总结：`services/ai` 写入后通过 `RemoteMoocService.recordSummaryChange` 调用 note。

其它相关改动：

- `DocMessageListener` 不再调用不存在的 RAG 索引端点；重新索引改为资料 `UPDATE`。
- 资料索引状态回写不产生变更，避免循环。
- AI 总结本地事务内先插入，再调用 note；失败使用既有内部服务错误并回滚。
- `RemoteMoocFallbackFactory` 已补降级返回。

## 4. 已完成的验证

| 验证 | 实际结果 |
|---|---|
| `mvn test -pl note` | **212/212，BUILD SUCCESS**（最后一次通过） |
| `mvn test -pl ai` | **46/46，BUILD SUCCESS** |
| `KnowledgeChangeServiceImplIntegrationTest` | **1/1，真实 Spring/MySQL 提交与回滚通过** |
| 最终 Docker E2E | **通过**：8 类导出和查询、内部签名、缺签名/缺令牌拒绝、权限负例、提交退回、字幕时间范围、资料索引状态、重新索引、删除游标 |
| OpenAPI | 标准 `openapi/generate.sh` 成功；`note.json` 增加 9 个路径、0 删除，其余 5 份 baseline 不变 |
| 当前容器 | note、AI、Gateway、Auth、System、File、Notify、MySQL、Redis、Nacos、ES、RocketMQ、MinIO 均为 healthy |

最终 E2E 输出：

```text
verify entity kb
verify entity note
verify entity doc
verify entity mooc
verify entity mooc_item
verify entity transcript
verify entity summary
verify entity task
M16.3 Docker E2E passed
```

最后一次临时脚本结果在 `tmp/m16-3/result.json`，其中 `success=true`，保存了本轮实体 id 和测试用户名，不含访问令牌。

### 全 reactor 验证状态

- 第一次 `mvn -o test` 因 Docker 卷缺少 `spring-boot-starter-webflux` 在依赖解析阶段停止，未进入该模块测试。
- 随后改为联网 `mvn test` 补齐依赖。
- 用户要求暂停时，该联网全量任务被主动停止，**没有通过或失败结论**。

## 5. 当前工作区事实

暂停时 `git status --short --branch` 为 `dev...origin/dev`，工作区不干净：

- 已跟踪修改：22 个文件，`+291 / -133`。
- 未跟踪新增：58 个文件。
- 本交接文档本身随后会再增加一个未跟踪文件。

没有修改 `AI_MILESTONES.md` 的 M16.3 勾选状态，也没有创建 changelist、提交或推送。

## 6. 暂停时的环境与数据

以下容器仍在运行且 healthy，note 已包含“多条条目正文取最新”的最后修正：

- `anynote-anynote-modules-note-1`
- `anynote-anynote-modules-ai-1`
- Gateway / Auth / System / File / Notify
- MySQL / Redis / Nacos / Elasticsearch / RocketMQ / MinIO

`tmp/m16-3/` 目前是被 gitignore 的临时工作目录，包含：

- `verify.py`：完整 E2E 脚本。
- `result.json`：最后一轮成功结果和测试 id。
- `note-old.json`：OpenAPI 旧 baseline 对比副本。
- `bin/curl`、`bin/pnpm`：为非 root web 容器提供的临时兼容入口。
- 多份 `note-*.log` 调试日志。

**这些不是交付物，最终复核后应删除；在清理前不要删除 result.json，它用于精确清理测试数据。**

验证中产生过多轮失败账号、知识库、笔记、任务、慕课、条目、资料、变更记录、Redis 任务上下文和 MinIO 对象。最后一轮账号已登出，但早期失败轮次保留的会话和全部业务/对象数据尚未清理。

## 7. 已确认的既有问题，不要顺手修复

| 问题 | 当前处理 |
|---|---|
| `POST /docs/pdfs` 直接创建资料时，`n_doc.index_status` 无默认值导致插入失败 | 已确认发生在既有 insert 和本批变更记录之前。`createPDF` 有 Mock Service 单测；未修改该既有缺陷。 |
| MinIO 临时签名接口返回 `MinIO 请走分片上传任务流程` | 未修改限制。`completeDocUpload` 通过真实 file 上传和既有 Redis 上传缓存契约完成验证。 |
| 资料英文名翻译 Feign 调用失败，旧 AI 翻译端点在 M16.2 已删除 | 与本批知识访问层无关，未修改。日志中会出现重试。 |
| 删除笔记初期缺少 `n_note_collab_state` | 已在 dev 环境执行仓库既有迁移，未改代码。 |
| 条目更新可能留下多条正文 | 只在新读取层选择最新记录，没有改既有写入逻辑。 |

后续 agent 不应把上述问题包装成“全仓门禁全绿”，也不应未经用户确认扩大范围修复。

## 8. 建议续作顺序

1. 阅读本文与 `.claude/openspec/changes/2026-11-14-note-knowledge-access.md`，不要重新设计已确认契约。
2. 先检查 `git status`，不要覆盖或丢弃当前未提交改动；本交接文档也应保留供复核。
3. 完成全 reactor `mvn test` 和 `mvn install -DskipTests`；上一次联网全量被暂停，需重新取得真实结果。
4. 如代码再改动，重跑 `mvn test -pl note`、`mvn test -pl ai` 与事务集成测试。
5. 重新执行 OpenAPI 生成并核对只有预期差异。当前临时兼容入口仍在 `tmp/m16-3/bin/`，使用前需 `chmod +x`，且应继续使用非 root 容器。
6. 若实现未变化，可引用已通过的最终 E2E；若有变化，重跑 `tmp/m16-3/verify.py`，再核对所有变更游标。
7. 按 `result.json` 和测试前缀做**精确清理**：
   - 删除本批测试账号、角色关系、知识库及其笔记/任务/慕课/条目/资料。
   - 删除对应文件行、Redis 会话和 ASR 上下文、MinIO 临时对象。
   - `n_knowledge_change` 只删除本批测试知识库对应记录，禁止整表清空。
   - 早期失败轮次也要清理，不能只清最后一轮。
8. 删除 `tmp/m16-3/` 临时脚本、日志和兼容入口；不要提交这些验证产物。
9. 按 `docs/changelist/README.md` 重新获取 Git 实际统计并生成 `docs/changelist/2026-11-14-note-knowledge-access.md`，包括逐文件表、验证结果和审计要点。
10. 回写 `AI_MILESTONES.md` M16.3 勾选与验收记录，再同步 `docs/ai-refactor/README.md`、`CLAUDE.md` 状态。
11. 最终复核 `git diff --check`、`git status`、OpenAPI baseline 和新增 SQL 的 `resultMap`，然后才向用户报告结果；是否提交由用户另行决定。

## 9. 可复用命令

### 单测

```bash
MSYS_NO_PATHCONV=1 docker run --rm \
  -v "C:/Users/YXLMz/code/anynote:/workspace" \
  -v "anynote-maven-repo:/root/.m2" \
  -w /workspace/services maven:3.9.11-eclipse-temurin-21 \
  mvn -pl note,ai test
```

### 真实事务集成测试

```bash
MSYS_NO_PATHCONV=1 docker run --rm --network anynote_anynote-net \
  -v "C:/Users/YXLMz/code/anynote:/workspace" \
  -v "anynote-maven-repo:/root/.m2" \
  -e SPRING_CLOUD_NACOS_DISCOVERY_SERVER_ADDR=nacos:8848 \
  -e SPRING_CLOUD_NACOS_CONFIG_SERVER_ADDR=nacos:8848 \
  -w /workspace/services maven:3.9.11-eclipse-temurin-21 \
  mvn -pl note -Dtest=KnowledgeChangeServiceImplIntegrationTest \
  -Dtest.excluded.groups= test
```

### OpenAPI

```bash
MSYS_NO_PATHCONV=1 docker run --rm --network anynote_anynote-net \
  -v "C:/Users/YXLMz/code/anynote:/workspace" \
  -w /workspace --entrypoint sh anynote/anynote-web:local -lc \
  'export PATH=/workspace/tmp/m16-3/bin:$PATH; cd openapi && GATEWAY_URL=http://anynote-gateway:8080 ./generate.sh'
```

### 最终 E2E

```bash
MSYS_NO_PATHCONV=1 docker run --rm --network anynote_anynote-net \
  -v "C:/Users/YXLMz/code/anynote/tmp/m16-3:/work" \
  -w /work python:3.12.14-slim python -u verify.py
```

## 10. 暂停时后台状态

用户要求暂停后，联网全 reactor 测试已主动停止；没有其它仍在运行的开发或验证任务。
没有提交、推送、创建新分支或执行 Git 历史修改。
