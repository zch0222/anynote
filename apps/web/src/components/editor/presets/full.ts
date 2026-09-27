import { AnynoteImage } from "@/components/editor/extensions/anynote-image";
import { AnynoteBlockMath, AnynoteInlineMath } from "@/components/editor/extensions/anynote-math";
import { CodeBlockShiki } from "@/components/editor/extensions/code-block-shiki";
import { SlashCommand } from "@/components/editor/extensions/slash-command";
import { DEFAULT_PLACEHOLDER, type PresetContext } from "@/components/editor/presets/types";
import { coreExtensions } from "@anynote/editor-core";
import type { Extensions } from "@tiptap/core";
import CharacterCount from "@tiptap/extension-character-count";
import Placeholder from "@tiptap/extension-placeholder";

/**
 * `full`：笔记 / 文档编辑。
 *
 * schema 与 Markdown 规则来自 `@anynote/editor-core` 的 `coreExtensions()`（与协同服务同一份），
 * 这里只替换带界面的扩展（KaTeX、Shiki、图片上传），并追加占位符、字数统计与 Slash 菜单。
 */
export function full(ctx: PresetContext): Extensions {
  return [
    ...coreExtensions({
      undoRedo: ctx.undoRedo,
      overrides: {
        inlineMath: AnynoteInlineMath,
        blockMath: AnynoteBlockMath,
        codeBlock: CodeBlockShiki,
        image: AnynoteImage.configure({ uploadFn: ctx.uploadFn }),
      },
    }),
    Placeholder.configure({ placeholder: ctx.placeholder ?? DEFAULT_PLACEHOLDER }),
    CharacterCount,
    SlashCommand.configure({ uploadFn: ctx.uploadFn, aiContinue: ctx.aiContinue }),
  ];
}
