# Changelist：MinIO 笔记图片链路（M11.0 – M11.5）

> 对应方案：[`docs/minio/MINIO_PLAN.md`](../minio/MINIO_PLAN.md) · 进度与验收：[`docs/minio/MINIO_MILESTONES.md`](../minio/MINIO_MILESTONES.md) · 契约提案：[`.claude/openspec/changes/2026-09-12-minio-note-image-upload.md`](../../.claude/openspec/changes/2026-09-12-minio-note-image-upload.md)

## 概览

把 `OSS_TYPE=MIN_IO` 下"创建任务 → 换分片签名 → 浏览器直传 → 合并 → 渲染"这条链路从三层都不通，修到端到端可用，并顺带解决"正文存 7 天预签名 URL 会集体裂图"的历史问题。

**规模**（`git diff --numstat` + `git ls-files --others --exclude-standard` 实测）：修改 **29** 个文件（**+735 / −150** 行），新增 **9** 个文件（**+1396** 行，含本清单）。合计 **38** 个文件。

按目录分布：

| 目录 | 文件数 | 说明 |
|------|--------|------|
| `services/file` | 11 | 双 endpoint、`multipartFileUpload` 实现、redirect 端点、归属收口、P2 清理 + 3 个测试类 |
| `apps/web` | 6 | `upload.ts` 换端点与 MB 口径、BFF 302 透传、playground 去掉 uploadFn + 2 个测试 + 1 个 E2E |
| `services/note` | 5 | 上传任务端点 + 参数 BO + 测试 |
| `infra` | 6 | compose（minio region/CORS、minio-init）+ prod override、`.env.example`、nginx `oss.*` 块、两处 `sys_config` seed |
| `docs/` | 3 | `docs/minio/MINIO_MILESTONES.md`、`docs/deployment-network.md`、`docs/changelist/`（本清单）；`docs/minio/MINIO_PLAN.md` 是方案原文，本批**未改** |
| 仓库根 | 2 | `CLAUDE.md`、`README.md` |
| `openapi/specs` | 2 | `note.json` / `file.json` baseline 重生（**生成物**） |
| `services/api` | 1 | `OssSliceUploadTaskCreatePublicDTO` 补 `@Schema`（含 MB 单位） |
| `.claude/` | 1 | openspec 变更提案 |

### 验证结果

| 命令 | 结果 |
|------|------|
| `mvn test -pl note,file`（纯单测，`services/` 下执行） | ✅ note **26** / file **23**，全绿无回归 |
| `mvn test -pl file -Dtest.excluded.groups= -Dtest=MinIOFilePluginIntegrationTest` | ✅ **5 passed**（真 MinIO，本机 Docker 栈） |
| `pnpm --filter web test` | ✅ **856 passed / 93 files** |
| `npx tsc --noEmit`（`apps/web`） | ✅ 干净 |
| `pnpm --filter web test:e2e --project=chromium` | ✅ **23 passed**（含新增 `notes-image-upload.spec.ts` 2 条） |
| `pnpm --filter web bundle:budget` | ✅ 首屏 295.3 / 300 KB、`/m/*` 243.1 / 250 KB、编辑器 13.2 / 250 KB |
| `docker compose config --quiet`（middleware / 全栈 / dev 三份） | ✅ 退出码 0 |
| `mc ls local/` + `mc admin config get local api` | ✅ `anynote/` 桶存在、`cors_allow_origin=*` |
| `openapi/specs/` 二次生成幂等性（等价于 `openapi:check` 无漂移） | ✅ 6 份 baseline 两次生成 SHA256 完全一致 |

> **本机跑 `pnpm openapi:check` 会失败，与本批改动无关**：该脚本是 `bash openapi/generate.sh`，Windows 上 `bash` 解析到 **WSL**，而 WSL 到不了宿主机的 `localhost:8080`，六个服务全部报"响应校验未通过"。用 `& "C:\Program Files\Git\bin\bash.exe" openapi/generate.sh` 跑即全绿（六个 spec 全部拉到，`23/61/14/16/2` paths）。CI 在 Linux 上不受影响。

