# 桌面设置页退出登录 changelist

## 概览

- 文件：新增 3 个、修改 2 个、删除 0 个，共 5 个（含本文件）。
- 行数：新增 234、删除 0 行（含本文件）。
- 分布：`apps/web` 4 个；`docs/changelist` 新增本文件。
- 范围：只在桌面端 `/settings/profile` 的账号分区追加退出登录入口；复用既有 `useLogoutMutation` 与共享 `ConfirmDialog`，不改后端、API 契约、移动端 `/m/me` 或导航结构。
- 未纳入：既有未跟踪文件 `docs/ai-refactor/AI_CHAT_SIDE_PANEL_CODE_REVIEW_ROUND_3.md` 保持不动，不属于本批改动。

### 验证结果

| 命令或检查 | 结果 |
|---|---|
| `pnpm --filter web exec vitest run src/features/settings/components/__tests__/logout-settings-card.test.tsx src/features/settings/components/__tests__/account-settings.test.tsx` | 通过，2 个测试文件、32 条用例 |
| `pnpm --filter web exec vitest run --maxWorkers=6` | 通过，203 个测试文件、2335 条用例 |
| `pnpm --filter web test` | 2332/2335 通过；失败的 3 条为既有并发不稳定用例（`date-time-field` 2 条、`task-form-page` 1 条），与本次改动无关 |
| `pnpm --filter web exec vitest run src/features/tasks/components/__tests__/date-time-field.test.tsx src/features/tasks/components/__tests__/task-form-page.test.tsx --maxWorkers=2` | 通过，45 条用例，用于复核上述并发不稳定失败 |
| `pnpm --filter web typecheck` | 通过 |
| `pnpm exec biome check apps/web/src/features/settings/components/logout-settings-card.tsx apps/web/src/features/settings/components/account-settings.tsx apps/web/src/features/settings/components/__tests__/logout-settings-card.test.tsx apps/web/src/features/settings/components/__tests__/account-settings.test.tsx` | 通过，本批 4 个源码/测试文件无 Biome 问题 |
| `pnpm --filter web lint` | 未通过：Biome 在 `apps/web/src` 检出 16 个既有格式化/导入排序错误，均在本次未触碰文件；按范围要求未顺手修复 |
| `docker compose --env-file infra/.env.dev.local -f infra/docker-compose.yaml -f infra/docker-compose.dev.yaml build anynote-web` 与 `docker compose --env-file infra/.env.dev.local -f infra/docker-compose.yaml -f infra/docker-compose.dev.yaml up -d --no-deps anynote-web` | 通过，生产镜像构建成功；`anynote-anynote-web-1` 重启后为 healthy |
| 真实浏览器验收（Playwright 临时脚本，`http://localhost:3000/settings/profile`） | 通过：浅色/深色均渲染入口与确认框，文案与确认结果一致；取消不退出；确认后真实退出并跳转 `http://localhost:3000/login`；浏览器控制台无错误 |

## `apps/web`

桌面账号设置页新增独立退出登录卡片，并补充组件级与页面集成测试；退出清态逻辑继续由既有认证 mutation 单点负责。

| 文件 | 状态 | 作用与原因 |
|---|---|---|
| `apps/web/src/features/settings/components/logout-settings-card.tsx` | 新增 | 提供桌面端退出登录卡片，用二次确认挡住误触，并复用 `useLogoutMutation` 统一完成后端登出、前端清态与跳转，避免在设置页复制一套清理逻辑。 |
| `apps/web/src/features/settings/components/account-settings.tsx` | 修改 | 在账号分区的修改密码卡片后渲染退出登录卡片，使 `/settings/profile` 具备用户确认要求的桌面端入口。 |
| `apps/web/src/features/settings/components/__tests__/logout-settings-card.test.tsx` | 新增 | 覆盖取消不退出、确认发起 mutation、失败提示并关闭确认框、退出中禁用入口四条关键交互，防止已确认文案和错误路径回归。 |
| `apps/web/src/features/settings/components/__tests__/account-settings.test.tsx` | 修改 | 为嵌套的退出卡片 mock `useLogoutMutation` 并断言账号设置页出现退出按钮，防止上层集成时入口丢失。 |

## `docs/changelist`

| 文件 | 状态 | 作用与原因 |
|---|---|---|
| `docs/changelist/2026-11-26-desktop-settings-logout.md` | 新增 | 记录本批桌面退出登录改动的文件面、验证结果与评审重点。 |

## 审计要点

- **登出清态逻辑没有分叉**：本批只接入口，成功后的 BFF 登出、TanStack Query 缓存清理、右侧栏本地痕迹清理、IndexedDB 笔记副本清理与 `/login` 跳转仍全部在 `useLogoutMutation` 内；重点确认这里不需要也不应该再复制一份。
- **错误路径是刻意行为**：确认后请求飞行中确认框保持打开并禁用按钮；失败时关闭确认框并展示用户确认的 `退出登录失败，请重试`，使用户回到卡片入口可重新发起。
- **可见文案逐字来自用户确认**：入口 `退出登录`、标题 `退出登录？`、说明 `退出后需要重新输入账号密码，未保存的内容会丢失。`、进行中 `正在退出…` 与失败 toast 均未擅自改写。
- **移动端与导航未动**：`/m/me` 原退出入口保持原样；仓库里未被引用的 `components/layout/user-menu.tsx` 也没有被启用或改造，符合本次只补桌面设置页入口的范围。
- **全量 lint 失败不是本批引入**：`pnpm --filter web lint` 的 16 个错误都在既有未触碰文件；本批 4 个源码/测试文件的 targeted Biome 检查通过，评审时不要误把既有格式化债务算入本次改动。
