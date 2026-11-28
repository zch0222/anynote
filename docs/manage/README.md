# Anynote 服务管理后台（`apps/manage`）方案总览

> 实施状态（2026-11-27）：M20.0–M20.7 代码完成，`apps/web` 模型供应商入口已退役；容器构建与全链路 E2E 验收进行中，逐项状态以 [MANAGE_MILESTONES.md](./MANAGE_MILESTONES.md) 为准。

> 文档版本：v1.0（已拍板定稿） | 创建 2026-11-27
> 状态：**D1–D6 已于 2026-11-27 拍板确认，待按 M20.0–M20.7 实施**
> 上游约束：[`CLAUDE.md`](../../CLAUDE.md)、[`README.md` 启动指南与测试节](../../README.md)、[`docs/deployment-network.md`](../deployment-network.md)
> 关联方案：[`docs/ai-refactor/AI_REFACTOR_PLAN.md`](../ai-refactor/AI_REFACTOR_PLAN.md)、[`docs/ai-refactor/AGENT_TRACE_VIEW_PLAN.md`](../ai-refactor/AGENT_TRACE_VIEW_PLAN.md)（吸收并替代原 M17.5 设置页控制台方案）、[`docs/ai-refactor/AI_MILESTONES.md`](../ai-refactor/AI_MILESTONES.md)（承接 M16.5 待补检索参数页）

## 这是什么

基于 **Vue 3.5 + Nuxt 4 + Nuxt UI v4** 构建的 Anynote 独立服务管理后台（`apps/manage`），仅限系统超级管理员（`ADMIN_X`）登录，统一承载平台级配置、AI 运行治理与系统运维能力。

四条核心架构判断：

1. **管理面与用户面物理分离，消除混合权限心智负担**。用户端 `apps/web`（Next.js 15）回归纯粹的知识库协作与 AI 问答产品体验；模型供应商密钥、逻辑模型路由、检索融合参数、未脱敏 Agent 完整 Trace 及后续全站用户/配置治理全部收拢至独立子域部署的 `apps/manage`（本地 `http://localhost:3001`，生产 `manage.YOUR_DOMAIN`），支持在外部 Nginx 层叠加办公网/VPN IP 白名单等独立访问控制。
2. **异构前端框架，同构契约与安全底座**。虽然技术栈采用 Vue + Nuxt 生态，但完整复用仓库既有的 `@anynote/api-client`（`openapi-typescript` 生成的强类型契约 + `openapi-fetch`）与 `@anynote/api-core`（`ResData` 拆包、错误码、查询参数展平，零 React 耦合）；认证沿用与 `apps/web` 同等级别的 **Nitro BFF + `httpOnly` Cookie（`manage_at` / `manage_rt`）+ 进程内单飞刷新 + 写请求 `Origin` 强校验**，浏览器 JS 永远接触不到原始 JWT。
3. **非超管零残留强准入**。管理后台不设注册与公开页；Nitro 登录接口在换取令牌后立即向 `services/system` 权威核验 `role.roleKey === "ADMIN_X"`，非超管账号当场由服务端调用 `/logout` 销毁刚签发的令牌对、不落任何 Cookie 并返回 `403 / A0301`；每次 `/api/auth/me` 会话恢复均复核超管身份，降权即刻踢出。
4. **第一阶段闭环全部 AI 治理能力，并为第二阶段平台管理预留标准插槽**。一期 100% 复用 `services/ai` 已就绪的 12 个管理端点，仅最小化新增 1 个只读运行聚合统计接口（`GET /v1/admin/agent-runs/stats`），一次性交付概览看板、模型与供应商设置、24 项知识检索参数配置、Agent 运行列表与单次完整 Trace 深度检查器；一期验收后同步下线 `apps/web` 中的「设置 → 模型供应商」分区。

## 目录

