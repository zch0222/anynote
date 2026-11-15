# M16.4 修复复验记录

> 日期：2026-11-15（Asia/Hong_Kong）  
> 分支与基线：`dev@731431d18772db9294da4415dabc5bdd7b1837be` 加本次未提交修改  
> 结论：核心修复、固定九类真实语料、实际更新时延与精确清理均已通过；**用户明确将真实模型语义评测移至 M16.8，M16.4 按调整后的验收范围关闭**。  
> 依据：[独立失败验收](M16_4_ACCEPTANCE_AUDIT.md)、[修复契约](../../.claude/openspec/changes/2026-11-15-indexing-integrity-repair.md)。原报告和历史 changelist 保留。

## 1. 工作范围与已确认行为

用户已允许保留原未跟踪验收报告，在当前分支继续修改；功能修复期间未切分支、未推送。本轮继续确认：允许 manifest 限定的补种和物理清理，暂停并恢复现有 `anynote-ai-indexer`；新增错误、日志和命令帮助模板全部按原文批准。为修复真实 PDF 创建阻断，note 服务已在本机 Docker 重建并部署一行初始化修复；现有 Worker 仍未部署本次索引代码。功能修改与复验完成后，用户进一步明确将真实 Embedding 语义评测移至 M16.8，并关闭 M16.4；该收尾只修改文档，未重跑全量测试。

最终源文件校验清单位于 `tmp/m16-4-repair/source-sha256.txt`，包含 34 个本次变更/新增的源码、测试、固定语料、测试依赖及 Nacos 配置文件。按路径排序，每行格式为 `sha256 + 两个空格 + 仓库相对路径`，UTF-8/LF；该清单自身 SHA-256 为 `cdbcc09443c41ccd2c0e035260382b7b6db0ed51415a9f1e50e6c847a8a135b4`。最终功能修改后已复跑测试、固定九类验收及真实源探针；之后仅修改文档。

- on→off 停止新向量计算与语义检索，保留已有向量和物理 profile；同模型同维度重新启用后对账补齐，换模型或维度要求 rebuild。
- Embedding 输入为标题、完整标题路径与正文；标题变化重嵌，权限变化且内容完整时只更新元数据。
- 超长代码、表格整体保留并告警；SRT 使用 60 秒窗口及最大 5 秒相邻间隔，单条超限保持原文和时间。
- 本机 Docker 中执行项目测试与验证。Python 新方法及测试沿用 docstring，作者为“称霸幼儿园”；Java 仅为直接 PDF 创建补充 `NOT_INDEXED(3)` 初始化及既有测试断言，没有新增 SQL。
- 固定验收的 MySQL/MinIO 驱动只加入测试依赖与测试镜像，生产 Worker 运行依赖不变；权威业务读取仍走内部 API，直接数据库访问仅用于已授权的补种和清理。
- 界面新增文案已确认：`关闭后将停用语义检索和向量计算；已有向量保留，重新启用后执行索引对账补齐。`

## 2. F01–F10 修复结果

| ID | 修改与证据 | 当前判定 |
|---|---|---|
| F01 | 检查 bulk 整体与逐项结果及响应数量；新代际写入、核验、发布后才清旧代际；写入失败不回写成功、不提交失败页游标 | 单测和真实 ES 故障回归通过 |
| F02 | item 保存数量、generation、规则版本；对账核验源集合、双版本、分片数量/代际/可读性/向量覆盖及 chunk-only 孤儿，修复后独立复核；rebuild 使用唯一 attempt，核验后激活 | 缺片、多片、错版本、孤儿、重试、别名响应丢失等真实 ES 回归通过 |
| F03 | 关闭开关与物理向量 profile 分开；关闭后可增量/重建，重开补向量，更换模型或维度拒绝混写 | 使用确定性向量替身及真实 ES 验证；未调用真实供应商 |
| F04 | schema 3、独立 `chunker_version` 和 `embedding_profile_version`；空轮及异常记录水位、时间、游标差、错误类型；健康接口输出白名单 | 单测通过，真实探针游标 235/235、差值 0 |
| F05 | 确定性输入 `标题：…\n标题路径：…\n正文：…`，标题变化重嵌、权限-only 跳过 | 精确输入和分支单测通过；真实语义质量未评测 |
| F06 | Markdown 类型块、代码/表格原子性、相邻普通块组包、源行号；SRT 时间窗口；检索证据输出行号 | 解析、分块、PDF 与检索定位回归通过 |
| F07 | Nacos 先加载再装配 ES，异常也关闭已建立资源，非默认 timeout/replicas 测试覆盖 | Worker 与配置回归通过 |
| F08 | item/chunk 先不可读再删除或改 ACL；所有读取入口过滤 `readable=true`，第二段授权保留 | 真实 ES 中途失败/重试及检索过滤回归通过 |
| F09 | 固定语料、九类 API/限定补种夹具、真实源隔离探针、时延及原始输出路径入库；历史通过声明标注为历史记录 | 九类真实验收和独立清理复核通过；真实语义评测移至 M16.8 |
| F10 | 默认及 Nacos 轮询恢复为 3 秒；新清单按实际 Git 结果生成 | 配置测试通过；旧清单方法名纠正见下 |

