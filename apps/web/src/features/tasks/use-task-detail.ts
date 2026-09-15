"use client";

import { ApiError, unwrapEnvelope } from "@/lib/api/errors";
import { noteApi } from "@/lib/api/openapi";
import { RES_CODE } from "@anynote/api-core/codes";
import { useQuery } from "@tanstack/react-query";
import { fetchTaskEditHeatmap } from "./heatmap-endpoint";
import { taskQueryKeys } from "./query-keys";
import {
  type AdminTask,
  type MemberTask,
  SUBMISSION_PAGE_SIZE,
  SUBMISSION_TAB_STATUS,
  type SubmissionTab,
  TIMELINE_RETURN,
  TIMELINE_SUBMIT,
  type TaskHeatmap,
  type TaskSubmission,
  type TaskTimelineItem,
  adminTaskSchema,
  memberTaskPageSchema,
  taskHeatmapSchema,
  taskSubmissionPageSchema,
  taskTimelineItemSchema,
} from "./schemas";

/** 成员找任务时逐页翻的上限：50 × 40 = 2000 个任务，超过就当"找不到"。 */
const MEMBER_TASK_MAX_PAGES = 40;

const request = { parseAs: "stream" as const, signal: AbortSignal.timeout(15_000) };

/**
 * `GET /noteTasks` 的列表行只能按知识库整页取，没有按 id 的单条端点
 * （§1.4 第 8 条：成员侧没有单个任务查询，B-4 是可选的后端补充）。
 *
 * 所以逐页找：命中即停，翻完仍没有返回 `null`，页面据此显示不存在态。
 * `pageSize = 50` 是列表页的分页口径，复用它可以吃到同一份后端缓存。
 * 加页数上限是因为"页数没翻完"和"后端 pages 字段异常"在客户端看起来一样，
 * 没有上限的话一个坏响应就能让页面无限翻页。
 */
async function findMemberTask(baseId: number, taskId: number): Promise<MemberTask | null> {
  for (let page = 1; page <= MEMBER_TASK_MAX_PAGES; page += 1) {
    const { response } = await noteApi.GET("/noteTasks", {
      params: { query: { page, pageSize: 50, knowledgeBaseId: baseId } },
      ...request,
    });
    const pageData = await unwrapEnvelope(response, memberTaskPageSchema.parse);
    const hit = pageData.rows.find((row) => row.id === taskId);
    if (hit) return hit;
    const pages = pageData.pages ?? 1;
    if (page >= pages) return null;
  }
  return null;
}

/** 成员视角的单个任务（从列表里找）。找不到时 `data === null`。 */
export function useMemberTaskQuery(baseId: number, taskId: number) {
  return useQuery({
    queryKey: [...taskQueryKeys.list(baseId, 1), "member-task", taskId] as const,
    enabled:
      Number.isSafeInteger(baseId) && baseId > 0 && Number.isSafeInteger(taskId) && taskId > 0,
    queryFn: async (): Promise<MemberTask | null> => findMemberTask(baseId, taskId),
  });
}

/**
 * 「不存在或无权限」的统一判定。
 *
 * 后端对"任务不存在"与"你没有这个任务的权限"返回的是同一类错误
 * （`RequiresNoteTaskPermissionsAspect` 抛 `AuthException`，`A0301`），
 * `GET /admin/noteTasks/{id}` 在任务不存在时走 `getNoteTaskKnowledgeBaseId`
 * 还可能直接 500。两种情况对用户来说下一步动作一样——返回任务列表，
 * 所以一并归到不存在态，不分别给文案（分开还会泄露对象是否存在）。
 */
export function isTaskMissing(error: unknown): boolean {
  if (error instanceof ApiError) {
    return (
      error.status === 404 ||
      error.code === RES_CODE.UNAUTHORIZED ||
      error.code === RES_CODE.BAD_PARAM
    );
  }
  return false;
}

/** 管理员任务详情（`GET /admin/noteTasks/{id}`）。 */
export function useAdminTaskQuery(taskId: number) {
  return useQuery({
    queryKey: taskQueryKeys.adminDetail(taskId),
    enabled: Number.isSafeInteger(taskId) && taskId > 0,
    queryFn: async (): Promise<AdminTask> => {
      const { response } = await noteApi.GET("/admin/noteTasks/{id}", {
        params: { path: { id: taskId } },
        ...request,
      });
      return unwrapEnvelope(response, adminTaskSchema.parse);
    },
  });
}

