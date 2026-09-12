/**
 * 工具栏命令的**唯一注册表**（M10.3）。
 *
 * 桌面与移动端共用这一份 id 列表：桌面按 `FULL_LAYOUT` / `MINIMAL_LAYOUT` 排版，
 * 移动端按 `MOBILE_PRIMARY` + "更多"分组排版。分成独立文件是为了让分组表能
 * 只 import 类型而不牵连整个 `toolbar.tsx`（它带 lucide 图标与编辑器状态）。
 */
export const TOOLBAR_COMMAND_IDS = [
  "undo",
  "redo",
  "heading1",
  "heading2",
  "heading3",
  "bold",
  "italic",
  "underline",
  "strike",
  "code",
  "highlight",
  "link",
  "bulletList",
  "orderedList",
  "taskList",
  "blockquote",
  "callout",
  "codeBlock",
  "table",
  "image",
  "math",
  "horizontalRule",
  "clearFormat",
] as const;

export type ToolbarCommandId = (typeof TOOLBAR_COMMAND_IDS)[number];

/** 分隔符在排版数组里用这个哨兵表示。 */
export const TOOLBAR_DIVIDER = "|" as const;

export type ToolbarSlot = ToolbarCommandId | typeof TOOLBAR_DIVIDER;

/** 桌面 `full` 的排版顺序——与移动端拆分前逐个按钮的顺序完全一致。 */
export const FULL_LAYOUT: readonly ToolbarSlot[] = [
  "undo",
  "redo",
  TOOLBAR_DIVIDER,
  "heading1",
  "heading2",
  "heading3",
  TOOLBAR_DIVIDER,
  "bold",
  "italic",
  "underline",
  "strike",
  "code",
  "highlight",
  "link",
  TOOLBAR_DIVIDER,
  "bulletList",
  "orderedList",
  "taskList",
  TOOLBAR_DIVIDER,
  "blockquote",
  "callout",
  "codeBlock",
  "table",
  "image",
  "math",
  "horizontalRule",
  TOOLBAR_DIVIDER,
  "clearFormat",
];

/** 桌面 `minimal`（评论 / 输入框场景）：只留基础排版。 */
export const MINIMAL_LAYOUT: readonly ToolbarSlot[] = [
  "undo",
  "redo",
  TOOLBAR_DIVIDER,
  "bold",
  "italic",
  "underline",
  "strike",
  "code",
  "highlight",
  "link",
  TOOLBAR_DIVIDER,
  "bulletList",
  "orderedList",
  "clearFormat",
];
