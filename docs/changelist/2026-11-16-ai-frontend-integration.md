# M16.7 前端接入改动清单

## 概览

本批实现桌面与移动端的知识库范围问答、运行进度、可定位引用、PDF 问答入口和索引状态，并补齐会话范围及引用来源契约。功能与真实栈验收完成，全仓既有格式门禁的处理范围待用户确认，M16.7 尚未关闭。

当前分支 `dev`，本批以 `92107bb` 为基线：**新增 24、修改 63、删除 0，共 87 个文件，+2339 / -290 行**（包含本清单）；按服务与包拆分提交。

编写前后均执行 `git status --porcelain | sort`、`git diff --stat`、`git diff --stat HEAD...HEAD`、`git ls-files --others --exclude-standard`；当时尚无本批提交。逐文件行数来自 `git diff --numstat`，未跟踪文件使用 `git diff --no-index --numstat` 与空文件比较，提交后再按上述基线复核。临时脚本、日志、截图和派生客户端均被 Git ignore 排除，不计入清单。

| 目录 | 文件数 | 新增行 | 删除行 |
|---|---:|---:|---:|
| apps/web | 57 | 1805 | 273 |
| services/note | 6 | 114 | 2 |
| services/file | 5 | 74 | 0 |
| services/ai | 3 | 36 | 0 |
| services/api | 3 | 21 | 0 |
| ai-service | 6 | 46 | 1 |
| openapi/specs | 3 | 3 | 3 |
| 文档与提案 | 4 | 240 | 11 |

### 验证结果

| 实际检查 | 结果 |
|---|---|
| 宿主机 Java：`mvn -o install -pl note,file,ai "-Dtest.excluded.groups=integration"` | 最终 BUILD SUCCESS；note 245、file 29、ai 80，共 354 条通过；初轮新增测试夹具遗漏属性/权限参数，补全后通过 |
| 宿主机 Python：`venv/Scripts/python.exe -m pytest -o addopts='' -q` | 360 passed、20 skipped；既有 Starlette 弃用警告 1 条 |
| 宿主机全仓：`pnpm run test -- --maxWorkers=4` | 6/6 任务通过；Web 179 文件、2074 条通过 |
| `pnpm typecheck` | 6/6 任务通过，使用更新后的生成类型 |
| Web 生产构建（宿主机 `NEXT_DISABLE_STANDALONE=1`） | 通过；用于本机端口 3107 的真实栈 E2E |
| 本批 TS/TSX：`biome check <57 个实际变更文件>` | 最终 57 文件通过；最后仅修正新增 E2E 文件的一处换行 |
| 全仓只读 `biome check .` | 未通过：451 个错误，包含本机 tmp/venv 产物；启用 Git ignore 后剩 41 个格式错误文件，41/41 与 HEAD 一致，未修改；根脚本 `pnpm check` 带 `--write`，按用户第 8 条未执行全仓自动改写 |
| `pnpm --filter web bundle:budget` | 全部 PASS：桌面最大 303.7/310 KB，移动最大 246.6/250 KB，编辑器 15.8/250 KB |
| Playwright：`node node_modules/@playwright/test/cli.js test agent-retrieval.spec.ts mobile-agent-retrieval.spec.ts`（`E2E_AGENT_RETRIEVAL=1`） | 最终桌面 3/3、移动 3/3，6/6 通过，35.3 秒；初轮暴露 PDF 对象键 404 与移动预览滚动问题，修复后通过 |
| OpenAPI：live Springdoc → `node openapi/normalize-cli.mjs` → `openapi-typescript` | 重新生成六个域后仅 ai/note/file 三个 baseline 变化；未手改生成客户端 |
| `git diff --check` 与逐文件清单复核 | 通过；文件集合、状态及增删行与 Git 一致 |