/** 单个 tab 的提交记录分页（每页 20）。 */
export function useTaskSubmissionsQuery(taskId: number, tab: SubmissionTab, page: number) {
  return useQuery({
    queryKey: taskQueryKeys.submissions(taskId, tab, page),
    enabled: Number.isSafeInteger(taskId) && taskId > 0,
    // 切 tab / 翻页时保住上一页，列表不会闪成骨架
    placeholderData: (previous) => previous,
    queryFn: async (): Promise<{
      rows: TaskSubmission[];
      total: number;
      pages: number;
      current: number;
    }> => {
      const { response } = await noteApi.GET("/admin/noteTasks/submissions", {
        params: {
          query: {
            noteTaskId: taskId,
            page,
            pageSize: SUBMISSION_PAGE_SIZE,
            userTaskStatus: SUBMISSION_TAB_STATUS[tab],
          },
        },
        ...request,
      });
      const pageData = await unwrapEnvelope(response, taskSubmissionPageSchema.parse);
      return {
        rows: pageData.rows,
        total: pageData.total ?? pageData.rows.length,
        pages: pageData.pages ?? 1,
        current: pageData.current ?? page,
      };
    },
  });
}

/**
 * 成员编辑活跃度（B-1 `GET /admin/noteTasks/{id}/editHeatmap`）。
 *
 * **不回退到旧的 `/noteTasks/{id}/charts`**：那个端点按小时逐段查询、
 * 在没有提交时还会空指针（§1.4 第 6 条），数据口径与本画板也完全不同。
 * B-1 上线前请求会 404，页面据此整卡不渲染；其它错误才走 `QueryError`。
 *
 * `retry: false`：404 重试三次只是把"这个端点还没有"拖成三倍等待。
 */
export function useTaskHeatmapQuery(taskId: number) {
  return useQuery({
    queryKey: taskQueryKeys.heatmap(taskId),
    enabled: Number.isSafeInteger(taskId) && taskId > 0,
    retry: false,
    queryFn: async (): Promise<TaskHeatmap> => {
      const { response } = await fetchTaskEditHeatmap(taskId);
      return unwrapEnvelope(response, taskHeatmapSchema.parse);
    },
  });
}

/**
 * 热力图端点还没上线（B-1 未合入）的判定：整卡隐藏，不向用户暴露。
 *
 * 404 是"这个路径不存在"；`A0301` 是"没有权限"（成员打开管理员视角的深链），
 * 两者都不该在页面上留一个报错块——前者是部署状态，后者用户无法处理。
 */
export function isHeatmapUnavailable(error: unknown): boolean {
  if (!error) return false;
  if (error instanceof ApiError) {
    return error.status === 404 || error.code === RES_CODE.UNAUTHORIZED;
  }
  return false;
}

/**
 * 任务时间线（`GET /noteTasks/{id}/history`）。
 *
 * 只保留提交（3）与退回（4）——创建、修改、加成员是任务本身的流水，
 * 不属于"我的提交"这条线（D-17 图例 20）。新的在上。
 * 没有 `operationTime` 的条目排在最后，不参与排序。
 */
export function useTaskTimelineQuery(taskId: number) {
  return useQuery({
    queryKey: taskQueryKeys.timeline(taskId),
    enabled: Number.isSafeInteger(taskId) && taskId > 0,
    queryFn: async (): Promise<TaskTimelineItem[]> => {
      const { response } = await noteApi.GET("/noteTasks/{id}/history", {
        params: { path: { id: taskId } },
        ...request,
      });
      const rows = await unwrapEnvelope(response, (data) =>
        taskTimelineItemSchema.array().parse(data ?? []),
      );
      return rows
        .filter((row) => row.type === TIMELINE_SUBMIT || row.type === TIMELINE_RETURN)
        .sort(
          (a, b) =>
            (Date.parse(b.operationTime ?? "") || 0) - (Date.parse(a.operationTime ?? "") || 0),
        );
    },
  });
}
