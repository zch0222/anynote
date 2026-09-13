# Anynote CLI 命令速查

> **本文件由 `anynote manifest --format=markdown --write` 生成，不要手改。**改命令定义后重新生成并提交，CI 会对生成物做 diff 校验。

## 全局约定

- `--json`：输出 JSON 信封；**stdout 不是 TTY 时自动开启**，agent 无需显式指定。
  - 成功：`{ "ok": true, "command": "...", "data": ... }`
  - 失败：`{ "ok": false, "command": "...", "error": { "code", "message", "exitCode" } }`
- `--fields a,b`：裁剪输出字段，控制 agent 上下文预算。
- 写操作在非 TTY 环境必须显式 `--yes`，否则以退出码 2 拒绝且不发请求。
- `--dry-run`：只打印将要执行的写操作，不实际发送。
- `--profile <name>` / `ANYNOTE_PROFILE`：切换凭据 profile。
- `ANYNOTE_API_URL` 指定网关地址；`ANYNOTE_TOKEN` 可直接提供 token（不落盘、不刷新）。

## 退出码

| 码 | 名称 | 含义 |
|----|------|------|
| 0 | OK | 成功 |
| 1 | BUSINESS | 业务失败（后端 code 非 00000） |
| 2 | USAGE | 参数 / 用法错误，写操作缺 --yes 也归此类 |
| 3 | AUTH | 未认证或凭据失效，需要重新 auth login |
| 4 | NETWORK | 网关不可达 / 超时 |
| 5 | CONFLICT | 乐观并发冲突，重读后合并再重试 |
| 6 | NOT_FOUND | 资源不存在 |

## 命令

### `anynote auth login`

登录并把凭据写入本地 profile（稳定 · 写操作）

用用户名口令换取 accessToken / refreshToken 并落盘到 profile。口令优先用 --password-stdin 从标准输入读取。不想落盘时改用环境变量 ANYNOTE_TOKEN。

后端端点：`POST /api/auth/login`

| 参数 | 类型 | 必填 | 默认 | 说明 |
|------|------|------|------|------|
| `--username` | string | 是 | - | 用户名 |
| `--password` | string | 否 | - | 口令（不推荐，会进 shell history） |
| `--password-stdin` | boolean | 否 | false | 从标准输入读取口令 |

```bash
anynote auth login --username alice --password-stdin < pw.txt
```

### `anynote auth logout`

撤销当前会话并清除本地凭据（稳定 · 写操作）

向后端撤销 accessToken / refreshToken（幂等），然后删除本地 profile。

后端端点：`POST /api/auth/logout`

### `anynote auth register`

注册新账号并登录（稳定 · 写操作）

创建账号后自动写入本地 profile。用户名 6-15 位字母数字；口令 8-15 位且必须同时含大写、小写与数字。

后端端点：`POST /api/auth/register`

| 参数 | 类型 | 必填 | 默认 | 说明 |
|------|------|------|------|------|
| `--username` | string | 是 | - | 用户名 |
| `--password` | string | 否 | - | 口令（不推荐，会进 shell history） |
| `--password-stdin` | boolean | 否 | false | 从标准输入读取口令 |
| `--nickname` | string | 是 | - | 昵称 |
| `--sex` | integer | 否 | 0 | 性别：0 或 1 |

```bash
anynote auth register --username alice01 --nickname 小爱 --password-stdin < pw.txt
```

### `anynote auth status`

查看本地凭据状态（不发请求）（稳定）

只读本地文件：当前 profile、网关地址、凭据是否存在与获取时间。不会打印 token 本身。

### `anynote auth whoami`

查看当前登录用户（稳定）

调用 system 服务校验凭据是否真的可用；未认证时退出码为 3。

后端端点：`GET /api/system/user/mine`

### `anynote base create`

新建知识库（稳定 · 写操作）

后端要求 cover 非空且域名在白名单内，未指定时使用默认封面。name 长度 2-15，detail 最多 500。

后端端点：`POST /api/note/bases`

| 参数 | 类型 | 必填 | 默认 | 说明 |
|------|------|------|------|------|
| `--name` | string | 是 | - | 知识库名称，2-15 字符 |
| `--detail` | string | 否 | "" | 简介 |
| `--cover` | string | 否 | "https://anynote.obs.cn-east-3.myhuaweicloud.com/images/knowledge_base_cover.png" | 封面图 URL |
| `--type` | integer | 否 | 0 | 类型：0 个人 / 1 组织 |

