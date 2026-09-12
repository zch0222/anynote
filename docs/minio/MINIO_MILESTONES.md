# Anynote MinIO 链路实施进度（M11.0 – M11.5）

> 文档版本：v1.0 | 创建 2026-09-12 | 状态：**M11.0 – M11.5 已实施，桌面 E2E 与真 MinIO 集成测试全绿**
> 关联文档：[`MINIO_PLAN.md`](./MINIO_PLAN.md)（技术方案，§ 引用均指该文）· [`CLAUDE.md`](../../CLAUDE.md) · [`docs/deployment-network.md`](../deployment-network.md) · [`docs/changelist/2026-09-12-minio-note-image-upload.md`](../changelist/2026-09-12-minio-note-image-upload.md)

实施顺序与验收口径以方案 §8 / §9 为准；本文只记录**实际做了什么、实测数字、与方案的偏差、未做项**。

---

## 总览

| 里程碑 | 内容 | 状态 |
|---|---|---|
| M11.0 | 环境打通：compose region/CORS、建桶初始化、`sys_config` 真实值 | ✅ |
| M11.1 | 配置与插件：双 endpoint + region；`multipartFileUpload` 实现 | ✅ |
| M11.2 | 业务端点：note 上传任务 + file 归属收口 + 302 redirect | ✅ |
| M11.3 | 前端切换：`upload.ts` / uploader / BFF 302 透传 | ✅ |
| M11.4 | 中转与单文件签名收口 | ✅ |
| M11.5 | 生产网络：nginx `oss.*` server 块 + P2 清理 | ✅（prod 反代片段已入库，未在真实域名上验证） |

---

## M11.0 环境打通

**改了什么**

- `infra/docker-compose-middleware.yaml`：minio 增加 `MINIO_SITE_REGION`（默认 `us-east-1`）与 `MINIO_API_CORS_ALLOW_ORIGIN`（默认 `*`）；新增一次性 `minio-init` 服务建桶。
- `infra/docker-compose.yaml` / `docker-compose.prod.yaml`：用 `extends` / `<<: *prod` 引入 `minio-init`。
- `infra/sql/sys_config.sql` 与 `infra/docker/mysql/init/source/sys_config.sql`：`MIN_IO_CONFIG` seed 从个人环境残留的 `https://api.minio.yypan.xyz` 改为 `{"endPoint":"http://minio:9000","publicEndPoint":"http://localhost:9000","region":"us-east-1",...}`，凭据留空。
- `infra/.env.example`：补 `MINIO_BUCKET` / `MINIO_SITE_REGION` / `MINIO_CORS_ALLOW_ORIGIN` / `MINIO_MC_IMAGE` / `MINIO_MC_VERSION` / `MINIO_ILM_PREFIX`。

**实测（§7.3 的 1/2/3/5/6）**

| 检查 | 结果 |
|---|---|
| `docker exec anynote-minio curl .../minio/health/live` | ✅ 200 |
| file 容器 → `http://minio:9000/minio/health/live`（内网口径） | ✅ 200 |
| 宿主机 → `http://localhost:9000/minio/health/live`（浏览器口径） | ✅ 200 |
| `mc ls local/` | ✅ `anynote/` 桶存在 |
| `mc admin config get local api` | ✅ `cors_allow_origin=*` |
| minio 容器 env | ✅ `MINIO_SITE_REGION=us-east-1` |

**与方案的偏差（2 处，都是必须改的）**

| 方案原文 | 实际做法 | 原因 |
|---|---|---|
| `image: minio/mc:${MINIO_MC_VERSION:-latest}` | `quay.io/minio/mc`（可用 `MINIO_MC_IMAGE` 覆盖） | Docker Hub 的 `minio/mc` 已下架，`docker pull minio/mc` 报 `pull access denied`；mc 现在只在 quay.io 发布 |
| ILM 规则用 `--prefix "{basePath}/"` 且默认执行 | **默认不执行**，改为 `MINIO_ILM_PREFIX` 显式开启 | 分片路径是 `{basePath}/{path}/{uploadId}/{fileName}_chunk_{n}`，各业务来源的 `{path}` 不同，**没有任何单一 prefix 能只圈住分片**。照原文用 `{basePath}/` 会把正式对象一起 1 天过期（丢数据）。常规清理改由合并后 `removeObjects` 承担（§4.6-3） |

**`sys_config` 生效**：改库后按 §2.8 重启 `anynote-modules-system`，确认 Redis 里的 `MIN_IO_CONFIG` 带上了真实凭据。**这一步不做，file 服务读到的仍是空 accessKey**，报 `AccessKey and SecretKey must not be empty`——本地实施时先踩到过一次。

---

## M11.1 配置与插件

**改了什么**