E2E 使用真实 Java/Python/MySQL/Elasticsearch/MinIO 和本机 Docker 脚本化模型；断言每轮请求范围、ANSWERED/NOT_FOUND、刷新恢复、长文小节进入视口、PDF 单资料端点与第 2 页定位，以及移动端问答标签仍可见。Chromium 无法读取 SSE 响应体时，改为检查真实页面消费后的 store 终态和 DOM，未 mock 网络响应。外部付费模型未调用，模型质量归 M16.8。

验收期间临时调整的 Nacos 模型映射与 Redis MinIO 公开地址已恢复（缓存值逐字节核对），供应商和模型容器已删除；AI 容器临时测试密钥已移除并恢复 healthy，宿主机 3107 前端已停止。测试知识库、笔记和资料由公开 API 清理，账号沿用既有 global-setup 保留规则。原始日志和 `e2e-report.json` 位于本机 `tmp/m16-7/`，截图位于 `apps/web/e2e/.output/`。

范围与文案见 [API 提案](../../.claude/openspec/changes/2026-11-16-ai-frontend-integration.md)，验收状态见 [M16.7](../ai-refactor/AI_MILESTONES.md)。

## apps/web

| 文件 | 状态 | + / - | 作用与原因 |
|---|---|---:|---|
| `apps/web/e2e/agent-retrieval.spec.ts` | 新增 | +8 / -0 | 注册桌面真实栈验收，覆盖带引用、未找到及 PDF 问答。 |
| `apps/web/e2e/mobile-agent-retrieval.spec.ts` | 新增 | +8 / -0 | 注册移动端同组真实栈验收，防止移动路由与布局遗漏。 |
| `apps/web/e2e/support/agent-retrieval.ts` | 新增 | +228 / -0 | 创建真实索引夹具并检查范围、会话恢复、小节和 PDF 跳转，结束后删除测试数据。 |
| `apps/web/src/app/(mobile)/m/ai/chat/[id]/page.tsx` | 修改 | +7 / -2 | 读取知识库入口参数并传入移动聊天页，使新会话预选对应范围。 |
| `apps/web/src/app/(workspace)/ai/chat/page.tsx` | 修改 | +11 / -2 | 校验并传入知识库入口参数，使桌面新会话预选对应范围。 |
| `apps/web/src/components/layout/knowledge-base-sidebar.tsx` | 修改 | +9 / -1 | 增加桌面知识库问答入口并携带知识库标识。 |
| `apps/web/src/features/ai/__tests__/doc-index-status.test.ts` | 新增 | +38 / -0 | 校验后端 0–4 枚举、显示文案与只有构建中继续轮询的约定。 |
| `apps/web/src/features/ai/__tests__/use-chat-scope.test.tsx` | 新增 | +33 / -0 | 验证知识库选项分页加载，避免只显示第一页。 |
| `apps/web/src/features/ai/__tests__/use-chat-stream.test.tsx` | 修改 | +62 / -26 | 验证范围、引用、进度与终态存储，保留切页和正式会话迁移回归。 |
| `apps/web/src/features/ai/components/__tests__/chat-panel.test.tsx` | 修改 | +8 / -1 | 补充范围控件依赖与消息字段，保持现有输入交互回归。 |
| `apps/web/src/features/ai/components/__tests__/chat-scope-select.test.tsx` | 新增 | +37 / -0 | 验证范围选择、运行中禁用及加载失败重试状态。 |
| `apps/web/src/features/ai/components/__tests__/citation-answer.test.tsx` | 新增 | +61 / -0 | 验证引用来源、页码、标记和站内链接，并覆盖不可解析来源。 |
| `apps/web/src/features/ai/components/chat-page.tsx` | 修改 | +11 / -5 | 将预选知识库、历史范围和历史加载状态接入桌面聊天面板。 |
| `apps/web/src/features/ai/components/chat-panel.tsx` | 修改 | +56 / -2 | 提供范围切换、PDF 固定范围及历史重试，范围恢复前禁用发送。 |
| `apps/web/src/features/ai/components/chat-scope-select.tsx` | 新增 | +69 / -0 | 封装全部或单知识库选择，统一使用已确认的加载和错误文案。 |
| `apps/web/src/features/ai/components/citation-answer.tsx` | 新增 | +104 / -0 | 渲染带编号的回答与引用来源列表，支持页面内 PDF 跳转和安全站内路由。 |
| `apps/web/src/features/ai/components/doc-index-badge.tsx` | 新增 | +17 / -0 | 统一资料索引状态徽标，避免不同页面重复解释枚举。 |
| `apps/web/src/features/ai/components/message-item.tsx` | 修改 | +32 / -17 | 展示运行进度、取消状态及引用回答，保留原有普通消息渲染。 |
| `apps/web/src/features/ai/components/mobile/__tests__/chat-mobile.test.tsx` | 修改 | +5 / -2 | 更新路由与历史恢复断言，覆盖移动端范围透传。 |
| `apps/web/src/features/ai/components/mobile/__tests__/pdf-mobile.test.tsx` | 修改 | +8 / -7 | 将索引夹具调整为后端真实枚举并补充引用渲染依赖。 |
| `apps/web/src/features/ai/components/mobile/chat-mobile.tsx` | 修改 | +12 / -5 | 接入预选范围、历史范围恢复与对应新会话 key 迁移。 |
| `apps/web/src/features/ai/components/mobile/pdf-detail-mobile.tsx` | 修改 | +31 / -19 | 接入引用页跳转与统一索引状态，将 PDF 滚动限制在预览面板内。 |
| `apps/web/src/features/ai/components/mobile/pdf-list-mobile.tsx` | 修改 | +2 / -4 | 统一移动资料列表的五种索引状态显示。 |
| `apps/web/src/features/ai/components/pdf/__tests__/pdf-document.test.tsx` | 新增 | +45 / -0 | 验证所有页面渲染后定位指定页，避免异步布局导致跳页偏移。 |
| `apps/web/src/features/ai/components/pdf/pdf-document.tsx` | 修改 | +45 / -20 | 将引用页传入预览器，并在窄屏提供可切回预览的标签。 |
| `apps/web/src/features/ai/components/pdf/pdf-page.tsx` | 修改 | +46 / -43 | 增加 PDF 页定位标识并在目标页更新时滚动到对应页面。 |
| `apps/web/src/features/ai/components/pdf/pdf-viewer.tsx` | 修改 | +11 / -2 | 传递目标页和重复导航标识，等待全部页面布局稳定后定位。 |
| `apps/web/src/features/ai/doc-index-status.ts` | 新增 | +24 / -0 | 按后端状态值集中定义徽标文案和轮询条件，修正前端已索引值。 |
| `apps/web/src/features/ai/schemas.ts` | 修改 | +23 / -2 | 新增生成类型约束下的运行范围 schema，并恢复会话范围与统一索引常量。 |
| `apps/web/src/features/ai/use-chat-scope.ts` | 新增 | +41 / -0 | 从有权限的知识库分页接口构建范围选项，避免硬编码选项。 |
| `apps/web/src/features/ai/use-chat-stream.ts` | 修改 | +74 / -7 | 随每轮请求发送范围并保存进度、引用与结果，恢复历史后继续使用原范围。 |
| `apps/web/src/features/ai/use-docs.ts` | 修改 | +7 / -4 | 改用统一索引状态判断轮询，终态不继续请求。 |
| `apps/web/src/features/mooc/components/__tests__/mooc-detail.test.tsx` | 修改 | +1 / -0 | 补充路由参数 mock，保持桌面慕课详情回归。 |
| `apps/web/src/features/mooc/components/__tests__/video-player.test.tsx` | 新增 | +45 / -0 | 验证元数据就绪后的时间定位以及无效时间回退。 |
| `apps/web/src/features/mooc/components/mobile/__tests__/mooc-mobile.test.tsx` | 修改 | +1 / -0 | 补充路由参数 mock，保持移动慕课详情回归。 |
| `apps/web/src/features/mooc/components/mobile/mooc-detail-mobile.tsx` | 修改 | +29 / -5 | 优先选择引用指定的视频目录项并展开其章节。 |
| `apps/web/src/features/mooc/components/mooc-detail.tsx` | 修改 | +29 / -5 | 读取引用视频标识和秒数，在桌面目录加载完成后定位播放项。 |
| `apps/web/src/features/mooc/components/video-player.tsx` | 修改 | +14 / -2 | 在媒体元数据就绪时跳到引用秒数，兼容原生播放回退路径。 |
| `apps/web/src/features/mooc/lib/__tests__/catalog.test.ts` | 修改 | +8 / -1 | 覆盖按视频标识查找目录项及父章节，防止重名标题误定位。 |
| `apps/web/src/features/mooc/lib/catalog.ts` | 修改 | +15 / -0 | 按标识查找视频和父章节，为桌面与移动引用共用定位逻辑。 |
| `apps/web/src/features/notes/components/__tests__/knowledge-base-detail.test.tsx` | 修改 | +12 / -12 | 更新索引状态夹具与断言，验证真实枚举下的详情展示。 |
| `apps/web/src/features/notes/components/__tests__/knowledge-base-overview.test.tsx` | 修改 | +1 / -1 | 按后端已索引状态更新概览测试夹具。 |
| `apps/web/src/features/notes/components/knowledge-base-detail.tsx` | 修改 | +30 / -64 | 使用统一索引状态和重试条件，覆盖未索引与无法提取文本的展示。 |
| `apps/web/src/features/notes/components/knowledge-base-overview.tsx` | 修改 | +2 / -2 | 统一知识库概览资料状态显示，避免与列表状态冲突。 |
| `apps/web/src/features/notes/components/mobile/__tests__/base-docs-mobile.test.tsx` | 修改 | +4 / -4 | 按后端枚举更新移动知识库资料列表断言。 |
| `apps/web/src/features/notes/components/mobile/base-docs-mobile.tsx` | 修改 | +2 / -4 | 统一移动知识库资料列表索引徽标。 |
| `apps/web/src/features/notes/components/mobile/base-section-tabs.tsx` | 修改 | +7 / -0 | 增加移动知识库问答入口，携带当前知识库范围。 |
| `apps/web/src/features/notes/schemas.ts` | 修改 | +1 / -1 | 复用统一索引常量，避免笔记域继续使用错误值。 |
| `apps/web/src/features/notes/use-docs.ts` | 修改 | +3 / -0 | 仅在当前页存在索引构建中资料时轮询，及时展示构建结果。 |
| `apps/web/src/features/notes/use-note-editor-session.ts` | 修改 | +12 / -1 | 编辑器准备好后消费引用小节或行号并滚动，定位成功后解绑更新监听。 |
| `apps/web/src/lib/ai/__tests__/citation-editor.test.ts` | 新增 | +82 / -0 | 覆盖编号链接、代码排除、同名标题路径与实际笔记滚动定位。 |
| `apps/web/src/lib/ai/__tests__/citations.test.ts` | 新增 | +86 / -0 | 覆盖引用校验、去重、桌面与移动路由及不安全定位参数。 |
| `apps/web/src/lib/ai/__tests__/run-progress.test.ts` | 新增 | +25 / -0 | 验证已确认工具摘要与运行阶段映射，避免显示原始未确认文案。 |
| `apps/web/src/lib/ai/citation-editor.ts` | 新增 | +39 / -0 | 把有效引用编号转换为编辑器链接，跳过代码和已有链接。 |
| `apps/web/src/lib/ai/citations.ts` | 新增 | +107 / -0 | 校验引用数据并构建受约束的站内定位链接，无法解析时保留信息展示。 |
| `apps/web/src/lib/ai/note-location.ts` | 新增 | +49 / -0 | 按完整标题路径或行号查找笔记位置，滚动时不改写文档。 |
| `apps/web/src/lib/ai/run-progress.ts` | 新增 | +28 / -0 | 将运行事件映射为用户确认的阶段文案和工具摘要。 |

