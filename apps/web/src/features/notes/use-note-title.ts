"use client";

import type { Editor } from "@tiptap/core";
import { useCallback, useRef, useState } from "react";

function leadingHeading(editor: Editor): string | null {
  const first = editor.state.doc.firstChild;
  if (first?.type.name !== "heading" || first.attrs.level !== 1) return null;
  return first.textContent.trim() || null;
}

/**
 * 笔记标题**只来自正文的顶部 H1**（编辑器里没有独立的标题输入行，见
 * `lib/leading-heading.ts`）。这里只负责一件事：让标题与正文始终指向同一句话。
 *
 * 两条边界：
 * 1. 打开 / 切换笔记时先建立 H1 基线，只改正文不会重命名；
 * 2. 顶部 H1 被删空时不清空标题——用户正在改标题、文字暂时为空，
 *    这时候把标题抹掉会让目录与列表里那一条瞬间失去名字。
 *
 * `title` 供调用方读取当前标题（如移动端动作表的标题）；`getTitleForContent`
 * 在同一步里返回"与这次正文匹配的标题"，让标题与正文由同一份草稿保存。
 */
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