**跑过但失败（既有问题，非本批引入）**：`pnpm --filter web test:e2e --project=mobile` 27 passed / **1 failed** —— `mobile-core.spec.ts` 的「输入自动保存，返回列表再进来内容还在」在 `mobile-back` 处退回 `about:blank`。该用例此前从未实跑过（`docs/mobile/MOBILE_MILESTONES.md` 记为"未做"），失败的 `mobile-screen.tsx` 本批未触及；已如实记入里程碑的"顺带发现"。

---

## services/file — 对象存储插件与文件服务

这一层是本批的核心：既补上了 MinIO 缺失的实现，也收口了两处鉴权空洞。

| 文件 | 状态 | 作用与原因 |
|------|------|-----------|
| `services/file/src/main/java/com/anynote/file/model/bo/MinIOConfig.java` | 修改 | 新增 `publicEndPoint`（浏览器可达地址，**只**用于签预签名 URL）与 `region`。SigV4 把 Host 计入签名，服务端内网地址与浏览器地址不同，必须分开；`region` 显式设置后 `getPresignedObjectUrl` 是纯本地计算，不会对公网 endpoint 发 `GetBucketLocation` |
| `services/file/src/main/java/com/anynote/file/plugin/impl/MinIOFilePlugin.java` | 修改 | 构造时建两个客户端（内网 `minioClient` + 签名用 `presignClient`，都设 region，`publicEndPoint` 为空时回落同实例）；预签名改走 `presignClient`；`multipartFileUpload` 从空实现 `return ""` 改为真实 `putObject` 并返回 `objectName`；新增 `removeObjects` 删合并后的临时分片（尽力而为，失败只记日志） |
| `services/file/src/main/java/com/anynote/file/plugin/FilePlugin.java` | 修改 | 接口新增 `removeObjects`。删分片是"合并后清理"的必要能力，不能让调用方绕开插件直接碰 SDK |
| `services/file/src/main/java/com/anynote/file/plugin/impl/HuaweiFilePlugin.java` | 修改 | 同步实现 `removeObjects`，保持两种后端接口一致；同样尽力而为语义 |
| `services/file/src/main/java/com/anynote/file/controller/FileController.java` | 修改 | 新增 `GET objects/{fileId}/redirect`：302 到新鲜预签名 URL + `Cache-Control: private, max-age=300`。笔记正文存这个稳定路径，永不失效 |
| `services/file/src/main/java/com/anynote/file/service/FileService.java` | 修改 | 新增 `getObjectUrlByFileId` 方法声明 |
| `services/file/src/main/java/com/anynote/file/service/impl/FileServiceImpl.java` | 修改 | ①`upload` 从写死 `huaweiFilePlugin()` 改为 `filePlugin()`，尊重 `OSS_TYPE`（这正是 M7.6「PDF 上传转存失败」的根因）；②新增 `getObjectUrlByFileId`（归属校验）；③`getObjectUrlByObjectName` 补归属校验，不再"知道 objectName 就能换签名"；④`markOssUploadSlice` 改为写**校验通过**的分片子集（原来写请求里的全部 index，校验形同虚设）；⑤任务 key 与分片集合设 24h TTL；⑥合并后删分片；⑦URL 缓存与签名 TTL 从 7 天收敛到 1 小时 |
| `services/file/src/main/java/com/anynote/file/factory/FilePluginFactory.java` | 修改 | 抽出 `ossType()`，供"某路径只对特定后端有意义"的分支判断，避免为了拿类型先构造一个插件实例 |
| `services/file/src/test/java/com/anynote/file/plugin/impl/MinIOFilePluginTest.java` | **新增** | 8 条纯单测：`publicEndPoint` 回落（含空串/空白）、签名 host 取公网地址、region 补默认值并进 credential scope、中转上传失败抛异常而非返回空串、`removeObjects` 容错 |
| `services/file/src/test/java/com/anynote/file/plugin/impl/MinIOFilePluginIntegrationTest.java` | **新增** | 5 条真 MinIO 集成测试（`@Tag("integration")`）：预签名 PUT 真能上传、分片合并后内容按序一致且分片被清理、中转上传落真实对象、私有桶匿名读 403 + 签名读 200、credential scope region 一致。**纯单测证明不了"签出来的 URL 真能 PUT 上去"**，这是本批唯一能验证 Host/region/路径三者对齐的用例 |
| `services/file/src/test/java/com/anynote/file/service/impl/FileServiceImplTest.java` | **新增** | 15 条纯单测：redirect 的归属校验（他人/不存在 → A0301 且不签名）、命中缓存不重复签、无 objectName 的历史数据明确报错、`byObjectName` 三种越权分支、mark 只写校验通过的子集、合并后删分片、清理失败不影响上传结果、`MIN_IO` 下华为签名端点拒绝、建任务写 24h TTL、缓存 TTL 为 1 小时 |

