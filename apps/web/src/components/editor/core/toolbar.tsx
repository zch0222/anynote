"use client";

import type { AnynoteImageOptions } from "@/components/editor/extensions/anynote-image";
import { cn } from "@/lib/utils";
import type { Editor } from "@tiptap/react";
import { useEditorState } from "@tiptap/react";
import {
  Bold,
  Code,
  Eraser,
  Highlighter,
  ImagePlus,
  Italic,
  Link2,
  List,
  ListChecks,
  ListOrdered,
  MessageSquareWarning,
  Minus,
  Quote,
  Redo2,
  Sigma,
  SquareCode,
  Strikethrough,
  Table as TableIcon,
  Underline as UnderlineIcon,
  Undo2,
} from "lucide-react";
import type { ReactNode } from "react";
import { toast } from "sonner";

export type ToolbarVariant = "full" | "minimal";

export type ToolbarProps = {
  editor: Editor | null;
  variant?: ToolbarVariant;
};

type ToolbarButtonProps = {
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
};

function ToolbarButton({ label, active, disabled, onClick, children }: ToolbarButtonProps) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      className={cn("anynote-toolbar__button", active && "is-active")}
    >
      {children}
    </button>
  );
}

function ToolbarDivider() {
  return <span aria-hidden="true" className="anynote-toolbar__divider" />;
}

function pickImage(editor: Editor) {
  const image = editor.extensionManager.extensions.find((item) => item.name === "image");
  const uploadFn = (image?.options as AnynoteImageOptions | undefined)?.uploadFn;
  if (!uploadFn) {
    toast.error("当前编辑器未配置图片上传");
    return;
  }
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "image/*";
  input.addEventListener("change", () => {
    const file = input.files?.[0];
    if (!file) {
      return;
    }
    const at = editor.state.selection.from;
    uploadFn(file)
      .then((src) => {
        editor
          .chain()
          .focus()
          .insertContentAt(at, { type: "image", attrs: { src, alt: file.name } })
          .run();
      })
      .catch((error: unknown) => {
        console.error(error);
        toast.error("图片上传失败");
      });
  });
  input.click();
}

function applyLink(editor: Editor) {
  const previous = editor.getAttributes("link").href as string | undefined;
  const href = window.prompt("链接地址", previous ?? "https://");
  if (href === null) {
    return;
  }
  if (href === "") {
    editor.chain().focus().extendMarkRange("link").unsetLink().run();
    return;
  }
  editor.chain().focus().extendMarkRange("link").setLink({ href }).run();
}

/**
 * 编辑器工具栏。用 `useEditorState` 只订阅关心的状态，避免每次 transaction 全量重渲染。
 * `minimal` 只暴露基础排版（评论 / 输入框场景）。
 */
