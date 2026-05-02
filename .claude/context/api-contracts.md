# API 契约规范

> 本文档约定前后端 API 设计规则，所有新接口须遵循。

---

## REST 命名规范

| 操作       | 方法   | 路径示例                     | 说明                           |
|------------|--------|------------------------------|--------------------------------|
| 列表查询   | GET    | `/note/list`                 | 查询参数放 query string        |
| 单项查询   | GET    | `/note/{id}`                 | 路径参数用于资源 ID            |
| 创建       | POST   | `/note`                      | 请求体为 JSON                  |
| 全量更新   | PUT    | `/note/{id}`                 | 幂等替换                       |
| 局部更新   | PATCH  | `/note/{id}`                 | 只传变更字段                   |
| 删除       | DELETE | `/note/{id}`                 | 成功返回 200（含确认消息）     |
| 子资源操作 | POST   | `/user/{userId}/ban`         | 动词作为子资源，不用作路径     |

**禁止**在路径中使用动词（~~`/banUser`~~、~~`/getNote`~~）。

---

## HTTP 状态码使用

| 场景                   | 状态码 | 备注                         |
|------------------------|--------|------------------------------|
| 操作成功               | 200    | 统一 200，业务状态在 body    |
| 创建成功（可选）       | 201    | 若使用须在 Location 头返回新资源 URL |
| 无权限（未登录）       | 401    | Gateway 层返回               |
| 无权限（已登录）       | 403    | Gateway / 服务层返回         |
| 资源不存在             | 404    | 服务层返回                   |
| 服务内部错误           | 500    | 全局异常处理器返回           |

业务错误（参数校验失败、业务规则违反）**统一返回 200**，通过 `code` 字段区分：

```json
{ "code": "A0160", "msg": "笔记标题不能为空", "data": null }
```

---

## 统一响应格式

```typescript
interface ResData<T> {
  code: string    // "00000" = 成功，其他 = 失败
  msg: string     // 人类可读消息
  data: T | null
}
```

分页响应 `data` 结构：

```typescript
interface PageResult<T> {
  list: T[]
  total: number
  pageNum: number
  pageSize: number
}
```

---

## 常用 ResCode

| 枚举值                    | code    | 含义               | 触发层       |
|---------------------------|---------|--------------------|--------------|
| SUCCESS                   | 00000   | 成功               | —            |
| UNAUTHORIZED_ERROR        | A0301   | 未授权             | Gateway      |
| ACCESS_TOKEN_NOT_FOUND    | A0350   | 缺少 accessToken   | Gateway      |
| USER_REQUEST_PARAM_ERROR  | A0160   | 请求参数错误       | 服务层       |
| BUSINESS_ERROR            | B0001   | 业务逻辑错误       | 服务层       |
| INNER_SERVICE_ERROR       | B0400   | 内部 Feign 调用失败 | FallbackFactory |

---

## 请求头约定

| 头名称                  | 来源              | 用途                                    |
|-------------------------|-------------------|-----------------------------------------|
| `Authorization`         | 客户端            | Bearer token（仅到 Gateway，之后被替换） |
| `user_id`               | Gateway 注入      | 已认证用户 ID，服务直接读取             |
| `from-source: inner`    | Feign 拦截器      | 标记内部调用                            |
| `X-Internal-Timestamp`  | Feign 拦截器      | 毫秒时间戳（HMAC 防重放）               |
| `X-Internal-Sign`       | Feign 拦截器      | HMAC-SHA256 签名                        |

---

## API 变更流程

1. 在 `.claude/openspec/changes/` 下按模板创建变更提案文档
2. 后端实现新接口，加 `@Operation` 注解
3. 前端运行 `pnpm openapi:generate` 更新 API 客户端类型
4. 前端基于新类型实现调用

**不允许**在生成代码中手动修改 `packages/api-client/src/` 下的文件，下次生成会覆盖。

---

## 版本控制

- 当前所有接口使用 `/` 根路径（无版本前缀），通过 Nacos 路由区分环境
- 破坏性变更（删除字段、修改语义）须在变更文案中标注 `[Breaking Change]`，并保证向后兼容过渡期（≥1 个迭代）
- 新增字段可直接上线，前端做防御性取值（`data?.field ?? defaultValue`）
