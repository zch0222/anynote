# AI 对话按知识库分组变更清单

## 概览

本批仅调整桌面 `/ai/chat` 会话侧栏：通过现有分页接口取齐会话，按已保存的检索范围分组，每组默认展示 5 条并支持折叠、递增展开和收起；“其他会话”与“全部知识库”依次固定置底。移动端、PDF 问答、AI 工作流和其他页面不改。

| 范围 | 文件数 | 行数 |
|---|---:|---:|
| 已跟踪文件修改 | 7 | +401 / -127 |
| 新增代码与测试 | 3 | +322 / -0 |
| 新增本清单 | 1 | +75 / -0 |
| 合计 | 11（新增 4、修改 7、删除 0） | +798 / -127 |

目录分布：`apps/web/` 8 个文件，`services/ai/` 2 个文件，`docs/changelist/` 1 个文件。无新增 SQL、数据库迁移或 OpenAPI 契约结构变更；会话摘要 VO 原本已声明 `scope`，本批只补齐其实际返回值。

### 验证结果

| 命令或检查 | 实际结果 |
|---|---|
| 修复前 `mvn -o test -pl ai -Dtest=ChatServiceImplTest#returnsPersistedScopeInConversationList` | 按预期失败：列表项 `scope` 为 `null`，复现分组数据缺失 |
| 修复后运行同一后端回归用例 | 1 条通过 |
| 定向 Vitest：分组函数、会话查询、桌面会话列表 3 个文件 | 17 条全部通过 |
| `mvn -o test -pl ai` | 133 条全部通过 |
| `pnpm --filter web test` | 184 个文件中 179 通过、5 失败；2166 条中 2157 通过、9 失败，另有 1 个未处理错误；失败均位于未修改文件 |
| 单独复跑上述 5 个失败文件 | 77 条中 74 通过、3 失败；笔记创建、Shiki、移动任务卡全部通过，任务日期时间仍 2 条失败、任务表单仍 1 条失败，未修改相关模块 |
| `pnpm --filter web typecheck` | 最终通过，覆盖新增 E2E 文件 |
| Biome 检查本批 8 个前端代码/测试文件 | 通过；`git diff --check` 通过 |
| `mvn -o install -pl ai -am -DskipTests` 与 Docker Compose 重建 AI/Web | 构建成功，AI 与 Web 容器启动，Gateway 和 Web 健康检查通过 |
| 首次运行新增 Playwright 用例 | 1 条失败：共享 MySQL 辅助函数的 Windows `cmd.exe` 引号解析失败，尚未进入页面断言 |
| 修正本用例的 Docker 参数传递后复跑 Playwright | 1 条通过；真实接口下分组、显示更多、收起、折叠和打开会话均通过，临时数据已清理 |
| 深色浏览器验收 | Playwright 实拍核对两个知识库及两个置底分组；桌面内置浏览器核对真实页面并点击“全部知识库”，会话随分组折叠隐藏 |

## AI 服务

列表接口需要返回持久化范围，否则前端无法区分单库、多库、单资料与全部知识库会话。

| 文件 | 状态 | 作用与原因 |
|---|---|---|
| `services/ai/src/main/java/com/anynote/ai/service/impl/ChatServiceImpl.java` | 修改 | 会话摘要映射补上持久化 `scope` 的反序列化，使列表与详情使用同一分组数据来源。 |
| `services/ai/src/test/java/com/anynote/ai/service/impl/ChatServiceImplTest.java` | 修改 | 直接调用真实列表方法并清理 PageHelper 上下文，固定知识库范围与空引用列表的返回行为。 |

## Web 数据与分组

桌面全量查询与移动分页查询分离，纯函数负责分类和组顺序，组件只维护折叠及组内显示数量。

| 文件 | 状态 | 作用与原因 |
|---|---|---|
| `apps/web/src/features/ai/conversation-groups.ts` | 新增 | 按检索范围归类会话，忽略空知识库分组，并提供已确认的未命名、未知知识库及特殊分组名称。 |
| `apps/web/src/features/ai/use-conversations.ts` | 修改 | 抽取单页查询并新增桌面全量会话 hook，按实际接口上限逐页取齐且按 id 去重，移动端继续使用原 infinite 查询。 |
| `apps/web/src/features/ai/query-keys.ts` | 修改 | 为全量会话数组增加独立缓存键，避免与移动分页数据复用同一 key 而产生结构冲突。 |
| `apps/web/src/features/ai/components/conversation-list.tsx` | 修改 | 桌面侧栏改为可折叠知识库分组，每组默认 5 条并提供“显示更多/收起”，保留原有新建、重命名、删除及提示文案。 |

## Web 单元测试与 E2E

| 文件 | 状态 | 作用与原因 |
|---|---|---|
| `apps/web/src/features/ai/__tests__/conversation-groups.test.ts` | 新增 | 覆盖单库、多库、单资料、历史空范围、空分组、未知名称及特殊分组置底规则。 |
| `apps/web/src/features/ai/__tests__/use-conversations.test.tsx` | 修改 | 验证桌面全量查询自动读取第二页并按请求顺序合并会话。 |
| `apps/web/src/features/ai/components/__tests__/conversation-list.test.tsx` | 修改 | 覆盖分组顺序、折叠、5 条递增展开与收起，并保留加载、空态、错误、选中及触摸操作入口检查。 |
| `apps/web/e2e/ai-conversation-groups.spec.ts` | 新增 | 使用真实知识库 API 与本机测试库准备数据，验收完整分组交互；SQL 以容器参数传递，避免 Windows 宿主 shell 引号问题且不改共享协同测试工具。 |

## 文档

| 文件 | 状态 | 作用与原因 |
|---|---|---|
| `docs/changelist/2026-11-22-ai-conversation-knowledge-base-groups.md` | 新增 | 按实际 Git 差异记录逐文件改动、验证结果和未闭环测试，供评审审计。 |

## 审计要点

1. 后端只补列表摘要的 `scope` 映射，没有新增 SQL；`scope` 已在 VO 与 OpenAPI 基线中声明，因此未改动或重生成契约文件。
2. 普通单知识库会话必须同时满足 `refs` 为空；多知识库或带实体引用的会话进入“其他会话”，历史空范围进入“全部知识库”，不能混归某一知识库。
3. 桌面全量查询与移动 infinite 查询必须保持独立缓存键；两类查询都位于 `aiQueryKeys.conversations` 前缀下，重命名和删除后的缓存失效仍覆盖两者。
4. 只渲染有会话的知识库分组，知识库目录不可见或名称请求失败时使用 `知识库 {id}`，不新增错误提示；“其他会话”必须位于“全部知识库”之前。
5. E2E 只在临时账号下写入并按用户清理会话、按 id 删除临时知识库；没有修改共享 MySQL 辅助函数或处理无关的 Windows 兼容问题。
6. 全量 Web 单测及定向复跑仍有任务日期时间和任务表单 3 条失败，本批未修改这些模块，也未将其记为通过。