## services/note — 笔记图片上传任务端点

补齐方案 §2.3 指出的"缺的就是那一个业务端点"。

| 文件 | 状态 | 作用与原因 |
|------|------|-----------|
| `services/note/src/main/java/com/anynote/note/controller/NoteController.java` | 修改 | 新增 `POST /notes/{noteId}/images/uploadTasks`，带 `@Operation` 说明"path 与 source 由服务端决定、请求体只含 fileName/hash/fileSize(MB)/contentType" |
| `services/note/src/main/java/com/anynote/note/service/NoteService.java` | 修改 | 新增 `createNoteImageUploadTask` 声明 |
| `services/note/src/main/java/com/anynote/note/service/impl/NoteServiceImpl.java` | 修改 | 实现：`@RequiresNotePermissions(EDIT)`（与 `editNote` 同一把锁——只校验登录会让任何用户往他人笔记目录写对象）；校验笔记存在且未删除；`path` 用 `NOTE_IMAGE_PATH_TEMPLATE`、`source` 用 `FileSources.NOTE_IMAGE`，**都不从请求体取** |
| `services/note/src/main/java/com/anynote/note/model/bo/NoteImageUploadTaskCreateParam.java` | **新增** | 参数 BO。必须继承 `NoteQueryParam`：权限切面从第一个参数取该类并用其中的 id 查权限，换成普通 POJO 会让切面直接跳过校验。不加 `@Builder`（父类已有，Lombok 生成的子类 builder 无法覆盖父类 builder 类型，会编译失败） |
| `services/note/src/test/java/com/anynote/note/service/impl/NoteServiceImplCreateImageUploadTaskTest.java` | **新增** | 6 条纯单测：断言传给 Feign 的 `path == "note/42/images"`、`source == 0`；笔记不存在/已逻辑删除 → A0404 且**不调用** file 服务；Feign 返错/返 null/data 为空 → 包成 `BusinessException` |

## apps/web — 前端切换

改的是"第 1 步打谁"和"正文里存什么地址"两件事。

