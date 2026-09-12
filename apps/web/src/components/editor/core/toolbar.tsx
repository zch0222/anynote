"use client";

import {
  MOBILE_OVERFLOW_GROUPS,
  MOBILE_PRIMARY,
} from "@/components/editor/core/mobile-toolbar-groups";
import {
  FULL_LAYOUT,
  MINIMAL_LAYOUT,
  TOOLBAR_DIVIDER,
  type ToolbarCommandId,
  type ToolbarSlot,
} from "@/components/editor/core/toolbar-commands";
import type { AnynoteImageOptions } from "@/components/editor/extensions/anynote-image";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
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
  MoreHorizontal,
  Quote,
  Redo2,
  Sigma,
  SquareCode,
  Strikethrough,
  Table as TableIcon,
  Underline as UnderlineIcon,
  Undo2,
} from "lucide-react";
import { type ReactNode, useState } from "react";
import { toast } from "sonner";

export type ToolbarVariant = "full" | "minimal" | "mobile";

export type ToolbarProps = {
  editor: Editor | null;
  variant?: ToolbarVariant;
};

type ToolbarButtonProps = {
  label: string;
  active?: boolean | undefined;
  disabled?: boolean | undefined;
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
  // 移动端浏览器会据此弹出「拍照 / 相册」，不需要额外的原生桥接
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

type EditorSnapshot = {
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strike: boolean;
  code: boolean;
  highlight: boolean;
  link: boolean;
  heading1: boolean;
  heading2: boolean;
  heading3: boolean;
  bulletList: boolean;
  orderedList: boolean;
  taskList: boolean;
  blockquote: boolean;
  codeBlock: boolean;
  canUndo: boolean;
  canRedo: boolean;
  words: number;
};

type ToolbarCommand = {
  label: string;
  icon: ReactNode;
  active?: boolean | undefined;
  disabled?: boolean | undefined;
  run: () => void;
};

/**
 * 命令注册表：一份定义，桌面与移动端共用。
 *
 * `Record<ToolbarCommandId, ...>` 让 TS 保证不漏命令；新增按钮先加 id 再补这里，
 * 移动端的常驻 / 更多分组也会被单测逼着一起更新。
 */
function buildCommands(
  editor: Editor,
  state: EditorSnapshot,
): Record<ToolbarCommandId, ToolbarCommand> {
  const chain = () => editor.chain().focus();
  return {
    undo: {
      label: "撤销",
      icon: <Undo2 />,
      disabled: !state.canUndo,
      run: () => chain().undo().run(),
    },
    redo: {
      label: "重做",
      icon: <Redo2 />,
      disabled: !state.canRedo,
      run: () => chain().redo().run(),
    },
    heading1: {
      label: "一级标题",
      icon: <span className="anynote-toolbar__text">H1</span>,
      active: state.heading1,
      run: () => chain().toggleHeading({ level: 1 }).run(),
    },
    heading2: {
      label: "二级标题",
      icon: <span className="anynote-toolbar__text">H2</span>,
      active: state.heading2,
      run: () => chain().toggleHeading({ level: 2 }).run(),
    },
    heading3: {
      label: "三级标题",
      icon: <span className="anynote-toolbar__text">H3</span>,
      active: state.heading3,
      run: () => chain().toggleHeading({ level: 3 }).run(),
    },
    bold: {
      label: "加粗",
      icon: <Bold />,
      active: state.bold,
      run: () => chain().toggleBold().run(),
    },
    italic: {
      label: "斜体",
      icon: <Italic />,
      active: state.italic,
      run: () => chain().toggleItalic().run(),
    },
    underline: {
      label: "下划线",
      icon: <UnderlineIcon />,
      active: state.underline,
      run: () => chain().toggleUnderline().run(),
    },
    strike: {
      label: "删除线",
      icon: <Strikethrough />,
      active: state.strike,
      run: () => chain().toggleStrike().run(),
    },
    code: {
      label: "行内代码",
      icon: <Code />,
      active: state.code,
      run: () => chain().toggleCode().run(),
    },
    highlight: {
      label: "高亮",
      icon: <Highlighter />,
      active: state.highlight,
      run: () => chain().toggleHighlight().run(),
    },
    link: {
      label: "链接",
      icon: <Link2 />,
      active: state.link,
      run: () => applyLink(editor),
    },
    bulletList: {
      label: "无序列表",
      icon: <List />,
      active: state.bulletList,
      run: () => chain().toggleBulletList().run(),
    },
    orderedList: {
      label: "有序列表",
      icon: <ListOrdered />,
      active: state.orderedList,
      run: () => chain().toggleOrderedList().run(),
    },
    taskList: {
      label: "任务列表",
      icon: <ListChecks />,
      active: state.taskList,
      run: () => chain().toggleTaskList().run(),
    },
    blockquote: {
      label: "引用",
      icon: <Quote />,
      active: state.blockquote,
      run: () => chain().toggleBlockquote().run(),
    },
    callout: {
      label: "提示块",
      icon: <MessageSquareWarning />,
      run: () =>
        chain()
          .insertContent({ type: "callout", attrs: { level: "info" } })
          .run(),
    },
    codeBlock: {
      label: "代码块",
      icon: <SquareCode />,
      active: state.codeBlock,
      run: () => chain().toggleCodeBlock().run(),
    },
    table: {
      label: "表格",
      icon: <TableIcon />,
      run: () => chain().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(),
    },
    image: {
      label: "图片",
      icon: <ImagePlus />,
      run: () => pickImage(editor),
    },
    math: {
      label: "行内公式",
      icon: <Sigma />,
      run: () =>
        chain()
          .insertContent({ type: "inlineMath", attrs: { latex: "E = mc^2" } })
          .run(),
    },
    horizontalRule: {
      label: "分割线",
      icon: <Minus />,
      run: () => chain().setHorizontalRule().run(),
    },
    clearFormat: {
      label: "清除格式",
      icon: <Eraser />,
      run: () => chain().unsetAllMarks().run(),
    },
  };
}

function renderSlots(
  slots: readonly ToolbarSlot[],
  commands: Record<ToolbarCommandId, ToolbarCommand>,
) {
  return slots.map((slot, index) => {
    if (slot === TOOLBAR_DIVIDER) {
      // 分隔符没有天然 key，但排版数组是常量、顺序不会变，用下标是安全的
      return <ToolbarDivider key={`divider-${index}`} />;
    }
    const command = commands[slot];
    return (
      <ToolbarButton
        key={slot}
        label={command.label}
        active={command.active}
        disabled={command.disabled}
        onClick={command.run}
      >
        {command.icon}
      </ToolbarButton>
    );
  });
}

/**
 * 编辑器工具栏。用 `useEditorState` 只订阅关心的状态，避免每次 transaction 全量重渲染。
 *
 * - `full`：全部 23 个命令（笔记、文档）
 * - `minimal`：只留基础排版（评论 / 输入框场景）
 * - `mobile`：单行横滑的 10 个常驻命令 + "更多"底部弹层，按钮 40px（方案 D5）
 */
export function Toolbar({ editor, variant = "full" }: ToolbarProps) {
  const [overflowOpen, setOverflowOpen] = useState(false);
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

  const commands = buildCommands(editor, state);

  if (variant === "mobile") {
    return (
      <div
        className="anynote-toolbar"
        data-variant="mobile"
        role="toolbar"
        aria-label="编辑器工具栏"
      >
        {renderSlots(MOBILE_PRIMARY, commands)}
        <Sheet open={overflowOpen} onOpenChange={setOverflowOpen}>
          <SheetTrigger
            render={
              <button
                type="button"
                className="anynote-toolbar__button"
                aria-label="更多格式"
                title="更多格式"
              />
            }
          >
            <MoreHorizontal />
          </SheetTrigger>
          <SheetContent
            side="bottom"
            className="max-h-[70svh] overflow-y-auto rounded-t-2xl pb-[env(safe-area-inset-bottom,0px)]"
            data-testid="editor-more-sheet"
          >
            <SheetHeader>
              <SheetTitle>更多格式</SheetTitle>
            </SheetHeader>
            <div className="space-y-4 px-4 pb-4">
              {MOBILE_OVERFLOW_GROUPS.map((group) => (
                <section key={group.label} className="space-y-2">
                  <h3 className="text-xs text-muted-foreground">{group.label}</h3>
                  <div className="grid grid-cols-4 gap-2">
                    {group.ids.map((id) => {
                      const command = commands[id];
                      return (
                        <button
                          key={id}
                          type="button"
                          disabled={command.disabled}
                          onClick={() => {
                            setOverflowOpen(false);
                            command.run();
                          }}
                          className={cn(
                            "flex min-h-16 flex-col items-center justify-center gap-1 rounded-lg border text-xs outline-none",
                            "disabled:pointer-events-none disabled:opacity-50",
                            command.active && "border-primary text-primary",
                          )}
                        >
                          <span className="anynote-toolbar__sheet-icon">{command.icon}</span>
                          {command.label}
                        </button>
                      );
                    })}
                  </div>
                </section>
              ))}
            </div>
          </SheetContent>
        </Sheet>
      </div>
    );
  }

  return (
    <div
      className="anynote-toolbar"
      data-variant={variant}
      role="toolbar"
      aria-label="编辑器工具栏"
    >
      {renderSlots(variant === "full" ? FULL_LAYOUT : MINIMAL_LAYOUT, commands)}
      <span className="anynote-toolbar__spacer" />
      {variant === "full" ? (
        <span className="anynote-toolbar__count" data-testid="editor-word-count">
          {state.words} 字
        </span>
      ) : null}
    </div>
  );
}
