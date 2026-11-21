# 加载体系 E2E 与本机构建修复

## 概览

本批修复加载体系测试的过期文案、旧 SSE 模拟帧和画廊测试顺序依赖，并用项目已有开关验证 Windows 本机构建；不修改生产代码、用户可见文案或构建默认行为。

本批基线为 `db07312cd38646936c1d8d9dfda9eec78bf03deb`，`git diff --stat <base>...HEAD` 为空，所有改动均未提交。

| 范围 | 文件数 | 行数 |
|---|---:|---:|
| 修改 `apps/web/e2e/loading-system.spec.ts` | 1 | +7 / -5 |
| 新增本清单 | 1 | +44 / -0 |
| 合计 | 2（新增 1、修改 1、删除 0） | +51 / -5 |

目录分布：`apps/web/e2e/` 1 个测试文件，`docs/changelist/` 1 个审计文档。

### 验证结果

| 命令 | 实际结果 |
|---|---|
| `E2E_BASE_URL=http://localhost:3000 pnpm --filter web exec playwright test loading-system.spec.ts` | 15/15 通过，覆盖“正在准备”、新 SSE 正文增量、画廊骨架和编辑器版式 |
| `E2E_BASE_URL=http://localhost:3000 pnpm --filter web exec playwright test loading-system.spec.ts:627` | 使用全新临时账号独立运行，1/1 通过，不再依赖同文件前序用例 |
| `NEXT_DISABLE_STANDALONE=1 pnpm --filter web build` | Windows 宿主机生产构建成功，编译、类型检查、37 个静态页面与构建追踪全部完成 |
| `pnpm exec biome check --write apps/web/e2e/loading-system.spec.ts` | 通过，无需格式修复 |
| `git diff --check` | 通过 |

## E2E 测试

| 文件 | 状态 | 作用与原因 |
|---|---|---|
| `apps/web/e2e/loading-system.spec.ts` | 修改 | 将等待文案对齐现行“正在准备”，把旧 ResData 模拟帧改为带完整事件信封的 `text.delta`，并在画廊用例内自行创建知识库以消除顺序依赖。 |

## 文档

| 文件 | 状态 | 作用与原因 |
|---|---|---|
| `docs/changelist/2026-11-21-loading-system-e2e-fixes.md` | 新增 | 单独记录本批测试与构建验证，不回写上一批 AI 对话 UI 重构清单。 |

## 审计要点

1. 文案变化只发生在测试名称与断言中，页面仍显示既有“正在准备”，没有新增或修改用户提示。
2. SSE 模拟帧同时提供 `id`、`event`、`seq`、`runId`、`ts`、`type` 与 `data.delta`，与当前解码器的校验路径一致。
3. 画廊用例自己调用 `ensureKnowledgeBase()`，因此完整文件运行与全新账号独立运行都必须通过。
4. `NEXT_DISABLE_STANDALONE=1` 只跳过宿主机 standalone 拷贝；Docker 构建仍使用默认 standalone 输出，部署行为未改。
