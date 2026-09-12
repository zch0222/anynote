# Anynote 移动端适配

> 文档版本：v1.1 | 创建 2026-09-12 | 最近更新 2026-09-12
> 状态：**7 个决策点已于 2026-09-12 拍板，实施中**（里程碑重排为 M10.0 – M10.5）
> 上游约束：[`CLAUDE.md`](../../CLAUDE.md)、[`README.md` 测试节](../../README.md#测试)、[`README.md` Git 工作流](../../README.md#git-工作流)、[`docs/refactor/FRONTEND_MILESTONES.md`](../refactor/FRONTEND_MILESTONES.md)（M7.6 后端缺口）、[`docs/deployment-network.md`](../deployment-network.md)

## 这是什么

让 Anynote 在**手机浏览器**上可用的完整方案。核心判断只有两条：

1. **不新开项目**。移动端 UI 放在 `apps/web` 内的新路由段 `app/(mobile)/m/**`，与桌面版 `(workspace)` 并列。
   决定性理由是认证：Token 只存 httpOnly Cookie 且 `sameSite=strict`、不设 `domain`（host-only），
   而刷新单飞锁是**进程级** `Map` —— 换 origin 既拿不到身份，又会让同一个 refreshToken 被两个进程并发刷新。
2. **不是"把桌面版改窄"**。现有 UI 里约七成页面加断点即可，但三个 master-detail 页面
   （笔记目录树 + 编辑器、AI 会话列表 + 对话、PDF 三栏）必须拆成**列表路由 → 详情路由 + 返回**，
   靠断点无解 —— 它们现在用 `hidden lg:block` 把次级面板藏掉，结果是手机上**完全不可达**。

## 当前现状速览

| 对象 | 结论 |
|------|------|
| `apps/web` | **部分适配**：外壳（侧边栏抽屉 + 渐进隐藏的头部）、列表页（`grid … sm:grid-cols-2 lg:grid-cols-3`）、表单页窄屏可用；但三个次级面板不可达，`/ai/pdf` 在 < 1024px **横向溢出**，编辑器工具栏 23 个 28px 按钮要折 3 行，且**没有任何移动端门禁** |
| `apps/web-legacy` | **基本未适配**：整个 `src/` 只有 1 处断点前缀、28 处硬编码 px 宽度、2 处 `@media` 全是注释。**不做适配**（删除条件见 `CLAUDE.md` Phase 5 表） |

移动端适配在 `docs/refactor/` 全文中没有任何条目（唯一一处"移动端"是在讲 Lighthouse 节流参数），
因此这是 Phase 5 M8 之后的**新增范围**，需要自带验收基线——这也是本目录存在的原因。

## 目录

| 文档 | 内容 |
|------|------|
| [MOBILE_PLAN.md](./MOBILE_PLAN.md) | **技术方案**：目标与非目标、既有事实盘点（证据链）、8 条架构决策（落点 / 路由形状 / 导航范式 / master-detail 拆分 / 编辑器形态 / 交互替换 / 复用边界 / 性能预算）、6 个被否方案、目录结构、代码骨架、桌面→移动路由映射表、测试计划、CI、风险表、7 个决策点（已拍板）、工期估算 |
| [MOBILE_MILESTONES.md](./MOBILE_MILESTONES.md) | **执行计划**：M10.0 – M10.5 的任务清单、可执行验收命令、分支名、依赖关系图；留"验收记录"与"与方案的偏差"两节待实施期填写 |
| [UI_INVENTORY.md](./UI_INVENTORY.md) | **现状证据**：逐页核对结果，每条带 `文件:行` 出处——已经做对的部分、按严重度排序的问题清单、门禁现状、可零改动复用的资产、与 M7.6 后端缺口的关系、legacy 核对数据 |

阅读顺序：先 [UI_INVENTORY.md](./UI_INVENTORY.md)（知道现状），再 [MOBILE_PLAN.md](./MOBILE_PLAN.md)（知道为什么这么设计），最后 [MOBILE_MILESTONES.md](./MOBILE_MILESTONES.md)（按它干活）。

## 范围边界

**做**：笔记读写、文档阅读、AI 对话、PDF 问答、任务、课程、知识库、设置、搜索在 `< 768px` 可用；移动端自己的 E2E / Lighthouse / 产物预算门禁。

**不做**（理由见方案 §1.2）：原生 App（RN / Flutter）、Tauri 移动端壳、PWA 与离线、AI 工作流画布、平板专用版式、`apps/web-legacy` 的适配、修 M7.6 的 5 个后端缺口。

## 已拍板的决策（2026-09-12）

| # | 决策 | 结论 |
|---|------|------|
| 1 | 入口策略 | **取备选**：一开始就 UA 分流（入口路径 307 + `?desktop=1` 逃生口 + `anynote_view` 偏好 Cookie） |
| 2 | 登录后落地页 | **取备选**：`/m/dashboard`，并为移动端做一个有真实内容的工作台 |
| 3 | Lighthouse 移动 Performance | 取默认：0.85（Accessibility 0.95） |
| 4 | `/ai/workflow` | 取默认：移动端不提供，给说明 + 桌面链接 |
| 5 | `/wikis` | 取默认：进首版，三级 URL 路由 |
| 6 | PWA / 离线 | 取默认：不做 |
| 7 | 平板 768–1024px | 取默认：不专门做 |

决策 1、2 的连锁影响：原 **M10.6（入口策略）并入 M10.1**，工作台页从 M10.2 提到 M10.1；
底部 tab 变成"工作台 / 笔记 / 文档 / AI / 我的"，**"待办"降级为工作台卡片 + "我的"入口**（5 格上限）。

## 下一步

按 [MOBILE_MILESTONES.md](./MOBILE_MILESTONES.md) 从 M10.0 依次执行。M10.0 同时清掉 `/ai/pdf` 的
横向溢出 bug（它属于桌面版既有缺陷，不应等移动端一起做）。

估算合计 **10.5 天**（单人、含单测、不含等待后端缺口修复）。移动端**不阻塞** Phase 5 发版。
