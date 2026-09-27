import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { coreExtensions, getMarkdown } from "@anynote/editor-core";
import { Editor } from "@tiptap/core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as Y from "yjs";
import { type Converter, FRAGMENT, createConverter, deterministicLineage } from "../converter.ts";

const FIXTURE_DIR = join(__dirname, "..", "..", "..", "..", "packages", "editor-core", "fixtures");
const fixtures = readdirSync(FIXTURE_DIR)
  .filter((file) => file.endsWith(".md"))
  .sort()
  .map((file) => [file, readFileSync(join(FIXTURE_DIR, file), "utf8")] as const);

let converter: Converter;

beforeAll(() => {
  converter = createConverter();
});

afterAll(() => {
  converter.destroy();
});

function docFrom(state: Uint8Array): Y.Doc {
  const doc = new Y.Doc();
  Y.applyUpdate(doc, state);
  return doc;
}

/** 与浏览器端相同的直接转换：parse → serialize，不经过 Y.Doc。 */
function direct(markdown: string): string {
  const editor = new Editor({ extensions: coreExtensions(), content: markdown });
  const output = getMarkdown(editor);
  editor.destroy();
  return output;
}

describe("Converter：Markdown ↔ Y.Doc", () => {
  it.each(fixtures)("%s 经 Y 状态往返后与直接转换逐字节相同", (_name, markdown) => {
    const doc = docFrom(converter.buildState(markdown));
    expect(converter.serialize(doc).markdown).toBe(direct(markdown));
  });

  it("从顶部 H1 取标题；没有 H1 时标题为 null", () => {
    expect(converter.serialize(docFrom(converter.buildState("# 周会纪要\n\n正文"))).title).toBe(
      "周会纪要",
    );
    expect(converter.serialize(docFrom(converter.buildState("没有标题的正文"))).title).toBeNull();
  });

  it("标题超过 80 字时截断", () => {
    const title = "题".repeat(100);
    expect(converter.serialize(docFrom(converter.buildState(`# ${title}`))).title).toBe(
      "题".repeat(80),
    );
  });

  it("normalize 给没有顶部 H1 的正文补上标题", () => {
    expect(converter.normalize("正文", "标题")).toBe("# 标题\n\n正文");
    expect(converter.normalize("# 已有\n\n正文", "标题")).toBe("# 已有\n\n正文");
  });

  it("同一 clientID 重复构建得到逐字节相同的状态", () => {
    const markdown = fixtures[0]?.[1] ?? "# 标题";
    expect(converter.buildState(markdown, 12345)).toEqual(converter.buildState(markdown, 12345));
  });

  it("applyMarkdown 只改变差异部分，未改动段落的 Yjs 条目身份保留", () => {
    const doc = docFrom(converter.buildState("# 标题\n\n第一段\n\n第二段"));
    const fragment = doc.getXmlFragment(FRAGMENT);
    const firstParagraph = fragment.get(1);

    doc.transact(() => converter.applyMarkdown(doc, "# 标题\n\n第一段\n\n第二段已修改"));

    expect(converter.serialize(doc).markdown).toBe("# 标题\n\n第一段\n\n第二段已修改");
    expect(fragment.get(1)).toBe(firstParagraph);
  });

  it("空文档序列化为空正文且没有标题", () => {
    const doc = new Y.Doc();
    expect(converter.serialize(doc)).toEqual({ markdown: "", title: null });
  });
});

describe("deterministicLineage", () => {
  it("同一笔记同一版本得到相同的谱系与 clientID，版本变化则不同", () => {
    const a = deterministicLineage(42, "1790265600000");
    expect(deterministicLineage(42, "1790265600000")).toEqual(a);
    expect(deterministicLineage(42, "1790265601000").epoch).not.toBe(a.epoch);
    expect(deterministicLineage(43, "1790265600000").epoch).not.toBe(a.epoch);
  });

  it("谱系是 36 位 UUID 形态，clientID 是正的 31 位整数", () => {
    const { epoch, clientId } = deterministicLineage(1, "1");
    expect(epoch).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-8[0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(clientId).toBeGreaterThan(0);
    expect(clientId).toBeLessThan(2 ** 31);
  });
});
