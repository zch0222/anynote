import { presets } from "@/components/editor/presets";
import type { CollaborationBinding } from "@/components/editor/presets/types";
import { Editor } from "@tiptap/core";
import { describe, expect, it } from "vitest";
import { Awareness } from "y-protocols/awareness";
import * as Y from "yjs";

type Extensions = ReturnType<(typeof presets)["full"]>;

function names(extensions: Extensions) {
  return extensions.map((extension) => extension.name);
}

function find(extensions: Extensions, name: string) {
  return extensions.find((extension) => extension.name === name);
}

/**
 * CollaborationCaret 内部会直接读  并把它交给 yCursorPlugin，
 * 桩对象撑不住，这里用真的 Awareness（provider 的其余部分用不到）。
 */
function binding(doc = new Y.Doc()): CollaborationBinding {
  return {
    doc,
    provider: { awareness: new Awareness(doc) },
    user: { name: "小明", color: "#2563eb" },
  };
}

describe("collaborative 预设", () => {
  it("在 full 的基础上加上 Collaboration 与光标扩展", () => {
    const extensions = names(presets.collaborative({ collaboration: binding() }));

    expect(extensions).toContain("collaboration");
    expect(extensions).toContain("collaborationCaret");
    // full 的富文本能力必须全部保留
    for (const required of [
      "table",
      "taskList",
      "codeBlock",
      "image",
      "slashCommand",
      "markdown",
    ]) {
      expect(extensions).toContain(required);
    }
  });

  it("关掉 StarterKit 自带的 undo/redo（本地历史栈会撤销掉别人的编辑）", () => {
    const collaborative = presets.collaborative({ collaboration: binding() });
    const full = presets.full({});

    expect(find(collaborative, "starterKit")?.options).toMatchObject({ undoRedo: false });
    expect(find(full, "starterKit")?.options.undoRedo).not.toBe(false);
  });

  it("没有协同绑定时退回 full，保证连接中的中间态也能渲染", () => {
    const extensions = presets.collaborative({});

    expect(names(extensions)).toEqual(names(presets.full({})));
    expect(names(extensions)).not.toContain("collaboration");
    expect(find(extensions, "starterKit")?.options.undoRedo).not.toBe(false);
  });

  it("Collaboration 绑定的是传入的那个 Y.Doc", () => {
    const collaboration = binding();
    const extension = find(presets.collaborative({ collaboration }), "collaboration");

    expect(extension?.options).toMatchObject({ document: collaboration.doc });
  });

  it("光标扩展拿到 provider 与本人显示信息", () => {
    const collaboration = binding();
    const extension = find(presets.collaborative({ collaboration }), "collaborationCaret");

    expect(extension?.options).toMatchObject({
      provider: collaboration.provider,
      user: { name: "小明", color: "#2563eb" },
    });
  });
});

describe("collaborative 预设的实际同步", () => {
  it("一端输入的内容经 Y.Doc 交换后出现在另一端", () => {
    const docA = new Y.Doc();
    const docB = new Y.Doc();
    const editorA = new Editor({
      extensions: presets.collaborative({ collaboration: binding(docA) }),
    });
    const editorB = new Editor({
      extensions: presets.collaborative({ collaboration: binding(docB) }),
    });

    editorA.commands.insertContent("来自甲的内容");
    // 协同服务负责的就是这一步：把更新从一端搬到另一端
    Y.applyUpdate(docB, Y.encodeStateAsUpdate(docA));

    expect(editorB.getText()).toContain("来自甲的内容");

    editorA.destroy();
    editorB.destroy();
  });

  it("编辑器不设初始内容：正文只由 Y.Doc 灌入，不会写重复", () => {
    const doc = new Y.Doc();
    const editor = new Editor({
      extensions: presets.collaborative({ collaboration: binding(doc) }),
    });

    expect(editor.getText()).toBe("");

    editor.commands.insertContent("只此一份");
    expect(editor.getText()).toBe("只此一份");

    editor.destroy();
  });
});