export function Toolbar({ editor, variant = "full" }: ToolbarProps) {
  const state = useEditorState({
    editor,
    selector: ({ editor: current }) => {
      if (!current) {
        return null;
      }
      const characterCount = current.storage.characterCount as
        | { words?: () => number; characters?: () => number }
        | undefined;
      return {
        bold: current.isActive("bold"),
        italic: current.isActive("italic"),
        underline: current.isActive("underline"),
        strike: current.isActive("strike"),
        code: current.isActive("code"),
        highlight: current.isActive("highlight"),
        link: current.isActive("link"),
        heading1: current.isActive("heading", { level: 1 }),
        heading2: current.isActive("heading", { level: 2 }),
        heading3: current.isActive("heading", { level: 3 }),
        bulletList: current.isActive("bulletList"),
        orderedList: current.isActive("orderedList"),
        taskList: current.isActive("taskList"),
        blockquote: current.isActive("blockquote"),
        codeBlock: current.isActive("codeBlock"),
        canUndo: current.can().undo(),
        canRedo: current.can().redo(),
        words: characterCount?.words?.() ?? 0,
      };
    },
  });

  if (!editor || !state) {
    return null;
  }

  const chain = () => editor.chain().focus();

  return (
    <div className="anynote-toolbar" role="toolbar" aria-label="编辑器工具栏">
      <ToolbarButton label="撤销" disabled={!state.canUndo} onClick={() => chain().undo().run()}>
        <Undo2 />
      </ToolbarButton>
      <ToolbarButton label="重做" disabled={!state.canRedo} onClick={() => chain().redo().run()}>
        <Redo2 />
      </ToolbarButton>
      <ToolbarDivider />

      {variant === "full" ? (
        <>
          <ToolbarButton
            label="一级标题"
            active={state.heading1}
            onClick={() => chain().toggleHeading({ level: 1 }).run()}
          >
            <span className="anynote-toolbar__text">H1</span>
          </ToolbarButton>
          <ToolbarButton
            label="二级标题"
            active={state.heading2}
            onClick={() => chain().toggleHeading({ level: 2 }).run()}
          >
            <span className="anynote-toolbar__text">H2</span>
          </ToolbarButton>
          <ToolbarButton
            label="三级标题"
            active={state.heading3}
            onClick={() => chain().toggleHeading({ level: 3 }).run()}
          >
            <span className="anynote-toolbar__text">H3</span>
          </ToolbarButton>
          <ToolbarDivider />
        </>
      ) : null}

      <ToolbarButton label="加粗" active={state.bold} onClick={() => chain().toggleBold().run()}>
        <Bold />
      </ToolbarButton>
      <ToolbarButton
        label="斜体"
        active={state.italic}
        onClick={() => chain().toggleItalic().run()}
      >
        <Italic />
      </ToolbarButton>
      <ToolbarButton
        label="下划线"
        active={state.underline}
        onClick={() => chain().toggleUnderline().run()}
      >
        <UnderlineIcon />
      </ToolbarButton>
      <ToolbarButton
        label="删除线"
        active={state.strike}
        onClick={() => chain().toggleStrike().run()}
      >
        <Strikethrough />
      </ToolbarButton>
      <ToolbarButton
        label="行内代码"
        active={state.code}
        onClick={() => chain().toggleCode().run()}
      >
        <Code />
      </ToolbarButton>
      <ToolbarButton
        label="高亮"
        active={state.highlight}
        onClick={() => chain().toggleHighlight().run()}
      >
        <Highlighter />
      </ToolbarButton>
      <ToolbarButton label="链接" active={state.link} onClick={() => applyLink(editor)}>
        <Link2 />
      </ToolbarButton>
      <ToolbarDivider />

      <ToolbarButton
        label="无序列表"
        active={state.bulletList}
        onClick={() => chain().toggleBulletList().run()}
      >
        <List />
      </ToolbarButton>
      <ToolbarButton
        label="有序列表"
        active={state.orderedList}
        onClick={() => chain().toggleOrderedList().run()}
      >
        <ListOrdered />
      </ToolbarButton>

      {variant === "full" ? (
        <>
          <ToolbarButton
            label="任务列表"
            active={state.taskList}
            onClick={() => chain().toggleTaskList().run()}
          >
            <ListChecks />
          </ToolbarButton>
          <ToolbarDivider />
          <ToolbarButton
            label="引用"
            active={state.blockquote}
            onClick={() => chain().toggleBlockquote().run()}
          >
            <Quote />
          </ToolbarButton>
          <ToolbarButton
            label="提示块"
            onClick={() =>
              chain()
                .insertContent({ type: "callout", attrs: { level: "info" } })
                .run()
            }
          >
            <MessageSquareWarning />
          </ToolbarButton>
          <ToolbarButton
            label="代码块"
            active={state.codeBlock}
            onClick={() => chain().toggleCodeBlock().run()}
          >
            <SquareCode />
          </ToolbarButton>
          <ToolbarButton
            label="表格"
            onClick={() => chain().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}
          >
            <TableIcon />
          </ToolbarButton>
          <ToolbarButton label="图片" onClick={() => pickImage(editor)}>
            <ImagePlus />
          </ToolbarButton>
          <ToolbarButton
            label="行内公式"
            onClick={() =>
              chain()
                .insertContent({ type: "inlineMath", attrs: { latex: "E = mc^2" } })
                .run()
            }
          >
            <Sigma />
          </ToolbarButton>
          <ToolbarButton label="分割线" onClick={() => chain().setHorizontalRule().run()}>
            <Minus />
          </ToolbarButton>
          <ToolbarDivider />
        </>
      ) : null}

      <ToolbarButton label="清除格式" onClick={() => chain().unsetAllMarks().run()}>
        <Eraser />
      </ToolbarButton>

      <span className="anynote-toolbar__spacer" />
      {variant === "full" ? (
        <span className="anynote-toolbar__count" data-testid="editor-word-count">
          {state.words} 字
        </span>
      ) : null}
    </div>
  );
}
