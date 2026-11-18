import type { Editor } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { type Citation, type CitationVariant, citationHref } from "./citations";

/**
 * 将解析出的引用节点转为站内链接，并按回答标注隐藏无效编号。
 *
 * @param editor AI 回答编辑器
 * @param citations 已校验引用
 * @param variant 客户端路由类型
 * @param citationsRemoved 是否带有无效引用移除标注
 * @author 称霸幼儿园
 */
export function applyCitationReferences(
  editor: Editor,
  citations: Citation[],
  variant: CitationVariant,
  citationsRemoved: boolean,
): void {
  const links = new Map(citations.map((item) => [item.index, citationHref(item, variant)]));
  const mark = editor.schema.marks.link;
  if (!mark) return;

  const matches: Array<{ position: number; node: ProseMirrorNode }> = [];
  editor.state.doc.descendants((node, position) => {
    if (node.type.name === "aiCitation") matches.push({ position, node });
  });
  const transaction = editor.state.tr;
  for (const { position, node } of matches.sort((left, right) => right.position - left.position)) {
    const index = Number(node.attrs.index);
    const href = links.get(index);
    if (href) {
      transaction.replaceWith(
        position,
        position + node.nodeSize,
        editor.schema.text(`[${index}]`, [mark.create({ href, target: "_self" })]),
      );
    } else if (citationsRemoved && !links.has(index)) {
      transaction.delete(position, position + node.nodeSize);
    }
  }
  if (transaction.docChanged) editor.view.dispatch(transaction);
}
