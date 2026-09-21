# 提案：把 `/docs` 多人协作并入知识库笔记

## 背景

`/docs` 协同文档是独立于知识库体系的另一套文档存储：`apps/collab` 房间即文档、
正文落本地文件、没有任何后端接口与权限判定（任何登录用户可写任意房间）。
方案 `docs/collab/notes-collab-merge-plan.md` v2.0 已评审通过：协同降级为
“笔记的一种编辑模式”，真相源收敛回 MySQL，房间与权限绑定笔记主键。
Q1 已确认：`/docs` 只包含测试数据（新前端仅部署于线上测试环境），直接退役，不做迁移。

## 契约影响

### 新端点

`GET /notes/{noteId}/collab-grant`（普通 Bearer 认证，BFF 以会话身份调用）：

```json
{
  "noteId": 123,
  "perm": "MANAGE | EDIT | READ | NONE",
  "version": "1758297600000",
  "title": "会议纪要"
}
```

- `version` 与 `PATCH /notes/{noteId}` 的版本令牌同源（`NoteVersionUtil.toVersion(updateTime)`）。
- 笔记不存在返回 `A0404`；无权限返回 `perm: "NONE"`，由 BFF 决定拒签令牌。
- 不加 `@InnerAuth`：语义是“我对此笔记的协同准入”，不是服务间内部调用。

### 房间契约（破坏性变更）

```
note:<noteId>   noteId = 正整数（n_note 主键）
已删除：index、doc:<uuid>
note 房间不落盘（memoryOnlyPersistence）
```

协同令牌新增 `room` / `ro` claims；`room` 缺失视为非法令牌。旧 `/docs` 前端随本次退役，
无灰度期双契约。

### 错误码

沿用 `A0301` / `A0409` / `B0001`，无新增。

## 附加修复

`NoteServiceImpl#getNotePermissions` 的知识库只读成员分支使用
`Integer.valueOf(char)`，拿到字符码而不是数字，导致只读成员打开任意笔记必抛
`AUTH_ERROR`。先写复现用例，再改为 `Integer.parseInt(substring(2, 3))`。

## 验证

- Java：`NoteServiceImplCollabGrantTest` 覆盖作者 / 库管理 / 库编辑 / 库读 / 无关用户 / 笔记不存在；
  `getNotePermissions` 只读成员分支复现用例；`mvn test -pl note`。
- collab：房间契约、token 房间绑定、`ro` 写方向拦截、note 房间不落盘；`pnpm --filter @anynote/collab test`。
- 前端：BFF route、注入守卫、保存策略、双模式与降级；`pnpm --filter web test`。
- E2E：双浏览器共编、刷新读回、无权限拒签、`/docs` 404。
- 门禁：`pnpm openapi:check`、`pnpm --filter web bundle:budget`。
