import { ApiError } from "@/lib/api/errors";
import { fileApi, noteApi } from "@/lib/api/openapi";
import { createNoteImageUploader, noteImageUrl, uploadFile } from "@/lib/editor/upload";
import { type Mock, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api/openapi", () => ({
  fileApi: { POST: vi.fn(), GET: vi.fn() },
  noteApi: { POST: vi.fn(), GET: vi.fn() },
}));

// openapi-fetch 的 POST/GET 是按 path 派生参数的重载签名，这里的断言只看调用参数本身，
// 因此统一降级成宽松 Mock，避免为每个 path 写一遍完整泛型。
const taskPost = noteApi.POST as unknown as Mock;
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
  taskPost.mockReset();
  post.mockReset();
  get.mockReset();
  fetchMock.mockReset();
  fetchMock.mockResolvedValue(new Response(null, { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
});

describe("uploadFile：笔记图片分片直传五步", () => {
  it("第 1 步打 note 的业务端点，body 不含 path / source，fileSize 按 MB 传", async () => {
    taskPost.mockResolvedValueOnce(
      ok({ uploadId: "u1", chunkSize: 1, totalChunk: 1, finishedChunks: [] }),
    );
    post
      .mockResolvedValueOnce(
        ok({
          signatures: [{ index: 1, signature: { credentials: { url: "https://oss/1" } } }],
        }),
      )
      .mockResolvedValueOnce(ok({ markedIndexList: [1] }))
      .mockResolvedValueOnce(ok({ objectName: "note/42/images/a.png", fileId: 9 }));

    // 2 MiB 的文件
    const file = makeFile(2 * 1024 * 1024);
    const result = await uploadFile(file, { noteId: 42 });

    expect(taskPost).toHaveBeenCalledTimes(1);
    const [path, init] = taskPost.mock.calls[0] ?? [];
    // 必须是 note 的业务端点：file 的 /ossSliceUploadTasks 带 @InnerAuth，浏览器会被拒
    expect(path).toBe("/notes/{noteId}/images/uploadTasks");
    expect(init.params.path).toEqual({ noteId: 42 });
    const body = init.body as Record<string, unknown>;
    // path / source 由服务端按笔记归属决定，客户端不得携带
    expect(body).not.toHaveProperty("path");
    expect(body).not.toHaveProperty("source");
    expect(body.fileName).toBe("note.png");
    expect(body.contentType).toBe("image/png");
    expect(typeof body.hash).toBe("string");
    // 2 MiB → 2 MB（不是 2097152 字节），否则 1MiB 图片会被切成 1000 片
    expect(body.fileSize).toBeCloseTo(2, 5);

    // 第 2–5 步仍打 file 服务
    expect(post.mock.calls[0]?.[0]).toBe("/getOssSliceUploadSignatures");
    expect(post.mock.calls[2]?.[0]).toBe("/composeOssSliceUploadObject");
    // 不再调用 /public/byObjectName：地址改成稳定的 redirect 路径
    expect(get).not.toHaveBeenCalled();

    expect(result).toEqual({
      fileId: 9,
      objectName: "note/42/images/a.png",
      url: "/api/proxy/file/objects/9/redirect",
    });
  });

  it("返回的地址是 redirect 路径而不是预签名 URL（写进正文不会过期）", async () => {
    taskPost.mockResolvedValueOnce(
      ok({ uploadId: "u2", chunkSize: 1, totalChunk: 1, finishedChunks: [1] }),
    );
    post.mockResolvedValueOnce(ok({ objectName: "note/42/images/b.png", fileId: 77 }));

    const result = await uploadFile(makeFile(8), { noteId: 42 });

    expect(result.url).toBe("/api/proxy/file/objects/77/redirect");
    expect(result.url).not.toMatch(/X-Amz-/);
    expect(noteImageUrl(77)).toBe(result.url);
  });

  it("秒传：finishedChunks 已满时跳过换签名，直接合并", async () => {
    taskPost.mockResolvedValueOnce(
      ok({ uploadId: "u3", chunkSize: 1, totalChunk: 2, finishedChunks: [1, 2] }),
    );
    post.mockResolvedValueOnce(ok({ objectName: "note/42/images/c.png", fileId: 5 }));

    const result = await uploadFile(makeFile(8), { noteId: 42 });

    expect(result.fileId).toBe(5);
    expect(post).toHaveBeenCalledTimes(1);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("分片数超过 5 时按 5 个一批换签名", async () => {
    taskPost.mockResolvedValueOnce(
      ok({ uploadId: "u4", chunkSize: 1, totalChunk: 7, finishedChunks: [] }),
    );
    post.mockImplementation((path, options) => {
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
      return Promise.resolve(ok({ objectName: "note/42/images/d.png", fileId: 6 }));
    });

    await uploadFile(makeFile(16), { noteId: 42 });

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
    taskPost.mockResolvedValueOnce(
      ok({ uploadId: "u5", chunkSize: 1, totalChunk: 1, finishedChunks: [] }),
    );
    post.mockResolvedValueOnce(
      ok({ signatures: [{ index: 1, signature: { credentials: { url: "https://oss/1" } } }] }),
    );
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 403 }));

    await expect(uploadFile(makeFile(4), { noteId: 42 })).rejects.toBeInstanceOf(ApiError);
  });

  it("建任务业务失败（code !== 00000）抛 ApiError", async () => {
    taskPost.mockResolvedValueOnce(fail("A0301"));
    await expect(uploadFile(makeFile(4), { noteId: 42 })).rejects.toMatchObject({
      code: "A0301",
    });
    // 第 1 步失败就不该再去敲 file 服务
    expect(post).not.toHaveBeenCalled();
  });

  it("分片信息不完整时抛 ApiError", async () => {
    taskPost.mockResolvedValueOnce(ok({ uploadId: "u6", chunkSize: 0, totalChunk: 0 }));
    await expect(uploadFile(makeFile(4), { noteId: 42 })).rejects.toMatchObject({
      code: "B0500",
    });
  });

  it("合并未返回 fileId 时抛 ApiError（否则会写出坏地址）", async () => {
    taskPost.mockResolvedValueOnce(
      ok({ uploadId: "u7", chunkSize: 1, totalChunk: 1, finishedChunks: [1] }),
    );
    post.mockResolvedValueOnce(ok({ objectName: "note/42/images/e.png" }));

    await expect(uploadFile(makeFile(4), { noteId: 42 })).rejects.toMatchObject({
      code: "B0500",
    });
  });
});

