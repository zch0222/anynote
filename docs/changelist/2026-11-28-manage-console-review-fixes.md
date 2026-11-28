# 管理后台 M20：评审修复

日期：2026-11-28
依据：`docs/review/manage-m20/`（refuter / reviewer / security-reviewer，T3 含安全审查；评审文档未入库）
范围：`apps/manage`、`infra`、`docs/manage`；不改 Java 后端、OpenAPI、SQL、Nacos。
状态：**复核确认的 21 项（18 Important + 3 Nit）已全部修复；另修复验证中发现的 1 项既有缺陷；宿主机单测、typecheck、ESLint、真实 Docker 栈 Playwright、浏览器深浅色走查全部通过。1 项清单外问题（布局顶栏不渲染）未处理，待确认。**

## 概览

| 项 | 数量 |
|---|---|
| 修改（已跟踪） | 37 个文件，+1506 / −227 |
| 新增（未跟踪） | 12 个文件，913 行代码与测试 + 本清单 |
| 删除 | 0 |

未列入本清单：`docs/review/manage-m20/*.md`（4 份评审文档，按约定保持未跟踪）与仓库根目录的 `nul`。

改动集中在 `apps/manage`（40 个文件）：Nitro BFF 6 个、前端 20 个、测试与 e2e 14 个（含 vitest 配置）；其余为 `infra` 4 个、`docs/manage` 3 个、`CLAUDE.md` 1 个。

验证结果（2026-11-28，均为实际执行）：

| 命令 | 结果 |
|---|---|
| `node node_modules/vitest/vitest.mjs run`（`apps/manage`） | 13 files / **181 tests，全部通过** |
| `node node_modules/nuxt/bin/nuxt.mjs typecheck`（`apps/manage`） | exit 0，0 个错误 |
| `node node_modules/eslint/bin/eslint.js .`（`apps/manage`） | exit 0 |
| `node --test infra/manage/config.test.mjs` | **7 tests，全部通过** |
| `pytest infra/tests/test_compose.py` | **6 passed** |
| `nginx:1.28-alpine` 容器内 `nginx -t`（临时自签证书，替换域名占位） | 修复前 `[emerg] host not found in upstream "anynote_manage"`、`test failed`；修复后 `syntax is ok`、`test is successful` |
| `docker compose … build anynote-manage-web` + `up -d` | 镜像构建 exit 0；容器 `User=node`，`docker exec … id` 为 `uid=1000(node)`（修复前 `uid=0(root)`），`/healthz` 返回 200 |
| `node node_modules/@playwright/test/cli.js test`（真实 Docker 栈，`http://localhost:3080`） | **10 passed**（原有 5 条 + 新增回归 5 条） |
| 真实浏览器深浅两色走查（一次性脚本，未入库） | 登录、概览、模型、检索、运行列表（含下拉展开态）、Trace 详情六页签逐页截图核对，无页面报错 |

> 本机 `pnpm` 被 NVM 信任检查拦截（`NVM4306`），以上 npm 脚本均改为直接用 `node` 调用仓库已安装的工具，未安装或改动任何依赖。
> 容器构建通过构建参数 `HTTP_PROXY / HTTPS_PROXY`（`host.docker.internal:7890`）访问 npm 源；这两项是 Docker 预定义构建参数，已核对镜像环境变量与构建历史中不含代理信息。

## Nitro BFF（`apps/manage/server`）

会话与代理链路，影响面最大。

