/**
 * 知识库内的移动端详情地址。
 *
 * **为什么不放在 `components/layout/navigation.ts` 里**：那份文件顶层引着整棵
 * 导航注册表（几十个 lucide 图标 + tab 定义），任何页面 import 一个地址函数
 * 都会把它们一起打进首屏。实测笔记编辑器（`/m/notes/[baseId]/[noteId]`，
 * 预算最紧的移动端路由之一）为此多背约 3KB gzip——一段纯字符串拼接不值得。
 *
 * `navigation.ts` 仍然再导出这三个函数，桌面与既有调用方的 import 路径不变；
 * 真相只在本文件里。
 */

/** 慕课详情：`/m/notes/:baseId/mooc/:moocId`。 */
export function mobileMoocDetailHref(baseId: number, moocId: number) {
  return `/m/notes/${baseId}/mooc/${moocId}`;
}

/** 任务详情：`/m/notes/:baseId/tasks/:taskId`。 */
export function mobileTaskDetailHref(baseId: number, taskId: number) {
  return `/m/notes/${baseId}/tasks/${taskId}`;
}

/** 笔记历史版本：`/m/notes/:baseId/:noteId/history`。 */
export function mobileNoteHistoryHref(baseId: number, noteId: number) {
  return `/m/notes/${baseId}/${noteId}/history`;
}

/** 知识库内的二级 Tab。`notes` 走裸路径（它是知识库的默认落地页）。 */
export function mobileBaseSectionHref(
  baseId: number,
  section: "notes" | "mooc" | "tasks" | "docs",
) {
  return section === "notes" ? `/m/notes/${baseId}` : `/m/notes/${baseId}/${section}`;
}
