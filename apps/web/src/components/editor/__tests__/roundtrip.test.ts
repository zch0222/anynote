import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { type PresetName, presets } from "@/components/editor/presets";
import { getMarkdown } from "@/lib/editor/markdown";
import { Editor } from "@tiptap/core";
import { describe, expect, it } from "vitest";

/** 用核心 `Editor`（不挂 React）跑 markdown → ProseMirror → markdown。 */
function roundTrip(markdown: string, preset: PresetName = "full"): string {
  const editor = new Editor({ extensions: presets[preset]({}), content: markdown });
  const output = getMarkdown(editor);
  editor.destroy();
  return output;
}

/** 序列化结果末尾的换行不稳定（表格结尾会多一个 `\n`），文件也以换行结尾：统一裁掉再比较。
 * 另外把 CRLF 归一成 LF：Windows 上 autocrlf 检出会把 fixture 变成 CRLF，与序列化输出（LF）比较时必须先拉平。 */
function normalize(markdown: string): string {
  return markdown.replace(/\r\n/g, "\n").replace(/\n+$/, "");
}

/** 断言 markdown 精确往返（忽略文档末尾空行）。 */
function expectRoundTrip(markdown: string, preset: PresetName = "full"): void {
  expect(normalize(roundTrip(markdown, preset))).toBe(normalize(markdown));
}

/** vitest 以 apps/web 为 cwd 运行，fixture 用相对路径拼接，避免 jsdom 下 import.meta.url 非 file: 协议。 */
const FIXTURE_DIR = join(process.cwd(), "src", "components", "editor", "__tests__", "fixtures");

function loadFixtures(): Array<{ name: string; markdown: string }> {
  return readdirSync(FIXTURE_DIR)
    .filter((file) => file.endsWith(".md"))
    .sort()
    .map((file) => ({
      name: file,
      markdown: normalize(readFileSync(join(FIXTURE_DIR, file), "utf8")),
    }));
}

describe("Markdown round-trip：单节点", () => {
  const cases: Array<[name: string, markdown: string]> = [
    ["段落与行内标记", "**加粗** *斜体* ~~删除线~~ `代码`"],
    ["下划线与高亮", "++下划线++ 与 ==高亮=="],
    ["标题", "# 一级\n\n## 二级\n\n### 三级"],
    ["无序列表", "- 甲\n- 乙"],
    ["有序列表", "1. 甲\n2. 乙"],
    ["任务列表", "- [x] 完成\n- [ ] 未完成"],
    ["引用", "> 引用内容"],
    ["分割线", "---"],
    ["代码块", "```typescript\nconst a = 1;\n```"],
    ["链接", "[Anynote](https://anynote.dev)"],
    ["图片", "![封面](./cover.png)"],
    ["表格", "| 列一 | 列二 |\n| --- | --- |\n| 甲 | 乙 |"],
    ["行内公式", "公式 $E = mc^2$ 结束"],
    ["块级公式", "$$\n\\int_0^1 x^2 dx\n$$"],
    ["Callout", "> [!INFO] 提示"],
    ["Callout 警告", "> [!WARN] 警告"],
    ["双链", "[[项目手册]]"],
    ["双链带别名", "[[会议纪要|纪要]]"],
    ["AI 块", '```anynote-ai\n{ "model": "gpt-4o-mini" }\n```'],
  ];

  it.each(cases)("%s 精确往返", (_name, markdown) => {
    expectRoundTrip(markdown);
  });

  it.each(cases)("%s 幂等", (_name, markdown) => {
    const once = roundTrip(markdown);
    expect(roundTrip(once)).toBe(once);
  });
});

describe("Markdown round-trip：真实笔记 fixture", () => {
  const fixtures = loadFixtures();

  it("包含 5 篇 fixture", () => {
    expect(fixtures).toHaveLength(5);
  });

  it.each(fixtures.map((item) => [item.name, item.markdown] as const))(
    "%s 精确往返",
    (_name, markdown) => {
      expectRoundTrip(markdown);
    },
  );

  it.each(fixtures.map((item) => [item.name, item.markdown] as const))(
    "%s 幂等且无未知节点占位",
    (_name, markdown) => {
      const once = roundTrip(markdown);
      expect(roundTrip(once)).toBe(once);
      // 未注册 markdown 序列化的节点会退化成 `[nodeName]` 占位，这里做回归保护
      expect(once).not.toMatch(/\[(callout|wikilink|aiBlock|inlineMath|blockMath|image)\]/);
    },
  );
});

describe("Markdown round-trip：预设差异", () => {
  it("minimal 预设也能往返基础排版", () => {
    expectRoundTrip("# 标题\n\n**加粗** 与 `代码`", "minimal");
  });

  it("readonly 预设保留全部渲染型节点", () => {
    expectRoundTrip("> [!WARN] 警告\n\n公式 $a^2$", "readonly");
  });
});