| 文件 | 状态 | 作用与原因 |
|---|---|---|
| `apps/manage/server/utils/refresh.ts` | 修改 | 刷新成功后旧 refreshToken 在 30 秒内直接复用旋转结果；此前锁在刷新完成时立即删除，cookie 轮换前已在途的请求会拿已被后端删除的旧 rt 再次刷新，返回 401 后清掉刚写入的新会话 |
| `apps/manage/server/api/proxy/[...path].ts` | 修改 | 刷新成功后无论重放结果如何都下发新 Cookie（此前仅 `status < 500` 时下发，重放 5xx、超时、非 JSON 会让浏览器留着已失效的旧 rt）；新令牌重放仍 401 时注销新令牌对并清 Cookie |
| `apps/manage/server/api/auth/me.get.ts` | 修改 | `/user/mine` 在刷新后查询失败或返回业务错误时同样轮换 Cookie；新令牌仍 401 时注销并清 Cookie；注销改用统一工具 |
| `apps/manage/server/utils/cookies.ts` | 修改 | 新增 `attachTokenCookies`，把新令牌对的 Cookie 规格附到任意响应上，供代理与 me 两条链路共用 |
| `apps/manage/server/utils/revoke.ts` | 新增 | 新增 `createRevokeFn` / `revokeTokens`：调认证服务 `/logout` 撤销令牌对且失败静默，不掩盖调用方已得出的结论 |
| `apps/manage/server/utils/proxy-allowlist.ts` | 修改 | 路径穿越判定改为逐段循环解码（上限 5 轮），解码后含 `/`、`\` 或为 `.`、`..` 即拒绝；此前 `..%2f`、`%2e%2e%2f`、`..%5c..%5c`、多重编码都会被放行并原样拼进转发 URL |

## 会话、全局外壳与登录页

| 文件 | 状态 | 作用与原因 |
|---|---|---|
| `apps/manage/app/app.vue` | 修改 | 在 `NuxtPage` 外包一层 `NuxtLayout` 并注册会话复核；自定义 `app.vue` 此前只渲染页面，`layouts/default.vue` 与 `layouts/auth.vue` 从未生效 |
| `apps/manage/app/composables/auth/useAdminSession.ts` | 修改 | 新增 `recheckIfDue`（60 秒节流、在途去重）、`resolveSessionRecheck`（401/403 为失效，其余为暂不可用）、`isSessionRecheckDue`、`registerSessionRecheck` 与登录页提示状态；登录后此前再无权威角色复核入口 |
| `apps/manage/app/composables/auth/useAdminSessionRecheck.ts` | 新增 | 在根组件上监听窗口聚焦与标签页重新可见，复核失权时清空 Query 缓存并退回登录页；会话一旦失效同步清缓存，避免残留上一位管理员的数据 |
| `apps/manage/app/middleware/auth.global.ts` | 修改 | 已登录访问受保护页时按节流间隔复核会话，失权走既有的未登录跳转 |
| `apps/manage/app/pages/login.vue` | 修改 | 被退回登录页时显示 BFF 返回的失效提示（取用后清空，只提示一次） |

## Trace 归并与检查器

对齐 Harness 的真实事件形状（`ai-service/harness/trace/middleware.py`）。

| 文件 | 状态 | 作用与原因 |
|---|---|---|
| `apps/manage/app/lib/trace/buildTraceTimeline.ts` | 修改 | 轮次归属改为按事件类型取真实轮次（`trace.context` 读 `manifest.modelTurn`、`trace.visual` 读顶层 `modelTurn`）；瀑布条用 `durationMs` 推导起点，模型拆首字前与生成两段，工具按 `actions` 逐条出条；工具调用数按 `actions` 条数统计；新增 `actionItems`、`listToolCalls` |
| `apps/manage/app/lib/trace/resolveContextBlobs.ts` | 修改 | 哈希索引改从各 `trace.context` 的 `attributes.blobs` 建立（Harness 从不生成 `trace.blob`，此前真实数据全部标记缺失）；清单条目字段对齐真实 `tokenCount` 等 |
| `apps/manage/app/lib/trace/buildProcessCompare.ts` | 新增 | 新增 `buildProcessCompareRows`：把过程视图行整理为对比行，带出对象文字、结果计数与条目标题、完整全文；此前只显示名称与前 300 字，无法核对脱敏 |
| `apps/manage/app/lib/schemas/agent-trace.ts` | 修改 | 过程视图 schema 补 `target` / `result` 类型；新增 `RunOutcome` 全集、结果筛选项与徽章颜色、运行列表 URL 解析与生成、下拉框 `ALL` 哨兵与互转函数 |
| `apps/manage/app/components/ai/traces/TraceWaterfall.vue` | 修改 | 按 `kind` 着色并显示条目标签（`模型·首字前` / `模型·生成` / `工具·{工具名}`），时长放悬浮提示 |
| `apps/manage/app/components/ai/traces/TraceInspector.vue` | 修改 | 上下文数量标签改用 `tokenCount`；工具诊断按单次调用展开；用户视图对比显示对象、结果条目与可展开全文 |
| `apps/manage/app/pages/ai/traces/index.vue` | 修改 | 结果筛选项换成真实 `RunOutcome`；筛选条件与页码写入 URL 并在进入页面与前进 / 后退时回填；“全部结果”用 `ALL` 表示（下拉项 value 不能为空字符串，此前整页 500） |
| `apps/manage/app/pages/ai/traces/[runId].vue` | 修改 | 结果徽章颜色改用统一口径，`ANSWERED` 不再落到信息色 |

## 概览看板

| 文件 | 状态 | 作用与原因 |
|---|---|---|
| `apps/manage/app/composables/ai/useAgentRunStats.ts` | 修改 | 近期异常运行改为后端按 `outcome` 分别筛选失败与已取消、各取 10 条后合并取前 10 条（此前取全部运行前 50 条再前端过滤，会漏掉更早的异常）；时间窗改到每次请求时重算（此前固定在首次求值，刷新不纳入新运行）；新增 `mergeRecentAbnormalRuns` |
| `apps/manage/app/lib/schemas/agent-stats.ts` | 修改 | 分页 schema 的 `list` 改为后端 `PageBean` 的 `rows` 并补 `current`；此前 Zod 把 `rows` 剥掉，“近期异常运行”恒为空 |
| `apps/manage/app/composables/ai/useAgentRuns.ts` | 修改 | 删除本地重复的行 schema，复用 `agentRunPageSchema`，避免两处字段再次漂移 |

## 模型页与检索参数页

| 文件 | 状态 | 作用与原因 |
|---|---|---|
| `apps/manage/app/pages/ai/models.vue` | 修改 | 逻辑模型配置读取成功前不渲染卡片（骨架占位），读取失败显示重试；后端保存是整体覆盖，此前读取失败后仍可保存空表单抹掉现有配置 |
| `apps/manage/app/components/ai/models/LogicalModelCard.vue` | 修改 | 配置未加载时禁用保存按钮 |
| `apps/manage/app/pages/ai/retrieval.vue` | 修改 | 有未保存修改时后台重取不再覆盖草稿；服务器版本变化后提示并提供“放弃我的修改并加载最新”（点击二次确认） |
| `apps/manage/app/lib/schemas/retrieval-setting.ts` | 修改 | 新增 `resolveSettingsSync`：决定是否套用服务器数据、是否提示版本变化 |

## 测试

| 文件 | 状态 | 作用与原因 |
|---|---|---|
| `apps/manage/vitest.config.ts` | 修改 | 增加 `#imports` 桩别名与 `setupFiles`，让 composable 可以在 vitest 里直接测试 |
| `apps/manage/test/setup.ts` | 新增 | 补齐被测 composable 依赖的 Nuxt 自动导入全局（`computed`、`toValue`） |
| `apps/manage/test/stubs/imports.ts` | 新增 | `#imports` 桩：以模块级注册表模拟 `useState` 的跨调用共享 |
| `apps/manage/test/vue-query.ts` | 新增 | 测试辅助：在带 QueryClient 的注入上下文与独立作用域内执行 composable |
| `apps/manage/test/app/admin-session.test.ts` | 新增 | 会话复核 14 例：结论归类、节流判定、触发器注册、到期复核与失权踢出 |
| `apps/manage/test/app/agent-run-stats.test.ts` | 新增 | 概览与运行列表 composable 12 例：`rows` 读取、刷新推进时间窗、按 outcome 分筛合并、失败进入错误态 |
| `apps/manage/test/app/run-list.test.ts` | 新增 | 结果筛选项、徽章颜色、URL 解析与生成、下拉框 `ALL` 哨兵 15 例 |
| `apps/manage/test/app/process-compare.test.ts` | 新增 | 对比行整理 6 例：全文不截断、对象与结果条目、失败工具与重试行 |
| `apps/manage/test/server/revoke.test.ts` | 新增 | 注销工具与刷新后附带 Cookie 9 例 |
| `apps/manage/test/app/trace.test.ts` | 修改 | 增加 Harness 真实事件形状 14 例：轮次归属、首字前与生成拆分、工具逐条出条与计数、`attributes.blobs` 还原、单次调用展开 |
| `apps/manage/test/server/refresh-proxy.test.ts` | 修改 | 增加编码分隔符穿越拦截、复用窗口、旋转后各响应路径下发 Cookie、新令牌失效注销等 11 例 |
| `apps/manage/test/server/me.test.ts` | 修改 | 增加 me 链路 3 例：刷新后资料查询失败仍轮换 Cookie、新令牌仍 401 注销清 Cookie |
| `apps/manage/test/app/retrieval-setting.test.ts` | 修改 | 增加 `resolveSettingsSync` 5 例 |
| `apps/manage/e2e/admin-smoke.spec.ts` | 修改 | 新增 5 条真实栈回归：外壳渲染、逻辑模型加载失败保护、筛选与 URL 同步、聚焦复核失权踢出、检索草稿保护；`.vue` 改动无法做组件单测，由这些用例覆盖 |

