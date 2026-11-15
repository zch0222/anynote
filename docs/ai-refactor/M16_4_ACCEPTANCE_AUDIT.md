# M16.4 索引管线独立验收与后续修复报告

> 验收日期：2026-11-15  
> 当前代码：`dev@731431d`（M16.5 验收记录提交）  
> M16.4 完成记录：`bff9009`  
> 验收结论：**不通过，建议重开 M16.4，先修复 F01/F02 再继续依赖索引结果**  
> 本报告只做核对、测试与修复交接，未修改功能实现。

## 1. 结论摘要

M16.4 并非“完全没有实现”：Worker 部署、内部客户端、九类实体导出、无向量全量重建、正常路径对账、扫描件状态模型和元数据跳过重嵌均有代码及部分有效测试。当前真实栈的 Worker 也处于健康状态。

但原验收把“正常路径跑通”写成了“全流程通过”，遗漏了会破坏索引正确性的关键边界。此次已直接复现：

1. **Elasticsearch bulk 单条失败被吞掉**：条目写入成功、分片写入失败时，`upsert_item_and_chunks()` 仍正常返回。
2. **对账无法发现或修复上述损坏**：目标条目版本不变时没有分片也被记为 `skipped`；只有分片没有条目的孤儿也不会被清理。
3. **启用向量后再关闭 Embedding，增量管线被版本守卫拒绝**，不符合“关闭向量计算时管线照常完成”的无条件验收表述。
4. **没有实现水位/索引延迟指标，也没有持久化切分规则版本**。
5. **向量输入只有正文**，没有方案要求的标题和标题路径。
6. **切分不满足结构约束**：长代码块会被拆开；SRT 按字符数而不是约一分钟窗口合并。

因此，现有测试全绿不能证明索引完整、可恢复或可核对。尤其是 F01/F02 组合会造成“Worker 显示成功、对账显示零修复、实际内容无法召回”的静默数据缺失。

### 缺陷总表

| ID | 级别 | 状态 | 结论 |
|---|---|---|---|
| F01 | P0 | 真实 ES 已复现 | bulk 单项失败未检查，后续控制流可继续写成功状态并推进游标 |
| F02 | P0 | 真实 ES 已复现 | reconcile 不校验分片完整性、不扫描 chunk-only 孤儿；rebuild 切别名前也无完整性验证 |
| F03 | P1 | 定向复现 | 已有向量后关闭 Embedding 会拒绝工作；只有从冷启动就关闭时才验证通过 |
| F04 | P1 | 代码证实 | 水位、索引延迟指标和切分规则版本未实现；M16.5 文档也再次记录了该缺口 |
| F05 | P1 | 定向复现 | Embedding 输入未包含标题与完整标题路径 |
| F06 | P1 | 定向复现 + 代码证实 | 代码块/表格可被从中间切开，SRT 不按时间窗口，笔记片段没有行范围 |
| F07 | P2 | 代码证实 | Nacos 在装配 ES 客户端之后才加载，两个 ES 配置项实际被忽略 |
| F08 | P2 | 方案偏差 | 删除/权限收紧没有实现“先标不可读，再删除”的过渡语义；第二段权限确认仍是防线 |
| F09 | P2 | 文档与历史代码证实 | M16.4 原完成记录与当时实现不符，部分功能到 M16.5 才回补，原始 E2E 证据不可重放 |
| F10 | P3 | 代码与文档证实 | 默认轮询为 5 秒而方案写 3 秒；changelist 有多个不存在的方法名 |

级别含义：P0 = 可造成静默索引错误，必须先修；P1 = 明确阻断对应验收项；P2 = 方案/可靠性偏差，需要修复或重新拍板；P3 = 文档和低风险一致性问题。

---

## 2. 验收范围、依据与口径

### 2.1 依据

- `docs/ai-refactor/KNOWLEDGE_RETRIEVAL_PLAN.md` §3、§5，尤其是 §5.3–§5.8。
- `docs/ai-refactor/AI_MILESTONES.md` M16.4 的任务与六项验收标准。
- `.claude/openspec/changes/2026-11-15-indexing-pipeline.md`。
- `.claude/openspec/changes/2026-11-15-ai-logical-model-config.md`。
- `docs/changelist/2026-11-15-indexing-pipeline.md`。

