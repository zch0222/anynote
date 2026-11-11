"use client";

import { LinkEditor } from "@/components/editor/core/link-editor";
import { cn } from "@/lib/utils";
import type { Editor } from "@tiptap/react";
import { useEditorState } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import { Bold, Code, Highlighter, Italic, Link2, Strikethrough, Underline } from "lucide-react";
import { useState } from "react";

function BubbleMenuContent({
  editor,
  onEditLink,
}: {
  editor: Editor;
  onEditLink: (href: string) => void;
}) {
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
        // 走查 E-05：链接编辑走应用内 Dialog，不再弹 window.prompt
        () => onEditLink((editor.getAttributes("link").href as string) ?? ""),
        <Link2 />,
      )}
    </>
  );
}

/**
 * 选区气泡菜单。用 `BubbleMenu` 的 React 绑定（`@tiptap/react/menus`），
 * 无需单独注册 `@tiptap/extension-bubble-menu`。
 *
 * 链接编辑弹层**挂在气泡菜单外面**：气泡菜单在编辑器失焦时会收起，
 * 把 Dialog 塞进它的子节点里，点开输入框的一瞬间弹层就会连同对话框一起被卸载。
 */
export function BubbleMenuPortal(props: { editor: Editor | null; className?: string }) {
  const { editor } = props;
  /** 链接编辑的打开状态与「点击那一刻」的初始地址。 */
  const [link, setLink] = useState<{ href: string } | null>(null);

  if (!editor || !editor.isEditable) {
    return null;
  }

  return (
    <>
      <BubbleMenu
        editor={editor}
        className="anynote-bubble-menu"
        options={{ placement: "top" }}
        shouldShow={({ from, to }) => from !== to}
      >
        <BubbleMenuContent
          editor={editor}
          onEditLink={(href) => {
            setLink({ href });
          }}
        />
      </BubbleMenu>
      <LinkEditor
        open={link !== null}
        editor={editor}
        initialHref={link?.href ?? ""}
        onOpenChange={(open) => {
          if (!open) {
            setLink(null);
          }
        }}
      />
    </>
  );
}
