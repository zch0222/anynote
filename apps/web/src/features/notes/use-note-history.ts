"use client";

import { ApiError, unwrapEnvelope } from "@/lib/api/errors";
import { noteApi } from "@/lib/api/openapi";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { noteQueryKeys } from "./query-keys";
import {
  type NoteDetail,
  type NoteHistoryDetail,
  type NoteHistoryItem,
  type NoteSaveResult,
  noteDetailSchema,
  noteHistoryDetailSchema,
  noteHistoryItemSchema,
  noteSaveResultSchema,
  pageBeanSchema,
  toVersion,
} from "./schemas";
import { VERSION_CONFLICT_CODE } from "./use-save-note";

/** 历史列表每页 15 条（画板 D-16 图例 15）。 */
export const HISTORY_PAGE_SIZE = 15;

/**
 * 恢复成功后延迟失效历史列表的时间（方案 §1.4 第 4 条）。
 *
 * 历史快照由 `PATCH /notes/{noteId}` 触发的消息队列**异步**生成，
 * 保存返回时"恢复本身产生的那条新版本"还没落库。立刻失效只会重取到
 * 不含新版本的列表——用户回到历史页看到少一条，会以为恢复没生效。
 */
export const HISTORY_REFETCH_DELAY_MS = 2000;

const historyPageSchema = pageBeanSchema(noteHistoryItemSchema);

export type NoteHistoryPage = {
  rows: NoteHistoryItem[];
  total: number;
  pages: number;
  page: number;
};

/**
 * 笔记历史版本列表（D-16 右侧面板）。
 *
 * 无限翻页：历史随每次保存线性增长，一次性拉全量对一篇改过几百次的笔记
 * 是纯浪费，而用户通常只看最近几条。`total` 取第一页那份即可——
 * 它只用来在面板标题里报「共 N 个版本」。
 *
 * `getNextPageParam` 按后端算好的 `pages` 判到底，而不是"本页满 15 条"：
 * 两者的区别出现在最后一页恰好排满时——按条数判会多打一次必然为空的请求，
 * 用户滚到底先看到转圈、再看到「没有更早的版本了」，平白闪一下。
 */
export function useNoteHistoryInfinite(noteId: number) {
  return useInfiniteQuery({
    queryKey: noteQueryKeys.historyList(noteId),
    enabled: Number.isSafeInteger(noteId) && noteId > 0,
    initialPageParam: 1,
    queryFn: async ({ pageParam }): Promise<NoteHistoryPage> => {
      const { response } = await noteApi.GET("/notes/historyList", {
        params: { query: { noteId, page: pageParam, pageSize: HISTORY_PAGE_SIZE } },
        parseAs: "stream",
        signal: AbortSignal.timeout(15_000),
      });
      const page = await unwrapEnvelope(response, historyPageSchema.parse);
      return {
        rows: page.rows,
        total: page.total ?? page.rows.length,
        pages: page.pages ?? 1,
        page: pageParam,
      };
    },
    getNextPageParam: (last) => (last.page < last.pages ? last.page + 1 : undefined),
  });
}

/**
 * 单个历史版本的内容（`GET /notes/history?operationId=`）。
 *
 * `operationId` 允许传 `null`：右侧列表还没选中任何版本时不该发请求。
 * 缓存给 30s `staleTime`——历史版本是**不可变**的快照，同一 operationId 的
 * 内容不会再变，来回切换选中项没有理由重取。
 */
export function useNoteHistoryQuery(operationId: number | null | undefined) {
  const id = Number.isSafeInteger(operationId) ? (operationId as number) : Number.NaN;
  return useQuery({
    queryKey: noteQueryKeys.historyDetail(Number.isSafeInteger(id) ? id : -1),
    enabled: Number.isSafeInteger(id) && id > 0,
    staleTime: 30_000,
    queryFn: async (): Promise<NoteHistoryDetail> => {
      const { response } = await noteApi.GET("/notes/history", {
        params: { query: { operationId: id } },
        parseAs: "stream",
        signal: AbortSignal.timeout(15_000),
      });
      return unwrapEnvelope(response, noteHistoryDetailSchema.parse);
    },
  });
}

export type RestoreNoteVersionInput = {
  noteId: number;
  /** 该历史版本的标题与正文，原样写回。 */
  title: string;
  content: string;
};

/**
 * 恢复的结局。
 *
 * 用返回值而不是抛异常表达冲突：冲突是**预期内的业务分支**（别人刚保存过），
 * 调用方要 toast 并刷新列表，把它混进 `error` 会和网络故障走同一条路，
 * 页面就得靠 `instanceof` 再分一次流。
 */
