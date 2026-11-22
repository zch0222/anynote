import type { ResourceType } from "@/lib/ai/resource-target";

/**
 * 资源类型的中文名，标题取不到时作为兜底。
 *
 * 只被懒加载的宿主与正文引用，避免进入对话页首屏。
 *
 * @author 称霸幼儿园
 */
export const RESOURCE_TYPE_LABEL: Record<ResourceType, string> = {
  kb: "知识库",
  note: "笔记",
  doc: "资料",
  mooc: "慕课",
  mooc_item: "慕课条目",
  task: "任务",
};