### 2.2 历史与当前版本分开处理

- 对 M16.4 完成提交 `bff9009` 独立归档并复跑，验证原“56/56”数量。
- 对当前 `731431d` 复跑全部相关测试并审查实现。
- M16.5 已回补不重叠切分、任务成员、条目大纲/摘要、PDF 标题与双栏。**本报告不会把这些已经回补的内容仍算作当前缺失，但会将其记为 M16.4 原验收记录失真。**

### 2.3 证据等级

- **已复现**：本轮执行代码得到确定输出。
- **代码证实**：控制流、字段或调用顺序可直接确定，不冒充端到端复现。
- **部分通过**：正常路径有证据，但覆盖范围或故障路径不满足完整验收。
- **未复验**：原记录缺少可重放材料，不能据此断言原结果为假，也不能采信为通过。

原始 M16.4 E2E 只写了汇总结论，仓库中未找到对应的可重跑脚本、固定九类实体语料、原始输出或逐项计时数据。本报告不以该段汇总作为通过证据。

---

## 3. M16.4 任务逐项核对

| 任务 | 判定 | 核对结果 |
|---|---|---|
| Worker 入口与部署 | 通过（不含监控） | `run/rebuild/reconcile` 均存在；只读、降权、无宿主端口配置及 Compose 用例通过；真实容器 `/healthz` 为 200 |
| note 内部客户端与签名 | 通过 | HMAC 客户端和批量分片有单测；真实导出/变更读取经隔离 rebuild 走通 |
| 第一批适配器：kb/note/doc | 部分通过 | 统一源文档和路由存在；当前真实语料只覆盖 kb/note，doc 只有解析与管线替身测试证据 |
| Markdown/PDF/SRT/纯文本解析 | 部分通过 | 四种入口存在，PDF 有子进程、超时和内存限制；结构保留不完整，见 F06 |
| 结构化、标题路径、不重叠切分 | 部分通过 | 当前版本已无重叠且有标题路径；长原子块会拆开，SRT 窗口错误；M16.4 当时仍有重叠 |
| 三个索引、版本名/别名、批量写入 | 不通过 | mapping、版本名和别名存在；bulk 错误处理与切前验证不合格，见 F01/F02 |
| 可关闭向量；模型/切分版本入 `kn_meta` | 不通过 | 冷启动无向量可用，动态关闭失败；模型名/维度有记录，切分规则版本没有，见 F03/F04/F05 |
| 增量游标、双版本、删除与权限收紧 | 部分通过 | 游标和双版本控制流存在，元数据跳过重嵌有测试；完整性和删除过渡语义不合格 |
| 水位与延迟指标、资料状态回写 | 不通过 | 状态枚举与回写代码存在；水位/延迟指标缺失，见 F04 |
| 全量重建与按库核对 | 不通过 | 正常无向量路径可用；无法发现分片缺失和 chunk-only 孤儿，见 F02 |
| 第二批五类适配器 | 部分通过 | 类型和导出路径存在；当前真实语料仅覆盖 mooc/task，mooc_item/transcript/summary 未做本轮真实数据复验 |
| 第三批知识库通知 | 部分通过 | notify 导出、变更登记和索引代码存在；当前真实 rebuild 覆盖 1 条 notice；M16.5 检索侧主动排除通知不属于本项缺陷 |
| 运行时 Embedding 管理扩展 | 部分通过 | Java 相关测试、前端类型和定向 lint 通过；动态关闭的运行时行为不合格，真实供应商链路未复验 |

---

## 4. 原六项验收标准判定

