import { noteQueryKeys } from "@/features/notes/query-keys";
import type { NoteDetail } from "@/features/notes/schemas";
import { ApiError } from "@/lib/api/errors";
import { noteApi } from "@/lib/api/openapi";
import { renderHookWithProviders } from "@/test/render";
import { QueryClient } from "@tanstack/react-query";
import { act, waitFor } from "@testing-library/react";
import type { Mock } from "vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AUTOSAVE_DEBOUNCE_MS, RETRY_DELAY_MS, useSaveNote } from "../use-save-note";

vi.mock("@/lib/api/openapi", () => ({
  noteApi: { PATCH: vi.fn(), GET: vi.fn(), POST: vi.fn(), DELETE: vi.fn() },
}));

// openapi-fetch 的方法签名按 path 派生，测试只关心调用参数，统一降级成宽松 Mock。
const patch = noteApi.PATCH as unknown as Mock;
const get = noteApi.GET as unknown as Mock;

const NOTE_ID = 42;
const DETAIL_KEY = noteQueryKeys.detail(NOTE_ID);
const SERVER_VERSION = String(Date.parse("2026-09-11T03:00:00.000Z"));

const initialDetail: NoteDetail = {
  id: NOTE_ID,
  title: "旧标题",
  content: "旧内容",
  updateTime: "2026-09-11T01:00:00.000Z",
};

