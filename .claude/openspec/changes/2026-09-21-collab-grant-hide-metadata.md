# 提案：`collab-grant` 无权限时不回标题与版本令牌

## 背景

`GET /notes/{noteId}/collab-grant`（`.claude/openspec/changes/2026-09-21-notes-collab-merge.md`
新增）是**普通 Bearer 认证**、刻意不挂 `@RequiresNotePermissions` 的端点——它要把
“没权限”与“没登录”区分开，所以无权限时回 `perm: "NONE"` 而不是 401。

副作用是：任何登录用户都能按 `noteId` 调用它。原实现无差别回 `title` 与 `version`
（= `updateTime` 毫秒戳），等于给出一份可枚举的**全站笔记标题与最后修改时间清单**。

2026-09-21 在真实容器栈上实测确认：用一个与该笔记毫无关系的新注册账号调用，

- `GET /notes/{id}` → `A0301 没有权限访问笔记`（正确）
- `GET /notes/{id}/collab-grant` → `200`，`{"perm":"NONE","version":"...","title":"..."}`（泄露）

## 契约影响

`CollabGrantVO` 的字段与类型不变，**取值语义收紧**：

```json
{ "noteId": 123, "perm": "NONE", "version": null, "title": null }
```

- `perm` 为 `NONE` 时，`title` 与 `version` 一律为 `null`。
- `perm` 为 `MANAGE / EDIT / READ` 时两者照旧返回。
- 笔记不存在仍返回 `A0404`（与 `GET /notes/{id}` 同口径，两条链路都区分
  “不存在”与“没权限”，本次不改动这一点）。

BFF `POST /api/auth/collab-token` 只读 `perm` 判断是否签发，不读这两个字段，
因此前端无需改动。OpenAPI 的字段 `description` 同步说明该语义，
`openapi/specs/note.json` baseline 已重生。

## 错误码

无新增，无变更。

## 验证

- Java：`NoteServiceImplCollabGrantTest` 新增两条——“无权限拿不到标题与版本令牌”
  （先写、改前必红）与“无权限时不再为取标题多查一次库”；`mvn -pl note -am test`。
- 真实栈：作者仍拿到 `MANAGE` + 标题 + 版本；无关账号拿到 `NONE` + 两个 `null`。
- 门禁：`pnpm openapi:check` baseline 一致。
