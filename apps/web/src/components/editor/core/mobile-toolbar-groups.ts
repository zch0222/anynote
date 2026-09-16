import type { ToolbarCommandId } from "@/components/editor/core/toolbar-commands";

/**
 * 移动端工具条的命令分配（M10.3 / 方案 D5，2026-09-17 按 M-09 画板复核）。
 *
 * 桌面把 23 个按钮 `flex-wrap` 铺开，在 375px 下要折三行、吃掉三分之一屏。
 * 移动端改成单行横滑：**常驻 9 个**按移动端写作频率排序，其余进"更多"底部弹层。
 *
 * **M-09 画板实测的命令集是**：
 * `B I H2 •列表 1.列表 ☑列表 🔗链接 🖼图片 ⋯`
 * ——末位必须是「⋯」溢出菜单。早先这里以 `image, codeBlock, undo` 结尾，
 * 390 宽下多出一个「<>」（代码块）按钮，把画板的「⋯」直接挤出右缘。
 * 因此：
 * - 去掉 `codeBlock`（它是桌面写作命令，移动端低频；仍在 `MOBILE_OVERFLOW` 里可达）
 * - 去掉 `undo`（画板没有撤销键；`MOBILE_OVERFLOW` 的"编辑"组里保留，且系统级撤销仍可用）
 * - `image` 留在原位（画板里它是置灰的第 8 个按钮，置灰由 `disabledCommands` 控制）
 *
 * 两个集合必须不重不漏地覆盖 `TOOLBAR_COMMAND_IDS`——漏掉的命令在手机上就永远点不到。
 * 这条由 `__tests__/mobile-toolbar-groups.test.ts` 守着。
 */
export const MOBILE_PRIMARY: readonly ToolbarCommandId[] = [
  "bold",
  "italic",
  "heading2",
  "bulletList",
  "orderedList",
  "taskList",
  "link",
  "image",
];

/** "更多"弹层里的分组。分组只影响展示顺序，不影响命令本身。 */
export const MOBILE_OVERFLOW_GROUPS: readonly {
  label: string;
  ids: readonly ToolbarCommandId[];
}[] = [
  { label: "标题", ids: ["heading1", "heading3"] },
  { label: "文本样式", ids: ["underline", "strike", "code", "highlight", "clearFormat"] },
  { label: "块", ids: ["blockquote", "callout", "codeBlock", "table", "math", "horizontalRule"] },
  { label: "编辑", ids: ["undo", "redo"] },
];

/** 展平后的"更多"命令，按分组顺序。 */
export const MOBILE_OVERFLOW: readonly ToolbarCommandId[] = MOBILE_OVERFLOW_GROUPS.flatMap(
  (group) => [...group.ids],
);