function envelopeResponse(data: unknown, code = "00000", status = 200) {
  return new Response(JSON.stringify({ code, msg: "操作成功", data }), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function okEnvelope(data: unknown) {
  return { response: envelopeResponse(data) };
}

// useSaveNote 只做命令式缓存读写；默认测试客户端 gcTime: 0 会回收无观察者的条目，
// 需要断言缓存内容的用例换成 gcTime 正常的实例。
function createPersistentQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
}

function saveResult(overrides: Record<string, unknown> = {}) {
  return {
    id: NOTE_ID,
    title: "服务端标题",
    content: "服务端内容",
    updateTime: "2026-09-11T02:00:00.000Z",
    version: "2000",
    ...overrides,
  };
}

beforeEach(() => {
  patch.mockReset();
  get.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("useSaveNote：debounce 与保存", () => {
  it(`debounce ${AUTOSAVE_DEBOUNCE_MS}ms 内的连续输入合并成一次保存，带上当前版本号`, async () => {
    patch.mockResolvedValue(okEnvelope(saveResult()));
    const { result } = renderHookWithProviders(() =>
      useSaveNote({ noteId: NOTE_ID, initialVersion: "1000", debounceMs: 20 }),
    );

    act(() => result.current.scheduleSave({ title: "第一次", content: "c1" }));
    act(() => result.current.scheduleSave({ title: "第二次", content: "c2" }));
    expect(result.current.status).toBe("pending");

    await waitFor(() =>
      expect(patch).toHaveBeenCalledExactlyOnceWith("/notes/{noteId}", expect.anything()),
    );
    expect(patch.mock.calls[0]?.[1]).toMatchObject({
      params: { path: { noteId: NOTE_ID } },
      body: { title: "第二次", content: "c2", version: "1000" },
    });
    await waitFor(() => expect(result.current.status).toBe("saved"));
    expect(result.current.lastSavedAt).toBeInstanceOf(Date);
  });

  it("保存成功后把服务端权威内容写回详情缓存，下次保存携带新版本号", async () => {
    patch.mockResolvedValue(okEnvelope(saveResult()));
    const { result, queryClient } = renderHookWithProviders(
      () => useSaveNote({ noteId: NOTE_ID, initialVersion: "1000", debounceMs: 20 }),
      { queryClient: createPersistentQueryClient() },
    );
    queryClient.setQueryData<NoteDetail>(DETAIL_KEY, initialDetail);

    act(() => result.current.scheduleSave({ title: "本地标题", content: "本地内容" }));
    await waitFor(() => expect(result.current.status).toBe("saved"));

    expect(queryClient.getQueryData<NoteDetail>(DETAIL_KEY)).toMatchObject({
      title: "服务端标题",
      content: "服务端内容",
      updateTime: "2026-09-11T02:00:00.000Z",
    });

    act(() => result.current.scheduleSave({ title: "第三次", content: "c3" }));
    await waitFor(() => expect(patch).toHaveBeenCalledTimes(2));
    expect(patch.mock.calls[1]?.[1].body.version).toBe("2000");
  });

  it("保存结果缺省 version 时由 updateTime 派生版本号", async () => {
    patch.mockResolvedValue(
      okEnvelope(saveResult({ version: undefined, updateTime: "2026-09-11T06:00:00.000Z" })),
    );
    const { result } = renderHookWithProviders(() =>
      useSaveNote({ noteId: NOTE_ID, initialVersion: "1000", debounceMs: 20 }),
    );

    act(() => result.current.scheduleSave({ title: "t", content: "c" }));
    await waitFor(() => expect(result.current.status).toBe("saved"));

    act(() => result.current.scheduleSave({ title: "t2", content: "c2" }));
    await waitFor(() => expect(patch).toHaveBeenCalledTimes(2));
    expect(patch.mock.calls[1]?.[1].body.version).toBe(
      String(Date.parse("2026-09-11T06:00:00.000Z")),
    );
  });

  it("flush() 跳过 debounce 立即落盘", async () => {
    patch.mockResolvedValue(okEnvelope(saveResult()));
    const { result } = renderHookWithProviders(() =>
      useSaveNote({ noteId: NOTE_ID, initialVersion: "1000", debounceMs: 20 }),
    );

    act(() => result.current.scheduleSave({ title: "待保存", content: "内容" }));
    await act(async () => {
      await result.current.flush();
    });

    expect(patch).toHaveBeenCalledTimes(1);
    expect(result.current.status).toBe("saved");
  });
});

describe("useSaveNote：乐观更新与失败", () => {
  it("保存失败时回滚详情缓存到请求前快照，保留待存内容并进入 error", async () => {
    patch.mockRejectedValue(new ApiError(200, "B0001", "业务失败"));
    const { result, queryClient } = renderHookWithProviders(
      () => useSaveNote({ noteId: NOTE_ID, initialVersion: "1000", debounceMs: 20 }),
      { queryClient: createPersistentQueryClient() },
    );
    queryClient.setQueryData<NoteDetail>(DETAIL_KEY, initialDetail);

    act(() => result.current.scheduleSave({ title: "未落盘的标题", content: "未落盘" }));
    await waitFor(() => expect(result.current.status).toBe("error"));

    // 缓存回到快照，而不是停留在没落盘的乐观内容上
    expect(queryClient.getQueryData<NoteDetail>(DETAIL_KEY)).toMatchObject({ title: "旧标题" });

    // 再次编辑触发新的保存并成功
    patch.mockResolvedValueOnce(okEnvelope(saveResult()));
    act(() => result.current.scheduleSave({ title: "重试内容", content: "重试" }));
    await waitFor(() => expect(patch).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(result.current.status).toBe("saved"));
  });

  it(`失败后按 ${RETRY_DELAY_MS}ms 自动重试一次并恢复`, async () => {
    vi.useFakeTimers();
    patch.mockRejectedValueOnce(new ApiError(200, "B0001", "业务失败"));
    patch.mockResolvedValueOnce(okEnvelope(saveResult()));
    const { result } = renderHookWithProviders(() =>
      useSaveNote({ noteId: NOTE_ID, initialVersion: "1000", debounceMs: 1500 }),
    );

    act(() => result.current.scheduleSave({ title: "t", content: "c" }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500);
    });
    expect(patch).toHaveBeenCalledTimes(1);
    expect(result.current.status).toBe("error");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(RETRY_DELAY_MS);
    });
    expect(patch).toHaveBeenCalledTimes(2);
    expect(result.current.status).toBe("saved");
  });
});