真实 Java 文件方法为 `FilePlugin.openStream`、`FileService.openContentStream`，不是旧 changelist 中的 `openObjectStream/openFileStream`。历史文件保留，新记录明确纠正。

固定九类首次运行还发现直接 PDF 创建未设置 `n_doc.index_status`，MySQL 拒绝无默认值插入。`DocServiceImpl.createPDF()` 现已与另一创建入口一致初始化 `NOT_INDEXED(3)`；既有 `DocServiceImplKnowledgeChangeTest` 增加精确断言，先失败为 `null`，修复后通过。

### 激活与失败的具体边界

别名切换和 active 写入失败（包括请求已落地但响应丢失）恢复旧别名与 active 快照。恢复失败时，仍被别名或 active 引用的索引不会删除；别名与 active 不一致时拒绝继续混写。该边界有 10 个真实 ES 回归用例。

资料成功/无法提取状态延后至整次激活和重建水位保存之后。**激活后的水位或源状态回写失败不会撤回已经激活的新索引**；新索引保留，资料状态可由后续对账补写。不能把跨 ES 和源服务的过程描述为一个事务，也不声称任何异常都恢复旧索引。

完整性核验范围为集合、双版本、数量、generation、规则版本、可读性及开启时的向量覆盖；当前不比较每片正文哈希，也不声称验证了任意外部手工篡改。

## 3. Docker 验证结果

| 验证 | 最终结果 | 本地原始输出 |
|---|---|---|
| Python 全量，连接本机 ES | **365 passed，1 warning，72.83s** | `tmp/m16-4-repair/python-final.log` |
| 真实 ES 故障回归（含在上述全量内） | **20 项全部通过**；此前 19 项独立运行 58.25s，新增零向量换模型用例后随全量复验 | `tmp/m16-4-repair/python-final.log`、`es-integration-final.log`、`model-empty-green.log` |
| 全 reactor Maven，默认排除 integration 标签 | **30/30 SUCCESS，553 tests，0 failures/errors/skips，16:55** | `tmp/m16-4-repair/java-full-current.log`、`java-test-count-current.log` |
| Web 模型供应商模块 | **4 文件、20 tests passed，4.94s** | `tmp/m16-4-repair/web-current.log` |
| 两个修改的 Web 文件 Biome lint | **2 files，0 errors，82ms** | `tmp/m16-4-repair/web-lint-current.log` |
| Gateway OpenAPI 与 baseline | **6/6 字节一致** | `tmp/m16-4-repair/openapi-current.log` |
| Compose | **5/6，1 项既有失败，3.631s** | `tmp/m16-4-repair/compose-current.log` |
| 清理后真实源只读隔离探针 | **1246 item / 1082 chunk，8/8 断言通过，游标 235/235，临时 ES 索引 0** | `tmp/m16-4-repair/live-probe-current.json`、`.log` |
| 固定九类真实 API、重建、对账、时延与清理 | **19/19 断言通过；数据库、对象、令牌、旧 ES 与临时索引均清零** | `tmp/m16-4-repair/fixed-nine.json`、`.log` |
| 直接 PDF 初始化 Java 定向测试 | **3/3 passed；修复前新增断言为 null** | `tmp/m16-4-repair/doc-status-green.log` |
| 只读查询 Embedding 配置 | **configured=false** | `tmp/m16-4-repair/embedding-config.log` |

