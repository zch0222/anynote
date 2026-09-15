# 新增：个人资料对外更新端点

## 背景

设置页「账号」（画板 D-12 / M-11）要保存昵称、性别、邮箱、手机号。
现状比「清空不生效」更严重：**资料保存目前完全不可用**。

`PUT /user/{userId}` 标了 `@InnerAuth`（`SysUserController.java` 原 L110-116），
那是给服务间 Feign 调用用的内部端点，浏览器经网关调用一律被拒
（`from-source: inner` + HMAC 头是内部调用方才有）。M7.6 第 5 条已登记这个缺口。

它同时收完整 `SysUser`，把 `password` / `status` / `deleted` 一起暴露在请求体里，
即使放开鉴权也不适合对外开放。

## 契约

```
PUT /user/mine/profile
身份：从登录态取当前用户 id（tokenUtil.getLoginUser()），请求里不传 userId

UpdateMyProfileDTO {
  nickname:    string   @NotBlank @Size(max = 30)
  sex:         integer  @NotNull，只允许 0 男 / 1 女 / 2 未知（sys_user.sex 的定义，前端显示为「未设置」）
  email:       string   @Nullable，非空时 @Email @Size(max = 50)；"" 与 null 都表示清空
  phoneNumber: string   @Nullable，非空时 @Pattern("^1\\d{10}$")；"" 与 null 都表示清空
}

ResData<SysUser>   // 更新后的资料，字段白名单与 GET /user/mine 一致（不含 password）
```

**语义**：PUT 就是**整体替换这四个字段**。前端每次都把四个字段全部带上，
所以不存在「没传就不改」的歧义，清空邮箱和手机号自然成立。

## 实现

- `SysUserController` 新增 `PUT /user/mine/profile`，**不加 `@InnerAuth`**
  （这是给外部浏览器用的公开端点，身份从登录态取）。
- `SysUserService#updateMyProfile(UpdateMyProfileDTO)` 用 `LambdaUpdateWrapper<SysUser>`
  显式 `set` 四个字段加 `update_by` / `update_time`，`where id = 当前用户`。
  - 不用 `updateById`：那会把请求体里没打算改的列（密码、状态等）一起写进去。
  - 清空写空串 `''`，因为 `sys_user.email` / `phone_number` 的默认值就是空串
    （`infra/sql/anynote.sql:1014-1015`），和注册时没填的账号保持一致。
- 返回 `getMyUserInfo()`，前端直接用它写 `settingsQueryKeys.profile` 缓存。
- 原 `PUT /user/{userId}`（`@InnerAuth`）不动，服务间调用不受影响。
- 网关已放行 `/api/system/**` 的登录态请求，不改路由。

### 与方案原文的一处偏差

方案写的手机号正则是 `^1\d{10}$`，同时又要求「`""` 与 `null` 都表示清空」。
这两条在 `@Pattern` 下是冲突的：`@Pattern` 对空串同样生效，`""` 会被判为格式错误，
清空手机号的请求会被 400 拒绝。实现改成 `^$|^1\d{10}$`——空串单独放行，
其余取值仍必须严格匹配手机号格式。这是把方案的两条要求同时满足的必要调整。

## 验证

- `services/system/src/test/java/com/anynote/system/service/impl/SysUserServiceImplUpdateMyProfileTest.java`
  6 条用例（Mockito 捕获 `UpdateWrapper`）：只更新当前登录用户 /
  null 与空串都写成 `''` / `sex = 2` 原样写入 / set 子句只含白名单列与
  `update_by`·`update_time`（不含 password·username·status）/ 返回刷新后的资料 / 合法值不抛异常。
- `services/system/src/test/java/com/anynote/system/model/dto/UpdateMyProfileDTOTest.java`
  用 `jakarta.validation.Validator` 测 DTO：非法邮箱被拒 / 空串邮箱通过 /
  超长昵称被拒 / `sex = 3` 被拒，另有边界值（30 位昵称、0·1·2 三个 sex 值、空串手机号）。
- `mvn test -pl system` 通过。
- `pnpm openapi:check` 通过。
- 真实栈验收（方案 §4 B-3）：能改昵称、清空邮箱与手机号、把性别改回「未设置」（2）；
  传别人的资料无从下手（端点没有 userId 参数）。

## 后续

M7.6 第 5 条可标记为已关闭。
