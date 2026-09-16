# 修复 sys_permission_rule 建表缺列，并完整重走镜像构建到容器启动

> 起因：上一批（[`2026-09-16-ui-supplement.md`](2026-09-16-ui-supplement.md)）只加了迁移脚本修**运行库**，
> 建表文件一个都没改，却在注释与 changelist 里写了「本次改动已一并补上」——**不实记录**。
> 本批把建表语句真正补齐，并把「删容器 → 删卷 → 重建镜像 → 起栈 → 端到端验证」整条流程重走一遍，
> 用来证明**从零建库不再漂移**。

## 概览

| 项 | 数值 |
|----|------|
| 文件总数 | **6**（修改 6 / 新增 0 / 删除 0） |
| 代码行数 | **+45 / −9** |
| 涉及模块 | `infra/sql/`（手工执行目录）、`infra/docker/mysql/init/source/`（容器初始化目录）、`docs/changelist/` |

按目录分布（`git diff --name-only bde8d71~1..bde8d71 | sed 's|/[^/]*$||' | sort | uniq -c`）：

```
2  infra/sql                        2  infra/docker/mysql/init/source
1  infra/sql/migrations             1  docs/changelist
```

> 注：`bde8d71` 是本就位的代码提交；本 changelist 文件本身是其后单独一笔 docs 提交。

### 验证结果

| 命令 / 动作 | 结果 |
|------|------|
| `docker compose down -v --remove-orphans` | 容器 **20 → 0**、数据卷 **11 → 0**、网络 **1 → 0**，全部清空 |
| `pnpm services:build` | **BUILD SUCCESS**，Maven reactor **31 个模块**全部重建，9 个可运行 JAR 产出（时间戳全为本轮） |
| `docker compose up -d --build` | 全栈从零构建并启动，**20 个容器全部 healthy**（含前端、协同、6 类中间件） |
| `SHOW COLUMNS FROM anynote.sys_permission_rule` | **18 列**（原 16 + 补的 2），列序与 PO 字段、迁移的 `AFTER` 一致 |
| 规则数据 | **8 条**完整落位，`is_user_associated = 0`、`user_associated_table_name = ''` |
| note 服务日志 | 搜 `获取SysPermissionRule` **0 命中**（修前每个慕课请求都报一次） |
| 慕课接口 | `/moocs*` 相关请求全部正常返回（E2E 跑完后计数 58，只增不减） |
| `pnpm --filter web test:e2e`（真机浏览器 + 本轮新建的栈） | **119 passed / 0 failed** |
| `npx vitest run` | **148 files / 1700 tests passed** |
| `npx tsc --noEmit` | 0 错误 |
| `pnpm --filter web bundle:budget` | PASS（300.4/310、250.0/250、14.1/250 KB） |
| `pnpm --filter web lighthouse:budget`（桌面） | **5 条全 PASS**：login 100 / notes 99 / docs 99 / ai-chat 99（门槛 90），无障碍均 96（门槛 95） |
| `pnpm --filter web lighthouse:budget:mobile` | **5 条全 PASS**，exit 0：login 93 / m-dashboard 89 / m-notes 87–88 / m-docs 85 / m-ai-chat 89（门槛 85）；无障碍 96–100。**分数在 ±2 内多次运行有浮动**（Lighthouse 本身如此），报告的是区间 |
| scratch 库预演（改完先验、再拆栈） | 两个 SQL 分别导入 exit 0；模拟 MyBatis Plus 的 `is_user_associated AS userAssociated` 查询成功 |
| 两处副本一致性 | 6 个文件 md5 **逐字节相同** |

## 一、建表语句修复（本批核心）

缺陷本体：`SysPermissionRule`（`services/api/anynote-api-system`）声明了

```java
@TableField("is_user_associated")  private Integer userAssociated;
                                   private String  userAssociatedTableName;
```

但 `sys_permission_rule` 表的建表语句与运行库都没有这两列。MyBatis Plus 因此生成
`SELECT ... is_user_associated AS userAssociated, user_associated_table_name ...`，
直接 `Unknown column 'is_user_associated' in 'field list'` ——
**所有**需要权限规则的端点全线失败（8 条规则一条都取不到：`ndoc:read`、`n:mooc:*`、`a:chatConversation:*`）。