Python warning 是现有 Starlette/AnyIO 弃用提示。Compose 唯一失败为 `test_production_only_publishes_frontend_and_collab`：旧断言未包含已配置的 `anynote-gateway`，原独立报告已排除，本次不修改。前端未重跑全仓用例，历史全仓日期组件问题不计为本轮全绿；本轮只报告实际运行的 20 项。

先红后绿证据保存在 `tmp/m16-4-repair/`：`red-indexing.log`（4 项失败）、`alias-response-loss-red.log`（6 failed/4 passed）、`alias-drift-guard-red.log`（2 项失败）、`rebuild-status-red.log`（4 项失败）、`model-empty-red.log`（零向量换模型未拒绝）。全量中还发现旧 PDF 测试 ES 替身缺少 `get_alias`，保存为 `python-pre-final-fake-failure.log`（1 failed/352 passed）；补齐替身后 353 项通过，最后补齐模型守卫后全量 354 项通过。Java 全 reactor 的工具任务曾在 15 分钟超时，但 Maven 容器继续执行；接管同一容器日志后，最终于 16:55 完成且退出码为 0，没有重复启动另一轮测试。

`tmp/` 和 `.log` 由仓库忽略规则排除，不是待提交产物；以下保留关键原始结果，并列出可重跑命令。

### 可重跑命令

以下 PowerShell 从仓库根目录执行；Docker 路径使用本机已核实位置。镜像均为本机已有镜像，测试源码以挂载内容为准。

```powershell
$dockerExe = 'C:\Users\YXLMz\AppData\Local\Programs\DockerDesktop\resources\bin\docker.exe'

# Python 全量与真实 ES；ES 测试只写随机隔离名称并精确清理
& $dockerExe run --rm --network anynote_anynote-net -e INDEXING_ES_URL=http://elasticsearch:9200 `
  --mount type=bind,source=C:\Users\YXLMz\code\anynote\ai-service,target=/app,readonly `
  --mount type=bind,source=C:\Users\YXLMz\code\anynote\services,target=/services,readonly `
  anynote/ai-service-test:local pytest -p no:cacheprovider

# Java 全 reactor
& $dockerExe run --rm `
  --mount type=bind,source=C:\Users\YXLMz\code\anynote,target=/workspace `
  --mount type=volume,source=anynote-maven-repo,target=/root/.m2 `
  -w /workspace/services maven:3.9.11-eclipse-temurin-21 mvn -o test

# Web 受影响模块
& $dockerExe run --rm `
  --mount type=bind,source=C:\Users\YXLMz\code\anynote\apps\web\src,target=/workspace/apps/web/src,readonly `
  -w /workspace/apps/web anynote/web-test:local pnpm exec vitest run src/features/model-providers

# 实际根配置下的修改文件 lint
& $dockerExe run --rm `
  --mount type=bind,source=C:\Users\YXLMz\code\anynote\apps\web\src,target=/workspace/apps/web/src,readonly `
  --mount type=bind,source=C:\Users\YXLMz\code\anynote\biome.json,target=/workspace/biome.json,readonly `
  -w /workspace anynote/web-test:local pnpm exec biome lint `
  apps/web/src/features/model-providers/components/embedding-model-settings.tsx `
  apps/web/src/features/model-providers/__tests__/embedding-model-settings.test.tsx

# 真实源正常路径：不会回写资料状态，不调用模型，使用临时 ES 前缀
# ANYNOTE_INTERNAL_SECRET、REDIS_URL、NACOS_NAMESPACE 按 4.1 的 ContainerEnv 从现有 Worker 读取
& $dockerExe run --rm --network anynote_anynote-net `
  -e ANYNOTE_INTERNAL_SECRET -e REDIS_URL -e NACOS_NAMESPACE `
  -e NACOS_SERVER_ADDRESS=nacos:8848 -e NACOS_CONFIG_DATA_ID=anynote-ai-indexer.yml `
  -e ES_URL=http://elasticsearch:9200 -e NOTE_SERVICE_URL=http://anynote-modules-note:18091 `
  -e FILE_SERVICE_URL=http://anynote-modules-file:8095 -e NOTIFY_SERVICE_URL=http://anynote-modules-notify:9066 `
  --mount type=bind,source=C:\Users\YXLMz\code\anynote\ai-service,target=/app,readonly `
  --mount type=bind,source=C:\Users\YXLMz\code\anynote\tmp\m16-4-repair,target=/evidence `
  anynote/ai-service-test:local python -m evals.verify_indexing `
  --output /evidence/live-probe-current.json --code-ref 731431d+working-tree
```