## infra

| 文件 | 状态 | 作用与原因 |
|---|---|---|
| `infra/nginx/nginx.conf` | 修改 | 补 `upstream anynote_manage { server 127.0.0.1:3080; }`（`proxy_pass` 引用了从未定义的 upstream，`nginx -t` 失败会让整份配置无法加载）；manage 站点补 `X-Robots-Tag "noindex, nofollow"` 与可选 IP 白名单注释 |
| `infra/Dockerfile.manage` | 修改 | runtime 阶段 `CMD` 前加 `USER node`；此前容器以 root 运行，与方案 §7.2 及 `Dockerfile.web` 不一致 |
| `infra/manage/config.mjs` | 修改 | 启动校验报错不再回显环境变量原值；地址里若带 userinfo 会随容器日志进入日志采集 |
| `infra/manage/config.test.mjs` | 修改 | 增加“报错不回显原值”用例 |

## 文档

| 文件 | 状态 | 作用与原因 |
|---|---|---|
| `docs/manage/MANAGE_MILESTONES.md` | 修改 | 新增“M20 评审修复”记录（修复清单、验证记录、与方案的偏差、已知未处理）；M20.5 的 `trace.blob` 表述改为真实事件形状 |
| `docs/manage/MANAGE_PLAN.md` | 修改 | §5.6.2 与 §9.1 的 `trace.blob` 表述改为 `trace.context.attributes.blobs` |
| `docs/manage/README.md` | 修改 | 范围界定里的 `trace.blob` 表述同步 |
| `CLAUDE.md` | 修改 | 「上下文文档导航」里 `MANAGE_MILESTONES.md` 的概要补上评审修复记录与本清单的指针（文档维护约定：被引用文档内容变化需同步） |
| `docs/changelist/2026-11-28-manage-console-review-fixes.md` | 新增 | 本清单 |

