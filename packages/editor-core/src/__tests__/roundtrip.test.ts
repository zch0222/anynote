import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { Editor } from "@tiptap/core";
import { describe, expect, it } from "vitest";
import { coreExtensions } from "../core-extensions";
import { getMarkdown } from "../markdown";

/** 语料目录：web 的对拍测试与协同服务的转换测试读同一份。 */
const FIXTURE_DIR = join(__dirname, "..", "..", "fixtures");

function roundTrip(markdown: string): string {
  const editor = new Editor({ extensions: coreExtensions(), content: markdown });
  const output = getMarkdown(editor);
  editor.destroy();
  return output;
}

/** 序列化末尾换行不稳定、Windows 检出可能是 CRLF：统一后再比较。 */
function normalize(markdown: string): string {
  return markdown.replace(/\r\n/g, "\n").replace(/\n+$/, "");
}

const fixtures = readdirSync(FIXTURE_DIR)
  .filter((file) => file.endsWith(".md"))
  .sort()
  .map((file) => [file, normalize(readFileSync(join(FIXTURE_DIR, file), "utf8"))] as const);

describe("coreExtensions：语料往返", () => {
  it("语料覆盖全部自定义节点与常用结构", () => {
    const all = fixtures.map(([, markdown]) => markdown).join("\n");
    for (const marker of [
      "```anynote-ai",
      "$$",
      "> [!",
      "[[",
      "==",
      "++",
      "- [x]",
      "| --- |",
      "![",
      "```typescript",
    ]) {
      expect(all).toContain(marker);
    }
  });

  it.each(fixtures)("%s 精确往返", (_name, markdown) => {
    expect(normalize(roundTrip(markdown))).toBe(markdown);
  });

  it.each(fixtures)("%s 往返一次后稳定", (_name, markdown) => {
    const once = roundTrip(markdown);
    expect(roundTrip(once)).toBe(once);
    expect(once).not.toMatch(/\[(callout|wikilink|aiBlock|inlineMath|blockMath|image)\]/);
  });
});
