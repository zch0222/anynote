# CLI 凭据存储与刷新协议

## 背景与授权

`apps/cli`（`@anynote/cli`）是 Anynote 的第四个前端，供人与 agent 在终端操作知识库与笔记。
它直连 Gateway 使用 `Authorization: Bearer`，没有浏览器的 Cookie jar，因此 CLAUDE.md 禁止清单里
「token 只能存 httpOnly Cookie」的约束在这里无法照搬。

2026-09-12 用户要求按 `docs/cli/CLI_PLAN.md` 实施 CLI，本提案登记该方案对凭据存储的弱化及其边界。
这是既有约束的**新增例外**，与 M8.2 给 `apps/web/src/lib/desktop/bridge.ts` 开的例外同性质。

## 已确认的存储契约

| 项 | 取值 |
|----|------|
| 文件 | `<configDir>/credentials.json` |
| configDir 默认值 | Windows `%APPDATA%\anynote`；其余 `~/.anynote` |
| 覆盖方式 | `ANYNOTE_CONFIG_DIR` |
| 文件权限 | POSIX `0600`，父目录 `0700`；**Windows 无等价保护，不做 ACL** |
| 写入方式 | 临时文件 + `rename` 原子替换 |
| 内容 | `{ version: 1, current, profiles: { <name>: { apiUrl, accessToken, refreshToken, username, obtainedAt } } }` |

- 支持多 profile（`--profile` / `ANYNOTE_PROFILE`），互不干扰。
- `ANYNOTE_TOKEN` 环境变量优先级最高：此时**不落盘、不刷新**，token 过期直接以退出码 3 结束。
  这是 CI 与 agent 沙箱里"不留痕"的逃生口。
- 任何命令的 stdout / stderr 都不打印 token；`auth status` 只报告存在性与获取时间。
- Gateway 的外部 Bearer 契约、`/api/auth/*` 的请求与响应结构**不做任何改动**，本提案不改后端。

## 刷新协议（跨进程）

多个 agent 并发跑 CLI 是常态，而后端刷新会轮换 refreshToken：两个进程各拿同一个旧 rt 去刷，
后到的那个会带着已作废的 rt 请求，结果是两边都被登出。因此：

1. 刷新前读一次凭据文件（`before`）。
2. 用 `<configDir>/.refresh.lock` 目录（`mkdir` 原子性，Windows / POSIX 行为一致）串行化，
   超过 `staleMs`（默认 10s）的锁视为持有者已崩溃，可抢占。
3. 拿到锁后**再读一次**：`accessToken` 已变说明别人刷过了，直接复用，不再打后端。
4. 刷新成功后**先落盘、再释放锁**。
5. 等锁超时（默认 5s）不报错：重读凭据，变了就用新的，没变返回 null 交给上层按 401 处理。

401 只重放一次；请求体先缓冲成 ArrayBuffer 以支持重放。

## 验证

- `apps/cli/src/__tests__/store.test.ts`：原子写、多 profile、环境变量优先级、
  **并发刷新只打一次后端**、等锁超时后重读到别人的新 token。
- `apps/cli/src/__tests__/lock.test.ts`：并发只有一个拿到锁、陈旧锁抢占、超时返回 null、
  owner.json 损坏时按目录时间判断。
- `apps/cli/src/__tests__/api.test.ts`：401 刷新后用新 token 重放同一份请求体，且只重放一次。
- `apps/cli/e2e/cli.live.test.ts`：真实栈上验证 `auth register / login / whoami / status / logout`
  闭环，并断言 stdout 不含 accessToken。

## 需要同步的文档

- CLAUDE.md 禁止清单：为 CLI 凭据落盘增加显式例外。
- CLAUDE.md「上下文文档导航」：加 `docs/cli/` 指针。
- `apps/cli/README.md` 与 `.claude/skills/anynote-cli/SKILL.md`：写明 Windows 上没有文件权限保护。
