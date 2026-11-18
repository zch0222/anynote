import type { AiRunEvent } from "./sse";

/**
 * Agent 运行过程区状态与事件归并（纯函数，供组件渲染）。
 *
 * @author 称霸幼儿园
 */

export type ProcessTarget = { label: string; resolved: boolean };

export type ProcessResultItem = {
  ref?: string;
  title?: string;
  kbName?: string;
  locator?: Record<string, unknown>;
};

export type ProcessResult = { count: number; items: ProcessResultItem[] };

export type ProcessItem =
  | {
      type: "reasoning";
      blockId: string;
      text: string;
      status: "streaming" | "done" | "interrupted";
      durationMs?: number | undefined;
    }
  | {
      type: "tool";
      callId: string;
      name: string;
      target?: ProcessTarget | null | undefined;
      status: string;
      durationMs?: number | undefined;
      result?: ProcessResult | undefined;
    }
  | { type: "note"; text: string }
  | { type: "retry" };

export type ProcessState = {
  /** 是否开始累积（收到首个过程事件后置 true）。 */
  active: boolean;
  items: ProcessItem[];
};

export const EMPTY_PROCESS: ProcessState = { active: false, items: [] };

/** 工具行的动作文案（沿用已确认的七条说明）。 */
const TOOL_ACTION: Record<string, string> = {
  kb_list: "列出可访问的知识库",
  kb_outline: "查看目录",
  kb_search: "检索知识库",
  kb_grep: "在原文中查找",
  kb_read: "阅读原文",
  kb_query: "查询知识库清单",
  kb_related: "查找关联内容",
};

/** 运行中的结果摘要格式（已确认文案；工具完成后展示）。 */
const RESULT_SUMMARY: Record<string, (count: number) => string> = {
  kb_list: (n) => `${n} 个知识库`,
  kb_outline: (n) => `${n} 个节点`,
  kb_search: (n) => `命中 ${n} 条`,
  kb_grep: (n) => `命中 ${n} 处`,
  kb_read: (n) => `读取 ${n} 字`,
  kb_query: (n) => `${n} 行`,
  kb_related: (n) => `${n} 个关联条目`,
};

/**
 * 归并一条运行事件到过程状态。
 *
 * @param state 当前过程状态
 * @param event 运行事件
 * @returns 新过程状态
 */
export function applyRunEvent(state: ProcessState, event: AiRunEvent): ProcessState {
  if (!isProcessEvent(event)) {
    return state;
  }
  const items = [...state.items];
  switch (event.type) {
    case "reasoning.delta": {
      const blockId = readString(event.data.blockId) ?? "";
      const delta = readString(event.data.delta) ?? "";
      const index = findReasoningIndex(items, blockId);
      if (index < 0) {
        items.push({
          type: "reasoning",
          blockId,
          text: delta,
          status: "streaming",
        });
      } else {
        const current = items[index];
        if (current?.type === "reasoning") {
          items[index] = { ...current, text: current.text + delta };
        }
      }
      return { active: true, items };
    }
    case "reasoning.finished": {
      const blockId = readString(event.data.blockId) ?? "";
      const index = findReasoningIndex(items, blockId);
      const current = index >= 0 ? items[index] : undefined;
      if (current?.type === "reasoning") {
        const finished: Extract<ProcessItem, { type: "reasoning" }> = {
          type: "reasoning",
          blockId: current.blockId,
          text: current.text,
          status: readString(event.data.status) === "interrupted" ? "interrupted" : "done",
          durationMs: readNumber(event.data.durationMs),
        };
        items[index] = finished;
      }
      return { active: true, items };
    }
    case "step.note": {
      const text = readString(event.data.text);
      if (text) {
        items.push({ type: "note", text });
      }
      return { active: true, items };
    }
    case "model.retry":
      items.push({ type: "retry" });
      return { active: true, items };
    case "tool.started": {
      const callId = readString(event.data.callId) ?? "";
      const index = findToolIndex(items, callId);
      const existing = index >= 0 ? items[index] : undefined;
      const next: Extract<ProcessItem, { type: "tool" }> =
        existing?.type === "tool"
          ? { ...existing }
          : {
              type: "tool",
              callId,
              name: readString(event.data.name) ?? "",
              status: "running",
            };
      next.target = readTarget(event.data.target);
      if (existing?.type === "tool") {
        items[index] = next;
      } else {
        items.push(next);
      }
      return { active: true, items };
    }
    case "tool.finished": {
      const callId = readString(event.data.callId) ?? "";
      const index = findToolIndex(items, callId);
      const existing = index >= 0 ? items[index] : undefined;
      const next: Extract<ProcessItem, { type: "tool" }> =
        existing?.type === "tool"
          ? { ...existing }
          : {
              type: "tool",
              callId,
              name: readString(event.data.name) ?? "",
              status: "running",
            };
      next.status = readString(event.data.status) ?? "SUCCESS";
      next.durationMs = readNumber(event.data.durationMs);
      next.target = readTarget(event.data.target);
      next.result = readResult(event.data.result);
      if (existing?.type === "tool") {
        items[index] = next;
      } else {
        items.push(next);
      }
      return { active: true, items };
    }
    default:
      return state;
  }
}

