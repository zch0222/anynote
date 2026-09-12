import { ApiError } from "@/lib/api/errors";
import { fileApi, noteApi } from "@/lib/api/openapi";

/**
 * 浏览器分片直传（五步），笔记图片场景：
 *   1. POST /api/proxy/note/notes/{noteId}/images/uploadTasks  建任务（path / source 由服务端决定）
 *   2. POST /api/proxy/file/getOssSliceUploadSignatures        按 chunkIndexList 换分片签名
 *   3. 浏览器按签名直接 PUT 分片到对象存储（MinIO），不过 BFF / Gateway
 *   4. POST /api/proxy/file/markOssSliceUploadSignatures       标记已完成分片（支持断点续传）
 *   5. POST /api/proxy/file/composeOssSliceUploadObject        合并 → { fileId, objectName }
 *
 * 第 1 步**必须**打 note 的业务端点：file 的 /ossSliceUploadTasks 带 @InnerAuth，
 * 浏览器直连会被正确拒绝（docs/minio/MINIO_PLAN.md §2.2）。path 与 source 也由服务端按
 * 笔记归属拼装，请求体不允许携带——否则客户端能自选前缀越权写入他人 note/{id}/images。
 *
 * 返回的地址是稳定的 redirect 路径（`/api/proxy/file/objects/{fileId}/redirect`），
 * 而不是预签名 URL：预签名 URL 会过期，写进正文就意味着过几天集体裂图（§2.6）。
 */

/** `FileSources.NOTE_IMAGE`，见后端 `com.anynote.file.api.enums.FileSources`。 */
export const FILE_SOURCE_NOTE_IMAGE = 0;

const SUCCESS_CODE = "00000";
/** 单批向服务端索要的签名数量（与 legacy 上传实现保持一致）。 */
const SIGNATURE_BATCH_SIZE = 5;
const BYTES_PER_MB = 1024 * 1024;

export type UploadResult = {
  /** 合并后的文件 id，用于拼稳定地址。 */
  fileId: number;
  objectName: string;
  /**
   * 稳定访问地址（BFF 的 redirect 路径），可直接写进 Markdown 的 `img src`——
   * 它每次请求都由后端换成新鲜的预签名 URL，**不会过期**。
   */
  url: string;
};

export type UploadOptions = {
  /** 目标笔记 id；图片只能挂到某篇笔记下（服务端据此定 path 与权限）。 */
  noteId: string | number;
  onProgress?: (percent: number) => void;
  signal?: AbortSignal;
};

type Envelope<T> = { code?: string; msg?: string; data?: T };

function unwrap<T>(status: number, body: Envelope<T> | undefined): T {
  if (!body || body.code !== SUCCESS_CODE) {
    throw new ApiError(status, body?.code ?? "B0500", body?.msg ?? "文件上传失败");
  }
  if (body.data === undefined) {
    throw new ApiError(status, "B0500", "文件上传响应缺少数据");
  }
  return body.data;
}

/** 计算文件 SHA-256（小写十六进制），作为后端秒传 / 断点续传的去重键。 */
export async function sha256Hex(file: File): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

type SignatureCredentials = {
  url?: string;
  method?: string;
  headers?: Record<string, string>;
};

/** 只在提供了 signal 时才写入该字段：`exactOptionalPropertyTypes` 下不允许显式 undefined。 */
function withSignal(signal?: AbortSignal): { signal?: AbortSignal } {
  return signal ? { signal } : {};
}

/** 笔记图片的稳定访问地址。正文存它，而不是会过期的预签名 URL。 */
export function noteImageUrl(fileId: string | number): string {
  return `/api/proxy/file/objects/${fileId}/redirect`;
}

/** 直接 PUT 单个分片到对象存储（MinIO）；签名由 file 服务下发，不经过 BFF。 */
async function putChunk(
  credentials: SignatureCredentials,
  chunk: Blob,
  signal?: AbortSignal,
): Promise<void> {
  if (!credentials.url) {
    throw new ApiError(500, "B0500", "分片签名缺少上传地址");
  }
  const init: RequestInit = {
    method: credentials.method ?? "PUT",
    body: chunk,
  };
  if (credentials.headers) {
    init.headers = credentials.headers;
  }
  if (signal) {
    init.signal = signal;
  }
  const response = await fetch(credentials.url, init);
  if (!response.ok) {
    throw new ApiError(response.status, "B0500", `分片上传失败（HTTP ${response.status}）`);
  }
}

