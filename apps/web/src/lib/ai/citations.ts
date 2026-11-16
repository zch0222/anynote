import { z } from "zod";

/**
 * 引用来源与结构化定位。
 *
 * @author 称霸幼儿园
 */
export const citationSchema = z.object({
  index: z.number().int().positive(),
  sourceType: z.string(),
  sourceId: z.string(),
  evidenceId: z.string().nullish(),
  title: z.string().nullish(),
  kbId: z.number().int().nonnegative().nullish(),
  kbName: z.string().nullish(),
  locator: z.record(z.string(), z.unknown()).nullish(),
  snippet: z.string().nullish(),
  stale: z.boolean().nullish(),
  authority: z.string().nullish(),
});
export type Citation = z.infer<typeof citationSchema>;
export type CitationVariant = "desktop" | "mobile";

/** 将不可信引用数组转换为已校验、去重且按编号排序的引用。 */
export function parseCitations(value: unknown): Citation[] {
  if (!Array.isArray(value)) return [];
  const items = new Map<number, Citation>();
  for (const raw of value) {
    const result = citationSchema.safeParse(raw);
    if (result.success) items.set(result.data.index, result.data);
  }
  return [...items.values()].sort((a, b) => a.index - b.index);
}

/** 解析非负数值定位参数，正整数参数另行校验。 */
export function locatorNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}

/** 解析 URL 中的正整数标识或页码。 */
export function positiveParam(raw: string | null | undefined): number | null {
  if (!raw || !/^\d+$/.test(raw)) return null;
  const value = Number(raw);
  return Number.isSafeInteger(value) && value > 0 ? value : null;
}

/** 按客户端路由生成引用链接；无可用来源时返回空值。
 * @param citation 已校验引用
 * @param variant 桌面或移动端
 * @return 站内来源链接
 */
export function citationHref(citation: Citation, variant: CitationVariant): string | null {
  const match = /^(kb|note|doc|mooc|mooc_item|task):([1-9]\d*)(?:#(transcript|summary))?$/.exec(
    citation.sourceId,
  );
  if (!match || !Number.isSafeInteger(Number(match[2]))) return null;
  const [, kind, id] = match;
  const base = citation.kbId;
  const prefix = variant === "mobile" ? "/m" : "";
  const locator = citation.locator ?? {};
  const params = new URLSearchParams();
  let path: string;
  if (kind === "doc") {
    path = variant === "mobile" ? `/m/ai/pdf/${id}` : "/ai/pdf";
    if (variant === "desktop") {
      if (base && base > 0) params.set("baseId", String(base));
      params.set("docId", id ?? "");
    }
    const page = locatorNumber(locator.pageStart ?? locator.pageNo);
    if (page && Number.isSafeInteger(page)) params.set("page", String(page));
  } else {
    if (kind === "kb") return `${prefix}/notes/${id}${variant === "desktop" ? "/overview" : ""}`;
    if (base == null || base <= 0) return null;
    if (kind === "note") {
      path = `${prefix}/notes/${base}/${id}`;
      const section = locator.sectionPath ?? locator.heading;
      if (typeof section === "string" && section.trim()) params.set("section", section);
      const line = locatorNumber(locator.startLine ?? locator.line);
      if (line && Number.isSafeInteger(line)) params.set("line", String(line));
    } else if (kind === "mooc_item") {
      const mooc = locatorNumber(locator.moocId);
      if (!mooc || !Number.isSafeInteger(mooc)) return null;
      path = `${prefix}/notes/${base}/mooc/${mooc}`;
      params.set("itemId", id ?? "");
      const time = locatorNumber(locator.startTimeMs);
      if (time != null) params.set("t", String(time / 1000));
    } else {
      path = `${prefix}/notes/${base}/${kind === "mooc" ? "mooc" : "tasks"}/${id}`;
    }
  }
  return params.size ? `${path}?${params}` : path;
}

/** 返回引用的页码、小节或时间说明。 */
export function citationLabel(citation: Citation): string {
  const locator = citation.locator ?? {};
  const page = locatorNumber(locator.pageStart ?? locator.pageNo);
  if (page && Number.isSafeInteger(page)) return `第 ${page} 页`;
  const section = locator.sectionPath ?? locator.heading;
  if (typeof section === "string") return section;
  const ms = locatorNumber(locator.startTimeMs);
  if (ms != null) {
    const seconds = Math.floor(ms / 1000);
    return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
  }
  return "";
}
