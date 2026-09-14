"use client";

import { BubbleMenuPortal } from "@/components/editor/core/bubble-menu";
import { Toolbar, type ToolbarVariant } from "@/components/editor/core/toolbar";
import type { UploadFn } from "@/components/editor/extensions/anynote-image";
import {
  type AiContinueFn,
  type CollaborationBinding,
  type PresetName,
  presets,
} from "@/components/editor/presets";
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
  /** 内容变化回调，同时提供当前编辑器以读取结构化文档（如顶部标题）。 */
  onChange?: (markdown: string, editor: Editor) => void;
  editable?: boolean;
  placeholder?: string;
  /** 图片上传实现；不传时图片相关入口会提示未配置。 */
  uploadFn?: UploadFn;
  /** 「AI 续写」实现；不传时 slash 菜单对应项提示未接入。 */
  aiContinue?: AiContinueFn;
  /**
   * 协同绑定（配合 `preset="collaborative"`）。传了之后正文的唯一真相是 Y.Doc，
   * `value` 不再作为初始内容、也不再受控回灌。
   */
  collaboration?: CollaborationBinding;
  onReady?: (editor: Editor) => void;
  /**
   * 工具栏形态覆写。不传时按 preset 推导（`minimal` 预设用 minimal 工具栏，其余用 full），
   * 与移动端无关的调用方行为完全不变；移动端页面显式传 `"mobile"`。
   */
  toolbar?: ToolbarVariant;
  /**
   * 外层已经把编辑器约束到确定高度（如笔记页占满视口）时传 `true`：
   * 正文会撑满可滚动区，长文在编辑器内部滚动而不是把整页顶长。
   * 高度自适应的场景（playground、AI 输出）保持 `false`。
   */
  fill?: boolean;
  /**
   * 正文不自带内边距，留白交给外层。
   *
   * 笔记页的正文列自己有 `px-*`（标题、元信息、正文必须左右对齐成一条线），
   * 编辑器再叠一层 padding 会让标题比正文多缩进一截。默认 `false`，
   * 独立使用编辑器（playground 等）时仍自带内边距。
   */
  flush?: boolean;
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
    collaboration,
    onReady,
    toolbar,
    fill = false,
    flush = false,
    className,
  } = props;

  // 不传 toolbar 时沿用原来的推导，保证桌面调用方一行不用改
  const toolbarVariant: ToolbarVariant = toolbar ?? (preset === "minimal" ? "minimal" : "full");
  const isMobileToolbar = toolbarVariant === "mobile";
  /** 不渲染常驻工具条（设计稿的桌面编辑器形态）。 */
  const hasNoToolbar = toolbarVariant === "none";

  // readonly 预设不含交互与 undo 扩展：强制只读并跳过 Toolbar / BubbleMenu，
  // 否则工具栏对不存在的命令（can().undo()）求值会直接抛错、炸掉整个 React 树。
  const isReadonlyPreset = preset === "readonly";
  const effectiveEditable = isReadonlyPreset ? false : editable;

  const lastEmitted = useRef(value);
  const onChangeRef = useRef(onChange);
  const onReadyRef = useRef(onReady);
  onChangeRef.current = onChange;
  onReadyRef.current = onReady;

  // 协同模式下正文由 ySyncPlugin 从 Y.Doc 灌入：再设 content / setContent 会把内容写两遍。
  const isCollaborative = Boolean(collaboration);

  const editor = useEditor(
    {
      extensions: presets[preset]({ uploadFn, aiContinue, placeholder, collaboration }),
      ...(isCollaborative ? {} : { content: value }),
      editable: effectiveEditable,
      immediatelyRender: false,
      shouldRerenderOnTransaction: false,
      onUpdate: ({ editor: current, transaction }) => {
        // setEditable 也会发 update；权限同步不应在标题基线建立前触发正文保存。
        if (!transaction.docChanged) return;
        const markdown = getMarkdown(current);
        lastEmitted.current = markdown;
        onChangeRef.current?.(markdown, current);
      },
      editorProps: {
        attributes: {
          /*
           * 刻意**不用** `prose`（@tailwindcss/typography）。
           *
           * prose 是给"整页 Markdown 文档"用的：它会给 pre 套深色底、给行内 code
           * 加反引号伪元素、接管表格与引用的边框，与编辑器自己的节点样式正面冲突。
           * 此前靠"更高特异度一条条复写回来"压制它——那种做法要求每次都赌对
           * 两个样式表的加载顺序，而 CSS 的加载顺序由构建决定、不由我们决定。
           * 正文排版现在由 `styles/tiptap.css` 的「正文排版」一节负责，
           * 取值全部走语义 Token，没有需要复位的对手。
           */
          class: "anynote-editor__content max-w-none focus:outline-none",
        },
      },
    },
    [preset, placeholder, uploadFn, aiContinue, collaboration],
  );

  // 外部 value 变化（如切换示例内容）时同步进编辑器，避免覆盖用户正在输入的内容
  useEffect(() => {
    if (!editor || isCollaborative) {
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
  }, [editor, value, isCollaborative]);

  useEffect(() => {
    editor?.setEditable(effectiveEditable);
  }, [editor, effectiveEditable]);

  useEffect(() => {
    if (editor) {
      onReadyRef.current?.(editor);
    }
  }, [editor]);

  return (
    <div
      className={cn("anynote-editor", className)}
      data-preset={preset}
      data-toolbar={toolbarVariant}
      data-fill={fill ? "true" : undefined}
      data-flush={flush ? "true" : undefined}
    >
      {/* 移动端工具条贴底（靠近软键盘），所以放在正文之后 */}
      {effectiveEditable && !isMobileToolbar && !hasNoToolbar ? (
        <Toolbar editor={editor} variant={toolbarVariant} />
      ) : null}
      {/*
        气泡菜单在触摸端关掉：选区一出现，系统自己的「复制 / 粘贴 / 全选」菜单
        会盖在同一位置上，两个浮层互相打架，且气泡本身依赖 hover 定位。
        移动端的格式化入口是贴底工具条。

        `none` 形态下它是**唯一的**就地格式化入口（其余是 Slash 菜单与快捷键），
        所以这里不能跟着工具条一起关掉。
      */}
      {effectiveEditable && !isMobileToolbar ? <BubbleMenuPortal editor={editor} /> : null}
      <EditorContent editor={editor} className="anynote-editor__surface" />
      {effectiveEditable && isMobileToolbar ? <Toolbar editor={editor} variant="mobile" /> : null}
    </div>
  );
}