| 文档 | 内容 |
|---|---|
| [README.md](./README.md) | **方案总览**：核心判断、范围边界、已拍板决策记录（D1–D6）、与既有里程碑衔接关系 |
| [MANAGE_PLAN.md](./MANAGE_PLAN.md) | **技术方案详设**：现状基线、Vue + Nuxt 4 + Nuxt UI v4 选型与 Monorepo 集成、Nitro 超管 BFF 安全设计、信息架构与一期四大模块详设、后端统计契约增量、Docker 多阶段构建与 Nginx 独立子域部署、`apps/web` 旧入口退役、测试门禁 |
| [MANAGE_MILESTONES.md](./MANAGE_MILESTONES.md) | **可执行里程碑（M20.0–M20.7）**：分阶段交付任务、前置依赖、单测/E2E/容器构建门禁与 Git 提交粒度规划 |

阅读顺序：本页 → [MANAGE_PLAN.md](./MANAGE_PLAN.md) → [MANAGE_MILESTONES.md](./MANAGE_MILESTONES.md)。

## 范围界定

### 第一阶段（本期实施：AI 设置与监控）

- **超管认证与全局控制台外壳**：`/login` 超管登录页、Nitro BFF 鉴权代理、Nuxt UI v4 Dashboard 桌面宽屏外壳（侧栏导航、命令面板 `⌘K`、深浅双色主题、管理员会话菜单）
- **AI 运行概览看板（`/ai/overview`）**：时间窗（24h / 7d / 30d）运行总量、成功率、输入/输出/推理 Token 消耗、平均与 P95 首字耗时（TTFT）与总耗时、按时间分桶趋势图、模型调用占比与近期异常运行直达
- **模型供应商与逻辑模型配置（`/ai/models`）**：模型供应商 CRUD（AES-GCM 只写密钥、`dataEgressAllowed` 出境开关、`processReasoningMaxChars` 思考截断字数）+ 三张逻辑模型运行时绑定卡（`agent_main` 含多模态视觉开关与推理解析/回传、`fast`、`embedding` 含向量维度与重建提示）
- **知识检索参数配置（`/ai/retrieval`）**：对接 `a_retrieval_setting` 全部 24 项 RRF 融合常数、三类查询词法/语义权重、权威性系数、片段窗口、`kb_grep` 限额与重排开关，支持分组校验、默认值差异对比与一键恢复推荐值（关闭 M16.5 待补项）
- **Agent 运行监控与完整 Trace 检查器（`/ai/traces`、`/ai/traces/[runId]`）**：多维筛选运行列表、交互式瀑布时间轴（区分首字前等待与流式生成）、按轮次折叠的虚拟化轨迹树、`trace.context.attributes.blobs` 上下文分层原文还原、复核前检索候选分数诊断、以及与「用户实际可见过程视图（`AgentProcessViewVO`）」的并排脱敏核验（关闭 M17.5，每次查看自动写 `a_agent_trace_access` 留痕）
- **容器化部署与旧入口收敛**：`infra/Dockerfile.manage`、Compose 三环境编排、Nginx `manage.YOUR_DOMAIN` 模板；验收通过后下线 `apps/web` 的 `/settings/providers` 与 `/m/settings/providers`

### 第二阶段（架构预留，不在一期开发）

- **全站系统管理（对接 `services/manage` 与 `services/system`）**：用户管理与封禁/解封（`/system/users`）、全站知识库巡检（`/system/knowledge-bases`）、系统参数 `sys_config` 管理（`/system/configs`）、Redis 缓存与在线用户治理（`/system/caches`）、全站 API 调用统计（`/system/statistics`）、中间件控制台外链（`/system/ops-links`）
- **AI 进阶运维（按需开启）**：`anynote-ai-indexer` 索引水位监控与页面手动触发 `reconcile` / `rebuild`、Harness 运行预算参数可视化配置

### 明确不做

- 普通用户登录、账号注册、密码找回、CLI 授权交换、桌面壳令牌交换、WebSocket 协同连接
- 移动端小屏专门适配（不做 `/m/*` 路由段，遵循桌面宽屏 `≥1024px` 运维台定位）
- 在管理后台前端存储明文 JWT 或模型供应商 API Key

## 已拍板的决策（2026-11-27 用户确认）