- `MinIOConfig`：新增 `publicEndPoint`（浏览器可达地址，只用于签预签名 URL）与 `region`。
- `MinIOFilePlugin`：构造时建两个客户端——`minioClient`（内网 `endPoint`，服务端调用）与 `presignClient`（`publicEndPoint`，签名专用）；两者都显式设 region。`publicEndPoint` 为空时回落成同一实例，兼容旧配置。
- `MinIOFilePlugin.multipartFileUpload`：从空实现 `return ""` 改为真实 `putObject`，返回 `objectName`。

**为什么要两个 client**：SigV4 把 Host 计入签名，服务端内网地址（`minio:9000`）与浏览器实际请求地址（`localhost:9000` / `oss.example.com`）不同。显式设 region 后 `getPresignedObjectUrl` 是纯本地计算，不会对公网 endpoint 发 `GetBucketLocation`。

**单测覆盖**（`MinIOFilePluginTest`，8 条）

- `publicEndPoint` 为 `null` / `""` / `"   "` 时 `presignClient` 必须与 `minioClient` 同实例。
- 配了 `publicEndPoint` 时签名 URL 的 host 是 `localhost`（不是 `minio`），路径含 `basePath` 前缀。
- 未配时签名 host 回落到内网。
- region 缺省补 `us-east-1` 且出现在 `X-Amz-Credential` 的 scope 里。
- 存储不可达时 `multipartFileUpload` 抛 `BusinessException`（不再静默返回空串）。
- `removeObjects` 对 `null` / 空列表不抛 NPE；删除失败只记日志不外抛。

**真 MinIO 集成测试**（`MinIOFilePluginIntegrationTest`，5 条，`@Tag("integration")`）

| 用例 | 验的是什么 |
|---|---|
| 预签名 PUT 真能上传 | 签出的 URL 直接 PUT 返回 200，服务端侧 stat 到对象且字节一致——**只有真打一次 MinIO 才能证明 Host/region/路径三者与 `MINIO_SITE_REGION`/bucket/`basePath` 完全一致** |
| 分片合并闭环 | 两片 → `composeObject` → 内容按序拼接 → `removeObjects` 后分片 stat 抛 `ErrorResponseException` |
| 中转上传落真实对象 | `multipartFileUpload` 返回 `objectName`，`exist()` 为真，内容可读回 |
| GET 预签名可读 + 私有桶 | 匿名 GET 返回 **403**（证明 `mc anonymous set none` 生效），带签名 GET 返回 200 且内容一致 |
| region 一致 | credential scope 含 `us-east-1` |

运行方式（默认被 surefire 的 `excludedGroups` 排除）：

```bash
cd services && mvn test -pl file -Dtest.excluded.groups= -Dtest=MinIOFilePluginIntegrationTest
```

> 集成测试里踩到的真实约束：`composeObject` 要求**除最后一片外每片 ≥5 MiB**（S3 `EntityTooSmall`），所以用例里第一片必须造够 5 MiB。后端 `chunkSize` 下限恰好也是 5 MB，两者一致。

---

## M11.2 业务端点

**改了什么**

- `NoteController` 新增 `POST /notes/{noteId}/images/uploadTasks`；`NoteServiceImpl.createNoteImageUploadTask` 复用 `@RequiresNotePermissions(EDIT)`。
- 新增 `NoteImageUploadTaskCreateParam`（继承 `NoteQueryParam` 以配合权限切面的取值约定）。
- `FileController` 新增 `GET objects/{fileId}/redirect`（302 + `private, max-age=300`）。
- `FileServiceImpl` 新增 `getObjectUrlByFileId`（归属校验），并给 `getObjectUrlByObjectName` 加同样的收口。
- `OssSliceUploadTaskCreatePublicDTO` 补 `@Schema`，**写明 `fileSize` 单位是 MB**。
- `RemoteFileService` 无需改动：`/ossSliceUploadTasks` 保持 `@InnerAuth`。

**安全边界（§2.2 的承重墙没有退让）**

| 项 | 结果 |
|---|---|
| `path` / `source` 来源 | 服务端按 `NOTE_IMAGE_PATH_TEMPLATE` + 笔记 id 拼装，请求体**不允许**携带 |
| 建任务权限 | 笔记 **编辑**权限（与 `editNote` 同一把锁） |
| 后续 2–5 步 | 仅登录；任务按 `userId + uploadId` 存 Redis，`objectName` 只从任务里读 |
| redirect / byObjectName | 文件必须存在且归属当前用户，否则 `A0301`（不区分"不存在"与"无权限"，避免泄露存在性） |

**单测覆盖**

