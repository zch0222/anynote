import { clearLeaveConfirmed, markLeaveConfirmed } from "@/features/notes/leave-confirmation";
import { noteQueryKeys } from "@/features/notes/query-keys";
import type { NoteDetail } from "@/features/notes/schemas";
import { ApiError } from "@/lib/api/errors";
import { noteApi } from "@/lib/api/openapi";
import { renderHookWithProviders } from "@/test/render";
import { QueryClient } from "@tanstack/react-query";
import { act, waitFor } from "@testing-library/react";
import type { Mock } from "vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  AUTOSAVE_DEBOUNCE_MS,
  COLLAB_AUTOSAVE_DEBOUNCE_MS,
  type NoteSaveStatus,
  RETRY_DELAY_MS,
  hasUnsavedRisk,
  useSaveNote,
} from "../use-save-note";

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

  it("关页（pagehide）时未落盘的改动通过 keepalive 请求送出", async () => {
    patch.mockResolvedValue(okEnvelope(saveResult()));
    const { result } = renderHookWithProviders(() =>
      useSaveNote({ noteId: NOTE_ID, initialVersion: "1000", debounceMs: 20 }),
    );

    act(() => result.current.scheduleSave({ title: "离开前", content: "未保存" }));
    window.dispatchEvent(new Event("pagehide"));

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

  /**
   * 切到后台（切 App / 锁屏 / 切标签）是移动端**最后一个可靠时机**：
   * iOS 与 Android 常常不发 `pagehide` 就直接回收后台标签页，只在
   * `visibilitychange` 里补一次落盘，才能保证这段改动不随进程一起消失。
   *
   * 这里断言**走的是正常保存**（带 `keepalive` 的即发即忘路径不行）：页面并没有
   * 卸载，用户切回来还会继续编辑，所以这次保存必须推进版本号——否则下一次保存
   * 会拿过期令牌撞 A0409 并被静默吞掉。
   */
  it("切到后台时立刻落盘，走正常保存以推进版本号", async () => {
    patch.mockResolvedValue(okEnvelope(saveResult()));
    const { result } = renderHookWithProviders(() =>
      // debounce 给足够长，确保这次保存**只能**由 visibilitychange 触发
      useSaveNote({ noteId: NOTE_ID, initialVersion: "1000", debounceMs: 600_000 }),
    );

    act(() => result.current.scheduleSave({ title: "切后台", content: "未保存" }));
    expect(patch).not.toHaveBeenCalled();

    Object.defineProperty(document, "visibilityState", {
      value: "hidden",
      configurable: true,
    });
    try {
      act(() => {
        document.dispatchEvent(new Event("visibilitychange"));
      });
      await waitFor(() => expect(patch).toHaveBeenCalledTimes(1));
      expect(patch.mock.calls[0]?.[1].body).toMatchObject({
        title: "切后台",
        content: "未保存",
      });
      // 关键：不是 keepalive 那条即发即忘、不推进版本号的路
      expect(patch.mock.calls[0]?.[1].keepalive).toBeUndefined();
    } finally {
      Object.defineProperty(document, "visibilityState", {
        value: "visible",
        configurable: true,
      });
    }
  });

  /**
   * 回归：反复「打字 → 切后台 → 切回前台」时，第一轮之后的保存都撞 A0409
   * 并被静默丢弃（真实浏览器实测服务端只剩第一轮）。根因是切后台曾走
   * keepalive 路径，不推进 `versionRef`，后续保存一直拿着过期令牌。
   */
  it("反复切后台时每轮都用最新版本号，不会连续撞 A0409", async () => {
    patch.mockResolvedValue(okEnvelope(saveResult()));
    const { result } = renderHookWithProviders(() =>
      useSaveNote({ noteId: NOTE_ID, initialVersion: "1000", debounceMs: 600_000 }),
    );

    const hide = () => {
      Object.defineProperty(document, "visibilityState", {
        value: "hidden",
        configurable: true,
      });
      act(() => {
        document.dispatchEvent(new Event("visibilitychange"));
      });
    };

    try {
      act(() => result.current.scheduleSave({ title: "第一轮", content: "1" }));
      hide();
      await waitFor(() => expect(patch).toHaveBeenCalledTimes(1));
      // 第一次用的是 seed 进来的版本号
      expect(patch.mock.calls[0]?.[1].body).toMatchObject({ version: "1000" });

      // 服务端推进到 3000，第二轮必须带上它
      patch.mockResolvedValue(okEnvelope(saveResult({ version: "3000" })));
      act(() => result.current.scheduleSave({ title: "第二轮", content: "2" }));
      hide();
      await waitFor(() => expect(patch).toHaveBeenCalledTimes(2));
      expect(patch.mock.calls[1]?.[1].body).toMatchObject({ version: "2000" });

      act(() => result.current.scheduleSave({ title: "第三轮", content: "3" }));
      hide();
      await waitFor(() => expect(patch).toHaveBeenCalledTimes(3));
      expect(patch.mock.calls[2]?.[1].body).toMatchObject({ version: "3000" });
    } finally {
      Object.defineProperty(document, "visibilityState", {
        value: "visible",
        configurable: true,
      });
    }
  });

  it("只是切回前台不发请求——没有待存内容时不该白跑一趟", async () => {
    patch.mockResolvedValue(okEnvelope(saveResult()));
    renderHookWithProviders(() =>
      useSaveNote({ noteId: NOTE_ID, initialVersion: "1000", debounceMs: 600_000 }),
    );

    Object.defineProperty(document, "visibilityState", {
      value: "visible",
      configurable: true,
    });
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(patch).not.toHaveBeenCalled();
  });

  /**
   * 请求已经发出、响应还没回来时离开页面：此时 `pendingRef` 已被清空，
   * 而那次普通请求会被浏览器随页面一起中断——不补发就等于这次改动从没存在过。
   */
  it("保存请求在飞行中时离开，用 keepalive 补发一次，改动不会丢", async () => {
    let releaseFirst: ((value: unknown) => void) | undefined;
    patch.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          releaseFirst = resolve;
        }),
    );
    const { result } = renderHookWithProviders(() =>
      useSaveNote({ noteId: NOTE_ID, initialVersion: "1000", debounceMs: 20 }),
    );

    act(() => result.current.scheduleSave({ title: "飞行中", content: "未保存" }));
    await waitFor(() => expect(patch).toHaveBeenCalledTimes(1));

    // 第一次请求仍挂起（响应未回），此刻关页
    window.dispatchEvent(new Event("pagehide"));

    await waitFor(() => expect(patch).toHaveBeenCalledTimes(2));
    expect(patch.mock.calls[1]?.[1]).toMatchObject({
      keepalive: true,
      body: { title: "飞行中", content: "未保存" },
    });

    // 收尾：放掉挂起的那次，避免留下未 settle 的 promise
    releaseFirst?.(okEnvelope(saveResult()));
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

    expect(patch.mock.calls[0]?.[1].body).toMatchObject({ title: "离开前", content: "未保存" });
    // SPA 返回时编辑器拿缓存当初始内容：不写回就会用落盘前的旧正文接着编辑
    expect(queryClient.getQueryData<NoteDetail>(DETAIL_KEY)).toMatchObject({
      title: "离开前",
      content: "未保存",
    });
    await waitFor(() => expect(invalidate).toHaveBeenCalledWith({ queryKey: DETAIL_KEY }));
  });
});