| 原验收项 | 判定 | 依据 |
|---|---|---|
| 单测覆盖每个适配器、解析器、切分、版本比对、删除 | 部分通过 | 历史 56 条、当前 258 条均通过；但 M16.4 时索引相关测试只有 19 条，且大量采用内存 ES，缺少本轮复现的关键边界 |
| 固定语料 rebuild 后 reconcile 零差异 | 不通过 | 本轮正常语料可对账一致，但人为制造的缺片/孤儿均未被修复；也没有找到原固定九类语料及原始报告 |
| 修改笔记后按延迟可检索；只改权限不重算向量 | 部分通过 | 内存测试证明同内容版本跳过 Embedding；原报告没有延迟数值，本轮未伪造新的笔记修改时延数据 |
| 删除实体后片段不可召回 | 部分通过 | 正常删除有内存测试；chunk-only 孤儿不会被 reconcile 清理，完整性保证不成立 |
| 关闭向量后管线照常完成 | 不通过 | 无向量冷启动 rebuild 成功；已有向量后关闭会抛 `IndexVersionConflictError` |
| 扫描 PDF 标记无法提取并正确回写 | 部分通过 | 空白 PDF 真实解析及管线替身回写测试通过；本轮真实 dev 语料 doc 数为 0，未复验 file→PDF→note 的真实回写链路 |

---

## 5. 缺陷详情与修复要求

### F01 / P0：bulk 单项失败被吞，可能写成功状态并推进游标

**位置**

- `ai-service/indexing/es_store.py:469-504`：构造 item + chunks 的 bulk 请求。
- `ai-service/indexing/es_store.py:504`：直接 `await self._client.bulk(...)`，返回值完全未检查。
- `ai-service/indexing/pipeline.py:201-213`：存储返回后写 `DOC_STATUS_INDEXED`。
- `ai-service/indexing/pipeline.py:287-289`：本页处理后推进游标。

**本轮真实 ES 复现**

创建二维向量 mapping，故意写入三维向量，制造确定性的分片 mapping 错误：

```text
{
  'upsert_returned_without_exception': True,
  'item_count': 1,
  'chunk_count': 0,
  'expected_vector_dims': 2,
  'actual_vector_dims': 3
}
```

这证明 `bulk` 的 HTTP 调用成功不等于每个写入动作成功。该探针是人为注入单项错误，用于验证 store 的错误处理；并非声称当前 Embedding adapter 每次都会返回错误维度。实际还可能出现字段 mapping、断路器、单文档限制等其他单项错误。

**影响**

- item 标成已索引，但其片段可能缺失。
- 按当前控制流，资料可继续回写已索引，增量游标可继续推进。
- 更新时先 `delete_by_query` 删除旧片段，再执行 bulk；即使随后抛出异常，旧版本也已被删除，故障期间会扩大不可用窗口。

**修复要求**

1. 检查 bulk 响应的 `errors` 和每个 `items[*]` 状态，任何失败都必须抛出可识别的异常；不要只依赖 HTTP 200。
2. 只有全部 item/chunk 写入成功后才允许回写 `INDEXED` 和推进游标。
3. 更新流程改为“新代际写入并验证成功后再清理旧代际”，避免先删旧片再写新片。代际键可使用内容版本或独立 generation；不能写完后用同一 `item_key` 全删，否则会把新片也删除。
4. 异常日志记录 ref、操作类型、ES 状态和错误类型，不记录正文、令牌或模型密钥。
5. 将真实 ES 集成测试纳入可重复执行的测试入口，不只使用内存替身。

**必须先有的回归测试**

- item 成功、chunk 失败：抛错、状态不变为已索引、游标不前进、旧片仍可检索。
- item 失败、chunk 成功：同样不得报成功，并能清理或识别残余 chunk。
- 多 chunk 中仅中间一条失败：不得漏检。
- bulk 成功后才允许状态回写和 refresh 后的可见性断言。

---

### F02 / P0：reconcile 对缺片和 chunk-only 孤儿均失效；rebuild 未验证就切别名

**位置**

- `ai-service/indexing/pipeline.py:155-167`：只比较 item 的 `content_version/meta_version/index_status`，相同即跳过。
- `ai-service/indexing/pipeline.py:346-378`：对账只遍历 item signatures 和源文档。
- `ai-service/indexing/es_store.py:390-408`：已有条目只取版本和状态。
- `ai-service/indexing/es_store.py:631-665`：只遍历 `kn_item`，不遍历 `kn_chunk`。
- `ai-service/indexing/pipeline.py:323-327`：rebuild 不做事前完整性核对就切别名并保存游标。
- `ai-service/indexing/pipeline.py:310-323`：`total_docs` 按尝试数递增，不是成功写入数。

