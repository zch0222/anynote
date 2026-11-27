# 管理后台第一阶段（apps/manage M20）

> 批次：`feat/manage-console` 分支 M20.0–M20.7

## 变更摘要

### 新增 apps/manage 管理后台（Nuxt 4）

- Nitro 超管 BFF：登录 ADMIN_X 核验 + 非超管即刻销票、me 在位复核、logout、白名单代理（路径穿越拦截、写请求 Origin 校验、refresh singleflight 重放）
- 登录页、UDashboard 全局外壳（侧栏/面包屑/命令面板/深浅色）、AI 运行概览看板（24h/7d/30d 趋势与分布）
- 模型供应商 CRUD 与逻辑模型配置页（API Key 只写不回显、出境冲突阻断、embedding 维度与重建提示）
- 知识检索 24 项参数配置页（五分组、默认值差异徽章、交叉校验、未保存离开守卫）
- Agent 运行列表与 Trace 详情检查器（瀑布图、分轮导航、六页签检查器、上下文 blob 还原、5000 条硬上限）
- 容器化：`infra/Dockerfile.manage` 多阶段构建 + compose 服务接线（3080 端口）+ Playwright 冒烟用例

### 后端（services/ai）

- 新增 `GET /v1/admin/agent-runs/stats` 聚合统计接口（HOUR/DAY 粒度、默认 7 天、最大 90 天）
- 管理员拦截文案统一为「只有系统管理员可以访问管理接口」
- OpenAPI baseline 同步

### apps/web 退役

- 移除「模型供应商」设置分节与 `src/features/model-providers/**`（桌面 + 移动端）
- 退役相关 Playwright 用例（model-providers、mobile-model-providers、pdf-ocr-vision）
- 管理职能移交 apps/manage，平台唯一管理入口

## 验证

- manage：88 单测全绿、typecheck/lint 零错误、`nuxt build` 成功
- web：settings 相关 71 单测全绿、typecheck 零错误
- 真实 Docker 栈：超管登录/非超管阻断/代理统计/注销闭环全部通过
- 待续：manage 镜像重建验证（openapi-typescript 依赖已修复）、Playwright 真实栈执行、web 全量测试与 bundle 预算

## 兼容性

- `apps/web` `/settings/providers` 路径失效后由分节校验回退，不再展示供应商入口
- 后端管理接口契约不变，旧前端供应商功能由 manage 完全接管