export type RestoreNoteVersionResult = { status: "restored" } | { status: "conflict" };

/**
 * 恢复到某个历史版本。
 *
 * **没有专门的回滚端点**（方案 §1.4 第 4 条），所以要两步：
 * 1. `GET /notes/{noteId}` 取服务端**最新**的 `updateTime`，用 `toVersion` 得到
 *    当前版本号。不能复用编辑器缓存里那个——用户可能已经离开编辑器、
 *    期间笔记被别人改过，拿过期令牌写回必然 A0409。
 * 2. `PATCH /notes/{noteId}` 写回 `{ title, content, version }`，三个字段都取自
 *    那个历史版本。后端据此异步生成一条新的历史快照，所以**恢复本身也可回退**，
 *    这正是画板那句"当前内容会先作为一个新版本保留"的依据。
 *
 * 成功后用返回值写回 `noteQueryKeys.detail(noteId)`：页面随即 `router.push` 回编辑器，
 * 而编辑器是拿详情缓存当初始正文的（见 `note-editor.tsx`），不写回的话
 * 它读到的还是恢复前的旧内容——用户会以为恢复失败。
 *
 * 延迟 2 秒再失效 `historyList`，且**只失效列表**：`historyDetail` 是不可变快照，
 * 连带清掉会让面板里正在读的正文闪回骨架。
 *
 * 冲突不重试：那是"别人刚保存过"的事实，自动重发只会撞同一个 A0409。
 */
export function useRestoreNoteVersionMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: RestoreNoteVersionInput): Promise<RestoreNoteVersionResult> => {
      const { noteId, title, content } = input;

      // 第 1 步：取服务端当前版本号。
      // 用 `noteDetailSchema`（宽解析）而不是 `noteSaveResultSchema`：后者要求
      // 正文必填，而这一步只关心 `updateTime`，正文两个字少一个都会把恢复挡在门外，
      // 用户看到的是"操作失败"却查不出原因。
      const latest = await noteApi.GET("/notes/{noteId}", {
        params: { path: { noteId } },
        parseAs: "stream",
        signal: AbortSignal.timeout(15_000),
      });
      const current = await unwrapEnvelope(latest.response, noteDetailSchema.parse);
      const version = toVersion(current.updateTime);

      // 第 2 步：带版本号写回该历史版本的标题与正文
      const { response } = await noteApi.PATCH("/notes/{noteId}", {
        params: { path: { noteId } },
        body: { title, content, ...(version ? { version } : {}) },
        parseAs: "stream",
        signal: AbortSignal.timeout(15_000),
      });

      let saved: NoteSaveResult;
      try {
        saved = await unwrapEnvelope(response, noteSaveResultSchema.parse);
      } catch (error) {
        if (error instanceof ApiError && error.code === VERSION_CONFLICT_CODE) {
          return { status: "conflict" };
        }
        throw error;
      }

      // 缓存写回放在 mutationFn 里而不是 onSuccess：只有真的保存成功才该动缓存，
      // 而成功与否要等拆完信封才知道
      queryClient.setQueryData<NoteDetail>(noteQueryKeys.detail(noteId), (existing) =>
        existing
          ? {
              ...existing,
              title: saved.title ?? title,
              content: saved.content ?? content,
              updateTime: saved.updateTime ?? existing.updateTime,
            }
          : existing,
      );

      // 快照由消息队列异步落库，等它写完再失效，否则列表会少一条
      setTimeout(() => {
        void queryClient.invalidateQueries({ queryKey: noteQueryKeys.historyList(noteId) });
      }, HISTORY_REFETCH_DELAY_MS);

      return { status: "restored" };
    },
    onSuccess: (result, input) => {
      // 冲突说明服务端刚被别的会话改过：我们手里的列表也已经过时（对方那次保存
      // 同样会生成版本），立刻重取，用户才不会对着旧列表继续点恢复。
      if (result.status === "conflict") {
        void queryClient.invalidateQueries({ queryKey: noteQueryKeys.historyList(input.noteId) });
      }
    },
    onError: (_error, input) => {
      // 其它失败（网络、权限）也可能伴随服务端状态变化，列表一并重取
      void queryClient.invalidateQueries({ queryKey: noteQueryKeys.historyList(input.noteId) });
    },
    retry: false,
  });
}

/** 供页面在冲突分支里手动刷新列表时复用，避免各处手拼 query key。 */
export function useInvalidateNoteHistory() {
  const queryClient = useQueryClient();
  return (noteId: number) =>
    queryClient.invalidateQueries({ queryKey: noteQueryKeys.historyList(noteId) });
}