- `NoteServiceImplCreateImageUploadTaskTest`（6 条）：断言传给 Feign 的 `path == "note/42/images"`、`source == 0`；笔记不存在 / 已逻辑删除 → `A0404` 且**不调用** file 服务；Feign 返错 / 返 null / data 为空 → 包成 `BusinessException`。
- `FileServiceImplTest`（15 条）：本人文件可签、他人文件与不存在的文件均 `A0301` 且不签名、命中缓存不重复签、`objectName` 为空的历史数据明确报错；`byObjectName` 三种越权分支；mark 只写校验通过的分片子集；合并后删分片；清理失败不影响上传结果；`MIN_IO` 下华为签名端点拒绝；建任务写 24h TTL。

---

## M11.3 前端切换

**改了什么**

- `apps/web/src/lib/editor/upload.ts`：第 1 步改打 `noteApi.POST("/notes/{noteId}/images/uploadTasks")`，body 去掉 `path` / `source`，`fileSize` 改传 **MB**（`file.size / 1024 / 1024`）；返回值改成 `{ fileId, objectName, url }`，`url` 是稳定 redirect 路径；新增导出 `noteImageUrl(fileId)`；`UploadOptions.noteId` 变为必填。
- `apps/web/src/app/api/proxy/[...path]/route.ts`：`redirect` 由 `"error"` 改为 `"manual"`，把 302 与 `Location` 原样交给浏览器。
- `playground/editor`：按方案 §5-3 不再传 `uploadFn`（playground 没有笔记），工具栏会提示"未配置图片上传"。

**为什么第 1 步必须打 note**：file 的 `/ossSliceUploadTasks` 带 `@InnerAuth`，浏览器直连被正确拒绝。这不是要绕过的障碍，而是这条设计的准入控制。

**单测覆盖**

- `upload.test.ts`（10 条）：断言第 1 步的 path / 参数 / body（**显式断言 body 不含 `path`、`source`**）、2 MiB → `fileSize ≈ 2`（不是 2097152）、返回地址是 `/api/proxy/file/objects/{id}/redirect` 且不含 `X-Amz-`、不再调用 `/public/byObjectName`、秒传短路、5 个一批换签名、PUT 非 2xx 抛 `ApiError`、合并缺 `fileId` 抛错、字符串 noteId 也能拼对路径参数。
- `proxy.test.ts`（12 条，含新增 3 条）：302 原样透传 `Location` 与状态码、`init.redirect === "manual"`（**关键：否则 Node 会把对象下载一遍再返回 200**）、302 缺 `Location` 不崩、非 302 行为不回归。

---

## M11.4 中转与单文件签名收口

- `FileServiceImpl.upload` 从 `huaweiFilePlugin()` 改为 `filePlugin()`，尊重 `OSS_TYPE`；用插件类型区分返回值语义（MinIO 返回 `objectName` 写进 `objectName` 列，华为返回永久 URL 只写 `url`），避免把华为 URL 当 objectName 去 stat。
- `createHuaweiOBSTemporarySignature` 在 `OSS_TYPE != HUAWEI_OBS` 时抛业务错误，不再静默落华为。
- `HuaweiFilePlugin.removeObjects` 同步实现，保证接口一致（尽力而为语义）。

---

## M11.5 生产网络与 P2 清理

- `infra/nginx/nginx.conf`：按 §7.2 追加 `upstream anynote_oss` + 独立 `server_name oss.YOUR_DOMAIN` 的 HTTP 跳转与 HTTPS 块；`proxy_set_header Host $http_host`（不可改写）、`client_max_body_size 1024M`、`proxy_request_buffering off`；只放通 `location ^~ /anynote/` 与 health，控制台落到 `return 404`；**不加 CORS 头**（由 MinIO 自己回，重复头会让浏览器判失败）。
- `docs/deployment-network.md`：架构图补对象存储入口与 `ossPort`，并写明"必须独立子域、必须原样透传 Host、不要重复加 CORS"三条约束。
- P2 清理（§4.6）：`markOssUploadSlice` 改为写**校验通过**的 `markedChunkIndexList`（原来写请求里的全部 index，校验形同虚设）；任务 key 与分片集合都设 24h TTL；合并后 `removeObjects` 删分片。
- 缓存 TTL：对象 URL 缓存与签名有效期都从 7 天收敛到 1 小时（正文改存 redirect 后不再需要长缓存，长缓存只会让吊销滞后）。

---

## 验收记录

### 2026-09-12 · M11.0 – M11.5 · 分支 `dev`（工作区改动）

**实测数字**