**本轮真实 ES 闭环复现**

先制造“item 为 c1/m1 且已索引、目标 chunk 为 0”的状态，再额外放入一个无 item 的 chunk-only 孤儿，执行真实 `run_reconcile()`：

```text
{
  'reconcile': {
    'indexed': 0, 'meta_updated': 0, 'skipped': 1,
    'deleted': 0, 'unextractable': 0, 'failed': 0
  },
  'target_item_version': 'c1/m1',
  'target_chunks_after_reconcile': 0,
  'chunk_only_orphans_after_reconcile': 1
}
```

这不是推断：对账明确返回了“跳过、零删除”，两种损坏却都原样保留。

**影响**

- F01 造成的缺片会成为永久状态，后续 reconcile 仍因版本相同而跳过。
- item 写入失败但 chunk 残留时，孤儿不在 `existing_sigs` 中，永远不会进入 `orphan_refs`。
- rebuild 可将不完整的新索引切到线上别名；旧物理索引随后还会被删除。
- 失败后的 rebuild 若复用同版本物理索引，没有失败现场清理，重试的幂等性没有保证。

**修复要求**

1. 在 item 中持久化至少 `chunk_count`；需要时同时保存解析/切分指纹，不能只看两个源版本。
2. reconcile 同时比较源文档、item 和 chunk：
   - item 版本是否一致；
   - 实际 chunk 数与期望是否一致；
   - chunk 的版本/generation 是否一致；
   - ES 中只有 chunk、没有 item 的键；
   - ES 中只有 item、源端已不存在的键。
3. 缺片必须重切/重嵌/补建，chunk-only 孤儿必须清理；完成后再次读取计数验证，而不是只返回动作计数。
4. rebuild 在新索引内先完成独立核对，达到明确门槛后才能原子切别名；失败保留旧别名和旧索引。
5. 每次 rebuild 使用可识别的新 attempt，失败时清理未完成物理索引，或保证重试前完整重置，不能复用脏现场。
6. `total_docs` 和结果统计区分 attempted/succeeded/failed/unextractable，不能把尝试数写成成功数。

**必须先有的回归测试**

- 本报告中的“item 完整、chunk=0、版本相同”必须触发补建而非 skipped。
- chunk-only、item-only、chunk 版本错误、chunk 数量多/少分别覆盖。
- rebuild 任一批次失败时 alias 不变、旧索引仍可查、游标不切到错误位置。
- rebuild 失败后再重试，不携带上一次的多余 item/chunk。

---

### F03 / P1：运行时关闭 Embedding 会阻塞已有向量的索引

**位置**

- `ai-service/indexing/es_store.py:288-298`：当请求无模型且旧索引含向量时抛出版本冲突。
- `ai-service/models/catalog.py:112-123`：配置 disabled 时解析为 `None`，正符合“运行时关闭”的输入。

**定向输出**

```text
{'disable_after_vectors': 'rejected',
 'error': '当前索引版本与激活映射不一致，请执行 rebuild 重建索引'}
```

**已验证的可用范围**

本轮隔离 rebuild 明确禁用向量，1,246 个条目可完成，因此“从空索引开始且始终关闭”没有问题。失败的是管理页面所支持的运行时状态迁移。

**修复要求**

1. 把“当前是否计算向量”与“物理 mapping 的模型/维度指纹”分开建模，禁用不应等价于 mapping 不兼容。
2. 明确并测试 off→on、on→off、同模型重开、换模型、换维度、维度未配置、空正文和纯元数据变更的状态机。
3. 若产品最终决定“关闭也必须先 rebuild”，则必须修改无条件验收表述、在管理 API/UI 中明确提示，并验证 rebuild 后管线恢复；不能直接保留当前隐式 503 行为。

---

### F04 / P1：水位、索引延迟和切分规则版本缺失

**位置与证据**

