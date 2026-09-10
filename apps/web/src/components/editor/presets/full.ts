import { AnynoteAiBlock } from "@/components/editor/extensions/anynote-ai-block";
import { AnynoteCallout } from "@/components/editor/extensions/anynote-callout";
import { AnynoteImage } from "@/components/editor/extensions/anynote-image";
import { AnynoteHighlight, AnynoteUnderline } from "@/components/editor/extensions/anynote-marks";
import { AnynoteBlockMath, AnynoteInlineMath } from "@/components/editor/extensions/anynote-math";
import { AnynoteTightTaskList } from "@/components/editor/extensions/anynote-tight-lists";
import { AnynoteWikilink } from "@/components/editor/extensions/anynote-wikilink";
import { CodeBlockShiki } from "@/components/editor/extensions/code-block-shiki";
import { SlashCommand } from "@/components/editor/extensions/slash-command";
import { DEFAULT_PLACEHOLDER, type PresetContext } from "@/components/editor/presets/types";
import { MarkdownBridge } from "@/lib/editor/markdown";
import type { Extensions } from "@tiptap/core";
import CharacterCount from "@tiptap/extension-character-count";
import Placeholder from "@tiptap/extension-placeholder";
import { Table, TableCell, TableHeader, TableRow } from "@tiptap/extension-table";
import TaskItem from "@tiptap/extension-task-item";
import TaskList from "@tiptap/extension-task-list";
import TextAlign from "@tiptap/extension-text-align";
import Typography from "@tiptap/extension-typography";
import StarterKit from "@tiptap/starter-kit";

/**
 * `full`：笔记 / 文档编辑。全部交互扩展 + 自定义节点 + Slash 菜单。
 * 注意：StarterKit v3 自带 `link` / `underline` / `codeBlock`，这里关掉要替换的两项。
 */
export function full(ctx: PresetContext): Extensions {
  return [
    StarterKit.configure({
      codeBlock: false,
      underline: false,
      link: { openOnClick: false, autolink: true, linkOnPaste: true },
    }),
    AnynoteUnderline,
    AnynoteHighlight,
    Typography,
    TextAlign.configure({ types: ["heading", "paragraph"] }),
    TaskList,
    TaskItem.configure({ nested: true }),
    AnynoteTightTaskList,
    Table.configure({ resizable: false }),
    TableRow,
    TableHeader,
    TableCell,
    Placeholder.configure({ placeholder: ctx.placeholder ?? DEFAULT_PLACEHOLDER }),
    CharacterCount,
    AnynoteInlineMath,
    AnynoteBlockMath,
    CodeBlockShiki,
    AnynoteImage.configure({ uploadFn: ctx.uploadFn }),
    AnynoteCallout,
    AnynoteWikilink,
    AnynoteAiBlock,
    SlashCommand.configure({ uploadFn: ctx.uploadFn }),
    MarkdownBridge,
  ];
}
