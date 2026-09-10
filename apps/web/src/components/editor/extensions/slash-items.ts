import type { UploadFn } from "@/components/editor/extensions/anynote-image";
import type { Editor, Range } from "@tiptap/core";
import { toast } from "sonner";

/** Slash 菜单项。`run` 负责删除触发文本并执行命令。 */
export type SlashItem = {
  title: string;
  description: string;
  group: string;
  keywords: string[];
  run: (props: { editor: Editor; range: Range }) => void;
};

export type SlashContext = {
  uploadFn?: UploadFn | undefined;
};

function pickImageFile(uploadFn: UploadFn | undefined, editor: Editor, range: Range) {
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
    editor.chain().focus().deleteRange(range).run();
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

function heading(level: 1 | 2 | 3) {
  return ({ editor, range }: { editor: Editor; range: Range }) => {
    editor.chain().focus().deleteRange(range).setNode("heading", { level }).run();
  };
}

/** 按上下文（是否配置上传）生成 slash 菜单项。 */
export function createSlashItems(context: SlashContext): SlashItem[] {
  return [
    {
      title: "一级标题",
      description: "大标题",
      group: "标题",
      keywords: ["h1", "heading", "title", "biao ti"],
      run: heading(1),
    },
    {
      title: "二级标题",
      description: "中标题",
      group: "标题",
      keywords: ["h2", "heading", "biao ti"],
      run: heading(2),
    },
    {
      title: "三级标题",
      description: "小标题",
      group: "标题",
      keywords: ["h3", "heading", "biao ti"],
      run: heading(3),
    },
    {
      title: "无序列表",
      description: "项目符号列表",
      group: "列表",
      keywords: ["bullet", "list", "ul", "lie biao"],
      run: ({ editor, range }) =>
        editor.chain().focus().deleteRange(range).toggleBulletList().run(),
    },
    {
      title: "有序列表",
      description: "数字编号列表",
      group: "列表",
      keywords: ["ordered", "number", "ol", "lie biao"],
      run: ({ editor, range }) =>
        editor.chain().focus().deleteRange(range).toggleOrderedList().run(),
    },
    {
      title: "任务列表",
      description: "待办清单",
      group: "列表",
      keywords: ["task", "todo", "check", "ren wu"],
      run: ({ editor, range }) => editor.chain().focus().deleteRange(range).toggleTaskList().run(),
    },
    {
      title: "引用",
      description: "引用一段内容",
      group: "块",
      keywords: ["quote", "blockquote", "yin yong"],
      run: ({ editor, range }) =>
        editor.chain().focus().deleteRange(range).toggleBlockquote().run(),
    },
    {
      title: "代码块",
      description: "带语法高亮的代码",
      group: "块",
      keywords: ["code", "codeblock", "dai ma"],
      run: ({ editor, range }) => editor.chain().focus().deleteRange(range).toggleCodeBlock().run(),
    },
    {
      title: "表格",
      description: "3 × 3 表格",
      group: "块",
      keywords: ["table", "biao ge"],
      run: ({ editor, range }) =>
        editor
          .chain()
          .focus()
          .deleteRange(range)
          .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
          .run(),
    },
    {
      title: "分割线",
      description: "水平分隔",
      group: "块",
      keywords: ["divider", "hr", "line", "fen ge"],
      run: ({ editor, range }) =>
        editor.chain().focus().deleteRange(range).setHorizontalRule().run(),
    },
    {
      title: "图片",
      description: "上传本地图片",
      group: "媒体",
      keywords: ["image", "picture", "upload", "tu pian"],
      run: ({ editor, range }) => pickImageFile(context.uploadFn, editor, range),
    },
    {
      title: "提示块",
      description: "信息 / 警告 / 危险",
      group: "块",
      keywords: ["callout", "note", "info", "warn", "ti shi"],
      run: ({ editor, range }) =>
        editor
          .chain()
          .focus()
          .deleteRange(range)
          .insertContent({
            type: "callout",
            attrs: { level: "info" },
            content: [{ type: "paragraph" }],
          })
          .run(),
    },
    {
      title: "警告块",
      description: "需要注意的内容",
      group: "块",
      keywords: ["callout", "warn", "warning", "jing gao"],
      run: ({ editor, range }) =>
        editor
          .chain()
          .focus()
          .deleteRange(range)
          .insertContent({
            type: "callout",
            attrs: { level: "warn" },
            content: [{ type: "paragraph" }],
          })
          .run(),
    },
    {
      title: "危险块",
      description: "高风险提示",
      group: "块",
      keywords: ["callout", "danger", "wei xian"],
      run: ({ editor, range }) =>
        editor
          .chain()
          .focus()
          .deleteRange(range)
          .insertContent({
            type: "callout",
            attrs: { level: "danger" },
            content: [{ type: "paragraph" }],
          })
          .run(),
    },
    {
      title: "行内公式",
      description: "KaTeX 行内公式",
      group: "数学",
      keywords: ["math", "latex", "formula", "gong shi"],
      run: ({ editor, range }) =>
        editor
          .chain()
          .focus()
          .deleteRange(range)
          .insertContent({ type: "inlineMath", attrs: { latex: "E = mc^2" } })
          .run(),
    },
    {
      title: "块级公式",
      description: "KaTeX 独立公式块",
      group: "数学",
      keywords: ["math", "latex", "formula", "block", "gong shi"],
      run: ({ editor, range }) =>
        editor
          .chain()
          .focus()
          .deleteRange(range)
          .insertContent({ type: "blockMath", attrs: { latex: "\\int_0^1 x^2 dx" } })
          .run(),
    },
    {
      title: "内部链接",
      description: "双链 [[笔记名]]",
      group: "引用关系",
      keywords: ["wikilink", "link", "backlink", "shuang lian"],
      run: ({ editor, range }) =>
        editor
          .chain()
          .focus()
          .deleteRange(range)
          .insertContent({ type: "wikilink", attrs: { target: "笔记名", label: null } })
          .run(),
    },
    {
      title: "AI 续写",
      description: "让 AI 接着写（M7 接入）",
      group: "AI",
      keywords: ["ai", "continue", "write", "xu xie"],
      run: ({ editor, range }) => {
        editor.chain().focus().deleteRange(range).run();
        toast.info("AI 续写将在 M7 接入");
      },
    },
  ];
}

/** 按 query 过滤（标题 / 关键词 / 分组）。 */
export function filterSlashItems(items: SlashItem[], query: string): SlashItem[] {
  const keyword = query.trim().toLowerCase();
  if (!keyword) {
    return items;
  }
  return items.filter((item) =>
    [item.title, item.description, item.group, ...item.keywords]
      .join(" ")
      .toLowerCase()
      .includes(keyword),
  );
}