- `ai-service/indexing/models.py:123-143` 虽有 `latest_cursor`，但增量流程没有保存或使用它计算延迟；只有 rebuild 在 `pipeline.py:301-302` 使用它取基线。
- `ai-service/indexing/es_store.py:224-238` 只保存 `cursor` 和 `updated_at`，没有 latest cursor、lag 或各类型水位。
- `ai-service/worker.py:80-88` 健康响应只有 `ok/unhealthy`，测试还明确 `/metrics` 为 404。
- `ai-service/indexing/es_store.py:25` 的 `INDEX_SCHEMA_VERSION=2` 是 mapping 结构版本，不是切分算法版本。
- `docs/ai-refactor/AI_MILESTONES.md:603` 的 M16.5 记录也明确写着 M16.4 的延迟指标未找到。

**修复要求**

1. 每轮（包括空轮）读取并持久化 source latest cursor、processed cursor、处理时间和 `lag_records=max(0, latest-cursor)`；需要时补各类型水位。
2. 在内部健康/指标接口暴露游标差、最后处理时间、最后成功时间和最后错误；后续 M16.6 再按方案把超阈值状态加入运行开始事件。
3. 新增独立 `chunker_version`，与 parser 规则、Embedding 输入规则一起版本化。变更时要求 rebuild，不能把 mapping schema 版本当作替代品。
4. 测试空轮水位更新、落后/追平、异常不前进、切分版本不一致拒绝混写。

---

### F05 / P1：向量计算丢失标题和标题路径上下文

**位置**

- `ai-service/indexing/pipeline.py:81-102`：Embedding 输入仅取 `draft.content`。
- `ai-service/indexing/pipeline.py:104-141`：标题和标题路径是后续写 ES 时才加入 payload，未进入向量输入。

**定向输出**

输入 `ChunkDraft(content="正文", section_path="章节 / 小节")` 后，捕获到：

```text
{'embedding_inputs': ['正文']}
```

方案 `KNOWLEDGE_RETRIEVAL_PLAN.md:263-264` 和 `:324` 要求标题路径参与全文和向量计算。当前全文 mapping 有独立 `title/section_path` 字段，问题特指向量通道。

**修复要求**

- 生成统一、确定性的 Embedding 输入，例如标题、完整标题路径、正文的分隔格式；标题只改时是否重嵌要与“只改标题不重嵌”的既有拍板一致，若标题进入向量，就需要重新评估该优化边界。
- 将该格式纳入 chunker/embedding profile 版本，升级后 rebuild。
- 单测精确断言输入，不只断言调用次数；真实检索评测补同义改写与深层小节样本。

**需要下一轮先解决的契约矛盾**：方案要求标题参与向量，M16.4 验收又要求“只改权限不重算向量”，执行记录进一步写成“只改标题跳过重嵌”。权限-only 可以跳过；标题-only 若标题确实进入向量则不应跳过。请按检索方案重新拍板并统一文档与测试，不要继续用当前模糊口径掩盖矛盾。

---

### F06 / P1：结构切分和定位不符合方案

#### 6.1 长代码块/表格会被从中间切开

`ai-service/indexing/chunking.py:26-52` 只按字符与换行/句号等边界截断，`:124-136` 对每个 section 都调用该函数，没有识别代码块或表格原子性。

本轮把 100 行 Python 代码放在一个 fenced block 中，得到：

```text
{'code_block_chunks': 11,
 'first_starts_fence': True,
 'last_ends_fence': True,
 'middle_chunk_has_unclosed_fence': True}
```

Markdown parser `ai-service/indexing/parsers/markdown.py` 只识别标题和 fence 开关，没有形成段落、列表、代码、表格、图片替代文字等类型化块。

#### 6.2 SRT 按字符数合并，不是按时间窗口

`ai-service/indexing/chunking.py:55-104` 的 `_pack_timed_sections` 只判断 `chunk_size`。两条相隔 10 分钟的字幕仍被合成一片：

```text
{'chunk_count': 1, 'start_ms': 1000, 'end_ms': 602000, 'span_seconds': 601.0}
```

#### 6.3 笔记片段没有行范围

`ParsedSection` 和 `ChunkPayload`（`ai-service/indexing/models.py:198-250`）没有 start/end line；ES chunk mapping 也没有对应字段。方案要求的“标题路径 + 行范围”定位不完整。