describe("useSaveNote：协同模式（M13.3）", () => {
  function renderCollab(overrides: Record<string, unknown> = {}) {
    const queryClient = createPersistentQueryClient();
    queryClient.setQueryData<NoteDetail>(DETAIL_KEY, initialDetail);
    return renderHookWithProviders(
      () =>
        useSaveNote({
          noteId: NOTE_ID,
          initialVersion: "1000",
          debounceMs: 20,
          conflictPolicy: "overwrite",
          ...overrides,
        }),
      { queryClient },
    );
  }

  it("overwrite 策略下 A0409 不弹冲突框，对齐服务端版本号后原样重发", async () => {
    patch.mockRejectedValueOnce(new ApiError(200, "A0409", "笔记已被其他会话更新，请刷新后重试"));
    patch.mockResolvedValueOnce(okEnvelope(saveResult({ version: "9000" })));
    // 回读拿到的是**别人改过**的内容，prompt 策略下这会进冲突态
    get.mockImplementation(() =>
      okEnvelope({
        id: NOTE_ID,
        title: "别人改过的标题",
        content: "别人写的内容",
        updateTime: "2026-09-11T03:00:00.000Z",
      }),
    );
    const { result } = renderCollab();

    act(() => result.current.scheduleSave({ title: "本地标题", content: "本地内容" }));
    await waitFor(() => expect(result.current.status).toBe("saved"));

    expect(result.current.conflict).toBeNull();
    expect(patch).toHaveBeenCalledTimes(2);
  });

  it("内容与基线完全相同就不发请求（防乒乓的关键守卫）", async () => {
    const { result } = renderCollab();

    act(() =>
      result.current.scheduleSave({
        title: initialDetail.title ?? "",
        content: initialDetail.content ?? "",
      }),
    );
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    expect(patch).not.toHaveBeenCalled();
    expect(result.current.status).toBe("saved");
  });

  it("overwrite 模式下重试预算放宽到 4 拍，真并发时也不会停在 error", async () => {
    // 前三拍都判过期，第四拍成功——两拍预算下会在第三拍前就放弃
    patch
      .mockRejectedValueOnce(new ApiError(200, "A0409", "过期"))
      .mockRejectedValueOnce(new ApiError(200, "A0409", "过期"))
      .mockRejectedValueOnce(new ApiError(200, "A0409", "过期"))
      .mockResolvedValueOnce(okEnvelope(saveResult({ version: "9000" })));
    let version = 0;
    get.mockImplementation(() =>
      okEnvelope({
        id: NOTE_ID,
        title: "服务端标题",
        content: "服务端内容",
        updateTime: new Date(Date.UTC(2026, 8, 11, 3, 0, version++)).toISOString(),
      }),
    );
    const { result } = renderCollab();

    act(() => result.current.scheduleSave({ title: "本地标题", content: "本地内容" }));
    await waitFor(() => expect(result.current.status).toBe("saved"), { timeout: 3000 });
    expect(patch).toHaveBeenCalledTimes(4);
  });

  it("默认 prompt 策略仍然弹冲突（协同开关关闭时的现状语义不变）", async () => {
    patch.mockRejectedValueOnce(new ApiError(200, "A0409", "过期"));
    get.mockResolvedValue(
      okEnvelope({
        id: NOTE_ID,
        title: "别人改过的标题",
        content: "别人写的内容",
        updateTime: "2026-09-11T03:00:00.000Z",
      }),
    );
    const { result } = renderCollab({ conflictPolicy: "prompt" });

    act(() => result.current.scheduleSave({ title: "本地标题", content: "本地内容" }));
    await waitFor(() => expect(result.current.status).toBe("conflict"));
  });

  it("sharedVersion 把本地版本号顶到别人刚存过的最新值（常态 A0409 归零）", async () => {
    patch.mockResolvedValue(okEnvelope(saveResult({ version: "9000" })));
    const { result, rerender } = renderHookWithProviders(
      (props: { sharedVersion: string | null }) =>
        useSaveNote({
          noteId: NOTE_ID,
          initialVersion: "1000",
          debounceMs: 20,
          conflictPolicy: "overwrite",
          sharedVersion: props.sharedVersion,
        }),
      {
        queryClient: createPersistentQueryClient(),
        initialProps: { sharedVersion: null as string | null },
      },
    );

    rerender({ sharedVersion: "7777" });
    act(() => result.current.scheduleSave({ title: "t", content: "c" }));
    await waitFor(() => expect(patch).toHaveBeenCalledTimes(1));

    expect(patch.mock.calls[0]?.[1].body.version).toBe("7777");
  });

  it("每次保存成功后回调 onSaved，携带新版本号（供写回共享 meta）", async () => {
    patch.mockResolvedValue(okEnvelope(saveResult({ version: "9000" })));
    const onSaved = vi.fn();
    const { result } = renderCollab({ onSaved });

    act(() => result.current.scheduleSave({ title: "t", content: "c" }));
    await waitFor(() => expect(result.current.status).toBe("saved"));

    expect(onSaved).toHaveBeenCalledWith("9000");
  });

  it(`协同模式的防抖常量是 ${COLLAB_AUTOSAVE_DEBOUNCE_MS}ms，比单人的 ${AUTOSAVE_DEBOUNCE_MS}ms 更宽`, () => {
    expect(COLLAB_AUTOSAVE_DEBOUNCE_MS).toBeGreaterThan(AUTOSAVE_DEBOUNCE_MS);
  });
});