/**
 * 上传单个文件到指定笔记，返回 `fileId` / `objectName` 与稳定地址。
 * 分片大小由后端 `chunkSize`（单位 MB）决定，前端不自定上限。
 */
export async function uploadFile(file: File, options: UploadOptions): Promise<UploadResult> {
  const { noteId, onProgress, signal } = options;
  const hash = await sha256Hex(file);

  const created = await noteApi.POST("/notes/{noteId}/images/uploadTasks", {
    params: { path: { noteId: Number(noteId) } },
    body: {
      fileName: file.name,
      // 后端按 **MB** 理解 fileSize（chunkSize = max(5, ceil(fileSize/1000))，见 MinIOFilePlugin）。
      // 传字节会让 1MiB 的图片被算成 1000 个分片，上传必败。
      fileSize: file.size / BYTES_PER_MB,
      hash,
      contentType: file.type || "application/octet-stream",
    },
    ...withSignal(signal),
  });
  const task = unwrap(
    created.response.status,
    created.data as Envelope<{
      uploadId?: string;
      chunkSize?: number;
      totalChunk?: number;
      finishedChunks?: number[];
    }>,
  );

  const uploadId = task.uploadId;
  const totalChunk = task.totalChunk ?? 0;
  const chunkSizeMb = task.chunkSize ?? 0;
  if (!uploadId || totalChunk <= 0 || chunkSizeMb <= 0) {
    throw new ApiError(502, "B0500", "上传任务创建失败：返回的分片信息不完整");
  }

  // 后端 chunkSize 单位是 MB；分片索引从 1 开始（与 legacy 实现一致）。
  const chunkBytes = chunkSizeMb * BYTES_PER_MB;
  const finished = new Set<number>(task.finishedChunks ?? []);

  const report = () => onProgress?.(Math.round((finished.size / totalChunk) * 100));

  if (finished.size >= totalChunk) {
    report(); // 秒传：所有分片都已存在
  } else {
    const pending = () => {
      const list: number[] = [];
      for (let index = 1; index <= totalChunk; index += 1) {
        if (!finished.has(index)) {
          list.push(index);
        }
      }
      return list;
    };

    while (pending().length > 0) {
      const batch = pending().slice(0, SIGNATURE_BATCH_SIZE);
      const signatureResponse = await fileApi.POST("/getOssSliceUploadSignatures", {
        body: { uploadId, chunkIndexList: batch },
        ...withSignal(signal),
      });
      const signatureVo = unwrap(
        signatureResponse.response.status,
        signatureResponse.data as Envelope<{
          signatures?: Array<{
            index?: number;
            signature?: { credentials?: SignatureCredentials };
          }>;
        }>,
      );

      const uploaded: number[] = [];
      for (const item of signatureVo.signatures ?? []) {
        const index = item.index;
        if (!index || finished.has(index)) {
          continue;
        }
        const start = (index - 1) * chunkBytes;
        const chunk = file.slice(start, Math.min(start + chunkBytes, file.size));
        await putChunk(item.signature?.credentials ?? {}, chunk, signal);
        uploaded.push(index);
      }

      if (uploaded.length === 0) {
        throw new ApiError(502, "B0500", "分片签名未返回可上传的分片");
      }

      const markResponse = await fileApi.POST("/markOssSliceUploadSignatures", {
        body: { uploadId, chunkIndexList: uploaded },
        ...withSignal(signal),
      });
      const marked = unwrap(
        markResponse.response.status,
        markResponse.data as Envelope<{ markedIndexList?: number[] }>,
      );
      for (const index of marked.markedIndexList ?? uploaded) {
        finished.add(index);
      }
      report();
    }
  }

  const composed = await fileApi.POST("/composeOssSliceUploadObject", {
    body: { uploadId },
    ...withSignal(signal),
  });
  const composedVo = unwrap(
    composed.response.status,
    composed.data as Envelope<{ objectName?: string; fileId?: number }>,
  );
  const objectName = composedVo.objectName;
  const fileId = composedVo.fileId;
  if (!objectName || !fileId) {
    throw new ApiError(502, "B0500", "合并分片失败：未返回 objectName / fileId");
  }

  return { fileId, objectName, url: noteImageUrl(fileId) };
}

/** 编辑器图片上传入口：`AnynoteImage` 的 `uploadFn` 默认实现（返回可长期写入正文的地址）。 */
export function createNoteImageUploader(noteId: string | number) {
  return (file: File) => uploadFile(file, { noteId }).then((result) => result.url);
}
