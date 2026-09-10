import { AnynoteAiBlock } from "@/components/editor/extensions/anynote-ai-block";
import { AnynoteCallout } from "@/components/editor/extensions/anynote-callout";
import { AnynoteImage } from "@/components/editor/extensions/anynote-image";
import { AnynoteHighlight, AnynoteUnderline } from "@/components/editor/extensions/anynote-marks";
import { AnynoteBlockMath, AnynoteInlineMath } from "@/components/editor/extensions/anynote-math";
import { AnynoteTightTaskList } from "@/components/editor/extensions/anynote-tight-lists";
import { AnynoteWikilink } from "@/components/editor/extensions/anynote-wikilink";
import { CodeBlockShiki } from "@/components/editor/extensions/code-block-shiki";
import { MarkdownBridge } from "@/lib/editor/markdown";
import type { Extensions } from "@tiptap/core";
import { Table, TableCell, TableHeader, TableRow } from "@tiptap/extension-table";
import TaskItem from "@tiptap/extension-task-item";
import TaskList from "@tiptap/extension-task-list";
import Typography from "@tiptap/extension-typography";
import StarterKit from "@tiptap/starter-kit";

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
