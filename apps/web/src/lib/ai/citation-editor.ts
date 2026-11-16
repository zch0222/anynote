import type { Editor } from "@tiptap/core";
import { type Citation, type CitationVariant, citationHref } from "./citations";

/** 为回答中普通文本的引用编号添加站内链接，跳过代码和现有链接。
 * @param editor 只读回答编辑器
 * @param citations 已校验引用
 * @param variant 客户端路由类型
 * @author 称霸幼儿园
 */
export function linkCitationReferences(
  editor: Editor,
  citations: Citation[],
  variant: CitationVariant,
): void {
  const links = new Map(citations.map((item) => [item.index, citationHref(item, variant)]));
  const mark = editor.schema.marks.link;
  if (!mark) return;
  const transaction = editor.state.tr;
  editor.state.doc.descendants((node, position, parent) => {
    if (node.type.name === "codeBlock") return false;
    if (
      !node.isText ||
      !node.text ||
      parent?.type.name === "codeBlock" ||
      node.marks.some((item) => item.type.name === "code" || item.type.name === "link")
    )
      return;
    for (const match of node.text.matchAll(/\[(\d+)\]/g)) {
      const href = links.get(Number(match[1]));
      if (!href) continue;
      transaction.addMark(
        position + match.index,
        position + match.index + match[0].length,
        mark.create({ href, target: "_self" }),
      );
    }
  });
  if (transaction.docChanged) editor.view.dispatch(transaction);
}
