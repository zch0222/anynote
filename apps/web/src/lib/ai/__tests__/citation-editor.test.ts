import type { Editor } from "@tiptap/core";
import { Schema } from "@tiptap/pm/model";
import { EditorState } from "@tiptap/pm/state";
import { describe, expect, it, vi } from "vitest";
import { applyCitationReferences } from "../citation-editor";
import { findSectionPosition, scrollToNoteCitation } from "../note-location";

const schema = new Schema({
  nodes: {
    doc: { content: "block+" },
    paragraph: { group: "block", content: "inline*" },
    heading: { group: "block", content: "text*", attrs: { level: { default: 1 } } },
    codeBlock: { group: "block", content: "text*" },
    aiCitation: { group: "inline", inline: true, atom: true, attrs: { index: {} } },
    text: { group: "inline" },
  },
  marks: { link: { attrs: { href: {}, target: { default: "_self" } } }, code: {} },
});

/**
 * 引用编号与笔记小节定位测试。
 *
 * @author 称霸幼儿园
 */
describe("引用编辑器定位", () => {
  /** 小节定位只滚动到标题，不修改笔记文档。 */
  it("滚动到对应标题元素", () => {
    const doc = schema.nodeFromJSON({
      type: "doc",
      content: [
        { type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: "标题" }] },
        { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "索引" }] },
      ],
    });
    const heading = document.createElement("h2");
    const scroll = vi.spyOn(heading, "scrollIntoView");
    const nodeDOM = vi.fn(() => heading);
    const editor = { state: { doc }, view: { nodeDOM } } as unknown as Editor;
    expect(scrollToNoteCitation(editor, { section: "标题 / 索引" }, "")).toBe(true);
    expect(nodeDOM).toHaveBeenCalledWith(4);
    expect(scroll).toHaveBeenCalledWith({ block: "center" });
  });
  /** 有效引用节点转为站内链接，未知编号在没有移除标注时保留。 */
  it("链接有效引用并保留未确认编号", () => {
    const doc = schema.nodeFromJSON({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "答案" },
            { type: "aiCitation", attrs: { index: 1 } },
            { type: "text", text: " " },
            { type: "aiCitation", attrs: { index: 2 } },
          ],
        },
        { type: "codeBlock", content: [{ type: "text", text: "[1]" }] },
      ],
    });
    const state = EditorState.create({ schema, doc });
    const dispatch = vi.fn();

    applyCitationReferences(
      { schema, state, view: { dispatch } } as unknown as Editor,
      [{ index: 1, sourceType: "note", sourceId: "note:5", kbId: 3 }],
      "mobile",
      false,
    );

    const result = dispatch.mock.calls[0]?.[0].doc.toJSON();
    expect(result.content[0].content[1].text).toBe("[1]");
    expect(result.content[0].content[1].marks[0].attrs.href).toBe("/m/notes/3/5");
    expect(result.content[0].content[3].type).toBe("aiCitation");
    expect(result.content[1].content[0].text).toBe("[1]");
  });

  /** 带移除标注时只隐藏不在引用列表中的编号。 */
  it("隐藏带移除标注的无效编号", () => {
    const doc = schema.nodeFromJSON({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "aiCitation", attrs: { index: 1 } },
            { type: "text", text: "与" },
            { type: "aiCitation", attrs: { index: 2 } },
          ],
        },
      ],
    });
    const state = EditorState.create({ schema, doc });
    const dispatch = vi.fn();

    applyCitationReferences(
      { schema, state, view: { dispatch } } as unknown as Editor,
      [{ index: 1, sourceType: "note", sourceId: "note:5", kbId: 3 }],
      "desktop",
      true,
    );

    const result = dispatch.mock.calls[0]?.[0].doc.toJSON();
    expect(result.content[0].content).toHaveLength(2);
    expect(result.content[0].content[0].text).toBe("[1]");
    expect(result.content[0].content[1].text).toBe("与");
  });

  /** 相同标题在不同章中使用完整路径定位。 */
  it("区分重名小节", () => {
    const doc = schema.nodeFromJSON({
      type: "doc",
      content: [
        { type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: "甲" }] },
        { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "索引" }] },
        { type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: "乙" }] },
        { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "索引" }] },
      ],
    });
    expect(findSectionPosition(doc, "甲 / 索引")).toBe(3);
    expect(findSectionPosition(doc, "乙 / 索引")).toBe(10);
    expect(findSectionPosition(doc, "不存在")).toBeNull();
  });
});
