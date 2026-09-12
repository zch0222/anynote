# API 变更提案：笔记图片上传任务 + 对象按 id 重定向

> 对应方案文档：[`docs/minio/MINIO_PLAN.md`](../../../docs/minio/MINIO_PLAN.md)（M11.2）
> 关联：[`FRONTEND_MILESTONES.md` 的 M5.10 / M7.6 上传缺口](../../../docs/refactor/FRONTEND_MILESTONES.md)

## 背景

新前端的编辑器图片上传在真实栈上必败，原因是三层的组合缺陷（方案 §0 / §2 有完整证据）：

1. **业务层缺端点**：mooc 有 `POST /api/note/moocs/cover/create` 这类"上传任务"端点，
   笔记图片没有；前端只能去敲 file 服务的 `POST /api/file/ossSliceUploadTasks`，
   而该端点带 `@InnerAuth`，会被正确拒绝（`A0301`）。
2. **图片地址会过期**：正文写的是 7 天预签名 URL（`FileServiceImpl:369`），
   到期后所有图片集体裂图。
3. **`public/byObjectName` 无归属校验**：任何登录用户拿任意 `objectName` 都能换签名，
   安全性建立在"UUID 难猜"上而不是鉴权。

`path` / `source` 必须由服务端决定：`uploadId` 就是后端颁发的临时凭据，
放任客户端自选前缀等于允许越权写入他人 `note/{id}/images` 目录。

## 变更端点

| 方法 | 路径 | 描述 | 变更类型 |
|------|------|------|----------|
| POST | `/api/note/notes/{noteId}/images/uploadTasks` | 创建笔记图片上传任务（分片直传第 1 步） | **新增** |
| GET | `/api/file/objects/{fileId}/redirect` | 按文件 id 302 到新鲜预签名 URL | **新增** |
| GET | `/api/file/public/byObjectName` | 按对象名换时效地址 | **语义收窄**（加归属校验，返回 A0301） |
| POST | `/api/file/ossSliceUploadTasks` | 内部：创建分片上传任务 | 不变（仍 `@InnerAuth`） |
| POST | `/api/file/getOssSliceUploadSignatures` | 换分片签名 | 不变 |

### 路径前缀说明

`CLAUDE.md` 写"新端点必须用 `/api/v1/*`"，但全仓 `services/**` 里 `/api/v1` 的实际用例为 **0**，
note 的端点全在 `/notes/**`。本提案与既有路由段保持一致，把 v1 前缀留给整体迁移，
避免为单个端点同时改 Gateway 路由与全部 note 端点（方案 §11 D4，已选 (a)）。

## 请求体示例（POST /api/note/notes/{noteId}/images/uploadTasks）

```json
{
  "fileName": "shot.png",
  "hash": "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08",
  "fileSize": 1.5,
  "contentType": "image/png"
}
```

- **`fileSize` 单位是 MB，不是字节**。后端 `chunkSize = max(5, ceil(fileSize/1000))`、
  `totalChunk = ceil(fileSize/chunkSize)`（`MinIOFilePlugin`）。新前端此前传的是字节，
  一张 1 MiB 图片会被算成 `chunkSize ≈ 1049 MB`、`totalChunk = 1000`，上传必败。
  本次已在 `@Schema` 里写明单位。
- 请求体**不含** `path` 与 `source`：两者由服务端按笔记归属拼装
  （`path = note/{noteId}/images`，`source = FileSources.NOTE_IMAGE(0)`）。

## 响应体示例

```json
{
  "code": "00000",
  "msg": "操作成功",
  "data": {
    "originalFileName": "shot.png",
    "fileName": "3f2a...c1.png",
    "fileSize": 1.5,
    "uploadId": "b7c1e0d4f2a94e88a1c3",
    "chunkSize": 5,
    "totalChunk": 1,
    "hash": "9f86...0a08",
    "finishedChunks": []
  }
}
```

`uploadId` 即后续换签名、标记、合并的凭据；第 2–5 步仍打 file 服务（不带 `@InnerAuth`）。

## 302 约定（GET /api/file/objects/{fileId}/redirect）

```
HTTP/1.1 302 Found
Location: http://localhost:9000/anynote/anynote_Shanghai_one/note/42/images/x.png?X-Amz-...
Cache-Control: private, max-age=300
```

- 笔记正文的 `<img src>` 存 **`/api/proxy/file/objects/{fileId}/redirect`**，
  永不失效；每次请求由后端换成新鲜签名。
- BFF（`apps/web/src/app/api/proxy/[...path]/route.ts`）必须把这一跳透传给浏览器：
  `redirect` 由 `"error"` 改为 `"manual"` 并原样透传 `Location`。
  **不能让 Node follow**——follow 等于让服务端把对象再下载一遍，白费带宽并把 30x 变成 200。
- 归属校验：文件不存在或不属于当前用户 → `A0301`（不区分"不存在"与"无权限"，避免泄露存在性）。

## 其余实现要点

- **`NoteServiceImpl.createNoteImageUploadTask`** 复用 `@RequiresNotePermissions(EDIT)`，
  与 `editNote` 同一把锁；只校验登录不够，否则任何登录用户都能往别人笔记目录写对象。
- **`MinIOConfig` 加 `publicEndPoint` / `region`**：SigV4 把 Host 计入签名，
  预签名 URL 必须用浏览器可达的 host 签；`region` 显式设置后
  `getPresignedObjectUrl` 是纯本地计算，不再触发 `GetBucketLocation`。
- **服务端中转上传改走 `filePlugin()`**（原写死 `huaweiFilePlugin()`），
  否则 `OSS_TYPE=MIN_IO` 时 PDF 转存 / Whisper / 封面仍写华为 OBS。
- **`createHuaweiOBSTemporarySignature` 在 `OSS_TYPE != HUAWEI_OBS` 时抛业务错误**，
  不再静默落华为。

## 备注（权限与边界）

| 项 | 要求 |
|---|---|
| 创建上传任务 | 需要该笔记的 **编辑**权限（`NotePermissions.EDIT`） |
| 换分片签名 / 标记 / 合并 | 仅需登录；任务按 `userId + uploadId` 存 Redis，`objectName` 只从任务里读 |
| 按 fileId 重定向 | 仅需登录 + 文件归属当前用户 |
| 按 objectName 换签名 | 仅需登录 + 对象在 `file` 表存在且归属当前用户 |
| 分片任务 TTL | 24h（与"断点续传最长窗口"对齐），放弃的上传不再永久残留 |
| 合并后 | 删除 `{path}/{uploadId}/*_chunk_*` 临时分片 |

## 验证

- 单测：`NoteServiceImplCreateImageUploadTaskTest`（6 条）、`FileServiceImplTest`（15 条）、
  `MinIOFilePluginTest`（8 条）。
- 集成（真 MinIO）：`MinIOFilePluginIntegrationTest`（5 条，`@Tag("integration")`），
  覆盖预签名 PUT 真能上传、分片合并后内容一致且分片被清理、私有桶匿名读被拒。
- E2E：`apps/web/e2e/notes-image-upload.spec.ts`——真实栈上传一张 PNG，
  断言 `img[src^="/api/proxy/file/objects/"]` 且 `naturalWidth > 0`。
- 契约：`pnpm openapi:check` 无漂移（`openapi/specs/note.json` / `file.json` 已重生入库）。
