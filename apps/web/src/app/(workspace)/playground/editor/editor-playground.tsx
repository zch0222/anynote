"use client";

import { TiptapEditor } from "@/components/editor/TiptapEditor";
import type { PresetName } from "@/components/editor/presets";
import { createNoteImageUploader } from "@/lib/editor/upload";
import { cn } from "@/lib/utils";
import { useMemo, useState } from "react";

const SAMPLES: Record<string, string> = {
  综合示例: `# 编辑器能力总览

这是一段**加粗**、*斜体*、++下划线++、~~删除线~~ 与 ==高亮== 混排的段落，还有 \`inline code\` 和 [链接](https://anynote.dev)。

## 列表

- 无序项 A
- 无序项 B

1. 有序项一
2. 有序项二

- [x] 已完成的任务
- [ ] 待办的任务

> [!INFO] 这是一个信息 Callout
> 支持 info / tip / warn / danger 四种语气。

> [!WARN] 注意
> Markdown 里以 \`> [!WARN]\` 开头即可。

## 代码

\`\`\`typescript
type User = { id: number; name: string };

export function greet(user: User): string {
  return \`hello, \${user.name}\`;
}
\`\`\`

## 数学

行内公式 $E = mc^2$，块级公式：

$$
\\int_0^1 x^2 \\, dx = \\frac{1}{3}
$$

## 表格

| 能力 | 状态 | 备注 |
| --- | --- | --- |
| 高亮 | 完成 | Shiki |
| 公式 | 完成 | KaTeX |

---

双链示例：[[项目手册|手册]]，以及内部链接 [[会议纪要]]。
`,
  空文档: "",
  纯文本: `这是一段纯文本，没有任何 Markdown 结构，用于验证工具栏在无格式内容上的行为。
`,
};

const PRESETS: Array<{ name: PresetName; label: string; description: string }> = [
  { name: "full", label: "full", description: "笔记 / 文档编辑：全部扩展 + Slash 菜单" },
  { name: "minimal", label: "minimal", description: "评论 / 输入框：基础排版" },
  { name: "readonly", label: "readonly", description: "预览 / AI 输出：只读渲染" },
];

export function EditorPlayground() {
  const [preset, setPreset] = useState<PresetName>("full");
  const [sample, setSample] = useState(Object.keys(SAMPLES)[0] ?? "综合示例");
  const [markdown, setMarkdown] = useState(() => SAMPLES[Object.keys(SAMPLES)[0] ?? ""] ?? "");
  const [lastEdited, setLastEdited] = useState("");

  const uploadFn = useMemo(() => createNoteImageUploader(), []);

  const selectSample = (name: string) => {
    setSample(name);
    const next = SAMPLES[name] ?? "";
    setMarkdown(next);
    setLastEdited(next);
  };

  return (
    <section className="mx-auto w-full max-w-6xl space-y-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">TipTap 编辑器 playground</h1>
        <p className="text-sm text-muted-foreground">
          仅开发环境可用。切换预设与示例内容，右侧查看实时序列化的 Markdown。
        </p>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        {PRESETS.map((item) => (
          <button
            key={item.name}
            type="button"
            title={item.description}
            onClick={() => setPreset(item.name)}
            className={cn(
              "rounded-md border px-3 py-1.5 text-sm",
              preset === item.name
                ? "border-transparent bg-primary text-primary-foreground"
                : "border-border bg-card text-muted-foreground hover:text-foreground",
            )}
          >
            {item.label}
          </button>
        ))}
        <span className="mx-2 h-5 w-px bg-border" />
        {Object.keys(SAMPLES).map((name) => (
          <button
            key={name}
            type="button"
            onClick={() => selectSample(name)}
            className={cn(
              "rounded-md border px-3 py-1.5 text-sm",
              sample === name
                ? "border-transparent bg-secondary text-secondary-foreground"
                : "border-border bg-card text-muted-foreground hover:text-foreground",
            )}
          >
            {name}
          </button>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-2">
          <h2 className="text-sm font-medium text-muted-foreground">编辑器（{preset}）</h2>
          <TiptapEditor
            preset={preset}
            value={markdown}
            editable={preset !== "readonly"}
            uploadFn={uploadFn}
            onChange={(next) => {
              setMarkdown(next);
              setLastEdited(next);
            }}
          />
        </div>
        <div className="space-y-2">
          <h2 className="text-sm font-medium text-muted-foreground">
            序列化输出（{lastEdited ? "实时" : "初始内容"}）
          </h2>
          <pre
            data-testid="playground-output"
            className="h-[420px] overflow-auto rounded-xl border bg-muted p-4 text-xs leading-relaxed"
          >
            {markdown}
          </pre>
        </div>
      </div>
    </section>
  );
}