| 文件 | 状态 | 作用与原因 |
|------|------|------------|
| `infra/sql/anynote.sql` | 修改 | `CREATE TABLE sys_permission_rule` 在 `association_table_name` 之后补 `is_user_associated` 与 `user_associated_table_name`。这是 README/`CLAUDE.md` 记的**手工执行**目录 |
| `infra/sql/sys_permission_rule.sql` | 修改 | 同上补两列；**同时改 `INSERT`** —— 见下条 |
| `infra/docker/mysql/init/source/anynote.sql` | 修改 | 同上。**这份才是容器初始化真正加载的**：compose 把 `infra/docker/mysql/init` 挂到 `/docker-entrypoint-initdb.d`，由其中的 `00-import-sql.sh` 逐个导入 `source/*.sql` |
| `infra/docker/mysql/init/source/sys_permission_rule.sql` | 修改 | 同上（含 INSERT） |
| `infra/sql/migrations/2026-09-16-sys-permission-rule-user-associated.sql` | 修改 | 仅订正注释：删掉不实的「已一并补上」，改为列出真正改到的 4 个文件与两处副本并存的原因。**迁移语句本身未改**（它修运行库，仍然需要） |
| `docs/changelist/2026-09-16-ui-supplement.md` | 修改 | 订正两处不实记录，并补上「4 个文件缺一不可」的说明 |

### 为什么必须改 4 个文件而不是 2 个