describe("useSaveNote：版本冲突", () => {
  function renderConflicted() {
    patch.mockRejectedValueOnce(new ApiError(200, "A0409", "笔记已被其他会话更新，请刷新后重试"));
    get.mockResolvedValue(
      okEnvelope({
        id: NOTE_ID,
        title: "服务端标题",
        content: "服务端内容",
        updateTime: "2026-09-11T03:00:00.000Z",
      }),
    );
    const rendered = renderHookWithProviders(
      () => useSaveNote({ noteId: NOTE_ID, initialVersion: "1000", debounceMs: 20 }),
      { queryClient: createPersistentQueryClient() },
    );
    rendered.queryClient.setQueryData<NoteDetail>(DETAIL_KEY, initialDetail);
    act(() => rendered.result.current.scheduleSave({ title: "本地标题", content: "本地内容" }));
    return rendered;
  }

  async function waitConflict(rendered: Awaited<ReturnType<typeof renderConflicted>>) {
    await waitFor(() => expect(rendered.result.current.status).toBe("conflict"));
    expect(patch).toHaveBeenCalledTimes(1);
    expect(rendered.result.current.conflict).toMatchObject({
      local: { title: "本地标题", content: "本地内容" },
      server: {
        title: "服务端标题",
        content: "服务端内容",
        version: SERVER_VERSION,
        updateTime: "2026-09-11T03:00:00.000Z",
      },
    });
  }

  it("A0409 触发冲突态：回读服务端内容交给弹窗，不自动重试", async () => {
    await waitConflict(renderConflicted());
  });

  it("冲突未解决时继续编辑只挂起改动，不再发请求", async () => {
    const rendered = renderConflicted();
    await waitConflict(rendered);

    act(() => rendered.result.current.scheduleSave({ title: "又改了", content: "又改了" }));
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
    expect(patch).toHaveBeenCalledTimes(1);
    expect(rendered.result.current.status).toBe("conflict");
  });

  it("keepLocal：用服务端最新版本号覆盖式重发本地内容", async () => {
    const rendered = renderConflicted();
    await waitConflict(rendered);
    patch.mockResolvedValueOnce(
      okEnvelope(saveResult({ version: "4000", updateTime: "2026-09-11T04:00:00.000Z" })),
    );

    await act(async () => {
      await rendered.result.current.resolveConflict("keepLocal");
    });

    expect(patch).toHaveBeenCalledTimes(2);
    expect(patch.mock.calls[1]?.[1].body).toMatchObject({
      title: "本地标题",
      content: "本地内容",
      version: SERVER_VERSION,
    });
    expect(rendered.result.current.conflict).toBeNull();
    expect(rendered.result.current.status).toBe("saved");
  });

  it("useServer：放弃本地改动，缓存切到服务端内容且不再发请求", async () => {
    const rendered = renderConflicted();
    await waitConflict(rendered);

    await act(async () => {
      await rendered.result.current.resolveConflict("useServer");
    });

    expect(patch).toHaveBeenCalledTimes(1);
    expect(rendered.result.current.conflict).toBeNull();
    expect(rendered.result.current.status).toBe("saved");
    expect(rendered.queryClient.getQueryData<NoteDetail>(DETAIL_KEY)).toMatchObject({
      title: "服务端标题",
      content: "服务端内容",
      updateTime: "2026-09-11T03:00:00.000Z",
    });
  });
});

