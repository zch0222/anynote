# AI 首条消息路由闪屏修复变更清单

## 概览

本批修复桌面与移动端新会话发送首条消息时的两段闪烁：`router.replace` 触发动态路由 RSC 与整页骨架，以及会话 key 已迁移但当前页面仍读取 `new` 导致的空会话中间帧。
首条消息拿到会话 ID 后，现在用 `flushSync` 同步迁移流式 store key 与本地活动会话 ID，再以原生 `history.replaceState` 回填地址；`usePathname` 只用于识别后续真实导航，不重新发起 Next 路由导航。

共 **5 个文件：新增 1、修改 4、删除 0**。业务与测试代码 **新增 197 行、删除 51 行**；本 changelist 新增 **49 行**。目录分布：`apps/web` 4 个修改文件，`docs/changelist` 1 个新增文件。

### 验证结果

| 命令 / 操作 | 实际结果 |
|---|---|
| 修复前运行桌面与移动端首条消息回归用例 | **2 个文件、2 个用例失败，7 个通过**：创建会话后面板仍读取 `new`，复现本地状态未同步问题 |
| `pnpm --filter web test -- src/features/ai/components/__tests__/chat-page.test.tsx src/features/ai/components/mobile/__tests__/chat-mobile.test.tsx` | 最终 **2 个文件、11 个用例全部通过**，覆盖地址栏回填、不调用 `router.replace`、key/列表/详情同步及真实导航后的状态重置 |
| `pnpm --filter web test` | 过程中一次 **184 个文件、2170 个用例全部通过**；最终复跑为 182 个文件、2167 个用例通过，3 个任务时间控件用例因 5 秒超时/后续 DOM 缺失失败。失败的两个文件单独复跑 **45/45 通过**，本批未修改任务模块 |
| `pnpm --filter web typecheck` | 最终通过 |
| `pnpm exec biome check`（本批 4 个 Web 源码与测试文件） | 最终通过，无提示 |
| `pnpm --filter web lint` | 全仓既有 **15 个格式错误**，位于模型供应商、设置及既有 AI 工具文件的未改动区域；本批 4 个文件不在报错清单，未整体重排无关文件 |
| `pnpm --filter web build`（Windows 宿主机） | Next 编译、类型检查与静态页生成通过，standalone 复制阶段因 Windows 符号链接权限 `EPERM` 失败；未通过提权或删除目录绕过 |
| `docker compose --env-file infra/.env.dev.local -f infra/docker-compose.yaml -f infra/docker-compose.dev.yaml up -d --build`；最终 `... up -d --build anynote-web` | Linux 容器生产构建与启动成功，最终 Web 容器 healthy，Gateway 健康检查通过 |
| 真实栈连续 DOM 探针（桌面 1440×900、移动端 393×851，探针验证后已删除） | 桌面会话 540、移动会话 541：首条消息与输入框持续存在，未出现空会话或路由骨架，动态 RSC 请求均为 **0**；第二条请求均复用首个 `conversationId`，刷新恢复历史、再次新建对话重置状态均通过 |
| Kimi Code 内置浏览器深色界面核对 | 会话 542 流式生成中首条消息、工具过程与输入框正常显示，地址栏已回填为 `/ai/chat/542` |
| `git diff --check` | 通过 |

## Web（apps/web）

桌面与移动端采用同一行为：首条消息只做客户端状态迁移和地址栏回填，后续真实导航仍恢复以路由参数为准。

| 文件 | 状态 | 作用与原因 |
|---|---|---|
| `apps/web/src/features/ai/components/chat-page.tsx` | 修改 | 用 `flushSync` 原子迁移会话 key 与本地活动会话 ID，并改用 `history.replaceState` 回填地址，避免动态 RSC 骨架和旧 `new` key 造成的空会话；路径变化时保留刚回填的会话，其他真实导航重新采用路由参数 |
| `apps/web/src/features/ai/components/mobile/chat-mobile.tsx` | 修改 | 移动端同步桌面的原子状态迁移与地址栏回填逻辑，消除相同的首条消息闪烁，并更新注释使其描述现行行为 |
| `apps/web/src/features/ai/components/__tests__/chat-page.test.tsx` | 修改 | 增加桌面首条消息回归：断言不发起路由导航、面板/会话列表/详情查询立即使用新 ID，并覆盖真实导航重置与已有会话不重复回填 |
| `apps/web/src/features/ai/components/mobile/__tests__/chat-mobile.test.tsx` | 修改 | 将移动端旧的路由跳转断言改为原生地址栏与同步 key 断言，补充真实导航后清除本地会话 ID 的回归覆盖 |

## 文档（docs/changelist）

| 文件 | 状态 | 作用与原因 |
|---|---|---|
| `docs/changelist/2026-11-22-ai-first-message-route-flash.md` | 新增 | 记录本批逐文件改动、失败到通过的回归证据、真实浏览器验收及既有门禁问题，供评审按实际范围核对 |

## 审计要点

- **不能只替换 `router.replace`**：真实探针曾继续抓到空会话中间帧，因此最终用 `flushSync` 将 Zustand key 迁移与 React 活动 ID 放在同一提交中，再更新地址栏。
- **路径同步是行为关键**：`/ai/chat/<新 ID>` 与 `/m/ai/chat/<新 ID>` 是本地回填而非重新渲染路由；只有进入其他路径时才清除本地 ID，避免覆盖流式状态或污染下一次新对话。
- **“无 RSC”不等于无数据请求**：首条消息不再请求动态页面 RSC，但会话详情仍按 TanStack Query 契约获取，流式期间 `hydrate` 的幂等保护保持不变。
- **验收覆盖瞬时状态而非只看终态**：真实探针持续监听 DOM，并额外核对第二条消息复用 ID、刷新恢复和再次新建；避免最终消息存在却漏掉中间闪屏。
- **未通过项未混入本批修复**：Windows standalone 符号链接权限、全仓既有格式错误及任务时间控件负载抖动均如实保留，未修改无关模块或扩大改动面。
