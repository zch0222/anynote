import { noteApi } from "@/lib/api/openapi";

/**
 * B-1 热力图端点的**临时**调用壳（`GET /admin/noteTasks/{id}/editHeatmap`）。
 *
 * 为什么单独一个文件：这个端点在改造方案 B-1 里新增，后端在另一条分支
 * （`feat/note-task-edit-heatmap`）上实现，`packages/api-client` 是
 * `openapi:generate` 的产物、不能手改，所以当前 spec 里**还没有这条路径**。
 * 直接用 `noteApi.GET("/admin/noteTasks/{id}/editHeatmap", ...)` 会编译不过。
 *
 * 于是把唯一一处类型断言关在这里，并统一走 `encodeURIComponent` 拼路径
 * （而不是 `// @ts-expect-error` 散落在 hook 里）：
 * 断言失败会集中在这一行报错，B-1 合入后**删掉本文件**、
 * 改成 hook 里直接 `noteApi.GET("/admin/noteTasks/{id}/editHeatmap", { params: { path: { id } } })` 即可。
 *
 * 后端返回仍是标准 `ResData` 信封，拆包交给调用方（与其它 hook 一致）。
 */
export async function fetchTaskEditHeatmap(taskId: number): Promise<{ response: Response }> {
  return (
    noteApi.GET as unknown as (
      path: string,
      init: { params: { path: { id: number } }; parseAs: "stream"; signal: AbortSignal },
    ) => Promise<{ response: Response }>
  )("/admin/noteTasks/{id}/editHeatmap", {
    params: { path: { id: taskId } },
    parseAs: "stream",
    signal: AbortSignal.timeout(15_000),
  });
}