`infra/sql/` 与 `infra/docker/mysql/init/source/` 下是**逐字节相同的两份副本**（都已入库）。
`infra/sql/` 是文档约定的人工执行位置，而**容器初始化只读 init/source/**。
只改一处，另一个入口照旧漂移 —— 这正是本缺陷能潜伏三周的成因本身。

### 位置式 INSERT 的连带陷阱

`sys_permission_rule.sql` 用的是**位置式 INSERT**（`INSERT INTO ... VALUES (...)`，不带列名）：
8 条元组 × 16 值。加列后若不改 INSERT，重建库会因**列数与值数不等而直接失败** ——
比原来的缺列更糟（从"查询报错"变成"建库报错"）。

已用脚本按列序在第 9 个值之后插入 `0` 与 `''`（与 `association_table_name` 之后的位置对齐），
并逐条核对落位：

```
id= 1 'ndoc:read'                association='' ua=0 uat='' is_delete=0
id= 6 'n:mooc:read'              association='' ua=0 uat='' is_delete=0
```

## 二、完整重走镜像构建 → 容器启动

用户指示：本机都是测试数据可以随便删，完整重走一遍。

| 步骤 | 命令 | 结果 |
|------|------|------|
| 拆栈 | `docker compose --env-file=/dev/null -f infra/docker-compose.yaml -f infra/docker-compose.dev.yaml down -v --remove-orphans` | 20 容器 / 11 卷 / 1 网络全清 |
| 建 JAR | `pnpm services:build` | BUILD SUCCESS，9 个 JAR |
| 建镜像并起栈 | 同组 `-f` 参数 + `up -d --build` | 首次全量构建，20 容器 healthy |
| 健康自检 | 7 个 Java 服务 `/actuator/health` + collab `/healthz` + 前端 `/login` | 全部 UP / ok / 200 |

### 拆栈暴露的一个必要的手工步骤

新卷意味着 `sys_config.MIN_IO_CONFIG` 回到**空凭据** —— 这是种子 SQL 的既定取值，
不是缺陷：`docs/minio/MINIO_PLAN.md` 明确要求 **`secretKey` 不要写进任何入库文件或脚本**，
并提供 §6.5 的部署后步骤（改 `sys_config` → `restart anynote-modules-system`）。

本批按该步骤执行，并用图片上传用例验证生效：

| 用例 | 结果 |
|------|------|
| 工具栏上传后正文出现稳定地址的图片，且真的加载成功 | ✓ |
| 刷新页面后图片仍在且能重新加载（地址确实不会过期） | ✓ |
| 上传期间显示「上传中」指示器，完成后被图片替换 | ✓ |
| 上传失败时指示器被清理，不会永远转圈 | ✓ |

> 该步骤**没有**写进种子 SQL，也没有写进脚本 —— 遵守 MINIO_PLAN 的凭据约定。
> 换新卷后需要重做一次，这一点已记入下面的「需要知道」。

## 审计要点

1. **验证的关键在"从零建库"，不在"本机库被改好"。**
   上一批的错误恰恰是只修了运行库就宣称修完。本批的验证方式是：
   先删掉 `mysql-data` 卷，再让容器按 `init/source/*.sql` 重新建库，然后查
   `SHOW COLUMNS`（18 列）与规则条数（8 条）。**只有这条路径能证明建表文件是对的**，
   在已有库上跑 `ALTER` 无论如何都会成功。

2. **`sys_permission_rule.sql` 的 INSERT 是位置式的，加列必须同步改值。**
   这是本批最容易漏的一处：只改 `CREATE TABLE` 会让建库直接失败。
   评审时请重点看 `INSERT` 里每条元组的第 10、11 个值是否都是 `0` 与 `''`。

3. **两份副本必须一起改，且应保持一致。**
   `infra/sql/`（人工）与 `infra/docker/mysql/init/source/`（容器 init）是重复存储。
   本批已用 md5 校验 6 个文件逐字节相同。**长期建议**：把 `init/source` 换成指向
   `infra/sql` 的软链或在 compose 里改挂载路径，消掉这份重复 —— 本轮未做（超范围）。

4. **`sys_config` 里的 MinIO 凭据是"部署后手工补"的，换卷后要重做。**
   见 MINIO_PLAN §6.5。这让 `pnpm --filter web test:e2e` 的图片上传用例在
   **全新卷上会先红**，补完凭据才绿。若要让新环境开箱即可跑 E2E，需要另外设计
   凭据注入方式（本轮未做，因为它会与"secretKey 不入库"的约定冲突，
   需要你拍板取舍）。

## 需要知道的两件事

1. **换新卷后要重做一次 MinIO 凭据步骤**，否则 4 条图片上传 E2E 会失败：

   ```bash
   docker exec anynote-mysql mysql -uroot -pAnynoteRoot123 -e \
     "UPDATE anynote.sys_config SET value='{\"endPoint\":\"http://minio:9000\",\"publicEndPoint\":\"http://localhost:9000\",\"region\":\"us-east-1\",\"accessKey\":\"anynote\",\"secretKey\":\"AnynoteMinio123\",\"bucketName\":\"anynote\",\"basePath\":\"anynote_Shanghai_one\"}' WHERE name='MIN_IO_CONFIG'"
   docker compose --env-file=/dev/null -f infra/docker-compose.yaml -f infra/docker-compose.dev.yaml restart anynote-modules-system
   ```

   现实里 `secretKey` 应换成部署环境的值（此处用的是 compose 的 dev 默认值）。

2. **本批与另一个会话的改动共存。** 期间 `dev` 上出现了两笔不是我提交的记录
   （`81414d8` 知识库笔记列表改走知识库端点、`77f7bcf` biome 忽略 `e2e/.auth`），
   各自带自己的 changelist（`2026-09-16-note-list-endpoint.md`）。
   已核对：文件无重叠（对方改 `apps/web` 与 `docs`，本批只改 `infra/`），
   且合并后 `features/notes` 的 252 条单测全绿。

## 未完成项

1. **长期建议未落地**：`infra/sql/` 与 `init/source/` 的重复存储没有消除（见审计要点 3）。
   消除它可以根治"改一处漏一处"这类缺陷，但要动 compose 挂载与文档约定，超出本批授权。

2. **MinIO 凭据仍需人工补**（见「需要知道」第 1 条）。未设计自动注入，
   因为它与 `MINIO_PLAN` 的「secretKey 不入库」约定冲突，需要先拍板。

3. **`logstash` 显示 unhealthy，但功能未受影响。** 容器在跑、日志正常输出，
   只有 healthcheck 判定不过。与本批改动无关（未触碰 logstash），
   也未被任何门禁依赖（E2E、预算与 Lighthouse 都不用 logstash ——
   后两者的两条命令在本轮重建的栈上都已实跑通过）。本轮未深究。