describe("useSaveNote：离线与卸载", () => {
  it("离线时不发请求，改动暂存；恢复在线后自动补发", async () => {
    const { result } = renderHookWithProviders(() =>
      useSaveNote({ noteId: NOTE_ID, initialVersion: "1000", debounceMs: 20 }),
    );
    Object.defineProperty(window.navigator, "onLine", { value: false, configurable: true });
    try {
      act(() => result.current.scheduleSave({ title: "离线改动", content: "c" }));
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
      });
      expect(patch).not.toHaveBeenCalled();
      expect(result.current.status).toBe("offline");

      Object.defineProperty(window.navigator, "onLine", { value: true, configurable: true });
      patch.mockResolvedValue(okEnvelope(saveResult()));
      act(() => {
        window.dispatchEvent(new Event("online"));
      });
      await waitFor(() => expect(patch).toHaveBeenCalledTimes(1));
      expect(patch.mock.calls[0]?.[1].body).toMatchObject({ title: "离线改动" });
      await waitFor(() => expect(result.current.status).toBe("saved"));
    } finally {
      Object.defineProperty(window.navigator, "onLine", { value: true, configurable: true });
    }
  });

  it("组件卸载时未落盘的改动通过 keepalive 请求送出", async () => {
    patch.mockResolvedValue(okEnvelope(saveResult()));
    const { result, unmount } = renderHookWithProviders(() =>
      useSaveNote({ noteId: NOTE_ID, initialVersion: "1000", debounceMs: 20 }),
    );

    act(() => result.current.scheduleSave({ title: "离开前", content: "未保存" }));
    unmount();

    expect(patch).toHaveBeenCalledTimes(1);
    expect(patch.mock.calls[0]?.[1]).toMatchObject({
      keepalive: true,
      body: { title: "离开前", content: "未保存", version: "1000" },
    });
  });

  it("已无待存内容时卸载不发请求", () => {
    const { unmount } = renderHookWithProviders(() =>
      useSaveNote({ noteId: NOTE_ID, initialVersion: "1000", debounceMs: 20 }),
    );
    unmount();
    expect(patch).not.toHaveBeenCalled();
  });
});