## services/note

| 文件 | 状态 | + / - | 作用与原因 |
|---|---|---:|---|
| `services/note/src/main/java/com/anynote/note/model/vo/KnowledgeAuthorizationItemVO.java` | 修改 | +2 / -0 | 为可读授权条目增加所属慕课标识，提供安全视频路由上下文。 |
| `services/note/src/main/java/com/anynote/note/service/impl/DocServiceImpl.java` | 修改 | +17 / -0 | 在既有资料 READ 校验后解析签名预览 URL，修复对象键导致 PDF 404。 |
| `services/note/src/main/java/com/anynote/note/service/impl/KnowledgeAccessServiceImpl.java` | 修改 | +3 / -0 | 仅向可读条目补充权威 moocId，不向无权访问结果泄露来源元数据。 |
| `services/note/src/main/resources/mapper/DocMapper.xml` | 修改 | +2 / -1 | 查询资料文件标识并补充 resultMap 映射，供签名预览调用使用。 |
| `services/note/src/test/java/com/anynote/note/service/impl/DocServiceImplPreviewTest.java` | 新增 | +85 / -0 | 验证对象键签名、既有绝对 URL 兼容和签名失败的已确认提示。 |
| `services/note/src/test/java/com/anynote/note/service/impl/KnowledgeAccessServiceImplTest.java` | 修改 | +5 / -1 | 验证可读结果携带慕课标识而拒绝结果不携带。 |