OpenAPI 使用 Docker `anynote/web-test:local` 的 Node，从 Gateway `/{auth,system,note,file,ai,notify}/v3/api-docs` 读取响应，经仓库 `openapi/normalize-spec.mjs` 的 `normalizeSpec` 与只读挂载的 `openapi/specs/*.json` 逐字节比较，未写 baseline。结果原文：

```powershell
& $dockerExe run --rm --network anynote_anynote-net `
  --mount type=bind,source=C:\Users\YXLMz\code\anynote\openapi,target=/audit/openapi,readonly `
  -w /audit anynote/web-test:local node --input-type=module -e 'import {readFileSync} from "node:fs"; import {normalizeSpec} from "./openapi/normalize-spec.mjs"; for (const name of ["auth","system","note","file","ai","notify"]) { const response=await fetch("http://anynote-gateway:8080/"+name+"/v3/api-docs"); const result=normalizeSpec(await response.text(),name); if(!response.ok||!result.ok||result.json!==readFileSync("./openapi/specs/"+name+".json","utf8")) throw new Error(name+" mismatch"); console.log(name+": "+result.pathCount+" paths, baseline byte-identical"); }'
```

```text
auth: 7 paths, baseline byte-identical
system: 24 paths, baseline byte-identical
note: 76 paths, baseline byte-identical
file: 15 paths, baseline byte-identical
ai: 19 paths, baseline byte-identical
notify: 4 paths, baseline byte-identical
```

Compose 实际使用从 `docker:29.7-cli` 复制到临时工具卷的 Linux Docker/Compose，在 Python 测试容器中运行 `python infra/tests/test_compose.py -v`；需要 `/tools/docker`、`/tools/config/cli-plugins/docker-compose`，`PATH=/tools:/usr/local/bin:/usr/bin:/bin`，`DOCKER_CONFIG=/tools/config`，仓库只读挂载 `/workspace`。测试只调用 `compose config`，没有启动业务服务。

## 4. 真实验收原始结果

### 4.1 固定九类、时延与清理

最终运行使用 `indexing_corpus_v1.json` 版本 1，实际创建九类实体共 12 个文档（三种 PDF 和两个慕课条目分别计数），采用本地八维确定性向量，不发起模型请求。19/19 断言通过；两次对账均为 `skipped=12` 且其余动作计数为 0。资料真实状态为文本 PDF `INDEXED(0)`、扫描 PDF `UNEXTRACTABLE(4)`、双栏 PDF `INDEXED(0)`。

| 实测阶段 | 结果 |
|---|---:|
| rebuild | 12.243734s |
| first reconcile | 0.445877s |
| second reconcile | 0.544753s |
| Redis 唤醒，修改到可检索 | 1.088536s |
| 三秒轮询，修改到可检索 | 4.091209s |

唤醒探针使用真实 `anynote:knowledge:change` 频道；轮询探针使用本轮无发布者的专属频道，运行时间隔为 3 秒。权限-only 保持 generation 且不增加向量调用，标题-only 更换 generation 并增加向量调用；API 删除后隔离索引按 kb 收敛为零。

最终资源为 `user=597 / kb=759 / note=3214 / mooc=22 / task=306 / notice=218`， manifest 中的全部数据库行、四份对象、访问/刷新令牌、Canal 旧 `note/mooc` 文档及三个临时索引均清零。独立 MySQL 复核覆盖 25 类资源记录全部为零，ES 按 `kb_id=759` 查询为零，旧文档均为 404；原始输出为 `fixed-nine.json`、`.log`、`fixed-nine-db-independent-final.log`、`fixed-nine-es-independent-final.log` 和 `fixed-nine-prefix-independent-final.log`。

第一次完整运行暴露了通知清理偏差：任务通知由系统以 `create_by=0` 写入，旧清理计划却按临时用户过滤，导致 `ntc_notice` 残留。新增回归先失败后通过，最终改为按已从真实导出确认的精确通知 ID 删除；旧结果保存在 `fixed-nine-notice-cleanup-red.json`、`.log`，最终复跑及独立复核通过。首次 PDF 阻断及残留清理记录另存为 `fixed-nine-pdf-red.log`、`fixed-nine-partial.json` 和 `cleanup-partial-fixture.log`；清理脚本末尾的 ES `exists()` 汇总类型错误不影响已提交清理，数据库、对象、令牌和 ES 均由独立只读命令复核为零。

