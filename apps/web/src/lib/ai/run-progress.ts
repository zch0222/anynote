import type { AiRunEvent } from "./sse";

const TOOL_PROGRESS: Record<string, string> = {
  kb_list: "列出可访问的知识库",
  kb_outline: "查看目录",
  kb_search: "检索知识库",
  kb_grep: "在原文中查找",
  kb_read: "阅读原文",
  kb_query: "查询知识库清单",
  kb_related: "查找关联内容",
};

/**
 * 将运行事件映射为已确认的进度文案。
 *
 * @author 称霸幼儿园
 */
export function runProgress(event: AiRunEvent): string | null {
  if (event.type === "tool.started") {
    return typeof event.data.name === "string" ? (TOOL_PROGRESS[event.data.name] ?? null) : null;
  }
  if (event.type === "tool.finished" || event.type === "text.delta") return "正在生成回答";
  if (event.type === "state") {
    if (event.data.state === "ACTING") return "正在搜索";
    if (event.data.state === "VERIFYING" || event.data.state === "RUNNING") return "正在生成回答";
  }
  return null;
}
