import type { ProcessResultItem } from "./process";

/**
 * 侧栏资源模型：引用与工具结果统一解析成资源标识、定位与完整页面地址。
 *
 * @author 称霸幼儿园
 */

export type ResourceType = "kb" | "note" | "doc" | "mooc" | "mooc_item" | "task";

export type ResourceVariant = "desktop" | "mobile";

/** 资源身份：决定去重与持久化，只含标识。 */
export type ResourceRef =
  | { type: "kb"; id: number }
  | { type: "note" | "mooc" | "task"; id: number; kbId: number }
  | { type: "doc"; id: number; kbId: number | null }
  | { type: "mooc_item"; id: number; kbId: number; moocId: number };

/** 定位：只随一次导航传递，不参与去重，不持久化。 */
export type ResourceLocator = {
  section?: string;
  line?: number;
  page?: number;
  seconds?: number;
  subtype?: "transcript" | "summary";
};

/** 打开资源时随手带上的标题与知识库名，只在数据到达前用于显示。 */
export type ResourceHint = { title?: string; kbName?: string };

export type ResourceTarget = {
  ref: ResourceRef;
  locator: ResourceLocator;
  hint?: ResourceHint;
};

/** 引用与工具结果共用的最小输入。 */
export type CitationLike = {
  sourceId: string;
  kbId?: number | null | undefined;
  locator?: Record<string, unknown> | null | undefined;
  title?: string | null | undefined;
  kbName?: string | null | undefined;
};

const SOURCE_ID_PATTERN =
  /^(kb|note|doc|mooc|mooc_item|task):([1-9]\d*)(?:#(transcript|summary))?$/;

/**
 * 解析非负数值定位参数，正整数参数另行校验。
 *
 * @param value 不可信定位值
 * @returns 有限的非负数，否则为空
 */
export function locatorNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}

/**
 * 从引用或工具结果解析资源目标。
 *
 * @param citation 引用或工具结果条目
 * @returns 资源目标，来源标识不合法或缺少必需字段时为空
 */
export function targetFromCitation(citation: CitationLike): ResourceTarget | null {
  const match = SOURCE_ID_PATTERN.exec(citation.sourceId);
  if (!match) return null;
  const id = Number(match[2]);
  if (!Number.isSafeInteger(id)) return null;
  const type = match[1] as ResourceType;
  const subtype = match[3] as ResourceLocator["subtype"];
  const kbId = positiveId(citation.kbId);
  const locator = citation.locator ?? {};
  const hint = readHint(citation.title, citation.kbName);

  if (type === "kb") {
    return withHint({ ref: { type, id }, locator: {} }, hint);
  }
  if (type === "doc") {
    const page = locatorNumber(locator.pageStart ?? locator.pageNo);
    return withHint(
      {
        ref: { type, id, kbId },
        locator: page && Number.isSafeInteger(page) ? { page } : {},
      },
      hint,
    );
  }
  if (!kbId) return null;
  if (type === "note") {
    const section = locator.sectionPath ?? locator.heading;
    const line = locatorNumber(locator.startLine ?? locator.line);
    const normalized: ResourceLocator = {};
    if (typeof section === "string" && section.trim()) normalized.section = section;
    if (line && Number.isSafeInteger(line)) normalized.line = line;
    return withHint({ ref: { type, id, kbId }, locator: normalized }, hint);
  }
  if (type === "mooc_item") {
    const moocId = locatorNumber(locator.moocId);
    if (!moocId || !Number.isSafeInteger(moocId)) return null;
    const time = locatorNumber(locator.startTimeMs);
    const normalized: ResourceLocator = {};
    if (time != null) normalized.seconds = time / 1000;
    if (subtype) normalized.subtype = subtype;
    return withHint({ ref: { type, id, kbId, moocId }, locator: normalized }, hint);
  }
  return withHint({ ref: { type, id, kbId }, locator: {} }, hint);
}

/**
 * 从过程区工具结果条目解析资源目标。
 *
 * @param entry 工具结果条目
 * @returns 资源目标，没有可用来源标识时为空
 */
export function targetFromToolItem(entry: ProcessResultItem): ResourceTarget | null {
  if (!entry.ref) return null;
  return targetFromCitation({
    sourceId: entry.ref,
    kbId: entry.kbId ?? null,
    locator: entry.locator ?? null,
    title: entry.title ?? null,
    kbName: entry.kbName ?? null,
  });
}

/**
 * 资源身份：同一资源的不同定位与子类型得到同一个键。
 *
 * @param ref 资源标识
 * @returns 形如 `note:12` 的稳定键
 */
export function resourceKey(ref: ResourceRef): string {
  return `${ref.type}:${ref.id}`;
}

/**
 * 生成资源的完整页面地址。
 *
 * @param target 资源目标
 * @param variant 桌面或移动端
 * @returns 站内地址，缺少必需标识时为空
 */
export function resourceHref(target: ResourceTarget, variant: ResourceVariant): string | null {
  const { ref, locator } = target;
  const prefix = variant === "mobile" ? "/m" : "";
  const params = new URLSearchParams();

  if (ref.type === "doc") {
    const path = variant === "mobile" ? `/m/ai/pdf/${ref.id}` : "/ai/pdf";
    if (variant === "desktop") {
      if (ref.kbId && ref.kbId > 0) params.set("baseId", String(ref.kbId));
      params.set("docId", String(ref.id));
    }
    if (locator.page && Number.isSafeInteger(locator.page)) {
      params.set("page", String(locator.page));
    }
    return params.size ? `${path}?${params}` : path;
  }

  if (ref.type === "kb") {
    return `${prefix}/notes/${ref.id}${variant === "desktop" ? "/overview" : ""}`;
  }

  const base = ref.kbId;
  if (base == null || base <= 0) return null;
  let path: string;
  if (ref.type === "note") {
    path = `${prefix}/notes/${base}/${ref.id}`;
    if (locator.section?.trim()) params.set("section", locator.section);
    if (locator.line && Number.isSafeInteger(locator.line)) {
      params.set("line", String(locator.line));
    }
  } else if (ref.type === "mooc_item") {
    if (!Number.isSafeInteger(ref.moocId) || ref.moocId <= 0) return null;
    path = `${prefix}/notes/${base}/mooc/${ref.moocId}`;
    params.set("itemId", String(ref.id));
    if (locator.seconds != null) params.set("t", String(locator.seconds));
  } else if (ref.type === "mooc") {
    path = `${prefix}/notes/${base}/mooc/${ref.id}`;
  } else {
    path = `${prefix}/notes/${base}/tasks/${ref.id}`;
  }
  return params.size ? `${path}?${params}` : path;
}

function positiveId(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? value : null;
}

function readHint(title: string | null | undefined, kbName: string | null | undefined) {
  const hint: ResourceHint = {};
  if (typeof title === "string" && title.trim()) hint.title = title;
  if (typeof kbName === "string" && kbName.trim()) hint.kbName = kbName;
  return Object.keys(hint).length > 0 ? hint : null;
}

function withHint(target: ResourceTarget, hint: ResourceHint | null): ResourceTarget {
  return hint ? { ...target, hint } : target;
}
