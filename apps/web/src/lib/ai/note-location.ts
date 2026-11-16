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

/** 根据引用参数滚动到笔记小节；没有可用定位时保持来源首页。 */
export function scrollToNoteCitation(editor: Editor, search: string, markdown: string): boolean {
  const params = new URLSearchParams(search);
  let section = params.get("section");
  const line = Number(params.get("line"));
  if (!section && Number.isSafeInteger(line) && line > 0) {
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