以下 PowerShell 从仓库根目录重跑；凭据只在当前进程环境传递，不打印、不写入 manifest。先构建测试镜像和 note，再暂停现有 Worker，`finally` 无条件恢复：

```powershell
$dockerExe = 'C:\Users\YXLMz\AppData\Local\Programs\DockerDesktop\resources\bin\docker.exe'
& $dockerExe build -f infra/Dockerfile.ai-service --target test -t anynote/ai-service-test:local .
& $dockerExe run --rm --mount type=bind,source=C:\Users\YXLMz\code\anynote,target=/workspace --mount type=volume,source=anynote-maven-repo,target=/root/.m2 -w /workspace/services maven:3.9.11-eclipse-temurin-21 mvn -o install -pl note -am -DskipTests
& $dockerExe compose --env-file=NUL -f infra/docker-compose.yaml -f infra/docker-compose.dev.yaml up -d --build --wait anynote-modules-note
function ContainerEnv([string]$Container, [string]$Key) {
    $line = & $dockerExe inspect --format '{{range .Config.Env}}{{println .}}{{end}}' $Container | Where-Object { $_.StartsWith("$Key=") } | Select-Object -First 1
    if ($null -eq $line) { throw }
    return $line.Substring($Key.Length + 1)
}
$env:MYSQL_ROOT_PASSWORD = ContainerEnv 'anynote-mysql' 'MYSQL_ROOT_PASSWORD'
$env:MYSQL_DATABASE = ContainerEnv 'anynote-mysql' 'MYSQL_DATABASE'
$env:ANYNOTE_INTERNAL_SECRET = ContainerEnv 'anynote-anynote-ai-indexer-1' 'ANYNOTE_INTERNAL_SECRET'
$env:REDIS_URL = ContainerEnv 'anynote-anynote-ai-indexer-1' 'REDIS_URL'
$env:NACOS_NAMESPACE = ContainerEnv 'anynote-anynote-ai-indexer-1' 'NACOS_NAMESPACE'
& $dockerExe stop anynote-anynote-ai-indexer-1
try {
    & $dockerExe run --rm --network anynote_anynote-net -e MYSQL_ROOT_PASSWORD -e MYSQL_DATABASE -e ANYNOTE_INTERNAL_SECRET -e REDIS_URL -e NACOS_NAMESPACE -e MYSQL_HOST=mysql -e MYSQL_PORT=3306 -e NACOS_SERVER_ADDRESS=nacos:8848 -e NACOS_CONFIG_DATA_ID=anynote-ai-indexer.yml -e ES_URL=http://elasticsearch:9200 -e NOTE_SERVICE_URL=http://anynote-modules-note:18091 -e FILE_SERVICE_URL=http://anynote-modules-file:8095 -e NOTIFY_SERVICE_URL=http://anynote-modules-notify:9066 --mount type=bind,source=C:\Users\YXLMz\code\anynote\ai-service,target=/app,readonly --mount type=bind,source=C:\Users\YXLMz\code\anynote\tmp\m16-4-repair,target=/evidence anynote/ai-service-test:local python -m evals.run_indexing --output /evidence/fixed-nine.json
} finally {
    & $dockerExe start anynote-anynote-ai-indexer-1
}
```

### 4.2 真实源只读探针原始结果摘录

执行时间：2026-11-15 20:51:36 至 20:53:21（Asia/Hong_Kong）。

```json
{
  "code_ref": "731431d+working-tree",
  "scope": "existing-real-source-read-only-normal-path",
  "fixed_nine_entity_corpus": false,
  "embedding": "explicitly_disabled_for_probe",
  "passed": true,
  "rebuilt_documents": 1246,
  "source_entity_counts": {"kb": 642, "mooc": 2, "note": 600, "notice": 1, "task": 1},
  "independent_counts": {"items": 1246, "chunks": 1082},
  "integrity_errors": [],
  "processed_cursor": 235,
  "source_latest_cursor": 235,
  "first_reconcile": {"indexed": 0, "meta_updated": 0, "skipped": 1246, "deleted": 0, "unextractable": 0, "failed": 0},
  "second_reconcile": {"indexed": 0, "meta_updated": 0, "skipped": 1246, "deleted": 0, "unextractable": 0, "failed": 0},
  "durations_s": {"rebuild": 94.287502, "incremental": 1.012921, "first_reconcile": 3.166591, "second_reconcile": 3.149596, "total": 104.275063},
  "status_write_attempts": [],
  "cleanup": {
    "deleted_indices": [
      "m164_probe_d557d98e0103_chunk_v1_a4ad8389303014afbbf61d39baadebe46",
      "m164_probe_d557d98e0103_item_v1_a4ad8389303014afbbf61d39baadebe46",
      "m164_probe_d557d98e0103_meta"
    ],
    "remaining_indices": [],
    "remaining": 0
  }
}
```

