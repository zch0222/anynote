import { Table } from "@tiptap/extension-table";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import type { MarkdownSerializerState } from "prosemirror-markdown";
import type { MarkdownSpecContext } from "../markdown";

/**
 * 表格单元格的 markdown 捕获：把单元格内容渲染进独立缓冲区，
 * 再压平成 GFM 管道表格能承载的单行文本。
 *
 * - 多块单元格（多段落、列表等）逐块渲染后以空格相接，不丢内容；
 * - hardBreak 序列化为 `\` + 换行，与其余换行一起压成空格（管道表格不允许行内换行）；
 * - 单元格里的所有 `|` 统一转义成 `\|`：markdown-it 拆单元格时会把 `\|` 还原为 `|`
 *   再做行内解析，因此纯文本、双链 `[[a|b]]`、行内代码、公式里的管道符都能精确往返，
 *   而不转义的话行内容器之外的管道符会把单元格拆散。
 */
function renderCellMarkdown(state: MarkdownSerializerState, cell: ProseMirrorNode): string {
  // `out` 在 prosemirror-markdown 的类型里标了 @internal，运行时是普通字符串属性
  const writable = state as MarkdownSerializerState & { out: string };
  const outerOut = writable.out;
  const parts: string[] = [];
  try {
    for (let index = 0; index < cell.childCount; index += 1) {
      const block = cell.child(index);
      writable.out = "";
      if (block.isTextblock) {
        writable.renderInline(block);
      } else {
        writable.render(block, cell, index);
      }
      parts.push(writable.out);
    }
  } finally {
    writable.out = outerOut;
  }

  return parts
    .join(" ")
    .replace(/\\\n/g, " ")
    .replace(/\s*\n\s*/g, " ")
    .replace(/\|/g, "\\|")
    .trim();
}

/** 首行是「整行表头单元格」才算有表头；缺表头（或无表头表格）时按无表头处理。 */
function hasHeaderRow(firstRow: ProseMirrorNode): boolean {
  if (firstRow.childCount === 0) return false;
  for (let i = 0; i < firstRow.childCount; i += 1) {
    if (firstRow.child(i).type.name !== "tableHeader") return false;
  }
  return true;
}

/**
 * 表格的 Markdown 序列化（GFM 管道表格）。
 *
 * `tiptap-markdown` 内置实现只在「首行全为表头、无合并单元格、每个单元格只有一个块」时
 * 序列化成管道表格，否则整体退化成 `[table]` 占位——复制选区从表头之后开始、表格无表头、
 * 单元格带 colspan/rowspan 或多段落时都会命中，剪贴板里的表格内容因此整体丢失。
 *
 * 这里改为**任何结构都输出管道表格**：
 *
 * - 标准表格输出与内置实现逐字节一致（精确往返不变）；
 * - 切片缺表头（部分复制）或无表头表格：先补一行空表头再写分隔行，
 *   所有行都按数据行输出，重新解析后没有数据行被提拔成假表头；
 * - 合并单元格 / 多块单元格：内容压平进单元格，结构降级但文本不丢；
 * - 行内单元格数不一致时按最大列数补齐空单元格，保证每行管道数一致。
 *
 * 解析侧仍由 markdown-it 内置的管道表格规则处理，无需注册。
 */
export const CoreTable = Table.extend({
  addStorage() {
    return {
      markdown: {
        serialize(
          this: MarkdownSpecContext,
          state: MarkdownSerializerState,
          node: ProseMirrorNode,
        ) {
          const rows: ProseMirrorNode[] = [];
          for (let i = 0; i < node.childCount; i += 1) {
            rows.push(node.child(i));
          }
          if (rows.length === 0) return;

          // 前一个块（如代码块）的收尾换行是惰性的：要在捕获单元格之前冲刷进正式输出，
          // 否则 flushClose 会写进第一个单元格的捕获缓冲区被丢弃，表格与前块粘连
          state.write();

          const grid = rows.map((row) => {
            const cells: string[] = [];
            for (let i = 0; i < row.childCount; i += 1) {
              cells.push(renderCellMarkdown(state, row.child(i)));
            }
            return cells;
          });
          const columnCount = Math.max(...grid.map((cells) => cells.length));

          const writeRow = (cells: string[]) => {
            const padded = [...cells, ...Array(Math.max(columnCount - cells.length, 0)).fill("")];
            state.write(`| ${padded.join(" | ")} |`);
            state.ensureNewLine();
          };

          const headerless = !hasHeaderRow(rows[0] as ProseMirrorNode);
          if (headerless) {
            writeRow(Array(columnCount).fill(""));
          } else {
            writeRow(grid[0] as string[]);
          }
          writeRow(Array(columnCount).fill("---"));
          for (const cells of grid.slice(headerless ? 0 : 1)) {
            writeRow(cells);
          }
          state.closeBlock(node);
        },
        parse: {
          // 由 markdown-it 内置的管道表格规则处理
        },
      },
    };
  },
});