**修复要求**

1. Markdown 先形成类型化块，再按标题、段落组包；代码块和表格默认不可拆，超过上限时采用明确的整块超限策略并记录告警，不能静默切坏。
2. SRT 同时受约 60 秒窗口、字符上限和异常时间间隔约束；长单条字幕可单独拆分，但时间定位必须合理。
3. 解析时保留源行号，chunk 写入 start/end line，并覆盖跨标题、代码块、表格测试。
4. 保留当前 M16.5 已补的不重叠、PDF 书签/字号标题和双栏测试，不要回退这些能力。

---

### F07 / P2：Nacos 加载顺序使 ES 请求超时和副本数配置失效

**位置**

- `ai-service/worker.py:115-117`：装配时一次性读取 runtime，创建 ES client 和 store。
- `ai-service/worker.py:269-274`：先 `build_pipeline`。
- `ai-service/worker.py:277-288`：随后才 `await nacos.start()` 加载配置。

因此 Nacos 的 `es-request-timeout-s` 和 `es-index-replicas` 在创建对象前未生效。其他每轮动态读取的配置不受同一问题影响；当前 Nacos 文件恰好使用默认值，所以本轮真实 rebuild 没有暴露差异。

**修复要求与测试**

- 对所有命令先加载 Nacos，再装配 ES client/store，并保证失败时正确 close；或把这两个选项改成可安全热更新的装配方式。
- 用非默认值启动测试，断言底层 client 的 timeout 和新索引 replicas 确实等于 Nacos 配置，不能只断言 `RuntimeConfigStore` 已更新。

---

### F08 / P2：删除与权限收紧未实现方案规定的过渡状态

方案 `KNOWLEDGE_RETRIEVAL_PLAN.md:278-284` 要求先标不可读再删除；OpenSpec 也把 `readable` 列为冗余 ACL 字段。

当前实现：

- `ai-service/indexing/es_store.py` 的 item/chunk mapping 没有 `readable` 字段。
- `es_store.py:580-609` 直接先删 item 再删 chunk，没有过渡标记。
- 权限收紧走 `update_metadata_only()` 更新 ACL，并非专门的收紧流程。

M16.5 的第二段 `/authorize` 仍是防止无权证据进入模型的防线，**本轮没有据此宣称发生越权泄漏**。但这是未登记的方案偏差，且删除 item 后、删除 chunk 前的窗口需要明确一致性依据。

**修复要求**

- 要么实现可检索过滤的 readable/tombstone 状态及对应测试，要么重新评审并修订方案，明确为何“两段权限 + 删除顺序”已足够，以及 reconcile 如何清理残留。
- 测试删除中间失败、权限收紧中间失败、重试和最终收敛，不只测试两个 delete 调用被调用。

---

### F09 / P2：M16.4 原完成记录与历史实现不一致，E2E 不可重放

已确认的历史差异：

1. `d723411` 的 `chunking.py` 仍有 `chunk_overlap_chars=100` 和重叠步进，当前版本才删除；与 M16.4 当时声称的“不重叠”不符。
2. M16.5 `AI_MILESTONES.md:563,568` 明确把任务成员、片段不重叠、条目大纲/摘要、PDF 标题与双栏写为“回补 M16.4”。
3. M16.4 changelist 写“真实栈全流程通过”，但没有逐项输入、断言、时延和原始输出，且执行后还有代码小修，无法形成最后代码上的证据闭环。
4. 原“56/56”数量本轮已复现为真，但那是整个 ai-service 测试数，其中 `test_indexing*.py` 只有 19 条，不能用来替代真实栈验收。

**修复要求**

- 验收报告必须记录可重跑命令、代码提交、固定语料版本、逐项输入/断言、耗时、原始结果位置和清理结果。
- 最后一次功能代码修改后必须重跑 E2E；前端小修与索引无关时可以说明理由，但不能笼统写“全流程通过”。
- 修复完成后另写新验收记录，保留本次失败历史，不要覆盖成从未失败。

---

### F10 / P3：配置与逐文件清单存在小型漂移

