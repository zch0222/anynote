import { AnynoteHighlight, AnynoteUnderline } from "@/components/editor/extensions/anynote-marks";
import { DEFAULT_PLACEHOLDER, type PresetContext } from "@/components/editor/presets/types";
import { MarkdownBridge } from "@/lib/editor/markdown";
import type { Extensions } from "@tiptap/core";
import Placeholder from "@tiptap/extension-placeholder";
import StarterKit from "@tiptap/starter-kit";

/**
 * `minimal`：评论、AI 聊天输入框等轻量输入场景。
 * 只保留基础排版（StarterKit 默认 + 下划线 / 高亮）+ 占位符，不注册自定义节点与 Slash 菜单。
 *
 * Note：`@tiptap/extension-mention` 已安装但**暂不注册**——@用户 / #笔记 需要真实的用户与
 * 笔记索引数据，属于 M7 范围，此处不接空数据源以免交互假死。
 */
export function minimal(ctx: PresetContext): Extensions {
  return [
    StarterKit.configure({
      underline: false,
      link: { openOnClick: false, autolink: true, linkOnPaste: true },
    }),
    AnynoteUnderline,
    AnynoteHighlight,
    Placeholder.configure({ placeholder: ctx.placeholder ?? DEFAULT_PLACEHOLDER }),
    MarkdownBridge,
  ];
}
