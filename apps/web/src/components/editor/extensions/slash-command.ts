import type { SlashMenuListHandle, SlashMenuListProps } from "@/components/editor/core/slash-menu";
import { SlashMenuList } from "@/components/editor/core/slash-menu";
import type { UploadFn } from "@/components/editor/extensions/anynote-image";
import {
  type SlashItem,
  createSlashItems,
  filterSlashItems,
} from "@/components/editor/extensions/slash-items";
import type { AiContinueFn } from "@/components/editor/presets/types";
import { Extension } from "@tiptap/core";
import { ReactRenderer } from "@tiptap/react";
import Suggestion from "@tiptap/suggestion";

export type SlashCommandOptions = {
  uploadFn?: UploadFn | undefined;
  aiContinue?: AiContinueFn | undefined;
};

/**
 * `slash-command`：基于 `@tiptap/suggestion` 的 `/` 唤起菜单。
 * 弹层用 `ReactRenderer` 渲染，用 `clientRect` 手动定位（不引入 tippy 依赖）。
 */
export const SlashCommand = Extension.create<SlashCommandOptions>({
  name: "slashCommand",

  addOptions() {
    return {};
  },

  addProseMirrorPlugins() {
    const items = createSlashItems({
      uploadFn: this.options.uploadFn,
      aiContinue: this.options.aiContinue,
    });

    return [
      Suggestion<SlashItem, SlashItem>({
        editor: this.editor,
        char: "/",
        startOfLine: false,
        allowSpaces: false,
        items: ({ query }) => filterSlashItems(items, query),
        command: ({ editor, range, props }) => props.run({ editor, range }),
        render: () => {
          let renderer: ReactRenderer<SlashMenuListHandle, SlashMenuListProps> | null = null;

          const place = (
            element: HTMLElement,
            clientRect: (() => DOMRect | null) | null | undefined,
          ) => {
            const box = clientRect?.();
            if (!box) {
              return;
            }
            element.style.position = "fixed";
            element.style.left = `${box.left}px`;
            element.style.top = `${box.bottom + 6}px`;
            element.style.zIndex = "60";
          };

          return {
            onStart: (props) => {
              renderer = new ReactRenderer<SlashMenuListHandle, SlashMenuListProps>(SlashMenuList, {
                props: { items: props.items, command: props.command },
                editor: props.editor,
              });
              document.body.appendChild(renderer.element);
              place(renderer.element, props.clientRect);
            },
            onUpdate: (props) => {
              if (!renderer) {
                return;
              }
              renderer.updateProps({ items: props.items, command: props.command });
              place(renderer.element, props.clientRect);
            },
            onKeyDown: (props) => {
              if (props.event.key === "Escape") {
                return false;
              }
              return renderer?.ref?.onKeyDown(props.event) ?? false;
            },
            onExit: () => {
              renderer?.destroy();
              renderer?.element.remove();
              renderer = null;
            },
          };
        },
      }),
    ];
  },
});
