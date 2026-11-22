import type { Editor } from "@tiptap/core";
import type { Node } from "@tiptap/pm/model";

/**
 * 查找笔记标题路径对应的位置，重名标题按完整路径区分。
 *
 * @author 称霸幼儿园
 */
export function findSectionPosition(doc: Node, section: string): number | null {
  const headings: Array<{ level: number; title: string }> = [];
  let result: number | null = null;
  doc.descendants((node, position) => {
    if (result !== null || node.type.name !== "heading") return;
    const level = Number(node.attrs.level);
    while (headings.length && (headings.at(-1)?.level ?? 0) >= level) headings.pop();
    headings.push({ level, title: node.textContent });
    const path = headings.map((heading) => heading.title).join(" / ");
    if (path === section || (!section.includes(" / ") && node.textContent === section))
      result = position;
  });
  return result;
}

export type NoteCitationLocate = { section?: string | undefined; line?: number | undefined };

/**
 * 从地址参数解析笔记定位。
 *
 * @param search 地址中的查询串
 * @returns 小节或行号，均缺失时为空
 */
export function locateFromSearch(search: string): NoteCitationLocate | null {
  const params = new URLSearchParams(search);
  const section = params.get("section") ?? undefined;
  const line = Number(params.get("line"));
  const positiveLine = Number.isSafeInteger(line) && line > 0 ? line : undefined;
  if (!section && positiveLine === undefined) return null;
  return { section, line: positiveLine };
}

/**
 * 判断服务端更新时间是否比本地版本新。
 *
 * @param next 服务端更新时间
 * @param current 本地版本更新时间
 * @returns 两端都可解析且服务端更新时为真
 */
export function isNewerUpdateTime(
  next: string | null | undefined,
  current: string | null | undefined,
): boolean {
  const nextTime = next ? Date.parse(next) : Number.NaN;
  const currentTime = current ? Date.parse(current) : Number.NaN;
  return Number.isFinite(nextTime) && Number.isFinite(currentTime) && nextTime > currentTime;
}

/** 根据定位参数滚动到笔记小节；没有可用定位时保持来源首页。 */
export function scrollToNoteCitation(
  editor: Editor,
  locate: NoteCitationLocate,
  markdown: string,
): boolean {
  let section = locate.section;
  const line = locate.line;
  if (!section && typeof line === "number" && Number.isSafeInteger(line) && line > 0) {
    const stack: Array<{ level: number; title: string }> = [];
    let fence = false;
    for (const text of markdown.split("\n").slice(0, line)) {
      if (/^\s*(```|~~~)/.test(text)) fence = !fence;
      const heading = !fence ? /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(text) : null;
      if (!heading) continue;
      const level = heading[1]?.length ?? 1;
      while (stack.length && (stack.at(-1)?.level ?? 0) >= level) stack.pop();
      stack.push({ level, title: heading[2] ?? "" });
    }
    section = stack.map((item) => item.title).join(" / ");
  }
  if (!section) return false;
  const position = findSectionPosition(editor.state.doc, section);
  if (position === null) return false;
  const target = editor.view.nodeDOM(position);
  if (!(target instanceof HTMLElement)) return false;
  target.scrollIntoView({ block: "center" });
  return true;
}