八项断言是源/item 总数一致、独立 item 扫描数一致、独立 chunk 扫描数一致、上述完整性字段一致、二次对账零修复、游标追平、原 `kn_item/kn_chunk` 别名不变、临时索引清零。该数据集只有五类，不能替代九类固定语料；上述阶段耗时也不是“修改到可检索”的唤醒/轮询时延。

最终命令退出 0，但日志在成功摘要后还有未完整输出的 `Exception in thread `，没有线程名、异常类型或栈。保留原文，不推定根因，也不把整条日志描述为无告警；它未改变 JSON 中的八项结果或清理结果。

独立短生命周期检查 `nacos-lifecycle-probe.log` 记录：项目 close 已停止心跳、移除 watcher 并清空 client，SDK 1.0.0 的 `_process_polling_result`、`_do_pulling` daemon 线程在 close 后一秒仍存在。该检查没有捕获原片段的完整异常，不能据此将其确定归因于某线程；本次未扩展修改 SDK 生命周期。

## 5. 已授权操作与未执行范围

### A. 九类真实验收的额外写入与清理

现有 API 建立七类基础夹具；字幕公开接口会启动 Whisper，总结入口会调用真实 Harness，因此按用户授权采用限定补种，不伪造 ASR Redis task，也不调用 Whisper 或对话模型。资料删除仅逻辑删主行，知识库/慕课删除不完整级联，故在 API 删除收敛后执行以下精确物理清理。

依据：`MoocServiceImpl.java:333`、`KnowledgeEntityServiceImpl.java:339`、`ChatServiceImpl.java:395`、`DocServiceImpl.java:253`、`KnowledgeBaseServiceImpl.java:583`；精确实现以当前源码为准。

本轮已获授权并实际执行以下范围，仅针对 manifest 记录的资源，不修改既有业务数据：

| 操作 | 限定范围 |
|---|---|
| 补字幕 | 内部 file API 上传唯一前缀 SRT；更新本轮 `n_mooc_video_item_info` 的 `srt_object_name/update_time/update_by` |
| 补总结 | 为本轮 `mooc_id/mooc_item_id` 插入一条固定 `a_mooc_video_summarize`；登记对应字幕/总结变更事件 |
| 用户与知识库清理 | `sys_user/sys_user_role` 按临时 userId；`n_knowledge_base/n_user_knowledge_base` 按临时 kbId |
| 笔记与资料清理 | `n_note/n_note_text/n_note_operation_log/n_note_history/n_note_edit_log` 按本轮笔记、正文及操作 ID；`n_doc/f_file` 按本轮 doc/file ID 且校验创建者 |
| 慕课、任务、通知清理 | `n_mooc/n_mooc_item/n_mooc_item_text/n_mooc_video_item_info/a_mooc_video_summarize`、`n_note_task/n_user_note_task/n_note_task_operation_history`、`ntc_notice/ntc_knowledge_base_notice/ntc_user_notice`，均按本轮关联 ID |
| 事件清理 | `n_knowledge_change` 同时限定本轮 kbId 和 manifest 实体引用 |
| 对象与令牌清理 | 当前有效 bucket/basePath 下 manifest 的三份 PDF、一份 SRT 精确对象；临时用户名对应 access/refresh token，先枚举再逐键核对删除 |
| 运行服务与旧 ES | 暂停并最终恢复现有 `anynote-ai-indexer`；使用独立 ES 前缀验收；核对并精确删除 Canal 产生的本轮 `note/<noteId>`、`mooc/<moocId>` 文档，不删除共享索引 |

最终九类命令退出 0，19/19 断言通过，`verified_zero=true`；独立数据库、对象、令牌、新旧 ES 复核均为零。清理失败或存在剩余时仍禁止把 `verified_zero=False` 记作成功。