```bash
anynote base create --name "我的知识库" --yes
```

### `anynote base get`

按 ID 获取知识库详情（稳定）

注意：知识库的权限切面先于存在性检查执行，**不存在与无权限都返回 A0301（退出码 3）**，不要据此判定需要重新登录；笔记侧则是正常的 A0404（退出码 6）。

后端端点：`GET /api/note/bases/{id}`

| 参数 | 类型 | 必填 | 默认 | 说明 |
|------|------|------|------|------|
| `<id>` | integer | 是 | - | 知识库 ID |

```bash
anynote base get 70
```

### `anynote base list`

分页列出当前用户可见的知识库（稳定）

permissions 是「小于等于」过滤，默认 4 表示我能看到的全部知识库。返回 id / 名称 / 权限 / 更新时间。

后端端点：`GET /api/note/bases`

| 参数 | 类型 | 必填 | 默认 | 说明 |
|------|------|------|------|------|
| `--page` | integer | 否 | 1 | 页码，从 1 起 |
| `--limit` | integer | 否 | 20 | 每页条数 |
| `--permissions` | integer | 否 | 4 | 权限过滤上界，默认 4 = 全部 |

```bash
anynote base list --json
```

### `anynote base rm`

删除知识库（稳定 · 写操作）

只有创建者能删除；非创建者会得到 B0001「没有权限删除知识库」。知识库不存在时后端返回 A0301（退出码 3），而不是 A0404。

后端端点：`DELETE /api/note/bases/{id}`

| 参数 | 类型 | 必填 | 默认 | 说明 |
|------|------|------|------|------|
| `<id>` | integer | 是 | - | 知识库 ID |

```bash
anynote base rm 70 --yes
```

### `anynote base update`

修改知识库名称 / 简介 / 封面（稳定 · 写操作）

后端的 @Url 切面会读取请求体里的 cover，缺省会直接 NPE 成 B0001。未显式给 --cover 时，本命令先读取知识库当前封面再回填。

后端端点：`PUT /api/note/bases/{id}`

| 参数 | 类型 | 必填 | 默认 | 说明 |
|------|------|------|------|------|
| `<id>` | integer | 是 | - | 知识库 ID |
| `--name` | string | 否 | - | 新名称 |
| `--detail` | string | 否 | - | 新简介 |
| `--cover` | string | 否 | - | 新封面 URL |

```bash
anynote base update 70 --name "新名字" --yes
```

### `anynote config get`

查看持久化设置与环境变量的生效结果（稳定）

打印设置文件内容，以及 apiUrl 的**生效值与其来源**（env / file / default）。凭据不在这个文件里，见 config path 给出的 credentials.json。

### `anynote config path`

打印配置、设置与凭据文件路径（稳定）

### `anynote config set`

把网关地址等设置持久化到 settings.json（稳定 · 写操作）

支持 api-url。写进 `<configDir>/settings.json`，之后所有命令都会用它，无需再设环境变量；优先级仍是 `--api-url` / `ANYNOTE_API_URL` 更高。传空串等于恢复默认值。

| 参数 | 类型 | 必填 | 默认 | 说明 |
|------|------|------|------|------|
| `<key>` | api-url | 是 | - | 设置项，当前只有 api-url |
| `<value>` | string | 是 | - | 设置值；api-url 需要是合法 URL，传空串恢复默认 http://localhost:8080 |

```bash
anynote config set api-url http://192.168.3.90:8080
# 恢复默认网关地址
anynote config set api-url ''
```

### `anynote config unset`

删除持久化设置项，恢复内置默认值（稳定 · 写操作）

| 参数 | 类型 | 必填 | 默认 | 说明 |
|------|------|------|------|------|
| `<key>` | api-url | 是 | - | 设置项，当前只有 api-url |

```bash
anynote config unset api-url
```

### `anynote doctor`

自检：安装方式、网关可达性、本地凭据与 skill 安装状态（稳定）

网关不可达时退出码 4；凭据缺失或失效时退出码 3。不会打印 token 本身。同时报告三家 agent 全局目录里 skill 的安装与版本匹配情况，以及本次运行的是全局安装的独立副本还是仓库里的构建产物。

