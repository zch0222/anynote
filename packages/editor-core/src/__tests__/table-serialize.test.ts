import { Editor } from "@tiptap/core";
import type { Fragment, Node as ProseMirrorNode } from "@tiptap/pm/model";
import { TextSelection } from "@tiptap/pm/state";
import { describe, expect, it } from "vitest";
import { coreExtensions } from "../core-extensions";
import { getMarkdown } from "../markdown";

/**
 * 表格 Markdown 序列化（`extensions/table.ts`）的行为测试。
 *
 * 背景：`tiptap-markdown` 内置实现只在「首行全表头、无合并、单块单元格」时输出管道表格，
 * 否则整体退化成 `[table]`——复制选区缺表头、无表头表格、合并或多段单元格都会丢光内容。
 */

type PMJson = Record<string, unknown>;

function createEditor(content: string | PMJson): Editor {
  return new Editor({ extensions: coreExtensions(), content });
}

function normalize(markdown: string): string {
  return markdown.replace(/\n+$/, "");
}

/** 序列化整个文档。 */
function serializeDoc(content: string | PMJson): string {
  const editor = createEditor(content);
  const output = getMarkdown(editor);
  editor.destroy();
  return normalize(output);
}

/** 模拟复制的 text/plain：与 `MarkdownClipboard` 一样走 serializer 序列化选区切片。 */
function serializeSelection(editor: Editor, from: number, to: number): string {
  const selection = TextSelection.create(editor.state.doc, from, to);
  editor.view.dispatch(editor.state.tr.setSelection(selection));
  const slice = editor.state.selection.content();
  const storage = editor.storage as {
    markdown?: { serializer?: { serialize(content: Fragment): string } };
  };
  return normalize(storage.markdown?.serializer?.serialize(slice.content) ?? "");
}

/** 在文档里定位第一个 table 节点，返回位置与节点。 */
function findTable(editor: Editor): { pos: number; node: ProseMirrorNode } {
  let found: { pos: number; node: ProseMirrorNode } | null = null;
  editor.state.doc.forEach((node, offset) => {
    if (!found && node.type.name === "table") {
      found = { pos: offset, node };
    }
  });
  if (!found) throw new Error("文档里没有表格");
  return found;
}

/** 找出包含指定文本的文本节点的起始位置（用于把选区端点落到行内内容里）。 */
function findTextPos(editor: Editor, text: string): number {
  let pos = -1;
  editor.state.doc.descendants((node, position) => {
    if (pos >= 0) return false;
    if (node.isText && node.text?.includes(text)) {
      pos = position;
    }
    return true;
  });
  if (pos < 0) throw new Error(`文档里没有文本「${text}」`);
  return pos;
}

const SIMPLE_MD = `| 类型 | 标题 |
| --- | --- |
| 笔记 | 111 |
| 资料 | 报告.pdf |`;

describe("表格序列化：标准结构字节兼容", () => {
  it("普通表格整文档序列化与原格式一致（含表头与分隔行）", () => {
    expect(serializeDoc(SIMPLE_MD)).toBe(SIMPLE_MD);
  });

  it("全选复制输出完整管道表格", () => {
    const editor = createEditor(SIMPLE_MD);
    editor.commands.selectAll();
    const slice = editor.state.selection.content();
    const storage = editor.storage as {
      markdown?: { serializer?: { serialize(content: Fragment): string } };
    };
    expect(normalize(storage.markdown?.serializer?.serialize(slice.content) ?? "")).toBe(SIMPLE_MD);
    editor.destroy();
  });

  it("选区覆盖完整表格时输出与内置实现一致", () => {
    const editor = createEditor(`前段\n\n${SIMPLE_MD}\n\n后段`);
    const { pos, node } = findTable(editor);
    // 从表格前一点选到表格后一点（用户框选整张表的常见形态）
    const output = serializeSelection(editor, pos, pos + node.nodeSize);
    expect(output).toContain("| 类型 | 标题 |");
    expect(output).toContain("| 笔记 | 111 |");
    expect(output).not.toContain("[table]");
    editor.destroy();
  });
});

describe("表格序列化：部分选区不再退化为 [table]", () => {
  /** 从「笔记」文本开头选到「报告.pdf」文本结尾：首行是数据行的切片，复现用户拖选路径。 */
  function selectDataRows(editor: Editor): string {
    return serializeSelection(
      editor,
      findTextPos(editor, "笔记"),
      findTextPos(editor, "报告.pdf") + "报告.pdf".length,
    );
  }

  it("选区从表头之后的数据行开始：补空表头、数据行全部保留", () => {
    const editor = createEditor(SIMPLE_MD);
    const output = selectDataRows(editor);
    expect(output).not.toContain("[table]");
    expect(output).toContain("| 笔记 | 111 |");
    expect(output).toContain("| 资料 | 报告.pdf |");
    // 缺表头的切片要补空表头行，保证数据行不会被提拔成假表头
    const lines = output.split("\n");
    expect(lines[0]).toBe("|  |  |");
    expect(lines[1]).toBe("| --- | --- |");
    editor.destroy();
  });

  it("部分选区输出重新解析后仍是表格且数据完整", () => {
    const editor = createEditor(SIMPLE_MD);
    const output = selectDataRows(editor);
    editor.destroy();

    const reparsed = createEditor(output);
    const table = findTable(reparsed);
    expect(table.node.type.name).toBe("table");
    expect(table.node.textContent).toContain("笔记");
    expect(table.node.textContent).toContain("报告.pdf");
    reparsed.destroy();
  });
});