| 文件 | 状态 | 作用与原因 |
|------|------|-----------|
| `apps/web/src/lib/editor/upload.ts` | 修改 | 第 1 步改打 `noteApi.POST("/notes/{noteId}/images/uploadTasks")`（file 的 `/ossSliceUploadTasks` 带 `@InnerAuth`，浏览器直连会被正确拒绝）；body 去掉 `path`/`source`；`fileSize` 改传 **MB**（`file.size / 1024 / 1024`，传字节会让 1 MiB 图片被切成 1000 片）；返回值改为 `{ fileId, objectName, url }`，`url` 是稳定 redirect 路径；新增 `noteImageUrl()`；`UploadOptions.noteId` 变为必填 |
| `apps/web/src/app/api/proxy/[...path]/route.ts` | 修改 | `redirect` 由 `"error"` 改为 `"manual"`，把 302 与 `Location` 原样交给浏览器。**不能让 Node follow**——follow 等于让服务端把对象再下载一遍，白费带宽并把 30x 变成 200 |
| `apps/web/src/app/(workspace)/playground/editor/editor-playground.tsx` | 修改 | 去掉 `uploadFn`：playground 没有绑定笔记，而图片上传的 path 与权限都由笔记归属决定。工具栏会提示"未配置图片上传"，粘贴/拖拽也不会静默失败 |
| `apps/web/src/lib/editor/__tests__/upload.test.ts` | 修改 | 10 条（改写）：断言第 1 步的 path/params/body，**显式断言 body 不含 `path`/`source`**；2 MiB → `fileSize ≈ 2`；返回地址是 redirect 路径且不含 `X-Amz-`；不再调 `/public/byObjectName`；秒传短路；5 个一批；PUT 非 2xx 抛 `ApiError`；合并缺 `fileId` 抛错；字符串 noteId 也能拼对 |
| `apps/web/src/app/api/proxy/__tests__/proxy.test.ts` | 修改 | 新增 3 条：302 原样透传 `Location` 与 `Cache-Control`、`init.redirect === "manual"`、302 缺 `Location` 不崩、非 302 行为不回归 |
| `apps/web/e2e/notes-image-upload.spec.ts` | **新增** | 2 条真实栈 E2E：①工具栏上传后正文出现 `/api/proxy/file/objects/{id}/redirect` 且 `naturalWidth > 0`（**只有真解码成功才能同时证明对象存在、302 被透传、预签名 URL 可读**），并断言请求不含 `path`/`source`、`fileSize < 1`；②刷新后图片仍能加载（证明正文存的是稳定路径） |

## infra — 容器与反代

| 文件 | 状态 | 作用与原因 |
|------|------|-----------|
| `infra/docker-compose-middleware.yaml` | 修改 | minio 增加 `MINIO_SITE_REGION`（与客户端 region 对齐，否则 `SignatureDoesNotMatch`）与 `MINIO_API_CORS_ALLOW_ORIGIN`（浏览器直传必需；MinIO 不实现 `PutBucketCors`，只能在服务端配）；新增一次性 `minio-init` 建桶 + 显式私有策略 + 可选 ILM |
| `infra/docker-compose.yaml` | 修改 | 用 `extends` 引入 `minio-init` |
| `infra/docker-compose.prod.yaml` | 修改 | `minio-init` 加 `<<: *prod` 但**显式保持 `restart: "no"`**——否则 `unless-stopped` 会让它建完桶后无限重启 |
| `infra/.env.example` | 修改 | 补 `MINIO_BUCKET` / `MINIO_SITE_REGION` / `MINIO_CORS_ALLOW_ORIGIN` / `MINIO_MC_IMAGE` / `MINIO_MC_VERSION` / `MINIO_ILM_PREFIX`，每项写明 prod 要求与踩坑点 |
| `infra/nginx/nginx.conf` | 修改 | 追加 `upstream anynote_oss` + 独立 `server_name oss.YOUR_DOMAIN`：原样透传 Host（签名依赖）、关闭请求缓冲、只放通 bucket 路径、控制台落 404、access log 不记 query（签名在里面）。**不加 CORS 头**——由 MinIO 自己回，重复头会让浏览器判失败 |
| `infra/sql/sys_config.sql` + `infra/docker/mysql/init/source/sys_config.sql` | 修改 | `MIN_IO_CONFIG` seed 从个人环境残留的 `https://api.minio.yypan.xyz` 改为 `http://minio:9000` + `publicEndPoint: http://localhost:9000` + `region`，凭据留空。原 seed 让新环境一上来就是坏的。两处内容必须一致（`fc` 校验过） |

## openapi/specs — 契约 baseline（生成物）

| 文件 | 状态 | 作用与原因 |
|------|------|-----------|
| `openapi/specs/note.json` | 修改（**生成物**） | 由 `pnpm openapi:generate`（= `bash openapi/generate.sh`）从运行中的 Gateway 拉取后归一化产出，含新端点 `/notes/{noteId}/images/uploadTasks`。CI `openapi-check.yml` 会对 baseline diff 阻断漂移，**评审请看 Controller 注解而不是这个文件** |
| `openapi/specs/file.json` | 修改（**生成物**） | 同上，含 `/objects/{fileId}/redirect` 与 `byObjectName` 的新描述 |

## services/api — 契约注解