### `anynote manifest`

输出命令清单（agent 自描述 / 文档生成）（稳定）

把命令注册表导出成 JSON 或 Markdown。输出中不含时间戳与绝对路径，是输入的纯函数，因此可以入库并用 git diff 卡漂移。

| 参数 | 类型 | 必填 | 默认 | 说明 |
|------|------|------|------|------|
| `--format` | json | markdown | 否 | "json" | 输出格式 |
| `--write` | boolean | 否 | false | 写入仓库内的生成物落点（仅 markdown） |
| `--root` | string | 否 | - | 仓库根目录，默认由可执行文件位置推导 |

```bash
anynote manifest --format=json
# CI 用：写盘后 git diff 必须为空
anynote manifest --format=markdown --write
```

### `anynote note create`

在知识库里新建笔记（稳定 · 写操作）

标题长度 3-15（后端 @Size 限制）。返回新笔记 ID。正文请随后用 note set 写入。

后端端点：`POST /api/note/notes`

| 参数 | 类型 | 必填 | 默认 | 说明 |
|------|------|------|------|------|
| `--base` | integer | 是 | - | 知识库 ID |
| `--title` | string | 是 | - | 笔记标题，3-15 字符 |

```bash
anynote note create --base 70 --title "会议纪要" --yes
```

### `anynote note get`

读取笔记，正文是 Markdown（稳定）

人类模式直接把 Markdown 正文写到 stdout（可重定向成 .md 文件）；--json 返回含 version 的结构体，该 version 是 note set 做乐观并发所必需的。

后端端点：`GET /api/note/notes/{noteId}`

| 参数 | 类型 | 必填 | 默认 | 说明 |
|------|------|------|------|------|
| `<id>` | integer | 是 | - | 笔记 ID |
| `--out` | string | 否 | - | 把正文写入文件而不是打印 |

```bash
anynote note get 2571 > note.md
# 取 version 用于后续保存
anynote note get 2571 --json
```

### `anynote note list`

列出某个知识库里的笔记（稳定）

走 POST /notes/bases/{baseId}，新建的笔记立即可见。若要看「我最近操作过的笔记」用 note recent。

后端端点：`POST /api/note/notes/bases/{baseId}`

| 参数 | 类型 | 必填 | 默认 | 说明 |
|------|------|------|------|------|
| `--base` | integer | 是 | - | 知识库 ID |
| `--page` | integer | 否 | 1 | 页码，从 1 起 |
| `--limit` | integer | 否 | 20 | 每页条数 |

```bash
anynote note list --base 70 --json
```

### `anynote note mv`

把笔记移动到另一个知识库（稳定 · 写操作）

需要对目标知识库有编辑权限。同样支持 --version 做乐观并发。

后端端点：`PATCH /api/note/notes/{noteId}`

| 参数 | 类型 | 必填 | 默认 | 说明 |
|------|------|------|------|------|
| `<id>` | integer | 是 | - | 笔记 ID |
| `--base` | integer | 是 | - | 目标知识库 ID |
| `--version` | string | 否 | - | note get --json 返回的 version |

```bash
anynote note mv 2571 --base 71 --yes
```

### `anynote note recent`

列出我最近操作过的笔记（稳定）

走 GET /notes，数据来自笔记操作日志，按最近操作时间倒序。**刚创建还没编辑过的笔记不会出现在这里**，要看知识库内全部笔记请用 note list --base。

后端端点：`GET /api/note/notes`

| 参数 | 类型 | 必填 | 默认 | 说明 |
|------|------|------|------|------|
| `--base` | integer | 是 | - | 知识库 ID（后端必填） |
| `--page` | integer | 否 | 1 | 页码，从 1 起 |
| `--limit` | integer | 否 | 20 | 每页条数 |

```bash
anynote note recent --base 70
```

### `anynote note rm`

删除笔记（稳定 · 写操作）

后端端点：`DELETE /api/note/notes/{noteId}`

| 参数 | 类型 | 必填 | 默认 | 说明 |
|------|------|------|------|------|
| `<id>` | integer | 是 | - | 笔记 ID |

```bash
anynote note rm 2571 --yes
```

### `anynote note set`