describe("useSaveNote：单人模式缺陷修复（M14.P）", () => {
  function renderSeeded(overrides: Record<string, unknown> = {}) {
    const queryClient = createPersistentQueryClient();
    queryClient.setQueryData<NoteDetail>(DETAIL_KEY, initialDetail);
    return renderHookWithProviders(
      () =>
        useSaveNote({
          noteId: NOTE_ID,
          initialVersion: "1000",
          debounceMs: 20,
          ...overrides,
        }),
      { queryClient },
    );
  }

  function serverNote() {
    return okEnvelope({
      id: NOTE_ID,
      title: "服务端标题",
      content: "服务端内容",
      updateTime: "2026-09-11T03:00:00.000Z",
    });
  }

  async function reachConflict(rendered: ReturnType<typeof renderSeeded>) {
    await waitFor(() => expect(rendered.result.current.status).toBe("conflict"));
  }

  it("① 选放弃后卸载也不发请求：被放弃的草稿不会经卸载补发写回服务端", async () => {
    patch.mockRejectedValueOnce(new ApiError(200, "A0409", "笔记已被其他会话更新"));
    get.mockImplementation(() => serverNote());
    const rendered = renderSeeded();
    act(() => rendered.result.current.scheduleSave({ title: "本地标题", content: "本地内容" }));
    await reachConflict(rendered);

    await act(async () => {
      await rendered.result.current.resolveConflict("useServer");
    });
    rendered.unmount();
    window.dispatchEvent(new Event("pagehide"));

    expect(patch).toHaveBeenCalledTimes(1);
  });

  it("① 选放弃时把服务端内容交给调用方载入编辑器", async () => {
    patch.mockRejectedValueOnce(new ApiError(200, "A0409", "笔记已被其他会话更新"));
    get.mockImplementation(() => serverNote());
    const onDiscardLocal = vi.fn();
    const rendered = renderSeeded({ onDiscardLocal });
    act(() => rendered.result.current.scheduleSave({ title: "本地标题", content: "本地内容" }));
    await reachConflict(rendered);

    await act(async () => {
      await rendered.result.current.resolveConflict("useServer");
    });

    expect(onDiscardLocal).toHaveBeenCalledExactlyOnceWith({
      title: "服务端标题",
      content: "服务端内容",
    });
  });

  it("③ 不可重试的错误（笔记已删除）停在 failed，展示后端原因且不再自动重试", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    patch.mockRejectedValue(new ApiError(200, "A0404", "笔记不存在"));
    const { result } = renderSeeded();

    act(() => result.current.scheduleSave({ title: "t", content: "c" }));
    await waitFor(() => expect(result.current.status).toBe("failed"));
    expect(result.current.failure).toMatchObject({ kind: "notFound", message: "笔记不存在" });

    await act(async () => {
      vi.advanceTimersByTime(RETRY_DELAY_MS * 3);
    });
    expect(patch).toHaveBeenCalledTimes(1);
  });

  it("③ 登录过期时停止重试、提示重新登录，草稿保留到手动重试", async () => {
    patch.mockRejectedValueOnce(new ApiError(401, "A0311", "登录已过期"));
    patch.mockResolvedValue(okEnvelope(saveResult()));
    const { result } = renderSeeded();

    act(() => result.current.scheduleSave({ title: "离线标题", content: "登录过期前写的" }));
    await waitFor(() => expect(result.current.status).toBe("failed"));
    expect(result.current.failure?.kind).toBe("auth");

    await act(async () => {
      await result.current.retry();
    });
    expect(patch).toHaveBeenCalledTimes(2);
    expect(patch.mock.calls[1]?.[1].body).toMatchObject({
      title: "离线标题",
      content: "登录过期前写的",
    });
    await waitFor(() => expect(result.current.status).toBe("saved"));
  });

  it("③ 服务端 5xx 与网络错误仍进 error 并按间隔重试", async () => {
    patch.mockRejectedValueOnce(new ApiError(502, "B0500", "网关错误"));
    patch.mockResolvedValue(okEnvelope(saveResult()));
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { result } = renderSeeded();

    act(() => result.current.scheduleSave({ title: "t", content: "c" }));
    await waitFor(() => expect(result.current.status).toBe("error"));
    await act(async () => {
      vi.advanceTimersByTime(RETRY_DELAY_MS);
    });
    await waitFor(() => expect(patch).toHaveBeenCalledTimes(2));
  });

  it("④ 有未保存改动时关页先拦截，并立刻发起一次普通保存", async () => {
    patch.mockResolvedValue(okEnvelope(saveResult()));
    const { result } = renderSeeded({ debounceMs: 600_000 });
    act(() => result.current.scheduleSave({ title: "t", content: "未保存" }));

    const event = new Event("beforeunload", { cancelable: true });
    act(() => {
      window.dispatchEvent(event);
    });

    expect(event.defaultPrevented).toBe(true);
    await waitFor(() => expect(patch).toHaveBeenCalledTimes(1));
    expect(patch.mock.calls[0]?.[1].keepalive).toBeUndefined();
  });

  it("④ 刚在站内确认过离开时，关页不再二次拦截，但仍发起一次保存", async () => {
    patch.mockResolvedValue(okEnvelope(saveResult()));
    const { result } = renderSeeded({ debounceMs: 600_000 });
    act(() => result.current.scheduleSave({ title: "t", content: "未保存" }));
    markLeaveConfirmed();

    const event = new Event("beforeunload", { cancelable: true });
    act(() => {
      window.dispatchEvent(event);
    });

    expect(event.defaultPrevented).toBe(false);
    await waitFor(() => expect(patch).toHaveBeenCalledTimes(1));
    clearLeaveConfirmed();
  });

  it("④ 没有未保存改动时关页不拦截", () => {
    renderSeeded();
    const event = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
  });

  it("④ SPA 路由卸载时页面仍在，用普通请求送出草稿", async () => {
    patch.mockResolvedValue(okEnvelope(saveResult()));
    const { result, unmount } = renderSeeded({ debounceMs: 600_000 });
    act(() => result.current.scheduleSave({ title: "离开前", content: "未保存" }));

    unmount();

    expect(patch).toHaveBeenCalledTimes(1);
    expect(patch.mock.calls[0]?.[1].keepalive).toBeUndefined();
    expect(patch.mock.calls[0]?.[1].body).toMatchObject({ content: "未保存", version: "1000" });
  });

  it("④ 关页时草稿不超过 keepalive 上限用 keepalive，超过则改用普通请求", () => {
    patch.mockResolvedValue(okEnvelope(saveResult()));
    const { result } = renderSeeded({ debounceMs: 600_000 });

    act(() => result.current.scheduleSave({ title: "小", content: "短正文" }));
    window.dispatchEvent(new Event("pagehide"));
    expect(patch.mock.calls[0]?.[1].keepalive).toBe(true);

    act(() => result.current.scheduleSave({ title: "大", content: "字".repeat(30_000) }));
    window.dispatchEvent(new Event("pagehide"));
    expect(patch).toHaveBeenCalledTimes(2);
    expect(patch.mock.calls[1]?.[1].keepalive).toBeUndefined();
  });

  it("⑤ 保存失败后把内容改回原样，离开页面不会补发改之前的内容", async () => {
    patch.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    const { result, unmount } = renderSeeded();

    act(() => result.current.scheduleSave({ title: "改过的", content: "改过的正文" }));
    await waitFor(() => expect(result.current.status).toBe("error"));

    act(() =>
      result.current.scheduleSave({
        title: initialDetail.title ?? "",
        content: initialDetail.content ?? "",
      }),
    );
    await waitFor(() => expect(result.current.status).toBe("saved"));
    unmount();
    window.dispatchEvent(new Event("pagehide"));

    expect(patch).toHaveBeenCalledTimes(1);
  });

  it("⑥ flush() 等在飞请求结束后再把新改动存一次", async () => {
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
    await waitFor(() => expect(patch).toHaveBeenCalledTimes(1));
    act(() => result.current.scheduleSave({ title: "第二次", content: "c2" }));

    let flushed = false;
    const flushing = result.current.flush().then(() => {
      flushed = true;
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
    expect(flushed).toBe(false);

    act(() => release?.());
    await act(async () => {
      await flushing;
    });
    expect(patch).toHaveBeenCalledTimes(2);
    expect(patch.mock.calls[1]?.[1].body).toMatchObject({ content: "c2", version: "2000" });
  });

  it("⑦ 冲突回读期间打的字，选「用我的改动覆盖」时一并保留", async () => {
    patch.mockRejectedValueOnce(new ApiError(200, "A0409", "笔记已被其他会话更新"));
    patch.mockResolvedValue(okEnvelope(saveResult({ version: "4000" })));
    let releaseRead: (() => void) | null = null;
    get.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          releaseRead = () => resolve(serverNote());
        }),
    );
    const rendered = renderSeeded();

    act(() => rendered.result.current.scheduleSave({ title: "本地", content: "本地内容" }));
    await waitFor(() => expect(get).toHaveBeenCalledTimes(1));
    act(() =>
      rendered.result.current.scheduleSave({ title: "本地", content: "本地内容+回读期间" }),
    );
    act(() => releaseRead?.());
    await reachConflict(rendered);

    await act(async () => {
      await rendered.result.current.resolveConflict("keepLocal");
    });

    expect(patch.mock.calls[1]?.[1].body).toMatchObject({ content: "本地内容+回读期间" });
  });

  it("⑧ 请求在飞时继续编辑，徽标保持「保存中」", async () => {
    let release: (() => void) | null = null;
    patch.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = () => resolve(okEnvelope(saveResult()));
        }),
    );
    patch.mockResolvedValue(okEnvelope(saveResult({ version: "3000" })));
    const { result } = renderSeeded();

    act(() => result.current.scheduleSave({ title: "t", content: "c1" }));
    await waitFor(() => expect(result.current.status).toBe("saving"));
    act(() => result.current.scheduleSave({ title: "t", content: "c2" }));
    expect(result.current.status).toBe("saving");

    act(() => release?.());
    await waitFor(() => expect(result.current.status).toBe("saved"));
  });

  it("持续输入不停顿时，最长等待到期也会保存一次", async () => {
    patch.mockResolvedValue(okEnvelope(saveResult()));
    const { result } = renderSeeded({ debounceMs: 80, maxWaitMs: 150 });

    for (let index = 0; index < 8; index += 1) {
      act(() => result.current.scheduleSave({ title: "t", content: `c${index}` }));
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 40));
      });
    }

    expect(patch).toHaveBeenCalled();
  });
});

describe("useSaveNote：离开拦截的判据", () => {
  it("离线、可重试失败、不可重试失败与冲突时离开会丢改动；其余状态不会", () => {
    const risky: NoteSaveStatus[] = ["offline", "error", "failed", "conflict"];
    const safe: NoteSaveStatus[] = ["saved", "pending", "saving"];
    for (const status of risky) expect(hasUnsavedRisk(status)).toBe(true);
    for (const status of safe) expect(hasUnsavedRisk(status)).toBe(false);
  });

  it("getStatus 同步给出最新状态：flush 失败返回后立即可读到 error，不必等重新渲染", async () => {
    patch.mockRejectedValue(new ApiError(502, "B0500", "网关错误"));
    const { result } = renderHookWithProviders(() =>
      useSaveNote({ noteId: NOTE_ID, initialVersion: "1000", debounceMs: 600_000 }),
    );
    act(() => result.current.scheduleSave({ title: "t", content: "c" }));

    let afterFlush: NoteSaveStatus | undefined;
    const { getStatus, flush } = result.current;
    await act(async () => {
      await flush();
      afterFlush = getStatus();
    });

    expect(afterFlush).toBe("error");
    expect(result.current.getStatus()).toBe(result.current.status);
  });
});
