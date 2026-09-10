import { ApiError } from "@/lib/api/errors";
import { fileApi } from "@/lib/api/openapi";
import { uploadFile } from "@/lib/editor/upload";
import { type Mock, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api/openapi", () => ({
  fileApi: { POST: vi.fn(), GET: vi.fn() },
}));

// openapi-fetch 的 POST/GET 是按 path 派生参数的重载签名，这里的断言只看调用参数本身，
// 因此统一降级成宽松 Mock，避免为每个 path 写一遍完整泛型。
const post = fileApi.POST as unknown as Mock;
const get = fileApi.GET as unknown as Mock;
const fetchMock = vi.fn();

function ok(data: unknown) {
  return {
    data: { code: "00000", msg: "ok", data },
    response: new Response(null, { status: 200 }),
  };
}

function fail(code: string, status = 200) {
  return {
    data: { code, msg: "boom", data: undefined },
    response: new Response(null, { status }),
  };
}

function makeFile(bytes: number, name = "note.png", type = "image/png") {
  return new File([new Uint8Array(bytes)], name, { type });
}

beforeEach(() => {
  post.mockReset();
  get.mockReset();
  fetchMock.mockReset();
  fetchMock.mockResolvedValue(new Response(null, { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
});

describe("uploadFile：分片直传五步", () => {
  it("单批分片：建任务 → 换签名 → PUT → 标记 → 合并 → 取 URL", async () => {
    const progress: number[] = [];
    post
      .mockResolvedValueOnce(
        ok({ uploadId: "u1", chunkSize: 1, totalChunk: 2, finishedChunks: [] }),
      )
      .mockResolvedValueOnce(
        ok({
          signatures: [
            { index: 1, signature: { credentials: { url: "https://oss/1" } } },
            { index: 2, signature: { credentials: { url: "https://oss/2" } } },
          ],
        }),
      )
      .mockResolvedValueOnce(ok({ markedIndexList: [1, 2] }))
      .mockResolvedValueOnce(ok({ objectName: "note/a.png", fileId: 9 }));
    get.mockResolvedValueOnce(ok({ url: "https://cdn/a.png", expireTime: "2030-01-01" }));

    const result = await uploadFile(makeFile(64), {
      path: "note/1",
      onProgress: (value) => progress.push(value),
    });

    expect(result).toEqual({ objectName: "note/a.png", url: "https://cdn/a.png" });
    // 第 1 次 POST 是建任务，参数含 hash / source
    const taskBody = post.mock.calls[0]?.[1]?.body as Record<string, unknown>;
    expect(taskBody).toMatchObject({ path: "note/1", fileName: "note.png", source: 0 });
    expect(typeof taskBody.hash).toBe("string");
    // 两次分片 PUT，URL 来自签名
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0]?.[0]).toBe("https://oss/1");
    // 合并与取 URL 的调用顺序
    expect(post.mock.calls[3]?.[0]).toBe("/composeOssSliceUploadObject");
    expect(get.mock.calls[0]?.[0]).toBe("/public/byObjectName");
    expect(progress.at(-1)).toBe(100);
  });

  it("秒传：finishedChunks 已满时跳过换签名，直接合并", async () => {
    post
      .mockResolvedValueOnce(
        ok({ uploadId: "u2", chunkSize: 1, totalChunk: 2, finishedChunks: [1, 2] }),
      )
      .mockResolvedValueOnce(ok({ objectName: "note/b.png" }));
    get.mockResolvedValueOnce(ok({ url: "https://cdn/b.png" }));

    const result = await uploadFile(makeFile(8), { path: "note" });

    expect(result.objectName).toBe("note/b.png");
    expect(post).toHaveBeenCalledTimes(2);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("分片数超过 5 时按 5 个一批换签名", async () => {
    post
      .mockResolvedValueOnce(
        ok({ uploadId: "u3", chunkSize: 1, totalChunk: 7, finishedChunks: [] }),
      )
      .mockImplementation((path, options) => {
        if (path === "/getOssSliceUploadSignatures") {
          const body = (options as { body: { chunkIndexList: number[] } }).body;
          return Promise.resolve(
            ok({
              signatures: body.chunkIndexList.map((index) => ({
                index,
                signature: { credentials: { url: `https://oss/${index}` } },
              })),
            }),
          );
        }
        if (path === "/markOssSliceUploadSignatures") {
          const body = (options as { body: { chunkIndexList: number[] } }).body;
          return Promise.resolve(ok({ markedIndexList: body.chunkIndexList }));
        }
        return Promise.resolve(ok({ objectName: "note/c.png" }));
      });
    get.mockResolvedValueOnce(ok({ url: "https://cdn/c.png" }));

    await uploadFile(makeFile(16), { path: "note" });

    const signatureCalls = post.mock.calls.filter(
      ([path]) => path === "/getOssSliceUploadSignatures",
    );
    expect(signatureCalls).toHaveLength(2);
    expect((signatureCalls[0]?.[1]?.body as { chunkIndexList: number[] }).chunkIndexList).toEqual([
      1, 2, 3, 4, 5,
    ]);
    expect((signatureCalls[1]?.[1]?.body as { chunkIndexList: number[] }).chunkIndexList).toEqual([
      6, 7,
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(7);
  });

  it("分片 PUT 非 2xx 抛 ApiError", async () => {
    post
      .mockResolvedValueOnce(
        ok({ uploadId: "u4", chunkSize: 1, totalChunk: 1, finishedChunks: [] }),
      )
      .mockResolvedValueOnce(
        ok({ signatures: [{ index: 1, signature: { credentials: { url: "https://oss/1" } } }] }),
      );
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 403 }));

    await expect(uploadFile(makeFile(4), { path: "note" })).rejects.toBeInstanceOf(ApiError);
  });

  it("建任务业务失败（code !== 00000）抛 ApiError", async () => {
    post.mockResolvedValueOnce(fail("B0400"));
    await expect(uploadFile(makeFile(4), { path: "note" })).rejects.toMatchObject({
      code: "B0400",
    });
  });

  it("分片信息不完整时抛 ApiError", async () => {
    post.mockResolvedValueOnce(ok({ uploadId: "u5", chunkSize: 0, totalChunk: 0 }));
    await expect(uploadFile(makeFile(4), { path: "note" })).rejects.toMatchObject({
      code: "B0500",
    });
  });
});
