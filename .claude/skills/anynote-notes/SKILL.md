---
name: anynote-notes
description: Anynote 笔记与知识库的常见任务配方——批量导出笔记为 Markdown、把本地 Markdown 写回笔记、迁移笔记到别的知识库、安全处理保存冲突。当用户要成批读写 Anynote 笔记、做内容迁移或导入导出时使用。
---

# Anynote 笔记配方

前置：先读 [anynote-cli](../anynote-cli/SKILL.md) 的输出契约与退出码。以下片段都假设 `anynote` 在 PATH 上；
在本仓库里没装全局命令时，用 `node apps/cli/dist/anynote.mjs` 替代。

## 正文格式

笔记正文在后端**就是 Markdown**（新前端用 TipTap + tiptap-markdown，落库的是 Markdown 源文），
所以 CLI 不做任何格式转换：`note get` 吐什么，`note set` 就能原样写回。

⚠️ 有损项：文本对齐（`textAlign`）等没有 Markdown 语法表达的节点属性，保存时会丢。
帮用户改正文前先说明这一点。

## 配方 1：导出一个知识库的全部笔记

```bash
BASE=70
mkdir -p out
anynote note list --base "$BASE" --limit 100 \
  | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{for(const r of JSON.parse(s).data) console.log(r.id+'\t'+r.title)})" \
  | while IFS=$'\t' read -r id title; do
      anynote note get "$id" --out "out/${id}-${title}.md"
    done
```

笔记多时记得翻页（`--page`），别把 `--limit` 开到很大后直接打印——会撑爆上下文。

## 配方 2：把本地 Markdown 写回笔记（带冲突保护）

```bash
NOTE=1024
anynote note get "$NOTE" --json > /tmp/before.json
VERSION=$(node -p "require('/tmp/before.json').data.version")
# …编辑 /tmp/new.md…
anynote note set "$NOTE" --file /tmp/new.md --version "$VERSION" --yes
```

退出码 **5** = 有人先改了。正确处理是：

1. 重新 `note get --json` 拿最新正文与 version
2. 把用户的改动**合并**到最新正文上（不是覆盖）
3. 带新 version 再存一次

只有用户明确说"以我的为准"时才用 `--force`。

## 配方 3：新建笔记并填入正文

`note create` 只建标题（后端限制 3-15 字），正文要再调一次 `note set`：

```bash
ID=$(anynote note create --base 70 --title "会议纪要" --yes | node -p "JSON.parse(require('fs').readFileSync(0)).data.id")
anynote note set "$ID" --content "# 会议纪要

- 议题一" --force --yes
```

刚创建的笔记还没有历史版本，这里用 `--force` 是安全的。

## 配方 4：迁移笔记到别的知识库

```bash
anynote note mv 1024 --base 71 --yes
```

需要对目标知识库有编辑权限；失败时会是业务错误（退出码 1）。

## 知识库操作

```bash
anynote base list --fields id,knowledgeBaseName        # 列表（默认前 20）
anynote base create --name "新知识库" --detail "简介" --yes
anynote base update 70 --name "改名" --yes             # 内部会自动回填 cover
anynote base rm 70 --yes                                # 只有创建者能删
```

⚠️ `base update` 必须带 cover，否则后端 `@Url` 切面会 NPE 成 `B0001`。CLI 已经帮你
先读取当前封面再回填，**不要绕过 CLI 直接打这个端点**。

⚠️ `base get <不存在的 id>` 返回 `A0301`（退出码 3）而不是"不存在"，这是后端权限切面
先于存在性检查执行导致的。别把它当成登录失效。

## 收尾

改完之后把「改了哪几条笔记、新 version 是多少」回报给用户；批量操作前先用
`--dry-run` 跑一遍确认影响面。
