# 管理后台用户管理

日期：2026-11-28

范围：`apps/manage`、`apps/web`、`services/{api,system,manage,auth,common}`、`openapi`、`infra`、`.claude/openspec`。

状态：**已实现并验收**。管理端用户列表、重置密码、设置/取消超级管理员、停用/启用账号已接通；注册、自助改密、教师重置密码同步允许可打印 ASCII 特殊字符；OpenAPI baseline 已更新；宿主机单测、前端单测、typecheck、ESLint、生产构建、真实 Docker 栈 Playwright 全部通过。

## 概览

| 项 | 数量 |
|---|---|
| 修改（已跟踪，含 1 个删除） | 32 个文件，+543 / −154 |
| 新增（未跟踪） | 17 个文件，1743 行代码与测试 + 130 行 OpenSpec 提案 + 12.2 KB 生成的 manage baseline |
| 删除 | 1 个文件（`SysUserUpdateParam.java`） |

按目录分布：

- `apps/manage`：12 个（页面、组件、composable、schema、BFF 白名单、单测、E2E）
- `services/{api,system,manage,auth,common}`：23 个（契约、服务实现、Mapper、DTO、单测；含 1 个删除）
- `apps/web`：7 个（注册、桌面/移动设置页、密码规则与测试）
- `openapi` / `infra`：6 个（生成脚本、网关 OpenAPI 路由、Dockerfile.manage、3 份 baseline）
- `.claude/openspec`：1 个（API 变更提案）

未列入本清单：`docs/review/manage-m20/*.md`（4 份既有评审文档，保持未跟踪）、仓库根目录的 `nul`（0 字节 Windows 产物）、本 changelist 自身。

验证结果（2026-11-28，均为实际执行）：

| 命令 | 结果 |
|---|---|
| `mvn test`（`services` 根，全量 30 模块） | **BUILD SUCCESS**，3 分 17 秒；manage 14/14、system 管理端 8/8、auth/system 密码规则各 12/12 |
| `mvn -pl manage test`（补齐详情端点用例后复跑） | **15/15 全过**（controller 5 + service 10） |
| `pnpm --filter manage test` | 14 个文件 / **197 例全过** |
| `pnpm --filter manage typecheck` | exit 0 |
| `pnpm --filter manage lint` | exit 0 |
| `pnpm --filter manage build` | exit 0，Nuxt/Nitro 生产构建完成 |
| `pnpm --filter manage test:e2e`（真实 Docker 栈，Chromium） | **15 例全过**（原 10 例 + 新增用户管理 5 例） |
| `pnpm --filter web exec vitest run`（注册/设置相关 4 个文件） | **87 例全过** |
| `pnpm --filter web test`（全量） | 2306 例通过 / 3 例超时失败（均在未改动的 `features/tasks` 两个文件）；单独重跑这两个文件 **45 例全过**，判定为全量并发下的既有 flaky |
| `pnpm --filter web typecheck` | exit 0 |
| `pnpm exec biome check`（本次新增/修改的 6 个 web 文件） | 通过 |
| `pnpm openapi:generate` | 7 个服务全部拉取成功；连续两次生成 md5 完全一致 |
| Docker 重建 `anynote-modules-system` / `anynote-modules-manage` / `anynote-auth` / `anynote-gateway` / `anynote-manage-web` | 镜像构建成功，容器 healthy，`http://localhost:3080/healthz` 返回 200 |
| 真实栈 API 验收 | 列表/详情/自我操作拦截/设超管/取消超管/重置密码/停用/解封/注册特殊字符/自助改密特殊字符全部符合预期；`e2emnormal01` 已恢复为 `MEMBER`、正常状态、原密码 |
| 真实栈文案复核（文案对齐后重建 manage 镜像） | 取消自己超管返回 `不能取消自己的超级管理员身份`；重置自己密码/停用自己文案不变；设自己为超管幂等成功且会话即时失效（旧 token 再访问返回 `A0350`） |

> `pnpm openapi:check` 在工作区未提交时会把本次 baseline 变更当成 diff 而失败；已用连续两次 `pnpm openapi:generate` 的 md5 对比证明生成确定，baseline 变更需随本次改动一起提交。
>
> `pnpm --filter web lint` 全量仍为红：`video-player.test.tsx`、`process.test.ts`、`sse.ts`、`mobile-settings.tsx` 等文件存在既有 Biome 格式问题（本次仅新增/修改的 6 个 web 文件已单独校验通过），未顺手重排。