| 文件 | 状态 | 作用与原因 |
|------|------|-----------|
| `services/api/anynote-api-file/src/main/java/com/anynote/file/api/model/dto/OssSliceUploadTaskCreatePublicDTO.java` | 修改 | 补 `@Schema`，**`fileSize` 明确写"单位 MB（不是字节）"**。原前端传字节的 bug 就是因为契约里没写单位；不写清下次还会有人踩 |

## 文档

| 文件 | 状态 | 作用与原因 |
|------|------|-----------|
| `docs/minio/MINIO_MILESTONES.md` | **新增** | M11.0–M11.5 执行进度、实测数字、逐项验收、与方案的偏差、未做项。方案是"要做什么"，这里是"实际做了什么" |
| `.claude/openspec/changes/2026-09-12-minio-note-image-upload.md` | **新增** | API 变更提案：两个新端点 + `byObjectName` 语义收窄 + 302 约定 + 权限边界表 + 验证计划 |
| `docs/deployment-network.md` | 修改 | 架构图补对象存储入口与 `ossPort`，并写明"必须独立子域（SDK 禁止 endpoint 带路径）、必须原样透传 Host、不要重复加 CORS"三条约束 |
| `README.md` | 修改 | E2E 用例数 20 → 22（桌面）；「端到端与性能门禁」补两条前置条件（collab 的 secure context 构建参数、MinIO 桶与 Redis 凭据就绪） |
| `CLAUDE.md` | 修改 | `docs/minio/` 导航行更新为"已实施 + 指向 MINIO_MILESTONES.md"；E2E 条数 49 → 52（桌面 23 + 移动 29）。按「文档维护约定」，新增被引用文件后同步指针，避免悬空引用 |

---

## 审计要点

1. **`FileServiceImpl.markOssUploadSlice` 的写集合**（`FileServiceImpl.java`）——原实现校验了分片存在性，却把**请求里的全部 index** 写进 Redis 集合，校验形同虚设、失败推迟到合并时才炸。现在只写校验通过的 `markedChunkIndexList`。这是本批唯一"修了看不出、不修会偶发"的缺陷。

2. **`MinIOFilePlugin` 的两个 client**——签名必须走 `presignClient`。若误用 `minioClient`，dev 下签名 host 会是 `minio:9000`，浏览器 PUT 到 `localhost:9000` 时 Host 不匹配，直接 `SignatureDoesNotMatch`。单测里专门断言了 host。

3. **BFF 的 `redirect: "manual"`**——看起来是个小开关，但它决定"302 是透传给浏览器还是被 Node 自己走完"。后者会让每次图片加载都变成服务端完整下载一遍对象。`proxy.test.ts` 里显式断言了 `init.redirect`。

4. **`fileSize` 的单位**——后端按 MB 算 `chunkSize`/`totalChunk`。前端传字节会让 1 MiB 图片被算成 1000 个分片，即使其他全部修好也上传必败。已在 `@Schema`、代码注释与两处测试（单测断言 `≈2`、E2E 断言 `< 1`）三处钉住。

5. **`minio-init` 的 ILM 默认关闭**——方案原文的 `--prefix "{basePath}/"` 会把**正式对象**一并 1 天过期（分片路径里各来源的 `{path}` 不同，没有单一 prefix 能只圈住分片）。这里改成需显式设置 `MINIO_ILM_PREFIX` 才启用，常规清理交给合并后的 `removeObjects`。改动方向与方案相反，理由写在里程碑的"与方案的偏差"表。

6. **`minio-init` 在 prod 必须是 `restart: "no"`**——`docker-compose.prod.yaml` 的 `<<: *prod` 会带上 `unless-stopped`，一次性建桶容器会无限重启。这条容易在复制粘贴 prod override 时漏掉。

7. **`getObjectUrlByObjectName` 的收口是行为变更**——它现在要求对象在 `file` 表存在且归属当前用户，否则 `A0301`。mooc / legacy 若依赖"任意 objectName 都能换签名"，会在这里被拒。这是刻意的安全修复（原设计靠 UUID 难猜），已写进 openspec 提案的"语义收窄"行。