## services/file

| 文件 | 状态 | + / - | 作用与原因 |
|---|---|---:|---|
| `services/file/src/main/java/com/anynote/file/controller/InternalFileController.java` | 修改 | +17 / -0 | 新增要求 HMAC 的资料预览签名端点，供已授权的内部资料读取使用。 |
| `services/file/src/main/java/com/anynote/file/service/FileService.java` | 修改 | +8 / -0 | 声明资料专用签名方法，保持公开文件归属校验接口语义。 |
| `services/file/src/main/java/com/anynote/file/service/impl/FileServiceImpl.java` | 修改 | +17 / -0 | 仅为存在且来源为知识库资料的文件签名，复用已确认的通用失败文案。 |
| `services/file/src/test/java/com/anynote/file/controller/InternalFileControllerTest.java` | 修改 | +10 / -0 | 验证新增内部端点的鉴权注解和预览地址响应。 |
| `services/file/src/test/java/com/anynote/file/service/impl/FileServiceImplTest.java` | 修改 | +22 / -0 | 验证资料签名不依赖当前用户归属，但拒绝其他来源文件。 |

## services/ai

| 文件 | 状态 | + / - | 作用与原因 |
|---|---|---:|---|
| `services/ai/src/main/java/com/anynote/ai/model/vo/ChatConversationInfoVO.java` | 修改 | +10 / -0 | 在会话详情契约中返回结构化运行范围，支持刷新恢复。 |
| `services/ai/src/main/java/com/anynote/ai/service/impl/ChatServiceImpl.java` | 修改 | +8 / -0 | 将持久化 scope JSON 还原为 DTO，避免前端丢失历史范围。 |
| `services/ai/src/test/java/com/anynote/ai/service/impl/ChatServiceImplTest.java` | 修改 | +18 / -0 | 验证会话详情从存储恢复知识库范围。 |

