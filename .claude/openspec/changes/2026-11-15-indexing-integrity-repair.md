# 提案：M16.4 索引完整性与运行时状态修复

> 日期：2026-11-15；用户已确认本次工作区继续在当前 `dev` 修复，不新切分支。
> 依据：[独立失败验收报告](../../../docs/ai-refactor/M16_4_ACCEPTANCE_AUDIT.md)、[知识检索方案 §3–§5](../../../docs/ai-refactor/KNOWLEDGE_RETRIEVAL_PLAN.md)、[里程碑 M16.4](../../../docs/ai-refactor/AI_MILESTONES.md#m164-索引管线)。
> 状态：核心修复、固定九类、故障路径、实际时延与精确清理已通过；真实语义评测按用户决定未执行，M16.4 保持重开；原失败报告与旧 changelist 保留。

## 背景与范围

独立验收确认 bulk 单项失败未检查、缺片和孤儿对账失效、运行时关闭向量被拒绝，以及切分、水位、版本与部署配置的缺口。本次修复 F01–F10，保留 M16.5 已补的 PDF 标题/书签/双栏、不重叠片段、任务成员和条目大纲摘要能力。

不借本次处理报告已排除的任务日期组件、Compose 生产端口旧断言、知识库通知用户权限判定或其他后续里程碑事项。现有管理员 Embedding API 请求与响应结构保持不变；界面说明及 Worker 新增技术异常模板均已确认，现有 Worker 尚未部署本次索引代码。

## 已确认行为

### 写入、删除与权限收紧

- 检查 bulk 的 `errors` 及每个动作的状态/错误；任一失败必须抛错，禁止写入成功状态或提交失败页游标。
- 新 generation 片段先写入并核验，之后发布条目与可读状态，再清理旧 generation；失败时清理失败代际并保留或恢复旧内容。
- `kn_item` 与 `kn_chunk` 均冗余 `readable`。删除先将条目及片段标不可读，再删除片段和条目；ACL 更新先标不可读，完整写入新 ACL 后恢复可读，中间失败由重试/对账收敛。
- 检索的所有 item/chunk 入口，包括全文、语义、条目、相邻片段、单条目读取、父引用及候选键查询，均要求 `readable=true`；第二段 `/authorize` 继续执行。
- 合法空正文允许零片段；扫描 PDF 保持 `UNEXTRACTABLE(4)`，重复对账不得回写为 `INDEXED(0)`。
- 故障日志只记录 ref、操作、ES 状态和错误类型，不记录正文、访问令牌或模型密钥。

### 完整性核对与重建

- item 保存 `chunk_count`、`generation`、`chunker_version`；chunk 保存相同 generation 与规则版本。
- reconcile 同时比较权威源、item 与 chunk：集合、源双版本、数量、generation、规则版本、可读状态，以及启用向量时的向量覆盖。缺片、错片补建，chunk-only 与已无权威源的孤儿清理；完成后独立复核，第二轮应无修复动作。
- 每次 rebuild 使用独立随机 attempt 后缀物理索引 `kn_item_v{N}_a{attemptId}` / `kn_chunk_v{N}_a{attemptId}`，避免失败重试复用脏现场。
- 在新索引内独立核验源集合、版本与片段完整性，通过后才原子切换两个别名并保存 active 元数据；别名或 active 请求失败（含已生效但响应丢失）恢复旧别名及 active 完整快照。
- 构建、切前核验或可恢复的激活失败保留旧别名、旧索引和原游标，清理未激活 attempt；恢复失败保留仍被别名或 active 引用的索引，实际别名与 active 不一致时拒绝后续混写。激活成功后的旧索引清理失败只记告警。
- 整次激活成功并保存重建水位后，才回写资料成功/无法提取状态；激活后的水位或源状态回写失败保留新索引，后续增量或对账恢复，不声明所有异常都能跨 ES 与源服务回滚。
- 重建统计区分 attempted、succeeded、failed、unextractable，不以尝试数冒充成功数。

### 版本与 Embedding 状态

| 项目 | 新契约 |
|---|---|
| mapping schema | `schema_version=3` |
| 解析与切分规则 | `chunker_version=markdown-blocks-lines-srt-window-v1` |
| 向量输入规则 | `embedding_profile_version=title-path-body-v1` |
| 输入格式 | `标题：{title}\n标题路径：{section_path}\n正文：{content}`，其中 `\n` 为换行 |
| 版本不兼容 | 旧 schema、切分规则、向量输入规则不兼容时执行 `worker.py rebuild`，禁止混写 |
| 标题-only | 标题参与向量输入，重新处理并在启用 Embedding 时重算向量 |
| 权限-only | 标题、正文和片段完整性不变时仅更新 ACL，跳过重嵌 |
| on → off | 停止向量计算与语义检索，保留物理模型/维度 profile 和已有向量，普通增量及无向量 rebuild 可继续 |
| 同模型同维度重新启用 | 执行 reconcile 补齐停用期间新增/变更内容所缺的向量 |
| 换模型或维度 | 保持版本守卫，执行 rebuild 后使用新 profile；维度未填时探测后核验 |

开启、关闭、同配置重新启用与更换 profile 均需覆盖；关闭不再被当作与现有物理 mapping 冲突。

### 结构切分与定位

- Markdown 先解析为标题、段落、列表、代码、表格、图片替代文字等类型化块，再按结构组包；不重叠。
- 代码块和表格不可拆，单块超出配置字符上限时整体保留、允许该片超限并记录告警。
- SRT 同时受 60 秒窗口、字符上限和相邻字幕最大 5 秒间隔约束；间隔大于 5 秒另起一片。单条字幕超出时间或字符上限时整体保留原时间范围。
- Markdown 源行号从 1 开始，chunk 写入 `start_line/end_line`，检索命中与证据定位输出 `startLine/endLine`；原 PDF 页码与字幕时间字段保留。

### 水位、配置与健康接口

- 默认轮询采用原方案的 3 秒，Redis 通知用于唤醒，轮询用于兜底。
- 所有 Worker 命令先加载 Nacos，再装配 ES client/store，保证非默认 `es-request-timeout-s` 和 `es-index-replicas` 在创建对象时生效；异常路径关闭已建立资源。
- 每轮含空轮保存 source latest cursor、processed cursor、`lag_records=max(0, latest_cursor-processed_cursor)`、最后处理时间、最后成功时间和最后错误类型。失败不推进失败页游标，保留最后成功时间；差值表示记录数，不表示秒数。
- 现有容器内网只读 `GET /healthz` 在 `status` 外增加 `watermark` 对象，端口仍不映射宿主机：

| 字段 | 含义 |
|---|---|
| `processed_cursor` | 已提交的处理游标 |
| `latest_cursor` | 本轮读取的源最新游标 |
| `lag_records` | 源游标与已处理游标的非负差值 |
| `last_processed_at` | 最后处理轮次时间 |
| `last_success_at` | 最后成功轮次时间 |
| `last_error_type` | 最后失败的异常类型；成功轮次清空 |
| `chunker_version` | 当前解析/切分规则版本 |
| `embedding_profile_version` | 当前向量输入规则版本 |

健康接口仅输出上述白名单字段，不输出正文、URL、令牌、密钥或任意异常消息；M16.6 再接入运行开始事件中的索引滞后状态。

## 用户已确认的界面说明

在桌面与移动端共用的 Embedding 设置卡片中增加以下原文，保持已有保存成功与错误文案：

> 关闭后将停用语义检索和向量计算；已有向量保留，重新启用后执行索引对账补齐。

## 验证计划与证据归档

全部项目验证、单元测试和集成测试在本机 Docker 执行。先保留失败用例再实现；最终功能代码修改后重新执行真实栈验收，原始输出、固定语料版本、代码提交及未提交 diff 指纹、耗时、断言与清理结果写入 [M16_4_REPAIR_ACCEPTANCE.md](../../../docs/ai-refactor/M16_4_REPAIR_ACCEPTANCE.md)。

- 真实 ES 回归覆盖 item/chunk 的各类 bulk 单项失败、旧代际可读性、失败游标与状态不前进、缺片/错片/孤儿修复、二次零修复动作及重建失败不切别名。
- 单测覆盖空轮水位、落后与追平、最后成功时间、版本守卫、精确 Embedding 输入、标题与 ACL 分支、零片段与扫描件状态。
- 固定语料定义覆盖 `kb/note/doc/mooc/mooc_item/transcript/summary/task/notice` 九类、文本 PDF、扫描 PDF、长代码、表格、双栏 PDF 和跨长时段字幕；字幕/总结使用已授权的 manifest 限定补种，物理清理按资源 ID、对象名及临时用户名复核。正常真实源探针使用隔离 ES 前缀并按精确物理索引名清理。
- 分别记录 Redis 唤醒与定时轮询的真实索引耗时；不把健康响应或游标差直接作为时延合格的证明。
- 覆盖 on→off、off→on、同模型重开、换模型、换维度、自动维度与纯元数据变更；用户已明确本轮不执行真实语义评测，M16.4 保持重开并记录该未覆盖项。
- 复验 Python、受影响 Java、全 reactor Maven、OpenAPI、Compose 及相关前端测试，如实记录既有失败与仍未覆盖项，不提前填写通过数量。
