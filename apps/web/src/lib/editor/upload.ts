import { ApiError } from "@/lib/api/errors";
import { fileApi } from "@/lib/api/openapi";

/**
 * 浏览器分片直传 file 服务（五步）：
 *   1. POST /ossSliceUploadTasks          建任务（hash 命中即秒传，finishedChunks 支持断点续传）
 *   2. POST /getOssSliceUploadSignatures  按 chunkIndexList 换分片签名
 *   3. 浏览器按签名直接 PUT 分片到 OSS（MinIO / HuaweiOBS）
 *   4. POST /markOssSliceUploadSignatures 标记已完成分片
 *   5. POST /composeOssSliceUploadObject  合并 → objectName；再 GET /public/byObjectName 换时效 URL
 *
 * 注意：不存在 `/files/presign`。见 docs/refactor/FRONTEND_REFACTOR_PLAN.md 6.5。
 */

/** `FileSources.NOTE_IMAGE`，见后端 `com.anynote.file.api.enums.FileSources`。 */
export const FILE_SOURCE_NOTE_IMAGE = 0;

const SUCCESS_CODE = "00000";
/** 单批向服务端索要的签名数量（与 legacy 上传实现保持一致）。 */
const SIGNATURE_BATCH_SIZE = 5;

export type UploadResult = {
  objectName: string;
  /** 时效 URL，带 expireTime，**不能**当永久地址写进 Markdown。 */
  url: string;
};

export type UploadOptions = {
  /** 业务侧路径前缀，笔记图片用 `note/{noteId}` 或 `note`。 */
  path: string;
  source?: number;
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

/** 直接 PUT 单个分片到对象存储；签名由 file 服务下发，不经过 BFF。 */
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
 * 上传单个文件，返回 `objectName` 与时效 URL。
 * 分片大小由后端 `chunkSize`（单位 MB）决定，前端不自定上限。
 */
export async function uploadFile(file: File, options: UploadOptions): Promise<UploadResult> {
  const { path, source = FILE_SOURCE_NOTE_IMAGE, onProgress, signal } = options;
  const hash = await sha256Hex(file);

  const created = await fileApi.POST("/ossSliceUploadTasks", {
    body: {
      path,
      fileName: file.name,
      fileSize: file.size,
      hash,
      contentType: file.type || "application/octet-stream",
      source,
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
  const chunkBytes = chunkSizeMb * 1024 * 1024;
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
    composed.data as Envelope<{ objectName?: string }>,
  );
  const objectName = composedVo.objectName;
  if (!objectName) {
    throw new ApiError(502, "B0500", "合并分片失败：未返回 objectName");
  }

  const urlResponse = await fileApi.GET("/public/byObjectName", {
    params: { query: { objectName } },
    ...withSignal(signal),
  });
  const objectUrl = unwrap(
    urlResponse.response.status,
    urlResponse.data as Envelope<{ url?: string }>,
  );
  if (!objectUrl.url) {
    throw new ApiError(502, "B0500", "获取文件访问地址失败");
  }

  return { objectName, url: objectUrl.url };
}

/** 编辑器图片上传入口：`AnynoteImage` 的 `uploadFn` 默认实现（返回时效 URL 字符串）。 */
export function createNoteImageUploader(noteId?: string | number) {
  return (file: File) =>
    uploadFile(file, { path: noteId ? `note/${noteId}` : "note" }).then((result) => result.url);
}
