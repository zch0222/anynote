import type { AnyExtension, Extensions } from "@tiptap/core";
import { Table, TableCell, TableHeader, TableRow } from "@tiptap/extension-table";
import TaskItem from "@tiptap/extension-task-item";
import TaskList from "@tiptap/extension-task-list";
import TextAlign from "@tiptap/extension-text-align";
import Typography from "@tiptap/extension-typography";
import StarterKit from "@tiptap/starter-kit";
import { AnynoteAiBlock } from "./extensions/ai-block";
import { AnynoteCallout } from "./extensions/callout";
import { CoreCodeBlock } from "./extensions/code-block";
import { CoreImage } from "./extensions/image";
import { AnynoteHighlight, AnynoteUnderline } from "./extensions/marks";
import { CoreBlockMath, CoreInlineMath } from "./extensions/math";
import { AnynoteTightTaskList } from "./extensions/tight-lists";
import { AnynoteWikilink } from "./extensions/wikilink";
import { MarkdownBridge } from "./markdown";

/** 可以被调用方替换成「定义 + 界面」版本的扩展槽位。替换品必须由对应的核心定义 `.extend()` 而来。 */
export type CoreExtensionOverrides = {
  inlineMath?: AnyExtension;
  blockMath?: AnyExtension;
  codeBlock?: AnyExtension;
  image?: AnyExtension;
};

export type CoreExtensionOptions = {
  /** 是否保留 StarterKit 自带的本地 undo/redo；协同模式传 false，改用 Y.UndoManager。 */
  undoRedo?: boolean | undefined;
  /** 界面层的替换扩展（节点视图、上传插件等），schema 与 Markdown 规则保持不变。 */
  overrides?: CoreExtensionOverrides | undefined;
};

/**
 * 笔记正文的完整扩展列表：决定 schema 与 Markdown 双向转换。
 *
 * web 的 `full` / `collaborative` 预设与协同服务的无界面编辑器都从这里构建，
 * 两侧因此得到同一份 schema 与同一套序列化规则。
 *
 * @param options undo/redo 开关与界面层替换
 * @returns TipTap 扩展列表，`MarkdownBridge` 位于最后
 */
export function coreExtensions(options: CoreExtensionOptions = {}): Extensions {
  const overrides = options.overrides ?? {};
  return [
    StarterKit.configure({
      codeBlock: false,
      underline: false,
      link: { openOnClick: false, autolink: true, linkOnPaste: true },
      ...(options.undoRedo === false ? { undoRedo: false as const } : {}),
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
    overrides.inlineMath ?? CoreInlineMath,
    overrides.blockMath ?? CoreBlockMath,
    overrides.codeBlock ?? CoreCodeBlock,
    overrides.image ?? CoreImage,
    AnynoteCallout,
    AnynoteWikilink,
    AnynoteAiBlock,
    MarkdownBridge,
  ];
}