## 契约与服务端

### services/api（跨服务契约）

| 文件 | 状态 | 作用与原因 |
|---|---|---|
| `services/api/anynote-api-system/src/main/java/com/anynote/system/api/model/vo/ManageUserVO.java` | 新增 | 管理端用户列表/详情 VO，含角色与联系方式；替代直接返回 `SysUser`，避免把 `password` 哈希带出接口 |
| `services/api/anynote-api-system/src/main/java/com/anynote/system/api/model/dto/AdminResetPasswordDTO.java` | 新增 | 管理员重置密码请求体，内置 8–15 位、大小写+数字、允许可打印 ASCII 特殊字符的校验 |
| `services/api/anynote-api-system/src/main/java/com/anynote/system/api/model/dto/UpdateSuperAdminDTO.java` | 新增 | `enabled` 控制设置/取消超管，避免用两个端点表达同一状态 |
| `services/api/anynote-api-system/src/main/java/com/anynote/system/api/RemoteUserService.java` | 修改 | 列表改为 `pageNum` + `PageBean<ManageUserVO>`；新增详情、重置密码、设置/取消超管四个内部 Feign 方法 |
| `services/api/anynote-api-system/src/main/java/com/anynote/system/api/factory/RemoteUserFallbackFactory.java` | 修改 | 为新增 Feign 方法补降级返回 `INNER_SYSTEM_SERVICE_ERROR`，保持熔断器不因抛异常失效 |
| `services/api/anynote-api-system/src/main/java/com/anynote/system/api/model/bo/SysUserUpdateParam.java` | 删除 | 仅旧 manage 改密接口使用；新接口改用 `AdminResetPasswordDTO`，删除避免两套密码规则并存 |

### services/system（用户数据与角色）

| 文件 | 状态 | 作用与原因 |
|---|---|---|
| `services/system/src/main/java/com/anynote/system/controller/SysUserController.java` | 修改 | 列表改为返回 `PageBean<ManageUserVO>`；新增 `GET /user/{id}/manage`、`PUT /user/{id}/password`、`PUT /user/{id}/super-admin` 三个 `@InnerAuth` 内部端点 |
| `services/system/src/main/java/com/anynote/system/service/SysUserService.java` | 修改 | 新增管理端列表/详情、管理员重置密码、设置/取消超管的方法签名 |
| `services/system/src/main/java/com/anynote/system/service/impl/SysUserServiceImpl.java` | 修改 | 列表走新 resultMap；重置密码与角色变更均校验用户存在、更新后 `TokenUtil.removeTokens` 使目标用户全部会话失效；取消超管仅允许当前为 `ADMIN_X` 的用户并回退 `MEMBER` |
| `services/system/src/main/java/com/anynote/system/mapper/SysUserMapper.java` | 修改 | 新增 `selectManageUserList`（含 userId/username 条件）与 `deleteUserRolesByUserId` |
| `services/system/src/main/resources/mapper/SysUserMapper.xml` | 修改 | 新增 `ManageUserVOResult` resultMap 与联表查询，显式映射角色、邮箱、手机号、时间字段；新增删除用户角色的 DELETE |
| `services/system/src/main/java/com/anynote/system/model/dto/ResetPasswordDTO.java` | 修改 | 教师重置密码同步为新的 8–15 位特殊字符规则，避免同一产品两套密码规则 |
| `services/system/src/test/java/com/anynote/system/service/impl/SysUserServiceImplManageUserTest.java` | 新增 | 覆盖列表映射、详情不存在、重置密码加密/注销会话、设超管/取消超管/非超管/角色不存在等分支 |
| `services/system/src/test/java/com/anynote/system/model/dto/AdminPasswordRuleDTOTest.java` | 新增 | 校验管理员重置、教师重置、超管状态 DTO 的密码与必填规则 |

### services/manage（管理端入口）