- 方案 `KNOWLEDGE_RETRIEVAL_PLAN.md:243` 写起步轮询 3 秒；`ai-service/core/config.py:52` 与 Nacos 配置均为 5 秒。若 5 秒是新拍板，应回写方案及延迟门槛。
- `docs/changelist/2026-11-15-indexing-pipeline.md:60-66` 写的 `openObjectStream`、`openFileStream` 在实际 Java 代码中分别是 `openStream`、`openContentStream`。
- changelist 称 pipeline 已有“水位推进与延迟指标”，与代码及其后续 M16.5 记录不符。

这些不是 P0/P1 的根因，但说明逐文件清单不能作为代码事实的替代来源。

---

## 6. 本轮测试与真实探针结果

### 6.1 标准测试与契约

| 检查 | 本轮结果 | 说明 |
|---|---|---|
| M16.4 历史快照 `bff9009` Python | **56 passed，1 warning，6.19s** | 修正 Docker 挂载后，确认历史文件不存在 M16.5 测试；原数量属实 |
| 当前 HEAD Python 全量 | **258 passed，1 warning，30.50s** | 当前工作区源码挂载进测试镜像执行 |
| 当前 HEAD 受影响 Java + 上游 | **22/22 reactor SUCCESS，441/441** | note 242、file 26、ai 64、notify 5，其余 104；耗时 2:25 |
| 当前 HEAD 全 reactor Maven | **30/30 SUCCESS** | `mvn -o test`，耗时 2:04；默认排除 integration tag |
| Web 全量 Vitest | **2044/2047；2 文件失败** | 3 条均在既有任务日期组件，不在 Embedding 设置页 |
| Web 失败文件隔离复跑 | **45/45** | 两个文件均通过，符合既有 Windows 不稳定表现；仍不能把全量结果写成全绿 |
| Web TypeScript | 通过 | `tsc --noEmit` |
| 模型供应商目录 Biome | 通过 | 11 文件，0 错误 |
| Compose | **5/6** | indexer 隔离用例通过；唯一失败仍是生产端口断言多出 Gateway |
| OpenAPI | **6/6 字节一致** | auth 7、system 24、note 76、file 15、ai 19、notify 4 paths |
| 真实 Worker 健康 | 200 `{"status":"ok"}` | 只证明探针健康，不证明游标已追平 |

Compose 必须在具备 Docker Compose 的 Linux 容器环境执行；宿主机直接执行缺少可用 Compose 插件，产生的 `unknown flag` 不计为项目测试结果，上表采用 Linux Docker CLI 容器内的有效复验。

### 6.2 隔离真实栈 rebuild + reconcile

为不污染现有 `kn_*` 别名，使用唯一临时前缀，禁用 Embedding，并禁止对权威资料状态的实际回写；数据读取仍走真实 note/file/notify 内部服务：

```text
rebuilt_documents = 1246
rebuild_seconds   = 13.197
entity_counts     = {kb: 642, note: 600, mooc: 2, notice: 1, task: 1}
reconcile         = {indexed: 0, meta_updated: 0, skipped: 1246,
                     deleted: 0, unextractable: 0, failed: 0}
cursor            = 235
```

解释与限制：

- 这证明**当前 dev 数据、无向量、正常写入路径**可以重建并在第二次对账时无修复动作。
- 它不是固定九类语料：实际只有 5 类，doc/mooc_item/transcript/summary 为 0。
- 功能阶段成功后，首次清理通配符被 ES 的 `destructive_requires_name` 拒绝，故该次外壳命令退出 1；随后已用精确索引名清理并确认 remaining 为 0。**本项只记功能阶段证据，不包装成整条命令成功。**
- 本次未调用真实 Embedding 供应商，也未制造真实业务数据。

### 6.3 定向故障探针

| 探针 | 实际输出 | 证明 |
|---|---|---|
| bulk 三维写二维 mapping | 返回成功；item=1、chunk=0 | F01 |
| reconcile 缺片 + chunk-only 孤儿 | skipped=1/deleted=0；目标 chunk 仍 0、孤儿仍 1 | F02 |
| 已有向量后 disable | `IndexVersionConflictError` | F03 |
| 长 Python fenced block | 11 片，中间片 fence 不闭合 | F06 |
| 捕获 Embedding 输入 | 仅 `['正文']` | F05 |
| 两条相隔 10 分钟 SRT | 合成一个 601 秒片段 | F06 |