### B. 真实语义评测

只读配置查询返回 `configured=false`。固定语料采用本地确定性向量，只证明索引状态机和结构行为，不证明真实模型的同义改写或深层标题语义质量。用户已明确将真实语义评测移至 M16.8；执行前仍需确认供应商、模型和知识内容出境许可，不自行选择供应商或代填许可。

### C. 已确认的新增操作错误与日志模板

以下模板已于本轮由用户全部按原文批准。管理员 Worker CLI 会打印异常文字；内部健康接口只输出异常类型。现有 Worker 尚未部署本次索引代码。

| 模板 | 变量或完整候选值 |
|---|---|
| `Elasticsearch bulk 写入失败 ref={ref} action={action} failures={summary}` | action 为 `item/chunks`；summary 为最多五项操作、状态码与错误类型，不含正文 |
| `Elasticsearch {operation}失败` | operation 为 `片段可读状态更新`、`旧代际片段删除`、`失败代际片段删除`、`权限元数据更新`、`片段删除`、`条目删除`、`知识库不可读标记`、`知识库删除` |
| `Elasticsearch 片段数量核对失败 ref={item_key}` | item_key 为实体引用 |
| `Elasticsearch 向量覆盖核对失败` | 无变量 |
| `Elasticsearch 源文档集合或版本核对失败` | 无变量 |
| `Elasticsearch 片段完整性核对失败` | 无变量 |
| `Elasticsearch 孤儿片段核对失败` | 无变量 |
| `{method} {path} code={code}` | 仅本地验收 API 夹具；不回显响应正文 |
| `notice export cursor did not advance` | 仅本地验收夹具 |
| `export cursor did not advance entity_type={entity_type}` | 仅本地验收夹具 |
| `indexing fixture was not created` | 仅本地验收夹具 |
| `invalid probe prefix` | 仅本地探针精确清理守卫 |
| `index name is outside probe prefix` | 仅本地探针精确清理守卫 |
| `probe active metadata missing` | 仅本地探针 |

新增命令帮助说明为 `M16.4 固定语料真实 API 验收` 和 `M16.4 只读真实源正常路径探针`。已有版本不兼容、PDF、模型错误文字未改。

以下新增终端日志也在同一批确认范围内，变量仅为索引名、引用、类型、长度或计数：

| 模板 | 用途 |
|---|---|
| `Markdown 原子块超出分块字符上限 block_type={type} chars={count} limit={limit}` | 超长代码/表格整体保留 |
| `索引切换快照恢复失败 type={type}` | 激活失败后的恢复失败 |
| `旧索引清理失败 index={index} type={type}` | 新索引已激活，旧索引回收失败 |
| `保留激活元数据引用的索引 index={index}` | 安全清理跳过 active 引用 |
| `保留别名引用的索引 index={index}` | 安全清理跳过别名引用 |
| `Elasticsearch 失败代际清理失败 ref={ref} generation={generation} type={type}` | 写入失败后的清理失败 |
| `Elasticsearch 条目回滚失败 ref={ref} type={type}` | 条目恢复失败 |
| `全量索引重建失败 stats={stats}` | 输出 attempted/succeeded/failed/unextractable 计数 |
| `全量索引重建完成 version=v{version} docs={count} model={model} dims={dims} stats={stats}` | 重建成功及分类计数 |

## 6. 验收清单

- [x] F01/F02 故障可见、游标/状态保护、旧代际保留与对账修复；真实 ES 回归。
- [x] 关闭/重开/换模型维度、标题与权限分支、结构切分、定位、水位、装配顺序与可读状态回归。
- [x] 最终代码的 1,246 条真实源隔离正常路径与精确清理。
- [x] 最终 Python、Maven、相关 Web、OpenAPI、Compose 的实际结果归档。
- [x] 九类固定真实语料，扫描资料实际状态回写，实际删除/权限链路。
- [x] Redis 唤醒及轮询的“修改到可检索”实测时延。
- [x] 验收范围调整：真实 Embedding 同义改写与深层标题语义评测移至 M16.8，本项不在 M16.4 执行。
- [x] 新增操作错误/命令帮助文案确认。

M16.4 已于 2026-11-15 按用户确认的调整后验收范围关闭；真实语义质量仍须在 M16.8 单独评测，不能由本记录推定通过。