## services/api

| 文件 | 状态 | + / - | 作用与原因 |
|---|---|---:|---|
| `services/api/anynote-api-file/src/main/java/com/anynote/file/api/RemoteFileService.java` | 修改 | +11 / -0 | 增加内部资料预览 Feign 契约与内部来源头。 |
| `services/api/anynote-api-file/src/main/java/com/anynote/file/api/factory/RemoteFileFallbackFactory.java` | 修改 | +5 / -0 | 新增端点降级返回既有内部文件服务错误码，供 note 统一提示。 |
| `services/api/anynote-api-note/src/main/java/com/anynote/note/api/model/vo/DocVO.java` | 修改 | +5 / -0 | 增加资料文件标识及 OpenAPI 注解，连接权限读取与预览签名。 |

## ai-service

| 文件 | 状态 | + / - | 作用与原因 |
|---|---|---:|---|
| `ai-service/retrieval/evidence.py` | 修改 | +13 / -0 | 把授权结果中的所属慕课标识并入引用定位，解决视频来源缺少路由上下文。 |
| `ai-service/retrieval/models.py` | 修改 | +1 / -0 | 为内部授权结果增加可选 moocId 字段，与 Java 契约保持一致。 |
| `ai-service/retrieval/session.py` | 修改 | +1 / -0 | 将授权返回的所属慕课标识写入证据注册表，传递到最终引用。 |
| `ai-service/tests/test_retrieval_evidence_text.py` | 修改 | +11 / -0 | 验证慕课标识补充后保留引用原定位字段。 |
| `ai-service/tests/test_retrieval_session.py` | 修改 | +18 / -0 | 验证检索会话把授权的慕课元数据传到引用定位。 |
| `ai-service/tools/knowledge/kb_query.py` | 修改 | +2 / -1 | 在知识查询证据中保留所属慕课标识，支持后续视频跳转。 |