所有本轮临时 ES 索引均已按精确名称删除；未修改业务表、现有线上别名或权威资料状态。

---

## 7. 下一轮 Agent 的推荐修复顺序

### 第一阶段：先恢复可相信的写入与对账（F01/F02）

1. 先提交会在当前代码失败的真实 ES 回归测试，覆盖本报告两个探针。
2. 修 bulk 逐条错误检查、失败游标/状态语义和新旧代际写入顺序。
3. 增加 chunk 数量/版本签名、chunk-only 扫描和补建/清理。
4. 把 rebuild 的“验证成功后切别名”实现为硬门槛，并处理失败重试现场。
5. 在修复后同时跑故障路径和 1,246 条正常路径，防止为了报错而破坏正常重建。

**完成标志**：任何单项写入失败都不会产生已索引状态或推进游标；人为制造缺片/孤儿后 reconcile 能修复并复核为零；rebuild 失败绝不切 alias。

### 第二阶段：关闭验收语义缺口（F03–F06）

1. 拍板 Embedding 状态机和标题进入向量后与“标题-only 跳过重嵌”的冲突。
2. 实现水位/延迟与 chunker/embedding-profile 版本。
3. 修 Embedding 输入、Markdown 原子块、SRT 时间窗口和行号定位。
4. 每个修复先保留当前失败用例，再写实现；升级规则时明确要求 rebuild。

### 第三阶段：部署、删除语义与证据工程（F07–F10）

1. 修 Nacos 装配顺序并用非默认值验证。
2. 实现 readable 过渡状态，或形成有记录的方案修订与一致性论证。
3. 统一轮询配置、changelist 方法名和方案描述。
4. 建立可重跑的固定九类语料 E2E，保存原始结果，不再只回写“全流程通过”。

---

## 8. 修复后的最低复验清单

下一轮不能只复跑单元测试，至少应完成：

- [ ] 当前 F01/F02 的真实 ES 探针从失败变为通过，且测试已纳入仓库可重复入口。
- [ ] 正常笔记更新可检索；权限-only 不重嵌；标题-only 按新拍板执行；记录唤醒与轮询各自时延。
- [ ] 删除、权限收紧、写入中途失败、重试后均收敛，chunk-only 为 0。
- [ ] on→off、off→on、换模型、换维度均有明确结果；关闭向量时增量和 rebuild 均完成。
- [ ] 固定语料覆盖全部 9 类、文本 PDF、扫描 PDF、长代码、表格、双栏 PDF 和跨长时段 SRT。
- [ ] rebuild 后对新索引做独立完整性核对，再允许切 alias；reconcile 二次执行无修复动作。
- [ ] 游标差、最后处理时间和切分版本可读取；异常时游标不前进。
- [ ] Python、受影响 Java、全 reactor Maven、OpenAPI、Compose、前端相关测试按最终结果如实记录。
- [ ] 验收记录包含最终提交号、原始输出位置、真实时延、清理结果及仍未覆盖项。

---

## 9. 明确不属于本轮 M16.4 修复范围的事项

- Web 全量的 3 个日期/任务组件失败：隔离后 45/45，通过但全量仍曾失败；不是索引管线引入的问题，不在本报告中要求顺手修复。
- Compose 生产端口断言未包含 Gateway：与原记录一致，按既有范围约束保留。
- M16.5 检索侧排除知识库通知：属于后续权限判定缺口，不应误写成 M16.4 通知未入索引。
- M16.5 记录的超管、语义检索、真实模型容量等后续限制：不借本报告扩大 M16.4 修复范围。
- 原里程碑列出的其他全仓既有门禁问题：本轮未重新归因，也不要求下一轮借 M16.4 一并处理。

**给下一轮 Agent 的一句话交接**：不要从“再补几条适配器测试”开始；先让真实 ES 的失败可见、让对账能发现并修复缺片与孤儿，然后再处理向量开关、结构切分和可观测性。只有这些故障用例由红转绿后，才适合重新关闭 M16.4。
