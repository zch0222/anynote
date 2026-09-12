"use client";

import type { Editor } from "@tiptap/core";
import { useCallback, useRef, useState } from "react";

function leadingHeading(editor: Editor): string | null {
  const first = editor.state.doc.firstChild;
  if (first?.type.name !== "heading" || first.attrs.level !== 1) return null;
  return first.textContent.trim() || null;
}

/** 顶部 H1 改动时同步笔记标题；正文改动不覆盖手动命名，空 H1 不清空标题。 */
export function useNoteTitle() {
  const [title, setTitleState] = useState("");
  const titleRef = useRef("");
  const headingRef = useRef<string | null>(null);

  const setTitle = useCallback((next: string) => {
    titleRef.current = next;
    setTitleState(next);
  }, []);

  const onEditorReady = useCallback((editor: Editor) => {
    // 加载与切换笔记只建立基线，不因打开旧笔记就写回数据。
    headingRef.current = leadingHeading(editor);
  }, []);

  const getTitleForContent = useCallback(
    (editor: Editor) => {
      const heading = leadingHeading(editor);
      if (heading !== null && heading !== headingRef.current) setTitle(heading);
      headingRef.current = heading;
      // React 状态要到下一次渲染才更新，保存当前正文必须立即拿到新的标题。
      return titleRef.current;
    },
    [setTitle],
  );

  return { title, setTitle, onEditorReady, getTitleForContent };
}
