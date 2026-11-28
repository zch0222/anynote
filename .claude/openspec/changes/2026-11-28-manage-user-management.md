# API 变更提案：管理后台用户管理

> 方案：[`docs/manage/MANAGE_PLAN.md`](../../../docs/manage/MANAGE_PLAN.md) §5.1 第二阶段「用户与权限」；里程碑：[`docs/manage/MANAGE_MILESTONES.md`](../../../docs/manage/MANAGE_MILESTONES.md) 第二阶段预留项
>
> 2026-11-28 用户确认：页面路由 `/system/users`；管理端接口统一迁移到 `/v1/admin/users`；列表使用 `pageNum` / `pageSize`；取消超管回退为 `MEMBER`；重置密码、角色变更、停用账号均注销目标用户全部会话；禁止操作自己；密码规则允许可打印 ASCII 特殊字符（不含空格）。

## 背景与范围

`apps/manage` 一期只覆盖 AI 治理。本期补齐平台级用户管理：用户列表、重置密码、设置/取消超级管理员、停用/启用账号。现有 `services/manage` 的 `ManageUserController` 只有列表、详情、改密、封禁/解封，且列表返回 `SysUser` 实体，实测会把 `password` BCrypt 哈希返回给前端，也没有角色字段。本期一并修正契约。

## 对外端点

外部路径经 Gateway `/api/manage/**`（`StripPrefix=2`）转发；以下为 manage 服务内路径。仅 `ADMIN_X` 可访问（Gateway `security.manage.urls`）。

| 方法 | 服务内路径 | 说明 | 变更类型 |
|---|---|---|---|
| GET | `/v1/admin/users` | 用户分页列表，支持 `pageNum`、`pageSize`、`username` 模糊搜索 | 新增（替代旧 `GET /users`） |
| GET | `/v1/admin/users/{userId}` | 用户详情 | 新增（替代旧 `GET /users/{userId}`） |
| PUT | `/v1/admin/users/{userId}/password` | 重置密码 | 新增（替代旧 `PATCH /users/{userId}`） |
| PUT | `/v1/admin/users/{userId}/super-admin` | 设置或取消超级管理员 | 新增 |
| POST | `/v1/admin/users/{userId}/ban` | 停用账号 | 新增（替代旧 `POST /users/{userId}/ban`） |
| POST | `/v1/admin/users/{userId}/unban` | 启用账号 | 新增（替代旧 `POST /users/{userId}/unban`） |

旧 `/users/**` 路径随本次迁移下线；`apps/web-legacy` 已下线，仓库内无其他消费者。

## 请求与响应

### 列表

`GET /v1/admin/users?pageNum=1&pageSize=20&username=e2em`

```json
{
  "code": "00000",
  "msg": "操作成功",
  "data": {
    "rows": [
      {
        "userId": 761,
        "username": "e2emnormal01",
        "nickname": "M20normal",
        "email": "",
        "phoneNumber": "",
        "status": 0,
        "roleId": 4,
        "roleName": "member",
        "roleKey": "MEMBER",
        "loginDate": "2026-11-27T21:33:38.000+08:00",
        "createTime": "2026-11-27T21:33:38.000+08:00"
      }
    ],
    "total": 1,
    "current": 1,
    "pages": 1
  }
}
```

- 列表排除 `sys_user.is_delete = 1`。
- `username` 为模糊匹配；不传则不过滤。
- 响应不再包含 `password`。

### 重置密码

`PUT /v1/admin/users/{userId}/password`

```json
{ "newPassword": "Abcdef1*" }
```

- 密码规则：8–15 位，必须包含大写字母、小写字母、数字；允许可打印 ASCII 特殊字符（`!` 到 `~`），不含空格。
- 成功后调用 `TokenUtil.removeTokens(username)`，目标用户全部 access / refresh token 立即失效。
- 禁止重置自己的密码。

### 设置/取消超级管理员

`PUT /v1/admin/users/{userId}/super-admin`

```json
{ "enabled": true }
```

- `enabled=true`：把用户角色替换为 `ADMIN_X`；对已是超管的用户（含操作者自己）重复设置为幂等成功。
- `enabled=false`：仅当用户当前为 `ADMIN_X` 时允许，回退为 `MEMBER`。
- 成功后注销目标用户全部会话，使其重新登录后按新角色生效。
- 禁止取消自己的超级管理员身份（报错文案：`不能取消自己的超级管理员身份`）；对自己设为超管不拦截，因操作者必为 `ADMIN_X`，属幂等重设。

### 停用/启用

`POST /v1/admin/users/{userId}/ban` / `POST /v1/admin/users/{userId}/unban`

- 停用：`sys_user.status=1` 并注销全部会话；禁止停用自己。
- 启用：`sys_user.status=0`；不注销会话。

## 内部系统服务端点

`services/system` 新增 `@InnerAuth` 内部端点，由 manage 服务 Feign 调用：

| 方法 | 服务内路径 | 说明 |
|---|---|---|
| GET | `/user/list` | 返回 `PageBean<ManageUserVO>`（原返回 `PageBean<SysUser>`） |
| GET | `/user/{userId}/manage` | 返回 `ManageUserVO` |
| PUT | `/user/{userId}/password` | 请求体 `AdminResetPasswordDTO` |
| PUT | `/user/{userId}/super-admin` | 请求体 `UpdateSuperAdminDTO` |

## 数据与 SQL

- 不新增表、不新增迁移。
- 列表查询新增 XML `resultMap`：`sys_user` LEFT JOIN `sys_user_role` / `sys_role`，映射 `ManageUserVO`。
- 角色替换：新增 `deleteUserRolesByUserId`（DELETE），复用现有 `insertUserRole`。

## OpenAPI

- `openapi/generate.sh` 的 services 增加 `manage`。
- 网关 Nacos 配置新增 `openapi-manage` 路由（`/manage/v3/api-docs`）。
- 新增 baseline `openapi/specs/manage.json`，同步 `openapi/specs/auth.json`、`openapi/specs/system.json` 的密码规则与用户契约。

## 密码规则同步

同一规则同步到：

- `services/auth` 的 `RegisterDTO`、`ResetPasswordDTO`
- `services/system` 的 `ResetPasswordDTO`（教师重置密码）
- 新增 `AdminResetPasswordDTO`
- `apps/web` 注册页、桌面/移动设置页的校验与说明文案

## 备注

- 所有管理端错误文案已由用户确认（见 `docs/changelist/2026-11-28-manage-user-management.md` 的验证记录）。
- 管理端接口的鉴权仍由 Gateway `security.manage.urls` 统一拦截；内部端点由 `@InnerAuth` HMAC 保护。
