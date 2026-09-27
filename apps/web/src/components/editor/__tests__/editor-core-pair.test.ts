import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { full } from "@/components/editor/presets/full";
import { coreExtensions, describeSchema, getMarkdown } from "@anynote/editor-core";
import { Editor, type Extensions, getSchema } from "@tiptap/core";
import { describe, expect, it } from "vitest";

/**
 * web 完整预设与 `@anynote/editor-core` 的对拍：协同服务用后者落库，两侧的 schema
 * 与 Markdown 序列化必须逐字节一致，否则服务端写回的正文会与浏览器看到的不同。
 */

const FIXTURE_DIR = join(process.cwd(), "..", "..", "packages", "editor-core", "fixtures");

const fixtures = readdirSync(FIXTURE_DIR)
  .filter((file) => file.endsWith(".md"))
  .sort()
  .map((file) => [file, readFileSync(join(FIXTURE_DIR, file), "utf8")] as const);

function serialize(extensions: Extensions, markdown: string): string {
  const editor = new Editor({ extensions, content: markdown });
  const output = getMarkdown(editor);
  editor.destroy();
  return output;
}

describe("web 完整预设 × editor-core", () => {
  it("schema 逐项相同（节点、mark、属性默认值、content 表达式与顺序）", () => {
    expect(describeSchema(getSchema(full({})))).toBe(describeSchema(getSchema(coreExtensions())));
  });

  it("协同预设关闭 undo/redo 后 schema 仍相同", () => {
    expect(describeSchema(getSchema(full({ undoRedo: false })))).toBe(
      describeSchema(getSchema(coreExtensions({ undoRedo: false }))),
    );
  });

  it.each(fixtures)("%s 两侧序列化结果逐字节相同", (_name, markdown) => {
    expect(serialize(full({}), markdown)).toBe(serialize(coreExtensions(), markdown));
  });
});