## openapi/specs

以下为生成物：从真实后端的 `/v3/api-docs` 获取内容，用 `node openapi/normalize-cli.mjs <service> <raw-file> openapi/specs/<service>.json` 归一化，再用 `pnpm --filter web exec openapi-typescript` 派生客户端。CI `openapi-check.yml` 对 baseline 卡 diff；评审优先查看 Controller、DTO 与提案。`packages/api-client/src/` 为忽略的派生输出。

| 文件 | 状态 | + / - | 作用与原因 |
|---|---|---:|---|
| `openapi/specs/ai.json` | 修改 | +1 / -1 | 生成物：归一化实时 Springdoc 会话范围契约，作为客户端生成输入及 CI diff 基准。 |
| `openapi/specs/file.json` | 修改 | +1 / -1 | 生成物：归一化实时 Springdoc 内部资料预览端点，作为客户端生成输入及 CI diff 基准。 |
| `openapi/specs/note.json` | 修改 | +1 / -1 | 生成物：归一化实时 Springdoc 资料文件标识与授权慕课字段，作为客户端生成输入及 CI diff 基准。 |

## 文档与提案

| 文件 | 状态 | + / - | 作用与原因 |
|---|---|---:|---|
| `.claude/openspec/changes/2026-11-16-ai-frontend-integration.md` | 新增 | +16 / -0 | 记录用户确认的范围、文案和为 PDF 预览补充的内部 API 契约。 |
| `CLAUDE.md` | 修改 | +1 / -1 | 同步 M16.7 已完成的功能验收与格式门禁待确认状态，避免入口文档误报关闭。 |
| `docs/ai-refactor/AI_MILESTONES.md` | 修改 | +43 / -10 | 回填任务、真实栈证据与门禁结果，明确既有格式问题未获授权清理。 |
| `docs/changelist/2026-11-16-ai-frontend-integration.md` | 新增 | +180 / -0 | 按实际 Git 变更记录逐文件作用、行数和验证，供本批评审审计。 |

## 审计要点

1. 会话范围在每轮请求、正式 key 迁移与历史恢复之间保持一致；历史加载完成前禁用发送，避免以默认范围覆盖历史。
2. 引用仅构建站内来源路由，编号不改写代码或既有链接；缺少定位打开来源首页，无法解析来源只展示信息。完整标题路径、PDF 异步布局及媒体元数据决定定位时机。
3. 资料预览先执行 note 的 READ 校验，再调用 HMAC 内部签名端点；file 仅允许知识库资料来源，公开文件接口的本人归属规则未放宽，新增字段使用 XML resultMap。
4. moocId 只从可读授权结果补充；拒绝访问结果不返回该元数据，Python 保留其余 locator 字段。
5. 索引枚举按后端 0–4 统一，特别是已索引为 0；仅构建中持续轮询，无法提取文本明确进入终态。
6. 真实栈六条用例验证链路与交互，脚本模型不代表真实模型质量；41 个既有格式问题未获清理授权，不能据本批文件检查通过声称全仓门禁已通过。
