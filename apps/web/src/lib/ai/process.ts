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
  kbId?: number;
  locator?: Record<string, unknown>;
};

export type ProcessResult = { count: number; items: ProcessResultItem[] };

/** 过程行：type 与 id 一起标识一行。 */
export type ProcessItem =
  | {
      type: "reasoning";
      id: string;
      text: string;
      status: "streaming" | "done" | "interrupted";
      durationMs?: number | undefined;
    }
  | {
      type: "tool";
      id: string;
      name: string;
      target?: ProcessTarget | null | undefined;
      status: string;
      durationMs?: number | undefined;
      result?: ProcessResult | undefined;
    }
  | { type: "note"; id: string; text: string }
  | { type: "retry"; id: string };

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
      const id = readString(event.data.id) ?? "";
      const delta = readString(event.data.delta) ?? "";
      const index = findItemIndex(items, "reasoning", id);
      if (index < 0) {
        items.push({
          type: "reasoning",
          id,
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
      const id = readString(event.data.id) ?? "";
      const index = findItemIndex(items, "reasoning", id);
      const current = index >= 0 ? items[index] : undefined;
      if (current?.type === "reasoning") {
        const finished: Extract<ProcessItem, { type: "reasoning" }> = {
          type: "reasoning",
          id: current.id,
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
        items.push({ type: "note", id: readString(event.data.id) ?? "", text });
      }
      return { active: true, items };
    }
    case "model.retry":
      items.push({ type: "retry", id: readString(event.data.id) ?? "" });
      return { active: true, items };
    case "tool.started": {
      const id = readString(event.data.id) ?? "";
      const index = findItemIndex(items, "tool", id);
      const existing = index >= 0 ? items[index] : undefined;
      const next: Extract<ProcessItem, { type: "tool" }> =
        existing?.type === "tool"
          ? { ...existing }
          : {
              type: "tool",
              id,
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
      const id = readString(event.data.id) ?? "";
      const index = findItemIndex(items, "tool", id);
      const existing = index >= 0 ? items[index] : undefined;
      const next: Extract<ProcessItem, { type: "tool" }> =
        existing?.type === "tool"
          ? { ...existing }
          : {
              type: "tool",
              id,
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
 * 把毫秒数格式化为保留一位小数的秒数文案。
 *
 * @param ms 毫秒数
 * @returns 如「0.8 秒」
 */
export function formatSeconds(ms: number): string {
  return `${(Math.max(0, ms) / 1000).toFixed(1)} 秒`;
}

/**
 * 生成完成后整轮控件的文案：总用时、首字时间、工具调用次数与活动摘要，用「 · 」连接。
 *
 * @param durationMs 运行总耗时（毫秒）
 * @param firstOutputMs 首字时间（毫秒），没有时不显示
 * @param toolCalls 工具调用次数，没有时不显示
 * @param items 过程行
 * @returns 如「已完成，用时 18 秒 · 首字 1.2 秒 · 工具调用 3 次 · 检索 1 次、阅读 1 篇」
 */
export function completedHead(
  durationMs: number | undefined,
  firstOutputMs: number | undefined,
  toolCalls: number | undefined,
  items: ProcessItem[],
): string {
  const parts = [`已完成，用时 ${Math.round((durationMs ?? 0) / 1000)} 秒`];
  if (typeof firstOutputMs === "number") parts.push(`首字 ${formatSeconds(firstOutputMs)}`);
  if (typeof toolCalls === "number") parts.push(`工具调用 ${toolCalls} 次`);
  const activity = activitySummary(items);
  if (activity) parts.push(activity);
  return parts.join(" · ");
}

/**
 * 生成工具行尾部文案：失败标识或结果摘要，加耗时，用「 · 」连接，没有内容时为空。
 *
 * @param item 工具行
 * @returns 尾部文案
 */
export function toolTrailing(item: Extract<ProcessItem, { type: "tool" }>): string | null {
  const parts: string[] = [];
  if (item.status === "FAILED") {
    parts.push("失败");
  } else {
    const summary = toolResultSummary(item.name, item.result);
    if (summary) parts.push(summary);
  }
  if (typeof item.durationMs === "number") parts.push(formatSeconds(item.durationMs));
  return parts.length > 0 ? parts.join(" · ") : null;
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

function findItemIndex(items: ProcessItem[], type: ProcessItem["type"], id: string): number {
  return items.findIndex((item) => item.type === type && item.id === id);
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
  return { count, items: readResultItems(record.items) };
}

/**
 * 读取工具结果条目，只保留已登记的字段。
 *
 * @param value 不可信的结果条目数组
 * @returns 结果条目
 */
export function readResultItems(value: unknown): ProcessResultItem[] {
  if (!Array.isArray(value)) return [];
  const items: ProcessResultItem[] = [];
  for (const entry of value) {
    if (typeof entry !== "object" || entry === null) continue;
    const record = entry as Record<string, unknown>;
    const item: ProcessResultItem = {};
    if (typeof record.ref === "string") item.ref = record.ref;
    if (typeof record.title === "string") item.title = record.title;
    if (typeof record.kbName === "string") item.kbName = record.kbName;
    if (typeof record.kbId === "number") item.kbId = record.kbId;
    if (typeof record.locator === "object" && record.locator !== null) {
      item.locator = record.locator as Record<string, unknown>;
    }
    items.push(item);
  }
  return items;
}
