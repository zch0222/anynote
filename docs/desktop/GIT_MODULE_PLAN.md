# 知识库「Git 仓库」模块方案

> 文档版本：v0.1（草案）| 创建日期：2026-10-01 | 状态：**待拍板，未开工**
> 关联文档：[README.md](./README.md)（摘要与待拍板决策）· [DESKTOP_PLAN.md](./DESKTOP_PLAN.md)（桌面客户端，本模块的执行端）·
> [DESKTOP_MILESTONES.md](./DESKTOP_MILESTONES.md)（M15.6 / M15.7）
>
> 现状证据见 [DESKTOP_PLAN §2](./DESKTOP_PLAN.md#2-既有事实盘点均已核对)，本文不重复。

---

## 1. 目标与非目标

### 1.1 目标

1. 每个知识库可以绑定一个 Git 仓库位置（远程地址 + 分支 + 子目录），也可以绑定只存在于某台电脑上的本地仓库。
2. 绑定后，知识库里的笔记与仓库里的 Markdown 文件**双向同步**：网页端或桌面端改的笔记进仓库，用任何工具改的仓库文件进知识库。
3. 同步在仓库里产生**干净的 diff**：只有真正改过的文件，文件里只有真正改过的行。
4. 冲突不丢数据：两边都改了同一篇时，能自动合并就合并，不能就让用户选；冲突标记绝不写进知识库。
5. 网页端知识库新增「Git 仓库」Tab：查看绑定、同步状态与记录，管理员可以绑定、修改、解绑。

### 1.2 非目标

| 不做 | 原因 |
|------|------|
| 服务端执行 git（定时备份、Webhook 触发同步） | 见 §2 |
| 服务端保存仓库凭据（PAT、SSH 私钥） | 同上 |
| 同步 Markdown 以外的文件（笔记引用的图片除外） | 知识库里只有笔记 |
| Git LFS、子模块、符号链接 | 同步时跳过并报告 |
| 一个知识库绑多个仓库；多个知识库绑同一路径 | 映射会变成多对多 |
| 把知识库已有的历史版本写进仓库历史 | 仓库历史从绑定那一刻开始，旧版本留在知识库的历史里 |
| 实时同步（保存即推送） | 提交太碎；改为手动同步，外加可选的定时同步 |

---

## 2. 核心决策：git 在桌面端跑，服务端只记账

| | 服务端执行 git | **桌面端执行 git（采用）** |
|------|------|------|
| 仓库凭据 | 服务端要长期保存 PAT / 私钥，一旦泄露所有绑定的仓库都失守 | 留在用户电脑的凭据助手 / ssh-agent 里，服务端永远拿不到 |
| 网络 | note 服务要能出网访问任意地址：SSRF、内网探测 | 服务端不连接仓库 |
| 本地仓库 | 做不到，服务器看不到用户电脑 | 天然支持 |
| 冲突处理 | 服务端没有界面，只能「后写者胜」或直接失败 | 桌面端有合并界面 |
| 资源 | clone / fetch 是长任务，占 note 服务的线程与磁盘 | 分摊到各个客户端 |
| 代价 | 不装桌面端也能同步 | **只有桌面端能同步**，网页端只能看状态 |

服务端只保存四类数据：绑定配置、同步游标、笔记 ↔ 文件映射、图片映射（§4）。服务端不读仓库内容，不需要任何 git 依赖。

---

## 3. 映射规则

### 3.1 绑定

- 一个知识库最多绑定一个仓库位置：`remote_url`（可空）+ `branch` + `root_dir`（仓库内子目录，可空）。
- `remote_url` 为空表示**仅本地仓库**：只有记录了本地路径的那台电脑能同步，其它电脑只能看状态。
- 本地路径**不存服务端**（它是设备私有信息）。桌面端在 `userData/bindings.json` 里记「服务器 + 知识库 id → 本地路径」；
  另一台电脑打开一个已绑定（有远程地址）的知识库时，提示「克隆到本机」。
- 修改 `remote_url`、`branch`、`root_dir` 等于换了一个仓库：必须显式带 `reset: true`，清空映射与游标，下次同步按首次同步处理。
- 绑定入口：桌面端可以「绑定到远程仓库（克隆到本机）」或「绑定到本机已有的仓库」；网页端只能填写远程地址（没有本地路径可选）。

### 3.2 笔记 ↔ 文件

- **范围**：`root_dir` 下匹配 `include`（默认 `**/*.md`、`**/*.markdown`）、不匹配 `exclude`（默认 `.*/**`、`node_modules/**`）的**已跟踪**文件。
- **关系存在映射表里**（§4.2），一篇笔记对应一个文件。**不在文件里写 front matter id**：不污染用户的文件；
  文件在仓库里改名（`git mv` 或任何工具），靠 `git diff -M` 的改名检测跟上。
- **路径**：相对 `root_dir`、正斜杠、Unicode NFC。唯一性按「小写 + NFC」判断，因为 Windows 和 macOS 默认大小写不敏感，
  `Note.md` 与 `note.md` 不能并存。
- **新笔记 → 新文件**：`<new_note_dir>/<文件名>.md`，文件名由标题生成：
  - `<>:"/\|?*` 和控制字符替换为 `-`，去掉首尾的空格和点；
  - 避开 Windows 保留名（`CON`、`PRN`、`AUX`、`NUL`、`COM1`–`COM9`、`LPT1`–`LPT9`）；
  - 最长 100 个字符；
  - 重名时追加 ` (2)`、` (3)`。
- **文件 → 新笔记**：标题按 `deriveTitle`（front matter 的 `title` > 文首 H1 > 文件名，见 [DESKTOP_PLAN §6.9](./DESKTOP_PLAN.md#69-编辑器typora-式编辑与保真保存)），截断到 80 字。
- **改名**：笔记标题始终从正文推导，**改标题不重命名文件**（路径稳定，diff 干净）；文件改名只更新映射里的路径，
  只有标题取自文件名时（既没有 front matter `title` 也没有 H1）才顺带更新笔记标题。

### 3.3 正文

- 知识库里存**文件的完整原文**（包括 front matter），不剥离任何内容；两边只有图片链接不同（§3.4）。
- 比较内容前统一规范化：CRLF 转 LF、去掉 BOM、末尾换行统一为一个。写回文件时还原该文件原来的 BOM 和行尾风格（新文件用 LF）。
- 只同步 UTF-8 文本。正文超过 65,535 字节（`n_note_text.content` 是 TEXT）的文件跳过，并在结果里列出。

### 3.4 图片

仓库里是相对路径，知识库里是 `/api/proxy/file/objects/{fileId}/redirect`。图片映射表（§4.3）记录「仓库路径 ↔ fileId ↔ blob」，同步时双向改写：

| 方向 | 做法 |
|------|------|
| 文件 → 笔记 | 正文里 `![…](相对路径)` 指向仓库里存在的图片：映射里有、且 blob 没变 → 直接换成 redirect 路径；否则以该笔记走一次图片上传（五步分片直传），拿到新 fileId 后登记映射 |
| 笔记 → 文件 | 正文里的 redirect 路径：映射里有 → 换回相对路径；没有（网页端新插的图）→ 以同步者身份下载到 `<asset_dir>/<fileId>-<原文件名>`，登记映射，换成相对路径 |
| 不处理 | 外部 `http(s)` 图片、HTML 里的 `<img>`、非图片链接、旧的预签名或 OBS 绝对地址：原样保留 |

- 相对路径按笔记文件所在目录计算：`docs/a/x.md` 引用 `assets/1.png` 时写成 `../../assets/1.png`。
- 改写函数是一对纯函数 `toFile` / `toServer`，**必须有互逆性测试**：对映射齐全的输入，`toFile(toServer(x)) === x`。
- 图片端点只认上传者本人（DESKTOP_PLAN §2.5）：同步者换人后，旧同步者上传的图下载会返回 A0301，此时原样保留链接并报告。

---

## 4. 数据模型

迁移文件 `infra/sql/migrations/YYYY-MM-DD-knowledge-base-git.sql`（幂等，`CREATE TABLE IF NOT EXISTS`），建表语句同步进 `infra/sql/anynote.sql`。

### 4.1 绑定与游标

```sql
CREATE TABLE IF NOT EXISTS `n_kb_git_binding` (
  `knowledge_base_id` bigint        NOT NULL COMMENT '知识库id',
  `remote_url`        varchar(500)  NULL     COMMENT '远程仓库地址，不含凭据；NULL 表示仅本地仓库',
  `branch`            varchar(255)  NOT NULL COMMENT '分支',
  `root_dir`          varchar(255)  NOT NULL DEFAULT '' COMMENT '仓库内子目录，空串表示仓库根',
  `include_globs`     varchar(1000) NOT NULL DEFAULT '**/*.md,**/*.markdown' COMMENT '同步范围',
  `exclude_globs`     varchar(1000) NOT NULL DEFAULT '.*/**,node_modules/**' COMMENT '排除范围',
  `new_note_dir`      varchar(255)  NOT NULL DEFAULT '' COMMENT '新笔记落盘目录（相对 root_dir）',
  `asset_dir`         varchar(255)  NOT NULL DEFAULT 'assets' COMMENT '图片目录（相对 root_dir）',
  `direction`         tinyint       NOT NULL DEFAULT 0 COMMENT '0 双向 1 仅导出（知识库→仓库） 2 仅导入（仓库→知识库）',
  `sync_owner_id`     bigint        NOT NULL COMMENT '同步身份：只有此用户能同步',
  `cursor_commit`     varchar(64)   NULL     COMMENT '最近一次成功同步时的提交（SHA-1 为 40 位，SHA-256 为 64 位）',
  `cursor_seq`        bigint        NOT NULL DEFAULT 0 COMMENT '游标序号：提交同步结果时比较并加一',
  `last_sync_time`    datetime      NULL     COMMENT '最近一次成功同步时间',
  `last_sync_device`  varchar(100)  NULL     COMMENT '最近一次同步的设备名（用户可见，不含路径）',
  `create_by`         bigint        NOT NULL DEFAULT 0,
  `create_time`       datetime      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `update_by`         bigint        NOT NULL DEFAULT 0,
  `update_time`       datetime      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`knowledge_base_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='知识库 Git 绑定';
```

### 4.2 笔记 ↔ 文件

```sql
CREATE TABLE IF NOT EXISTS `n_kb_git_entry` (
  `id`                bigint       NOT NULL AUTO_INCREMENT,
  `knowledge_base_id` bigint       NOT NULL COMMENT '知识库id',
  `note_id`           bigint       NOT NULL COMMENT '笔记id',
  `path`              varchar(500) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL COMMENT '相对 root_dir 的路径（原样大小写）',
  `path_key`          varchar(500) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL COMMENT '小写 + NFC 后的路径，唯一性用',
  `synced_blob`       varchar(64)  NOT NULL COMMENT '上次同步时文件的 blob',
  `synced_version`    varchar(20)  NOT NULL COMMENT '上次同步时笔记的版本号（update_time 毫秒）',
  `update_time`       datetime     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_kb_note` (`knowledge_base_id`, `note_id`),
  UNIQUE KEY `uk_kb_path` (`knowledge_base_id`, `path_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='知识库 Git 映射：笔记与文件';
```

**每一行的含义**（同步引擎的核心不变式）：提交里 `path` 处、blob 为 `synced_blob` 的文件，经 `toServer` 变换后与笔记版本
`synced_version` 的正文相同。三方合并的「上次同步」版本就从这里取。

路径列用 `utf8mb4_bin`：库的默认排序规则 `utf8mb4_unicode_ci` 既不区分大小写、也不区分部分重音，用来比较路径太宽松；
大小写不敏感的唯一性改由 `path_key` 显式表达。

### 4.3 图片 ↔ 文件

```sql
CREATE TABLE IF NOT EXISTS `n_kb_git_asset` (
  `id`                bigint       NOT NULL AUTO_INCREMENT,
  `knowledge_base_id` bigint       NOT NULL,
  `path`              varchar(500) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL COMMENT '相对 root_dir 的路径',
  `path_key`          varchar(500) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  `blob`              varchar(64)  NOT NULL COMMENT '图片文件的 blob',
  `file_id`           bigint       NOT NULL COMMENT 'file 服务的文件id',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_kb_path` (`knowledge_base_id`, `path_key`),
  KEY `idx_kb_file` (`knowledge_base_id`, `file_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='知识库 Git 映射：图片与文件';
```

### 4.4 同步记录

```sql
CREATE TABLE IF NOT EXISTS `n_kb_git_sync_log` (
  `id`                bigint       NOT NULL AUTO_INCREMENT,
  `knowledge_base_id` bigint       NOT NULL,
  `cursor_seq`        bigint       NOT NULL COMMENT '本次同步后的游标序号',
  `from_commit`       varchar(64)  NULL,
  `to_commit`         varchar(64)  NOT NULL,
  `operator_id`       bigint       NOT NULL,
  `device`            varchar(100) NULL,
  `stats`             varchar(500) NOT NULL COMMENT 'JSON：导出、导入、新建、删除、冲突、跳过的计数',
  `create_time`       datetime     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_kb_time` (`knowledge_base_id`, `create_time`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='知识库 Git 同步记录';
```

生命周期：删除知识库时连带删除绑定、映射与图片映射（`KnowledgeBaseServiceImpl` 的删除流程里加）；解绑时删除映射与图片映射，保留同步记录。
删除单篇笔记时映射保留到下次同步，由同步删除文件（需确认）后再删映射。

---

## 5. API 契约

note 服务新增 `KnowledgeBaseGitController`，经网关的完整前缀是 `/api/note/bases/{id}/git`。

| 方法 | 路径 | 权限 | 说明 |
|------|------|------|------|
| GET | `/bases/{id}/git` | 库 READ | 绑定配置、游标与统计（已映射数、自上次同步后改过的笔记数、尚未映射的笔记数）；未绑定时 `data` 为 `null` |
| PUT | `/bases/{id}/git` | 库 MANAGE | 新建或修改绑定；修改远程、分支、子目录时必须带 `reset: true` |
| DELETE | `/bases/{id}/git` | 库 MANAGE | 解绑 |
| PUT | `/bases/{id}/git/owner` | 库 MANAGE | 把同步身份改成自己（原同步者离开或设备丢失时用） |
| GET | `/bases/{id}/git/snapshot` | 同步者本人 | 同步引擎的输入，一次返回，避免 N+1：游标；全部映射（附笔记当前版本与状态 `ACTIVE` / `DELETED` / `INVISIBLE`）；同步者可见但还没映射的笔记（id、标题、版本）；图片映射 |
| POST | `/bases/{id}/git/syncs` | 同步者本人 | 提交一次同步结果（§6.6）：`expectedCursorSeq` 不符返回 A0409；在一个事务里写映射、图片映射、游标和同步记录 |
| GET | `/bases/{id}/git/syncs` | 库 READ | 同步记录分页（`pageNum` 从 1 起、`pageSize`） |

`PUT /bases/{id}/git` 请求体：

```jsonc
{
  "remoteUrl": "https://github.com/alice/notes.git", // 或 "git@github.com:alice/notes.git"；仅本地仓库时为 null
  "branch": "main",
  "rootDir": "docs",
  "include": ["**/*.md"],
  "exclude": [".*/**"],
  "newNoteDir": "inbox",
  "assetDir": "assets",
  "direction": 0,
  "reset": false
}
```

校验：

- `remoteUrl` 只接受 `https://`、`ssh://` 和 scp 风格的 `user@host:path`。**带凭据的地址直接拒绝**（如 `https://user:token@…`，
  返回 A0160 并提示改用凭据助手）；`file://`、`ext::`、以 `-` 开头的地址一律拒绝。服务端只校验格式，从不连接。
- `branch` 按 `git check-ref-format` 规则的子集校验；`rootDir`、`newNoteDir`、`assetDir` 必须是相对路径且不含 `..`。

`POST /bases/{id}/git/syncs` 请求体：

```jsonc
{
  "expectedCursorSeq": 12,
  "fromCommit": "a1b2c3…",
  "toCommit": "d4e5f6…",
  "device": "YXLMZ-PC",
  "entries": {
    "upsert": [{ "noteId": 1024, "path": "docs/intro.md", "syncedBlob": "9f2c…", "syncedVersion": "1759300000000" }],
    "remove": [1025]
  },
  "assets": {
    "upsert": [{ "path": "assets/88-cover.png", "blob": "77ab…", "fileId": 88 }],
    "remove": ["assets/old.png"]
  },
  "stats": { "exported": 3, "imported": 1, "created": 1, "deleted": 0, "conflicts": 1, "skipped": 2 }
}
```

服务端校验调用者是同步者、`noteId` 属于该知识库、`path` 合法且 `path_key` 不冲突、游标匹配，然后写入并把 `cursor_seq` 加一，
返回新游标。服务端**不校验内容**（它看不到仓库），映射是否正确由客户端算法保证（§6.6 的不变式）。

现有契约的三处改动：

1. `GET /notes/{noteId}` 返回加可空的 `gitPath`：web 据此关掉补 H1、在页头显示「Git · docs/intro.md」；
   方向为「仅导入」时编辑器置为只读。
2. `NoteCreateDTO.title` 从 3–15 放宽到 1–80（D9），与 `NoteEditDTO` 和 `NOTE_TITLE_MAX_LENGTH` 一致。
3. 桌面端网关代理白名单加入 `/bases/{id}/git/**`（[DESKTOP_PLAN §6.4](./DESKTOP_PLAN.md#64-网关代理)）。

按仓库约束：Controller 写齐 `@Tag` / `@Operation` / `@Schema`，权限用 `@RequiresKnowledgeBasePermissions`；
改完跑 `pnpm openapi:generate` 并提交 baseline；先写 OpenSpec 提案（§11 列出三份）。

---

## 6. 同步引擎（桌面端主进程）

### 6.1 设计原则

- **规划与执行分离**：`plan(snapshot, repoState, options) → SyncPlan` 是纯函数，承载全部判定逻辑，单测穷举；
  执行器只负责照着计划调用 git 和 API。
- **以映射为基准，不以游标为基准**：一个文件「改没改」，比的是它当前的 blob 和映射里的 `synced_blob`，而不是游标之后的 diff；
  游标提交只用于改名检测。这样某一篇的冲突一直没解决，游标照常前进也不会漏掉它。
- **两边都相同才记映射**：映射的每一行都意味着「文件这个 blob 与笔记这个版本内容一致」。
- **先预览，后执行**：每次同步先给出计划，删除和覆盖要用户确认。

### 6.2 流程

```
0. 前置：工作区已信任、git 可用、已登录、当前用户是同步者
1. 本地改动：root_dir 内未提交的改动先提交（"Anynote：提交本地编辑"）
2. git fetch → 本地分支快进；有本地提交且已分叉 → merge；merge 有冲突 → 停止，转到 Git 面板解决
3. 取快照：GET /bases/{id}/git/snapshot
4. 读仓库：git ls-tree -r -z HEAD -- <root>（路径 → blob）；git diff -z -M --name-status <cursor> HEAD -- <root>（改名对）
5. plan()：得到每一项的动作（§6.3），显示预览；有删除或覆盖时等待确认
6. 执行（逐项，可重放）：
   - 导入：POST / PATCH 笔记（带 version）、上传图片
   - 导出：写文件、下载图片
   - 合并：git merge-file 三方合并（§6.4）
7. git add（只加本次涉及的路径）→ commit → push；被拒绝 → 回到第 2 步（最多 3 轮）
8. POST /bases/{id}/git/syncs；A0409 表示别的设备刚同步过 → 回到第 2 步
9. 显示结果：成功数、跳过原因、未解决的冲突
```

仅本地仓库（`remote_url` 为空）跳过 fetch 和 push。

### 6.3 判定表

已映射的项，仓库侧状态取「未变 / 修改 / 改名 / 删除」，知识库侧取「未变 / 修改 / 删除」：

| 仓库 \ 知识库 | 未变 | 修改 | 删除 |
|------|------|------|------|
| **未变** | 无动作 | 导出：写文件 | 删文件（`git rm`）¹ |
| **修改** | 导入：PATCH 笔记 | 三方合并（§6.4） | 冲突：仓库改了、知识库删了² |
| **删除** | 删笔记（逻辑删除）¹ | 冲突：仓库删了、知识库改了² | 删除映射 |
| **改名** | 更新映射路径，内容按「修改」或「未变」那一行处理 | 同左 | 同「修改 × 删除」 |

知识库侧还有一种状态「不可见」（同步者失去了读权限）：跳过该项、保留映射、在结果里报告。

¹ 删除类动作在预览里单独列出，需要用户确认。单次删除超过已映射总数的 20% 时拒绝执行，除非用户再次输入确认——
防止 `root_dir` 或分支配错导致整个知识库被删。
² 默认保留有改动的一侧并恢复另一侧：「仓库改了、知识库删了」用文件内容新建笔记；「仓库删了、知识库改了」重新导出文件。
预览里可以改成「确认删除」。

未映射的项：

| 情况 | 动作 |
|------|------|
| 仓库里的新文件（没有映射、在同步范围内） | 新建笔记（标题按 `deriveTitle`）→ 上传图片 → PATCH 正文 |
| 知识库里的新笔记（同步者可见、没有映射） | 按 §3.2 生成路径 → 写文件 |
| 两边各有一个新项且内容相同（规范化后相等） | **直接配对**，不新建。用于从崩溃中恢复，也用于首次绑定一个之前手工导入过的仓库 |

方向模式：

| 模式 | 规则 |
|------|------|
| 仅导出 | 以知识库为准：仓库侧的修改和删除会被覆盖（预览里列出「将被覆盖」）；不导入新文件 |
| 仅导入 | 以仓库为准：知识库侧的修改会被覆盖；网页端编辑器对已映射的笔记只读（依据 `gitPath` 与方向） |
| 双向 | 判定表全量生效 |

### 6.4 三方合并

- base = `git cat-file -p <synced_blob>`（只要历史没被强推改写，仓库对象库里一定有）；ours = 仓库当前文件；theirs = `toFile(笔记正文)`。
- 先比较：ours 与 theirs 规范化后相等 → 只更新映射，什么都不写。
- 否则对三个临时文件执行 `git merge-file -p --diff3 -L 仓库 -L 上次同步 -L 知识库 <ours> <base> <theirs>`：
  - 退出码 0 表示干净合并 → 结果写回文件，并 PATCH 笔记（带 version）→ 记映射；
  - 退出码大于 0 表示有冲突 → **两边都不写**，生成冲突项，映射保持旧值（下次同步仍是冲突，直到解决）。
- base 找不到（强推改写了历史）→ 退化为两方比较，内容不同即冲突。
- 合并算法直接用 git 自带的，不在 TS 里再实现一份 diff3。

### 6.5 提交与推送

- 提交信息模板可以在绑定里配置，默认 `Anynote 同步：更新 N 篇，新增 M 篇，删除 K 篇`；作者用仓库的 `user.name` / `user.email`。
- 只 `add` 本次计划涉及的路径，不碰仓库里的其它文件。
- 推送被拒（期间有人推送）→ 回到第 2 步重新 fetch、合并、规划。已经写进知识库的笔记在下一轮表现为「两边都改了、内容相同」，
  按 §6.4 第一条只更新映射，不会重复写入。最多 3 轮。

### 6.6 游标提交与崩溃恢复

不变式：

- **I1**：映射行 `(path, blob, version)` 只在「文件的这个 blob 与笔记的这个版本，经变换后内容相同」时写入。
- **I2**：映射行的 version 取自本次 POST / PATCH 的返回值（或快照里本来就没变的版本），不另行重读——
  否则会把期间网页端的新改动误记为「已同步」。
- **I3**：游标与映射只经 `POST /syncs` 在一个事务里写入，并比较 `cursor_seq`。
- **I4**：每一步写操作都可以重放：PATCH 带 version；新建靠 §6.3 的「内容相同即配对」去重。

| 崩溃发生在 | 下次同步看到的情况 | 结果 |
|------|------|------|
| 已导入部分笔记，还没提交 git | 这些项两边都变了、内容相同 | 只更新映射 |
| 已新建笔记，还没记映射 | 仓库新文件 + 知识库新笔记，内容相同 | 直接配对，不重复新建 |
| 已提交，还没推送 | 本地分支领先远程 | 第 2 步先 fetch 合并，再推送 |
| 已推送，还没提交游标 | 两边都相同，映射是旧的 | 只更新映射 |

### 6.7 预览与冲突界面

- **预览**：分组列出「写入仓库 / 更新知识库 / 新建 / 删除（需确认）/ 冲突 / 跳过（附原因）」，每一项都能展开看 diff。
- **冲突**：三栏（仓库 / 上次同步 / 知识库）加一个合并结果栏（源码模式，预填 diff3 标记）。
  操作是「用仓库版本 / 用知识库版本 / 保存合并结果」；保存后同时写文件和笔记，再记映射。
- 未解决的冲突持续显示在知识库的 Git 状态里，不影响其它文件的同步。

### 6.8 规模与性能

- 一次同步最多 2000 个 Markdown 文件，超出时提示调整 `include` 或 `root_dir`。
- 快照接口一次返回；笔记正文只拉「知识库侧有改动」的那些（`GET /notes/{id}`）。
- 写知识库的并发为 4，带退避重试；进度经 `sync.onProgress` 推给界面，可以取消（取消按崩溃恢复的语义处理）。
- 可选定时同步：默认关闭；开启后按设定间隔静默执行，有删除、覆盖或冲突时不自动执行，改为提示。

---

## 7. 网页端「Git 仓库」Tab

路由 `/notes/[baseId]/git`（只做桌面版 web，移动端不做）：

- **页头**：「Git 仓库」，副标题是 `github.com/alice/notes · main · /docs`，或「未绑定」。
- **绑定信息**：远程地址、分支、子目录、方向、同步者；管理员可以「修改 / 解绑」。
- **同步状态**：上次同步的时间、设备、提交短 SHA；自上次同步后网页端改过的笔记数；还没进入仓库的新笔记数。
- **同步记录**：时间、设备、操作人、提交区间、各项计数。
- 说明「同步只能在桌面端进行」，附桌面端下载入口（`anynote://` 深链打开桌面端放到后续）。
- **笔记编辑器页头**：已映射的笔记显示「Git · docs/intro.md」小标签；方向为「仅导入」时只读并说明原因。
- 没有设计稿：先按现有知识库 Tab 的「页头 + 卡片 + 表格」版式实现，上线前按 `docs/ui/` 的流程请设计确认。
- 测试：`useKbGitBindingQuery` 等 hooks、Tab 组件的权限分支；E2E 加 1–2 条（需要真实后端栈）。

---

## 8. 与现有功能的关系

| 功能 | 关系 |
|------|------|
| 标题即 H1 | 已映射的笔记关闭补 H1（web 按 `gitPath` 判断），标题按 `deriveTitle` |
| 编辑器保真（DESKTOP_PLAN §6.9） | **双向同步和网页端编辑的前提**。M15.1 完成前只开放「仅导出」，网页端对已映射的笔记只读（D8） |
| 协同编辑（默认关闭） | 协同服务落库就是一次普通的笔记写入，同步时表现为「知识库修改」，不需要特判 |
| 笔记历史 | 不同步；仓库历史从绑定开始 |
| 删除笔记 / 知识库 | 删笔记：下次同步删除文件（需确认）；删知识库：连带删除绑定与映射 |
| 搜索（ES） | 不受影响，导入的笔记照常进索引 |
| 把笔记移动到其它知识库 | 视为「本库删除 + 目标库新增」；目标库也绑定了仓库时，由目标库的同步导出 |

---

## 9. 权限与安全

| 操作 | 权限 |
|------|------|
| 查看绑定、状态、同步记录 | 库 READ |
| 绑定、修改、解绑 | 库 MANAGE |
| 读快照、同步、提交同步结果 | 同步者本人（`sync_owner_id`），且仍有库 EDIT 权限 |
| 接管同步身份 | 库 MANAGE |

**多成员知识库的限制（D6）**：笔记权限创建时写死 `70000`，同步者**看不到别人建的笔记**，这些笔记不会进入仓库；
仓库里的新文件会以同步者身份建成笔记，其他成员同样看不到。这是笔记权限模型的既有缺口（DESKTOP_PLAN §2.4），
修好之前 Git 模块按「个人知识库」定位：绑定多成员知识库时给出明确提示，快照里不可见的笔记标为 `INVISIBLE`，不会被误判为删除。

安全：

- 服务端不连接仓库、不存凭据；带凭据的 `remote_url` 直接拒绝。
- 桌面端只允许 https 与 ssh 传输，`execFile` 不经 shell，路径前加 `--`（DESKTOP_PLAN §6.8）。
- 设备名只存用户可见的机器名，不存本地路径。
- 仓库内容是不可信输入：编辑器不渲染 HTML，外部图片默认不加载（DESKTOP_PLAN §6.1）。

---

## 10. 测试计划

| 范围 | 用例 |
|------|------|
| `plan()` 纯函数 | 判定表的每一格；改名同时修改；三种方向模式；删除阈值；内容相同配对；不可见；超大文件；非 UTF-8 |
| `toFile` / `toServer` | 相对路径的层级计算；互逆性（性质测试）；外部图片与 HTML 原样保留；映射里没有的 redirect 触发下载 |
| 路径与文件名 | 非法字符、保留名、大小写冲突、NFC、长度上限 |
| 执行器 | 真实 git + 临时 bare 仓库 + API 打桩：首次同步、增量同步、推送被拒后重试、游标 A0409；在执行器每一步注入失败，验证 §6.6 的每个崩溃点都能恢复 |
| 后端 | Service 单测（`MockitoExtension`）：权限、URL 校验、`reset` 语义、同步者接管、游标比较、事务回滚；Controller 注解齐全 |
| 网页 Tab | hooks 与组件 |
| 端到端 | 桌面端 + 真实后端栈 + 本地 bare 仓库：绑定 → 首次同步 → 网页改笔记 → 同步进仓库 → 仓库改文件 → 同步进知识库 → 两边同时改 → 解决冲突 |

---

## 11. OpenSpec 提案与风险

需要的提案（`.claude/openspec/changes/`）：

1. `YYYY-MM-DD-knowledge-base-git-binding.md`：§5 的新端点与三张表。
2. `YYYY-MM-DD-note-create-title-length.md`：`NoteCreateDTO.title` 放宽到 1–80。
3. `YYYY-MM-DD-note-detail-git-path.md`：`GET /notes/{noteId}` 增加 `gitPath`。

| 风险 | 影响 | 应对 |
|------|------|------|
| 编辑器保真没做完就开放双向 | 网页端一改就是整篇 diff | 双向排在 M15.1 之后；之前只给「仅导出」（D5、D8） |
| 多成员知识库语义残缺 | 别人的笔记不进仓库 | 先按个人知识库定位（D6），笔记权限缺口单独立项 |
| 用户强推改写历史 | base 丢失，冲突变多 | 退化为两方比较；文档里说明 |
| 正文 64 KB 字节上限 | 大文件进不了知识库 | 跳过并报告；是否改 `MEDIUMTEXT` 另议 |
| 大仓库首次同步慢 | 等待时间长 | 2000 文件上限 + 进度显示 + 可以取消 |
| 同步者的设备丢失 | 没人能同步 | 管理员接管（`PUT owner`）；映射在服务端，不会丢 |
