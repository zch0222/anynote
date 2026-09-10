"use client";

import { cn } from "@/lib/utils";
import type { Editor } from "@tiptap/react";
import { useEditorState } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import {
  Bold,
  Code,
  Highlighter,
  Italic,
  Link2,
  Sparkles,
  Strikethrough,
  Underline,
} from "lucide-react";
import { toast } from "sonner";

function BubbleMenuContent({ editor }: { editor: Editor }) {
  const state = useEditorState({
    editor,
    selector: ({ editor: current }) => ({
      bold: current.isActive("bold"),
      italic: current.isActive("italic"),
      underline: current.isActive("underline"),
      strike: current.isActive("strike"),
      code: current.isActive("code"),
      highlight: current.isActive("highlight"),
      link: current.isActive("link"),
    }),
  });

  if (!state) {
    return null;
  }

  const chain = () => editor.chain().focus();
  const button = (label: string, active: boolean, onClick: () => void, icon: React.ReactNode) => (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      onClick={onClick}
      className={cn("anynote-bubble-menu__button", active && "is-active")}
    >
      {icon}
    </button>
  );

  return (
    <>
      {button("加粗", state.bold, () => chain().toggleBold().run(), <Bold />)}
      {button("斜体", state.italic, () => chain().toggleItalic().run(), <Italic />)}
      {button("下划线", state.underline, () => chain().toggleUnderline().run(), <Underline />)}
      {button("删除线", state.strike, () => chain().toggleStrike().run(), <Strikethrough />)}
      {button("行内代码", state.code, () => chain().toggleCode().run(), <Code />)}
      {button("高亮", state.highlight, () => chain().toggleHighlight().run(), <Highlighter />)}
      {button(
        "链接",
        state.link,
        () => {
          const href = window.prompt(
            "链接地址",
            (editor.getAttributes("link").href as string) ?? "https://",
          );
          if (href === null) {
            return;
          }
          if (href === "") {
            chain().extendMarkRange("link").unsetLink().run();
            return;
          }
          chain().extendMarkRange("link").setLink({ href }).run();
        },
        <Link2 />,
      )}
      {button("AI 改写（M7 接入）", false, () => toast.info("AI 改写将在 M7 接入"), <Sparkles />)}
    </>
  );
}

/**
 * 选区气泡菜单。用 `BubbleMenu` 的 React 绑定（`@tiptap/react/menus`），
 * 无需单独注册 `@tiptap/extension-bubble-menu`。
 */
export function BubbleMenuPortal(props: { editor: Editor | null; className?: string }) {
  const { editor } = props;
  if (!editor || !editor.isEditable) {
    return null;
  }
  return (
    <BubbleMenu
      editor={editor}
      className="anynote-bubble-menu"
      options={{ placement: "top" }}
      shouldShow={({ from, to }) => from !== to}
    >
      <BubbleMenuContent editor={editor} />
    </BubbleMenu>
  );
}