| 文件 | 状态 | 作用与原因 |
|---|---|---|
| `services/manage/src/main/java/com/anynote/manage/controller/ManageUserController.java` | 修改 | 整体迁移到 `/v1/admin/users`，补齐 `@Operation`/`@Parameter`；列表 `pageNum`，新增密码与超管端点，保留详情、封禁、解封 |
| `services/manage/src/main/java/com/anynote/manage/service/ManageUserService.java` | 修改 | 接口改为返回 `ManageUserVO`，新增重置密码与设置/取消超管方法 |
| `services/manage/src/main/java/com/anynote/manage/service/impl/ManageUserServiceImpl.java` | 修改 | 通过 Feign 调用 system 内部端点；在管理端拦截“停用自己/重置自己密码/取消自己超管”，并按操作映射已确认的错误文案；对自己“设为超管”不拦截，因操作者必为 `ADMIN_X`，属幂等重设 |
| `services/manage/src/test/java/com/anynote/manage/service/impl/ManageUserServiceImplTest.java` | 新增 | 覆盖自我保护（含自己取消超管拦截与自己设为超管放行）、远程分页透传、成功/失败文案映射、封禁/解封委托 |
| `services/manage/src/test/java/com/anynote/manage/controller/ManageUserControllerTest.java` | 新增 | 覆盖六个端点的参数透传与 `ResData` 统一包装，确保控制器不丢失分页/关键字/请求体 |

### services/auth 与 common

| 文件 | 状态 | 作用与原因 |
|---|---|---|
| `services/auth/src/main/java/com/anynote/auth/model/dto/RegisterDTO.java` | 修改 | 注册密码允许可打印 ASCII 特殊字符（`!` 到 `~`，不含空格），仍要求 8–15 位且含大小写+数字 |
| `services/auth/src/main/java/com/anynote/auth/model/dto/ResetPasswordDTO.java` | 修改 | 自助改密同步同一规则 |
| `services/auth/src/test/java/com/anynote/auth/model/dto/PasswordRuleDTOTest.java` | 新增 | 覆盖注册/自助改密对特殊字符、空格、缺失大小写数字与越界长度的校验 |
| `services/common/anynote-common-core/src/main/java/com/anynote/core/enums/Role.java` | 修改 | 补 `MEMBER` 角色枚举，取消超管回退时不再使用魔法字符串 |

## OpenAPI 与部署

| 文件 | 状态 | 作用与原因 |
|---|---|---|
| `openapi/generate.sh` | 修改 | services 列表加入 `manage`，从网关拉取第 7 份 spec 并生成 TS 客户端 |
| `infra/docker/nacos/configs/anynote-gateway-dev.yml` | 修改 | 新增 `openapi-manage` 路由（`/manage/v3/api-docs` → `lb://anynote-manage`），否则生成脚本拿不到 manage spec |
| `infra/Dockerfile.manage` | 修改 | 构建期类型生成循环加入 `manage`，容器内可解析 `@anynote/api-client/src/manage` |
| `openapi/specs/manage.json` | 新增（生成物） | `pnpm openapi:generate` 产出的 manage 契约 baseline，含 `/v1/admin/users/**` 六个端点；由 CI `openapi-check.yml` 卡 diff，评审看后端注解而不是本文件 |
| `openapi/specs/auth.json` | 修改（生成物） | 注册/自助改密密码 pattern 同步为允许特殊字符；由 `pnpm openapi:generate` 派生，CI `openapi-check.yml` 卡 diff |
| `openapi/specs/system.json` | 修改（生成物） | 内部用户端点、`ManageUserVO`、`PageBeanManageUserVO`、教师重置密码 pattern 同步；由 `pnpm openapi:generate` 派生，CI `openapi-check.yml` 卡 diff |

## apps/manage（用户管理页）

| 文件 | 状态 | 作用与原因 |
|---|---|---|
| `apps/manage/app/lib/api/client.ts` | 修改 | 新增 `manageClient`，指向同源 BFF `/api/proxy/manage`，类型来自生成的 manage 契约 |
| `apps/manage/app/lib/api/query-keys.ts` | 修改 | 新增 `manageUsers` 查询键，写操作后精确失效列表 |
| `apps/manage/app/lib/schemas/manage-user.ts` | 新增 | 用户分页/单项 zod schema、角色与状态文案、自我保护判定、重置密码表单校验 |
| `apps/manage/app/composables/system/useManageUsers.ts` | 新增 | 列表 Query 与重置密码/超管/封禁/解封 Mutation，统一走 typed `manageClient` |
| `apps/manage/app/components/system/users/UserTable.vue` | 新增 | 用户表格：账号/昵称、角色、状态、邮箱、手机号、注册时间、最后登录与操作；当前账号标注并禁用危险操作 |
| `apps/manage/app/pages/system/users.vue` | 新增 | 用户管理页：用户名模糊搜索、分页、三个确认弹窗（重置密码/超管/停用启用）与已确认 toast 文案 |
| `apps/manage/app/components/layout/AppSidebar.vue` | 修改 | 新增“平台与系统 / 用户管理”导航分组 |
| `apps/manage/app/layouts/default.vue` | 修改 | 面包屑按 `/system` 切换“平台与系统”，命令面板新增用户管理入口，页面标题登记 `/system/users` |
| `apps/manage/server/utils/proxy-allowlist.ts` | 修改 | BFF 代理白名单新增 `/manage` 前缀，用户管理请求才能到达网关 |
| `apps/manage/test/app/manage-user.test.ts` | 新增 | 覆盖角色/状态文案、自我保护、密码特殊字符/空格/大小写/长度/二次确认、分页 schema |
| `apps/manage/test/server/refresh-proxy.test.ts` | 修改 | 白名单用例补充 `/manage/**` 放行与 `/managex` 拒绝 |
| `apps/manage/e2e/user-management.spec.ts` | 新增 | 真实栈只读 E2E：侧栏进入、列表字段、用户名搜索、空状态、当前账号按钮禁用、重置密码弹窗说明与取消 |