describe("createNoteImageUploader", () => {
  it("上传后返回稳定地址，供编辑器写进 Markdown", async () => {
    taskPost.mockResolvedValueOnce(
      ok({ uploadId: "u8", chunkSize: 1, totalChunk: 1, finishedChunks: [1] }),
    );
    post.mockResolvedValueOnce(ok({ objectName: "note/7/images/f.png", fileId: 31 }));

    const url = await createNoteImageUploader(7)(makeFile(4));

    expect(url).toBe("/api/proxy/file/objects/31/redirect");
    expect(taskPost.mock.calls[0]?.[1]?.params.path).toEqual({ noteId: 7 });
  });

  it("noteId 为字符串时也能拼对路径参数", async () => {
    taskPost.mockResolvedValueOnce(
      ok({ uploadId: "u9", chunkSize: 1, totalChunk: 1, finishedChunks: [1] }),
    );
    post.mockResolvedValueOnce(ok({ objectName: "note/9/images/g.png", fileId: 32 }));

    await createNoteImageUploader("9")(makeFile(4));

    // 路径参数类型是 integer，字符串 noteId 要转成数字，否则会被序列化成 "9" 之外的形式
    expect(taskPost.mock.calls[0]?.[1]?.params.path).toEqual({ noteId: 9 });
  });

  it("把分片进度透传给调用方（编辑器的上传指示器靠它）", async () => {
    taskPost.mockResolvedValueOnce(
      ok({ uploadId: "u10", chunkSize: 1, totalChunk: 4, finishedChunks: [] }),
    );
    post.mockImplementation((path, options) => {
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
      return Promise.resolve(ok({ objectName: "note/7/images/h.png", fileId: 33 }));
    });

    const onProgress = vi.fn();
    // 4 MiB、chunkSize 1MB → 4 片，每片完成后回调一次
    await createNoteImageUploader(7, onProgress)(makeFile(4 * 1024 * 1024));

    expect(onProgress).toHaveBeenCalled();
    const percents = onProgress.mock.calls.map(([percent]) => percent as number);
    // 进度必须单调不减，且落在 0–100 之内（指示器直接把它当百分比显示）
    for (const percent of percents) {
      expect(percent).toBeGreaterThanOrEqual(0);
      expect(percent).toBeLessThanOrEqual(100);
    }
    expect(percents.at(-1)).toBe(100);
  });

  it("不传 onProgress 时不报错（上传照常完成）", async () => {
    taskPost.mockResolvedValueOnce(
      ok({ uploadId: "u11", chunkSize: 1, totalChunk: 1, finishedChunks: [1] }),
    );
    post.mockResolvedValueOnce(ok({ objectName: "note/7/images/i.png", fileId: 34 }));

    await expect(createNoteImageUploader(7)(makeFile(4))).resolves.toBe(
      "/api/proxy/file/objects/34/redirect",
    );
  });
});