describe("表格序列化：无表头与非常规结构", () => {
  const HEADERLESS_TABLE: PMJson = {
    type: "doc",
    content: [
      {
        type: "table",
        content: [
          {
            type: "tableRow",
            content: [
              {
                type: "tableCell",
                content: [{ type: "paragraph", content: [{ type: "text", text: "甲" }] }],
              },
              {
                type: "tableCell",
                content: [{ type: "paragraph", content: [{ type: "text", text: "乙" }] }],
              },
            ],
          },
          {
            type: "tableRow",
            content: [
              {
                type: "tableCell",
                content: [{ type: "paragraph", content: [{ type: "text", text: "丙" }] }],
              },
              {
                type: "tableCell",
                content: [{ type: "paragraph", content: [{ type: "text", text: "丁" }] }],
              },
            ],
          },
        ],
      },
    ],
  };

  it("无表头表格输出空表头 + 全部数据行，不再退化为 [table]", () => {
    const output = serializeDoc(HEADERLESS_TABLE);
    expect(output).not.toContain("[table]");
    const lines = output.split("\n");
    expect(lines[0]).toBe("|  |  |");
    expect(lines[1]).toBe("| --- | --- |");
    expect(lines[2]).toBe("| 甲 | 乙 |");
    expect(lines[3]).toBe("| 丙 | 丁 |");
  });

  it("合并单元格（colspan/rowspan）内容压平保留，不退化", () => {
    const output = serializeDoc({
      type: "doc",
      content: [
        {
          type: "table",
          content: [
            {
              type: "tableRow",
              content: [
                {
                  type: "tableHeader",
                  content: [{ type: "paragraph", content: [{ type: "text", text: "列一" }] }],
                },
                {
                  type: "tableHeader",
                  content: [{ type: "paragraph", content: [{ type: "text", text: "列二" }] }],
                },
              ],
            },
            {
              type: "tableRow",
              content: [
                {
                  type: "tableCell",
                  attrs: { colspan: 2, rowspan: 1, colwidth: null },
                  content: [{ type: "paragraph", content: [{ type: "text", text: "跨两列" }] }],
                },
              ],
            },
          ],
        },
      ],
    });
    expect(output).not.toContain("[table]");
    expect(output).toContain("跨两列");
    expect(output).toContain("| 列一 | 列二 |");
  });

  it("多段落单元格的内容以空格拼接保留", () => {
    const output = serializeDoc({
      type: "doc",
      content: [
        {
          type: "table",
          content: [
            {
              type: "tableRow",
              content: [
                {
                  type: "tableHeader",
                  content: [{ type: "paragraph", content: [{ type: "text", text: "说明" }] }],
                },
              ],
            },
            {
              type: "tableRow",
              content: [
                {
                  type: "tableCell",
                  content: [
                    { type: "paragraph", content: [{ type: "text", text: "第一段" }] },
                    { type: "paragraph", content: [{ type: "text", text: "第二段" }] },
                  ],
                },
              ],
            },
          ],
        },
      ],
    });
    expect(output).not.toContain("[table]");
    expect(output).toContain("第一段 第二段");
  });

  it("单元格里的 hardBreak 压平为空格，不出现 [hardBreak] 或裸换行", () => {
    const output = serializeDoc({
      type: "doc",
      content: [
        {
          type: "table",
          content: [
            {
              type: "tableRow",
              content: [
                {
                  type: "tableHeader",
                  content: [{ type: "paragraph", content: [{ type: "text", text: "列" }] }],
                },
              ],
            },
            {
              type: "tableRow",
              content: [
                {
                  type: "tableCell",
                  content: [
                    {
                      type: "paragraph",
                      content: [
                        { type: "text", text: "上行" },
                        { type: "hardBreak" },
                        { type: "text", text: "下行" },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    });
    expect(output).not.toContain("[hardBreak]");
    expect(output).not.toContain("[table]");
    expect(output).toContain("上行 下行");
    for (const line of output.split("\n")) {
      expect(line.startsWith("|")).toBe(true);
    }
  });
});

describe("表格序列化：管道符转义", () => {
  it("单元格文本里的 `|` 转义为 `\\|`，重新解析后内容不变", () => {
    const output = serializeDoc({
      type: "doc",
      content: [
        {
          type: "table",
          content: [
            {
              type: "tableRow",
              content: [
                {
                  type: "tableHeader",
                  content: [{ type: "paragraph", content: [{ type: "text", text: "式子" }] }],
                },
              ],
            },
            {
              type: "tableRow",
              content: [
                {
                  type: "tableCell",
                  content: [{ type: "paragraph", content: [{ type: "text", text: "a|b" }] }],
                },
              ],
            },
          ],
        },
      ],
    });
    expect(output).toContain("a\\|b");
    const reparsed = createEditor(output);
    expect(findTable(reparsed).node.textContent).toContain("a|b");
    reparsed.destroy();
  });

  it("双链标记里的管道符同样转义，重新解析后目标与别名不丢", () => {
    // 注意输入必须是转义形式：未转义的 `|` 在 markdown-it 拆单元格时就会把单元格切开，
    // 表格里要表达带管道的行内标记，唯一的源形式就是 `\|`
    const output = serializeDoc("| 引用 |\n| --- |\n| [[会议纪要\\|纪要]] |");
    expect(output).not.toContain("[table]");
    expect(output).toContain("[[会议纪要\\|纪要]]");
    const reparsed = createEditor(output);
    const table = findTable(reparsed);
    let target = "";
    let label: string | null = null;
    table.node.descendants((node) => {
      if (node.type.name === "wikilink") {
        target = String(node.attrs.target);
        label = node.attrs.label ? String(node.attrs.label) : null;
      }
      return true;
    });
    expect(target).toBe("会议纪要");
    expect(label).toBe("纪要");
    reparsed.destroy();
  });
});