| 项 | 结果 |
|---|---|
| `mvn test -pl note,file`（纯单测） | ✅ note **26 条**（+6）、file **23 条**（新增 8 + 15）；全模块无回归 |
| `mvn test -pl file -Dtest.excluded.groups= -Dtest=MinIOFilePluginIntegrationTest` | ✅ **5 条全绿**（真 MinIO，Docker 栈） |
| `pnpm --filter web test` | ✅ **856 条 / 93 文件全绿**（新增/改写 22 条中的相关部分） |
| `npx tsc --noEmit`（apps/web） | ✅ 干净 |
| `pnpm openapi:check` 口径（`openapi/specs/` diff） | ✅ 仅 `note.json` / `file.json` 变化，两个新端点已入库 |
| `pnpm --filter web test:e2e --project=chromium` | ✅ **23 passed**（含新增 `notes-image-upload.spec.ts` 2 条） |
| `pnpm --filter web bundle:budget` | ✅ 首屏 295.3 KB / 300 KB；`/m/*` 243.1 KB / 250 KB；编辑器 13.2 KB / 250 KB |
| compose 配置校验（middleware / 全栈 / dev 三份） | ✅ `docker compose config --quiet` 退出码 0 |

**新增 E2E**：`apps/web/e2e/notes-image-upload.spec.ts` 2 条——上传后正文出现 `/api/proxy/file/objects/{id}/redirect` 且 `naturalWidth > 0`（证明合并出的对象存在、302 被透传、预签名 URL 可读）；刷新页面后仍能加载（证明正文存的是稳定路径而非会过期的 URL）。同时断言请求体不含 `path` / `source`、`fileSize < 1`（MB 口径）。

**未做项**

| 未做 | 原因 |
|------|------|
| `oss.YOUR_DOMAIN` 真实域名上的 nginx 反代验证（§7.3 的 4/7） | 本机没有公网域名与证书；片段已入库，dev 口径用 `publicEndPoint=http://localhost:9000` 全绿 |
| prod 用独立应用账号（`mc admin user add` + 只给桶策略） | 属 §6.4 的部署动作，需要真实生产环境 |
| 已落库的 7 天预签名 URL 正文重写（§4.2 末尾） | 当前库里只有 dev / E2E 账号数据，无需迁移脚本 |
| `/docs` 协同文档接图片上传（§11 D3） | 按决定**本期不接**；协同文档权限模型与笔记不同，需另开工单 |
| 移动端图片上传真机验收 | 无真机；桌面 E2E 已覆盖同一条链路 |

**顺带发现（不在本方案范围，未修）**

`pnpm --filter web test:e2e --project=mobile` 本轮**首次实跑**（此前 [`docs/mobile/MOBILE_MILESTONES.md`](../mobile/MOBILE_MILESTONES.md) 记为"未做"），27 passed / 1 failed：`mobile-core.spec.ts` 的「输入自动保存，返回列表再进来内容还在」在 `mobile-back` 处失败。原因是该用例 `page.goto(noteUrl)` 直接打开笔记后，`window.history.length` 为 2 而非 ≤1，`goBack()` 走 `router.back()` 退回 `about:blank`，没有落到 `/m/notes/{baseId}`。这与 MinIO 改动无关（`components/layout/mobile/mobile-screen.tsx` 未被本次触及），是移动端用例首次实跑暴露的既有问题，留待 `docs/mobile/` 单独处理。

`pnpm openapi:check` 在 Windows 上会失败：该脚本是 `bash openapi/generate.sh`，而 `bash` 解析到 **WSL**，WSL 到不了宿主机的 `localhost:8080`，六个服务全部报"响应校验未通过"。改用 Git Bash（`& "C:\Program Files\Git\bin\bash.exe" openapi/generate.sh`）即全绿。CI 跑在 Linux 上不受影响，因此未改脚本。

`pnpm check`（Biome）在 `apps/web/src/components/editor/core/toolbar-commands.ts` 报一条 `useArrayIndexAsKey`，**在本批改动前的 HEAD 上就已存在**（已在干净 worktree 上用同一版本 Biome 复现），本批未修以保持改动面聚焦。

---

## 与方案的偏差汇总

| 方案 | 实际 | 原因 |
|---|---|---|
| `minio/mc` 镜像 | `quay.io/minio/mc` | Docker Hub 已下架该仓库 |
| ILM `--prefix {basePath}/` 默认执行 | 改为 `MINIO_ILM_PREFIX` 显式开启，默认跳过 | 该 prefix 会误删正式对象；无更细 prefix 可用 |
| `getObjectUrlByObjectName` 的 TTL "改 1 小时" | 已改（签名与缓存都是 1 小时） | 按 §4.3-3 执行 |
| `createHuaweiOBSTemporarySignature` 抛 `NotImplementedException` | 抛 `BusinessException(...)` | 全仓 `services/**` 内不存在 `NotImplementedException` 类型，引入新异常类会与既有全局处理器约定分叉 |
| ILM 作为分片垃圾兜底 | 由合并后 `removeObjects` 承担 | 见上；§9 的人工验收第 9 条已按此调整 |
