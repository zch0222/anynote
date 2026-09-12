import { TiptapEditorImpl } from "@/components/editor/core/tiptap-editor";
import {
  CODE_TOKEN_CLASS,
  buildShikiDecorations,
} from "@/components/editor/extensions/code-block-shiki";
import { prepareHighlight, resetHighlighterForTest } from "@/lib/editor/shiki";
import { render, waitFor } from "@testing-library/react";
import type { Editor } from "@tiptap/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

const TS_BLOCK = "```ts\nconst answer = 42;\n```";

async function renderEditor(value: string) {
  const ready = vi.fn();
  const rendered = render(<TiptapEditorImpl preset="full" value={value} onReady={ready} />);
  await waitFor(() => expect(ready).toHaveBeenCalled());
  return { ...rendered, editor: ready.mock.calls[0]?.[0] as Editor };
}

describe("CodeBlockShiki：高亮以装饰形式贴在正文上", () => {
  beforeAll(async () => {
    // 分词是同步的，语法必须先加载好；组件里由插件的 view 负责，测试里手动准备
    await prepareHighlight("typescript");
  });

  afterEach(() => {
    resetHighlighterForTest();
  });

  it("代码块文本被装饰成带主题变量的片段，位置落在块内", async () => {
    const { editor } = await renderEditor(TS_BLOCK);
    const { decorations, pending } = buildShikiDecorations(editor.state.doc, "codeBlock");

    expect(pending).toEqual([]);
    const found = decorations.find();
    expect(found.length).toBeGreaterThan(0);

    // 代码块节点的内容范围：块起点+1 ~ 块终点-1
    let blockFrom = -1;
    let blockTo = -1;
    editor.state.doc.descendants((node, pos) => {
      if (node.type.name === "codeBlock") {
        blockFrom = pos + 1;
        blockTo = pos + node.nodeSize - 1;
      }
      return true;
    });
    expect(blockFrom).toBeGreaterThan(0);
    for (const decoration of found) {
      expect(decoration.from).toBeGreaterThanOrEqual(blockFrom);
      expect(decoration.to).toBeLessThanOrEqual(blockTo);
    }
  });

  it("语法未就绪时不产出装饰，而是报告待加载的语言", async () => {
    const { editor } = await renderEditor(TS_BLOCK);
    resetHighlighterForTest();

    const { decorations, pending } = buildShikiDecorations(editor.state.doc, "codeBlock");
    expect(decorations.find()).toHaveLength(0);
    expect(pending).toEqual(["ts"]);
  });

  it("没有代码块的文档不产出任何装饰", async () => {
    const { editor } = await renderEditor("普通段落");
    const { decorations, pending } = buildShikiDecorations(editor.state.doc, "codeBlock");
    expect(decorations.find()).toHaveLength(0);
    expect(pending).toEqual([]);
  });

  it("渲染出的代码块是单层可见文本，不再叠加透明高亮层", async () => {
    const { container } = await renderEditor(TS_BLOCK);

    await waitFor(() =>
      expect(container.querySelectorAll(`.${CODE_TOKEN_CLASS}`).length).toBeGreaterThan(0),
    );

    const token = container.querySelector(`.${CODE_TOKEN_CLASS}`) as HTMLElement;
    // 颜色以 CSS 变量给出，明暗主题由样式表决定
    expect(token.getAttribute("style")).toContain("--shiki-light");

    // 旧实现的绝对定位高亮层已移除：正文只有一份，不存在对不齐的可能
    expect(container.querySelector(".anynote-code-block__preview")).toBeNull();
    expect(container.querySelector(".anynote-code-block__body")).toBeNull();
    expect(container.querySelector("pre.anynote-code-block__editor")?.textContent).toContain(
      "const answer = 42;",
    );
  });

  it("只读编辑器不渲染语言下拉框", async () => {
    const ready = vi.fn();
    const { container } = render(
      <TiptapEditorImpl preset="readonly" value={TS_BLOCK} editable={false} onReady={ready} />,
    );
    await waitFor(() => expect(ready).toHaveBeenCalled());

    expect(container.querySelector(".anynote-code-block")).not.toBeNull();
    expect(container.querySelector(".anynote-code-block__language")).toBeNull();
  });
});