写入笔记标题 / 正文（Markdown）（稳定 · 写操作）

正文来源三选一：--file、--content、--stdin。必须给 --version（来自 note get --json）做乐观并发；确实要覆盖时用 --force 跳过检测。版本冲突退出码为 5，此时应重新 note get、合并内容、带新 version 重试。

后端端点：`PATCH /api/note/notes/{noteId}`

| 参数 | 类型 | 必填 | 默认 | 说明 |
|------|------|------|------|------|
| `<id>` | integer | 是 | - | 笔记 ID |
| `--file` | string | 否 | - | 从文件读取 Markdown 正文 |
| `--content` | string | 否 | - | 直接给出 Markdown 正文 |
| `--stdin` | boolean | 否 | false | 从标准输入读取 Markdown 正文 |
| `--title` | string | 否 | - | 新标题 |
| `--version` | string | 否 | - | note get --json 返回的 version |
| `--force` | boolean | 否 | false | 跳过版本冲突检测，后写入者胜出 |

```bash
anynote note set 2571 --file note.md --version 1789148175000 --yes
anynote note set 2571 --content "# 标题" --force --yes
```

### `anynote skill install`

把 CLI 自带的 skill 一键安装到各 agent 的 skill 目录（稳定 · 写操作）

支持 Claude Code、Codex、dsh。默认装**全局**目录：~/.claude/skills（可用 CLAUDE_CONFIG_DIR 覆盖）、$CODEX_HOME/skills（默认 ~/.codex/skills）、$DSH_HOME/skills（默认 ~/.dsh/skills）。加 --local 则装进**当前项目**：<项目根>/.claude/skills、<项目根>/.agents/skills、<项目根>/.dsh/skills（项目根 = 从 cwd 向上最近的含 .git 的目录，与 dsh 的判定一致），可随仓库提交给团队共用。**复制而非符号链接**；skill 内容随 CLI 一起打包，所以装出来的版本与当前 CLI 一定匹配，CLI 升级后重跑一次即完成升级。可重复执行，内容没变时是幂等的。

| 参数 | 类型 | 必填 | 默认 | 说明 |
|------|------|------|------|------|
| `--agent` | array | 否 | ["all"] | 目标 agent，可重复给；all = 三个都装 |
| `--local` | boolean | 否 | false | 装进当前项目而不是全局目录 |
| `--force` | boolean | 否 | false | 目标位置已有同名但不是本 CLI 装的 skill 时也覆盖 |
| `--root` | string | 否 | - | 临时覆盖 Claude Code 的全局配置根目录 |

```bash
# 装到 Claude Code / Codex / dsh 三家的全局目录
anynote skill install
# 装进当前项目，可随仓库提交给团队共用
anynote skill install --local
anynote skill install --agent=claude --agent=dsh
# 查看安装状态与版本漂移
anynote skill list
```

### `anynote skill list`

列出各 skill 目录里的 anynote skill 与版本匹配情况（稳定）

只读检查每个 skill 是否已安装、磁盘上记录的版本，以及是否与当前 CLI 打包的版本不一致（drifted=true 表示需要重跑 anynote skill install）。默认查全局；加 --local 查当前项目。

| 参数 | 类型 | 必填 | 默认 | 说明 |
|------|------|------|------|------|
| `--local` | boolean | 否 | false | 查当前项目而不是全局目录 |
| `--root` | string | 否 | - | 临时覆盖 Claude Code 的全局配置根目录 |

```bash
anynote skill list
anynote skill list --local
```

### `anynote skill uninstall`

移除本 CLI 安装的 skill（稳定 · 写操作）

只删带 anynote CLI 版本戳的目录；同名但不是本 CLI 安装的（用户手写）一律保留并如实报告，不会误删用户自己的 skill。默认处理全局目录；加 --local 处理当前项目。

| 参数 | 类型 | 必填 | 默认 | 说明 |
|------|------|------|------|------|
| `--agent` | array | 否 | ["all"] | 目标 agent，可重复给；all = 三个都检查 |
| `--local` | boolean | 否 | false | 处理当前项目而不是全局目录 |
| `--root` | string | 否 | - | 临时覆盖 Claude Code 的全局配置根目录 |

```bash
anynote skill uninstall --yes
anynote skill uninstall --local --yes
```