## 审计要点

1. **刷新后的 Cookie 不能丢**：`[...path].ts` 与 `me.get.ts` 里凡是 `rotated` 已赋值的返回路径都经过 `attachTokenCookies`；唯一的例外是“新令牌重放仍 401”，此时改为注销新令牌对并清 Cookie。改动这两处时不要新增绕过它的 `return`。
2. **单飞复用窗口是安全相关的常量**：`refresh.ts` 的 `ROTATED_REUSE_WINDOW_MS = 30_000` 以代理转发上游超时为依据；窗口过长会让已再次旋转或已注销的令牌对被复用，过短则回到“旧 rt 二次刷新被 401”的问题。
3. **会话失效的边界**：只有 `/api/auth/me` 返回 401/403 才清缓存并踢出，502 与网络错误保持会话；`markInvalid` 把 `loaded` 置为 true，是为了避免路由守卫随即再发一次请求。e2e 里用 `page.clock.setFixedTime` 只推进 `Date`，不要用 `clock.install()`（会冻结定时器，页面切换停在半途）。
4. **路径穿越判定**：`proxy-allowlist.ts` 的循环解码对每一轮中间结果都做判定，且解码次数用尽仍在变化时按拒绝处理；新增放行前缀时不要绕开 `hasPathTraversal`。
5. **Trace 归并与 Harness 契约一一对应**：`resolveTurn`、`derivedStart`、`actionItems`、`buildBlobIndex` 的字段名都取自 `ai-service/harness/trace/middleware.py`；Harness 事件形状变化时这四处要同步。工具瀑布条的时间是近似值（整批同时开始 + 各自耗时）。
6. **运行列表的下拉框哨兵**：`RUN_OUTCOME_FILTERS` 用空串表示“全部结果”，`RUN_OUTCOME_SELECT_ITEMS` 用 `ALL`；两者只能经 `toOutcomeSelectValue` / `fromOutcomeSelectValue` 互转。这是评审清单之外、在真实浏览器验证时才发现的既有 500，此前该页面没有任何 e2e 覆盖。

## 评审清单之外、未处理

- `layouts/default.vue` 的顶栏（面包屑、快捷导航）不渲染：`UDashboardPanel` 提供了默认插槽后 `#header` 不再生效。挂载 `NuxtLayout` 后才可见，不在复核确认的 21 项内，待确认后处理。
