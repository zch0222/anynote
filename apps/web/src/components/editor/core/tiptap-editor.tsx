"use client";

import { BubbleMenuPortal } from "@/components/editor/core/bubble-menu";
import { Toolbar } from "@/components/editor/core/toolbar";
import type { UploadFn } from "@/components/editor/extensions/anynote-image";
import { type AiContinueFn, type PresetName, presets } from "@/components/editor/presets";
import { getMarkdown } from "@/lib/editor/markdown";
// KaTeX 布局样式 + 自托管字体（public/fonts/katex）；编辑器样式表
import "@/styles/katex.css";
import "@/styles/tiptap.css";
import { cn } from "@/lib/utils";
import { type Editor, EditorContent, useEditor } from "@tiptap/react";
import { useEffect, useRef } from "react";

export type TiptapEditorProps = {
  /** 三套预设之一。 */
  preset: PresetName;
  /** Markdown 字符串（受控）。 */
  value: string;
  /** 内容变化回调，参数为最新 Markdown。 */
  onChange?: (markdown: string) => void;
  editable?: boolean;
  placeholder?: string;
  /** 图片上传实现；不传时图片相关入口会提示未配置。 */
  uploadFn?: UploadFn;
  /** 「AI 续写」实现；不传时 slash 菜单对应项提示未接入。 */
  aiContinue?: AiContinueFn;
  onReady?: (editor: Editor) => void;
  className?: string;
};

/**
 * TipTap 编辑器核心组件。
 *
 * - `immediatelyRender: false` 满足 Next 15 SSR 要求（配合 `dynamic(..., { ssr: false })` 懒加载）。
 * - 受控同步：外部 `value` 变化时 `setContent`，但用 `lastEmitted` 避免把自己的输出再打回去。
 * - 注意 `uploadFn` 请用 `useCallback` / `useMemo` 保持引用稳定，否则会重建编辑器实例。
 */
export function TiptapEditorImpl(props: TiptapEditorProps) {
  const {
    preset,
    value,
    onChange,
    editable = true,
    placeholder,
    uploadFn,
    aiContinue,
    onReady,
    className,
  } = props;

  // readonly 预设不含交互与 undo 扩展：强制只读并跳过 Toolbar / BubbleMenu，
  // 否则工具栏对不存在的命令（can().undo()）求值会直接抛错、炸掉整个 React 树。
  const isReadonlyPreset = preset === "readonly";
  const effectiveEditable = isReadonlyPreset ? false : editable;

  const lastEmitted = useRef(value);
  const onChangeRef = useRef(onChange);
  const onReadyRef = useRef(onReady);
  onChangeRef.current = onChange;
  onReadyRef.current = onReady;

  const editor = useEditor(
    {
      extensions: presets[preset]({ uploadFn, aiContinue, placeholder }),
      content: value,
      editable: effectiveEditable,
      immediatelyRender: false,
      shouldRerenderOnTransaction: false,
      onUpdate: ({ editor: current }) => {
        const markdown = getMarkdown(current);
        lastEmitted.current = markdown;
        onChangeRef.current?.(markdown);
      },
      editorProps: {
        attributes: {
          class:
            "anynote-editor__content prose prose-neutral dark:prose-invert max-w-none focus:outline-none",
        },
      },
    },
    [preset, placeholder, uploadFn, aiContinue],
  );

  // 外部 value 变化（如切换示例内容）时同步进编辑器，避免覆盖用户正在输入的内容
  useEffect(() => {
    if (!editor) {
      return;
    }
    if (value === lastEmitted.current) {
      return;
    }
    if (value === getMarkdown(editor)) {
      lastEmitted.current = value;
      return;
    }
    lastEmitted.current = value;
    editor.commands.setContent(value, { emitUpdate: false });
  }, [editor, value]);

  useEffect(() => {
    editor?.setEditable(effectiveEditable);
  }, [editor, effectiveEditable]);

  useEffect(() => {
    if (editor) {
      onReadyRef.current?.(editor);
    }
  }, [editor]);

  return (
    <div className={cn("anynote-editor", className)} data-preset={preset}>
      {effectiveEditable ? (
        <Toolbar editor={editor} variant={preset === "minimal" ? "minimal" : "full"} />
      ) : null}
      {effectiveEditable ? <BubbleMenuPortal editor={editor} /> : null}
      <EditorContent editor={editor} className="anynote-editor__surface" />
    </div>
  );
}