/**
 * 判断事件是否属于过程区。
 *
 * @param event 运行事件
 * @returns 过程区是否消费该事件
 */
export function isProcessEvent(event: AiRunEvent): boolean {
  return [
    "reasoning.delta",
    "reasoning.finished",
    "step.note",
    "model.retry",
    "tool.started",
    "tool.finished",
  ].includes(event.type);
}

/**
 * 返回工具行的动作文案。
 *
 * @param name 工具名
 * @returns 已确认的动作文案，未知工具回退为工具名
 */
export function toolAction(name: string): string {
  return TOOL_ACTION[name] ?? name;
}

/**
 * 返回工具行的结果摘要文案。
 *
 * @param name 工具名
 * @param result 结果摘要
 * @returns 摘要文案，无结果时为空
 */
export function toolResultSummary(name: string, result: ProcessResult | undefined): string | null {
  if (!result) {
    return null;
  }
  const format = RESULT_SUMMARY[name];
  return format ? format(result.count) : null;
}

/**
 * 统计活动摘要（完成后收起行尾部）。
 *
 * @param items 过程行
 * @returns 已确认动词的活动摘要，如「检索 1 次、阅读 2 篇」
 */
export function activitySummary(items: ProcessItem[]): string | null {
  const counts = { search: 0, read: 0, grep: 0 };
  for (const item of items) {
    if (item.type !== "tool") {
      continue;
    }
    if (item.name === "kb_search") counts.search += 1;
    if (item.name === "kb_read") counts.read += 1;
    if (item.name === "kb_grep") counts.grep += 1;
  }
  const parts: string[] = [];
  if (counts.search > 0) parts.push(`检索 ${counts.search} 次`);
  if (counts.read > 0) parts.push(`阅读 ${counts.read} 篇`);
  if (counts.grep > 0) parts.push(`查找 ${counts.grep} 次`);
  return parts.length > 0 ? parts.join("、") : null;
}

function findReasoningIndex(items: ProcessItem[], blockId: string): number {
  return items.findIndex((item) => item.type === "reasoning" && item.blockId === blockId);
}

function findToolIndex(items: ProcessItem[], callId: string): number {
  return items.findIndex((item) => item.type === "tool" && item.callId === callId);
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function readNumber(value: unknown): number | undefined {
  return typeof value === "number" ? value : undefined;
}

function readTarget(value: unknown): ProcessTarget | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }
  const label = readString((value as Record<string, unknown>).label);
  return label ? { label, resolved: (value as Record<string, unknown>).resolved === true } : null;
}

function readResult(value: unknown): ProcessResult | undefined {
  if (typeof value !== "object" || value === null) {
    return undefined;
  }
  const record = value as Record<string, unknown>;
  const count = readNumber(record.count) ?? 0;
  const items = Array.isArray(record.items)
    ? record.items.filter(
        (entry): entry is ProcessResultItem => typeof entry === "object" && entry !== null,
      )
    : [];
  return { count, items };
}
