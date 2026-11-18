import { AiCitation } from "@/components/editor/extensions/ai-citation";
import { AnynoteImage } from "@/components/editor/extensions/anynote-image";
import { AnynoteBlockMath, AnynoteInlineMath } from "@/components/editor/extensions/anynote-math";
import { CodeBlockShiki } from "@/components/editor/extensions/code-block-shiki";
import {
  AnynoteTightTaskList,
  MarkdownBridge,
  StarterKit,
  Table,
  TableCell,
  TableHeader,
  TableRow,
  TaskItem,
  TaskList,
  Typography,
} from "@anynote/editor-core";
import type { Extensions } from "@tiptap/core";

const OBJECT_IMAGE_PATH = /^\/api\/proxy\/file\/objects\/[1-9]\d*\/redirect$/;

/** 判断图片地址是否为本站文件服务的对象重定向地址。 */
export function isAiAnswerImageUri(src: string, origin = window.location.origin): boolean {
  try {
    const url = new URL(src, origin);
    return url.origin === origin && OBJECT_IMAGE_PATH.test(url.pathname);
  } catch {
    return false;
  }
}

const AiAnswerImage = AnynoteImage.extend({
  parseHTML() {
    return [
      {
        tag: "img[src]",
        getAttrs: (element: HTMLElement) =>
          isAiAnswerImageUri(element.getAttribute("src") ?? "") ? null : false,
      },
    ];
  },
});

/**
 * AI 回答专用只读预设：保留外部链接，只放行本站对象存储图片。
 *
 * @author 称霸幼儿园
 */
export function aiAnswer(): Extensions {
  return [
    StarterKit.configure({
      codeBlock: false,
      underline: false,
      undoRedo: false,
      trailingNode: false,
      link: {
        openOnClick: true,
        autolink: true,
        linkOnPaste: false,
        HTMLAttributes: { target: "_blank", rel: "noopener noreferrer nofollow" },
      },
    }),
    Typography,
    TaskList,
    TaskItem.configure({ nested: true }),
    AnynoteTightTaskList,
    Table.configure({ resizable: false }),
    TableRow,
    TableHeader,
    TableCell,
    AnynoteInlineMath,
    AnynoteBlockMath,
    CodeBlockShiki,
    AiAnswerImage,
    AiCitation,
    MarkdownBridge,
  ];
}