describe("useSaveNote：版本号推进（回归 —— 正常编辑不该弹冲突）", () => {
  function renderSeeded(initialVersion: string | null = "1000") {
    const queryClient = createPersistentQueryClient();
    // 基线内容取自详情缓存，必须在挂载前放进去（真实页面里也是先有 note.data 才有 initialVersion）
    queryClient.setQueryData<NoteDetail>(DETAIL_KEY, initialDetail);
    return renderHookWithProviders(
      (props: { initialVersion: string | null }) =>
        useSaveNote({ noteId: NOTE_ID, initialVersion: props.initialVersion, debounceMs: 20 }),
      { queryClient, initialProps: { initialVersion } },
    );
  }

  it("保存响应给出的版本号不会被详情缓存回算出的旧值顶回去", async () => {
    patch.mockResolvedValue(okEnvelope(saveResult()));
    const { result, rerender } = renderSeeded();

    act(() => result.current.scheduleSave({ title: "第一次", content: "c1" }));
    await waitFor(() => expect(result.current.status).toBe("saved"));
    expect(patch.mock.calls[0]?.[1].body.version).toBe("1000");

    // 页面把 initialVersion 算作 toVersion(note.data.updateTime)。后台重取或
    // 卸载时的 keepalive 落盘都会让这个值落后于服务端真实版本；
    // 跟着它走就是把过期令牌固化下来，下一次保存必然 A0409。
    rerender({ initialVersion: "1500" });
    act(() => result.current.scheduleSave({ title: "第二次", content: "c2" }));

    await waitFor(() => expect(patch).toHaveBeenCalledTimes(2));
    expect(patch.mock.calls[1]?.[1].body.version).toBe("2000");
  });

  it("首次拿到服务端时间戳时才 seed 版本号，之后的 prop 变化一律忽略", async () => {
    patch.mockResolvedValue(okEnvelope(saveResult()));
    const { result, rerender } = renderSeeded(null);

    rerender({ initialVersion: "1000" });
    rerender({ initialVersion: "9999" });
    act(() => result.current.scheduleSave({ title: "t", content: "c" }));

    await waitFor(() => expect(patch).toHaveBeenCalledTimes(1));
    expect(patch.mock.calls[0]?.[1].body.version).toBe("1000");
  });

  it("请求进行中产生的新改动，会在本次保存完成后自动补发", async () => {
    let release: (() => void) | null = null;
    patch.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = () => resolve(okEnvelope(saveResult()));
        }),
    );
    patch.mockResolvedValue(okEnvelope(saveResult({ version: "3000" })));
    const { result } = renderSeeded();

    act(() => result.current.scheduleSave({ title: "第一次", content: "c1" }));
    await waitFor(() => expect(result.current.status).toBe("saving"));

    // 请求还在飞的时候继续输入：这一批改动不能等到用户下次敲键盘才发
    act(() => result.current.scheduleSave({ title: "飞行中改动", content: "c2" }));
    act(() => release?.());

    await waitFor(() => expect(patch).toHaveBeenCalledTimes(2));
    expect(patch.mock.calls[1]?.[1].body).toMatchObject({ title: "飞行中改动", content: "c2" });
    await waitFor(() => expect(result.current.status).toBe("saved"));
  });

  it("版本令牌漂移（服务端内容没变）时静默换号重发，不打扰用户", async () => {
    patch.mockRejectedValueOnce(new ApiError(200, "A0409", "笔记已被其他会话更新，请刷新后重试"));
    patch.mockResolvedValueOnce(okEnvelope(saveResult({ version: "5000" })));
    // 回读到的服务端内容与基线（initialDetail）完全一致 ⇒ 没人动过这篇笔记
    get.mockResolvedValue(
      okEnvelope({
        id: NOTE_ID,
        title: initialDetail.title,
        content: initialDetail.content,
        updateTime: "2026-09-11T03:00:00.000Z",
      }),
    );
    const { result } = renderSeeded();

    act(() => result.current.scheduleSave({ title: "本地标题", content: "本地内容" }));
    await waitFor(() => expect(result.current.status).toBe("saved"));

    expect(result.current.conflict).toBeNull();
    expect(patch).toHaveBeenCalledTimes(2);
    expect(patch.mock.calls[1]?.[1].body).toMatchObject({
      title: "本地标题",
      content: "本地内容",
      version: SERVER_VERSION,
    });
  });

  it("换号后仍被判过期时退回 error 等重试，不停在保存中", async () => {
    patch.mockRejectedValue(new ApiError(200, "A0409", "笔记已被其他会话更新，请刷新后重试"));
    // 回读会发生两次，Response 的 body 只能读一次，必须每次新建
    get.mockImplementation(() =>
      okEnvelope({
        id: NOTE_ID,
        title: initialDetail.title,
        content: initialDetail.content,
        updateTime: "2026-09-11T03:00:00.000Z",
      }),
    );
    const { result } = renderSeeded();

    act(() => result.current.scheduleSave({ title: "本地标题", content: "本地内容" }));
    await waitFor(() => expect(result.current.status).toBe("error"));
    expect(result.current.conflict).toBeNull();
    expect(patch).toHaveBeenCalledTimes(2);
  });

  it("服务端内容真的变了才进冲突态", async () => {
    patch.mockRejectedValueOnce(new ApiError(200, "A0409", "笔记已被其他会话更新，请刷新后重试"));
    get.mockResolvedValue(
      okEnvelope({
        id: NOTE_ID,
        title: "别人改过的标题",
        content: "别人写的内容",
        updateTime: "2026-09-11T03:00:00.000Z",
      }),
    );
    const { result } = renderSeeded();

    act(() => result.current.scheduleSave({ title: "本地标题", content: "本地内容" }));
    await waitFor(() => expect(result.current.status).toBe("conflict"));

    expect(patch).toHaveBeenCalledTimes(1);
    expect(result.current.conflict).toMatchObject({
      local: { title: "本地标题", content: "本地内容" },
      server: { title: "别人改过的标题", content: "别人写的内容" },
    });
  });

  it("卸载 flush 把草稿写回缓存并让详情查询失效，回到这篇笔记不会读到旧正文", async () => {
    patch.mockResolvedValue(okEnvelope(saveResult()));
    const { result, unmount, queryClient } = renderSeeded();
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");

    act(() => result.current.scheduleSave({ title: "离开前", content: "未保存" }));
    unmount();

    expect(patch.mock.calls[0]?.[1]).toMatchObject({ keepalive: true });
    // SPA 返回时编辑器拿缓存当初始内容：不写回就会用落盘前的旧正文接着编辑
    expect(queryClient.getQueryData<NoteDetail>(DETAIL_KEY)).toMatchObject({
      title: "离开前",
      content: "未保存",
    });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: DETAIL_KEY });
  });
});
