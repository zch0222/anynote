import { loadKatex } from "@/lib/editor/katex";
import { CoreBlockMath, CoreInlineMath } from "@anynote/editor-core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import type { NodeView } from "@tiptap/pm/view";

/**
 * 数学公式的界面层：在 `@anynote/editor-core` 的定义上叠加 KaTeX 节点视图。
 *
 * KaTeX 通过 `loadKatex()` 动态加载，拆成独立的懒加载 chunk，不进入编辑器主 chunk。
 */

/** 用 KaTeX 渲染到容器里；加载失败或不合法公式时降级为纯文本，不抛异常。 */
function renderMath(element: HTMLElement, latex: string, displayMode: boolean): void {
  element.textContent = latex;
  loadKatex()
    .then((katex) => {
      katex.render(latex, element, { displayMode, throwOnError: false });
    })
    .catch((error: unknown) => {
      console.error("KaTeX 加载失败，公式降级为纯文本", error);
    });
}

function mathNodeView(tag: "span" | "div", displayMode: boolean) {
  return ({ node }: { node: ProseMirrorNode }): NodeView => {
    const dom = document.createElement(tag);
    dom.className = displayMode ? "anynote-math-block" : "anynote-math-inline";
    dom.dataset.type = displayMode ? "block-math" : "inline-math";
    dom.setAttribute("data-latex", String(node.attrs.latex ?? ""));
    renderMath(dom, String(node.attrs.latex ?? ""), displayMode);
    return {
      dom,
      ignoreMutation: () => true,
      update: (updated) => {
        if (updated.type.name !== node.type.name) {
          return false;
        }
        dom.setAttribute("data-latex", String(updated.attrs.latex ?? ""));
        renderMath(dom, String(updated.attrs.latex ?? ""), displayMode);
        return true;
      },
    };
  };
}

export const AnynoteInlineMath = CoreInlineMath.extend({
  addNodeView() {
    return mathNodeView("span", false);
  },
});

export const AnynoteBlockMath = CoreBlockMath.extend({
  addNodeView() {
    return mathNodeView("div", true);
  },
});