## apps/web（密码规则同步）

| 文件 | 状态 | 作用与原因 |
|---|---|---|
| `apps/web/src/features/auth/schemas.ts` | 修改 | 注册 zod 规则允许可打印 ASCII 特殊字符，并同步校验文案 |
| `apps/web/src/features/auth/components/register-form.tsx` | 修改 | 注册页密码帮助文案补充“可含特殊字符（不含空格）” |
| `apps/web/src/features/settings/use-profile.ts` | 修改 | 自助改密 schema 与错误文案同步新规则 |
| `apps/web/src/features/settings/components/account-settings.tsx` | 修改 | 桌面设置页密码说明同步新规则 |
| `apps/web/src/features/settings/components/mobile-settings.tsx` | 修改 | 移动设置页新增同一密码说明，保持桌面/移动口径一致 |
| `apps/web/src/features/auth/__tests__/schemas.test.ts` | 新增 | 注册密码特殊字符、空格、大小写数字、长度边界单测 |
| `apps/web/src/features/settings/components/__tests__/account-settings.test.tsx` | 修改 | 新增“允许特殊字符并提交”用例，锁定前端到 mutation 的完整链路 |

## 文档

| 文件 | 状态 | 作用与原因 |
|---|---|---|
| `.claude/openspec/changes/2026-11-28-manage-user-management.md` | 新增 | API 变更提案：端点、请求/响应、内部 Feign、权限、密码规则、OpenAPI 与 SQL 约束 |

## 审计要点

1. **密码哈希不再出接口**：`GET /v1/admin/users` 从 `SysUser` 改为 `ManageUserVO`，实测旧接口会把 BCrypt 哈希返回给浏览器；新联表查询显式映射字段，评审重点看 `SysUserMapper.xml` 的 `ManageUserVOResult` 是否遗漏或误映射。
2. **角色替换是“先删后插”**：`updateSuperAdmin` 在事务内删除 `sys_user_role` 全部行再插入目标角色；取消超管前先确认当前角色是 `ADMIN_X`，避免把教师/学生误降为 `MEMBER`。
3. **会话失效边界**：重置密码、设/取消超管、停用账号都会 `TokenUtil.removeTokens(username)`；如果漏掉，目标用户会在旧 token 过期前继续保留旧角色或已重置密码的会话。单测与真实栈 API 验收都覆盖了这条。
4. **自我保护只在 manage 层**：`ManageUserServiceImpl` 用 `TokenUtil.getLoginUser()` 拦截自己停用、自己重置密码、自己取消超管；对自己设为超管不拦截（操作者必是 `ADMIN_X`，等同幂等重设，与“已是超管再次设置返回成功”的规则一致）。system 内部端点保持通用，评审需确认没有其他管理端入口绕过 manage 直接调用内部端点（外部调用会被 `@InnerAuth` 拒绝）。
5. **密码规则一次性收敛**：注册、自助改密、教师重置、管理员重置四处使用同一正则 `[\x21-\x7E]{8,15}`；前端 zod、后端 DTO、OpenAPI baseline 三处必须同时改，评审重点看 `auth.json` / `system.json` 的 pattern 与前端 schema 是否逐字一致。
6. **BFF 白名单扩大**：`/manage` 前缀放行后，管理后台可代理 manage 服务的全部路径；这是本次用户管理的前置条件，但也意味着 manage 服务自身端点必须继续由网关 `security.manage.urls` 的 `ADMIN_X` 规则保护，不能直接暴露 manage 端口到公网。
