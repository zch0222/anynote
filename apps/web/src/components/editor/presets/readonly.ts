import { AnynoteImage } from "@/components/editor/extensions/anynote-image";
import { AnynoteBlockMath, AnynoteInlineMath } from "@/components/editor/extensions/anynote-math";
import { CodeBlockShiki } from "@/components/editor/extensions/code-block-shiki";
import {
  AnynoteAiBlock,
  AnynoteCallout,
  AnynoteHighlight,
  AnynoteTightTaskList,
  AnynoteUnderline,
  AnynoteWikilink,
  MarkdownBridge,
  StarterKit,
  Table,
  TableCell,
  TableHeader,
  TableRow,
  TaskItem,
  TaskList,
  Typography,
} from "@anynote/editor-core";
import type { Extensions } from "@tiptap/core";

/**
 * `readonly`：笔记预览、AI 输出渲染、Wikis 浏览。
 * 保留全部渲染能力（代码高亮 / 公式 / 表格 / 图片 / 自定义节点），去掉交互扩展、Slash 菜单与历史。
 */
export function readonly(): Extensions {
  return [
    StarterKit.configure({
      codeBlock: false,
      underline: false,
      undoRedo: false,
      trailingNode: false,
      link: { openOnClick: true, autolink: true, linkOnPaste: false },
    }),
    AnynoteUnderline,
    AnynoteHighlight,
    Typography,
    TaskList,
    TaskItem.configure({ nested: true }),
    AnynoteTightTaskList,
    Table.configure({ resizable: false }),
    TableRow,
    TableHeader,
    TableCell,
    AnynoteInlineMath,
    AnynoteBlockMath,
    CodeBlockShiki,
    AnynoteImage,
    AnynoteCallout,
    AnynoteWikilink,
    AnynoteAiBlock,
    MarkdownBridge,
  ];
}
