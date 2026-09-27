# 改动清单：非协同作为笔记的默认模式

> 日期：2026-09-27 · 分支：`feat/collab-server-persist`（**尚未提交**，与同日 [`2026-09-27-single-user-leave-guard.md`](./2026-09-27-single-user-leave-guard.md) 同属一批未提交改动）
> 决定：2026-09-27 用户拍板，笔记默认非协同（单人保存）；取代 [`docs/collab/notes-collab-merge-plan.md`](../collab/notes-collab-merge-plan.md) §12 Q4 原建议「稳定一周后默认开启」。

## 概览

代码层面的默认值本来就是关闭：`apps/web/src/lib/env.ts` 只有 `"1"` 才开（`env.test.ts` 有断言），
`infra/Dockerfile.web` 与 `infra/docker-compose.yaml` 的默认值都是空。本批不改产品代码，做三件事：

1. **E2E 以默认构建为基线**：`collab.spec.ts` 里依赖协同的两组原先没有跳过条件，默认构建下必然 1 条失败、7 条不运行；
   现在按行为探测当前构建（新建一篇笔记，看编辑页会不会去换协同令牌），没开协同就跳过这两组，另外两组（令牌权限、`/docs` 退役）照常执行。
2. **文档记录这一决定**：方案 Q4 与 D7、`CLAUDE.md`、`README.md`、协同落库方案附录 H.5。
3. **本机开发栈切回默认**：`anynote-web` 以不设 `NEXT_PUBLIC_COLLAB_NOTES` 重建并替换容器；协同服务的 `COLLAB_SERVER_PERSIST` 本就是关闭。这一项不进仓库。

### 改动面

| 文件 | 状态 | 行数 |
|------|------|------|
| `apps/web/e2e/collab.spec.ts` | 修改 | +10 / −0 |
| `apps/web/e2e/support/collab-persist.ts` | 修改 | 上一批未提交改动中的文件，增量无法从 git 单独区分 |
| `CLAUDE.md`、`README.md`、`docs/collab/notes-collab-merge-plan.md`、`docs/collab-persistence/COLLAB_PERSISTENCE_PLAN.md` | 修改 | 同上 |

### 验证结果

| 命令 / 动作 | 结果 | 备注 |
|------|------|------|
| `collab.spec.ts`，web 以 `NEXT_PUBLIC_COLLAB_NOTES=1` 构建 | ✅ 8 passed | 探测结果为开启，两组协同用例照常执行 |
| `collab.spec.ts`，默认构建 | ✅ 2 passed / 6 skipped | 探测结果为关闭，只跳过依赖协同的两组 |
| 全量 E2E，默认构建 | ⚠️ **140 passed / 21 skipped / 3 failed** | 跳过：协同两组 6 条 + 落库联调 15 条；失败：`notes-image-upload` 3 条（本机 MinIO 配置没有凭据，与本批无关） |
| `npx tsc --noEmit`（`apps/web`，含 `e2e/`）/ `biome check apps/web/e2e` | ✅ 0 错误 | |

---

## 一、`apps/web/e2e`

| 文件 | 状态 | 作用与原因 |
|------|------|-----------|
| `support/collab-persist.ts` | 修改 | 新增 `collabNotesEnabled(browser)`：`NEXT_PUBLIC_COLLAB_NOTES` 在构建期内联，测试进程读不到，所以按行为判断当前构建是否开启协同；结果在进程内缓存，只探测一次。另导出跳过原因文案 |
| `collab.spec.ts` | 修改 | 「笔记协同」与「冷启动注入」两组的 `beforeAll` 里探测，没开协同就整组跳过；文件头注明默认构建下的行为 |

## 二、文档

| 文件 | 状态 | 作用与原因 |
|------|------|-----------|
| `docs/collab/notes-collab-merge-plan.md` | 修改 | §12 Q4 记录拍板（默认保持关闭），D7 同步注明 |
| `CLAUDE.md` | 修改 | `apps/collab` 条目写明笔记默认非协同；E2E 命令注释写明默认构建下协同用例自动跳过、跑它们需要的构建参数 |
| `README.md` | 修改 | 协同服务说明补「默认非协同」；E2E 注意事项补协同用例的探测与跳过 |
| `docs/collab-persistence/COLLAB_PERSISTENCE_PLAN.md` | 修改 | 附录 H.5 注明落库方案只在显式开启笔记协同的部署上生效 |

## 审计要点

1. **探测靠行为而不是配置**：判据是「作者打开自己的笔记时会不会请求 `/api/auth/collab-token`」。若将来协同的准入条件改了（例如不再依赖编辑权），探测要跟着改，否则协同用例会被误跳过。
2. **探测会多建一篇笔记**（放在「E2E 协同探测库」里），每个测试进程一次。
