import { useMemberTaskByIdQuery } from "@/features/tasks/use-task-detail";
import { isTaskMissing } from "@/features/tasks/use-task-detail";
import { resourceHref } from "@/lib/ai/resource-target";
import { ClipboardList } from "lucide-react";
import type { TabDefinition } from "../../types";

/**
 * 任务标签定义。
 *
 * @author 称霸幼儿园
 */
export const taskTabDefinition: TabDefinition = {
  kind: "task",
  family: "resource",
  resourceType: "task",
  mobile: true,
  icon: ClipboardList,
  typeLabel: "任务",
  useTitle: (record, hint) => {
    const id = record.family === "resource" && record.ref.type === "task" ? record.ref.id : 0;
    const query = useMemberTaskByIdQuery(id);
    return {
      title: query.data?.taskName?.trim() || hint?.title || null,
      unavailable: isTaskMissing(query.error),
    };
  },
  href: (record, locator, variant) =>
    record.family === "resource" ? resourceHref({ ref: record.ref, locator }, variant) : null,
  body: () => import("./body").then((mod) => ({ default: mod.TaskTabBody })),
};