| # | 决策项 | 拍板结论 | 未选备选 | 工程依据 |
|---|---|---|---|---|
| D1 | 超级管理员身份口径 | **直接复用现有 `ADMIN_X` 角色**（`role.roleKey === "ADMIN_X"`） | 新增 `SUPER_ADMIN` 角色；限定固定用户 ID | 与网关 `/api/manage/**`（`AuthFilter`）及 AI 管理端 `SystemAdminGuard` 完全一致，无需改 RBAC 表与既有权限切面 |
| D2 | 部署入口与域名形式 | **独立子域部署**（生产 `manage.YOUR_DOMAIN` → `127.0.0.1:3001`，本地 `http://localhost:3001`） | 主域名子路径 `YOUR_DOMAIN/manage/` | 避免与 `apps/web` 的 `/api/auth/*`、`/api/proxy/*` 路径冲突，彻底隔离 Cookie、`Origin` 校验与构建参数，便于 Nginx 单独加固访问策略 |
| D3 | 第一阶段 AI 功能范围 | **覆盖后端已就绪的全部 AI 管理能力**：模型供应商 CRUD + 逻辑模型绑定 + 24 项知识检索参数 + Agent 运行与 Trace 监控 | 暂不含知识检索参数页；一期额外扩建 Indexer/Harness 预算接口 | 检索参数后端（`RetrievalSettingAdminController`）已在 M16.5 就绪且登记待补页面，零后端成本即可补齐完整 AI 配置闭环 |
| D4 | Trace 监控概览看板 | **一期包含轻量 AI 运行概览看板**（在 `AgentRunAdminController` 新增 1 个只读聚合统计接口）+ 运行列表与单次 Trace 检查器 | 不新增接口，仅做列表与单次详情 | 管理后台首屏需要直观掌握全局调用量、错误率、Token 消耗与延迟水位，单接口增量极小且价值显著 |
| D5 | `apps/web` 模型供应商页去留 | **管理后台一期验收上线后，下线 `apps/web`（桌面与移动端）中的「模型供应商」分区** | 双端长期或短期并存 | 消除同一管理能力在 Next 与 Nuxt 两套前端重复维护的成本，让 `apps/web` 保持纯粹用户端定位 |
| D6 | 目录命名、屏幕范围与渲染模式 | **目录 `apps/manage`，纯桌面宽屏设计（`≥1024px`），采用 Nuxt 4 `ssr: false`（SPA）+ Nitro Server BFF** | 目录 `apps/admin`；全量 SSR；适配移动端小屏 | 目录名对齐 `services/manage` 与 `docs/manage`；后台全站需登录无需 SEO，`ssr: false` 消除复杂图表/虚拟表水合开销，同时完整保留 Nitro 服务端 `httpOnly` Cookie 代理安全性 |

## 与既有方案及里程碑的衔接

1. **接管 `AGENT_TRACE_VIEW_PLAN.md` 的 M17.5（管理控制台）**：原方案 T5 计划将「AI 运行」放在 `apps/web` 的 `/settings/ai-runs` 分区；随独立管理后台立项，完整 Trace 控制台正式迁入 `apps/manage` 的 `/ai/traces` 与 `/ai/traces/[runId]`，原 `AgentRunAdminController` 三个端点与 `a_agent_trace_access` 留痕机制原样复用。
2. **关闭 `AI_MILESTONES.md` M16.5 的「检索参数管理页面待补」**：在 `apps/manage` 的 `/ai/retrieval` 落地，不再往 `apps/web`（桌面及 `/m/*`）塞管理员专属复杂参数表单。
3. **收敛 `AI_MILESTONES.md` M16.2 的供应商管理页面**：待 M20.6 验收完成后，在 M20.7 移除 `apps/web` 内的 `features/model-providers/**` 与 `/settings/providers` 路由。

## 下一步

1. 执行 **M20.0**：编写 `.claude/openspec/changes/` 统计接口变更提案，在 `services/ai` 补齐 `GET /v1/admin/agent-runs/stats` 与复合索引，重跑 `pnpm openapi:generate` 提交 `openapi/specs/ai.json`。
2. 执行 **M20.1–M20.5**：搭建 `apps/manage`（Nuxt 4 + Nuxt UI v4 + Nitro BFF），依次落地概览看板、模型配置、检索参数与 Trace 深度检查器。
3. 执行 **M20.6–M20.7**：完成 Docker 化、Playwright 端到端与深浅色主题验收，随后清理 `apps/web` 旧供应商设置入口。
