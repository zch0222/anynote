"use client";

/*
 * 这个弹层是「组合框 + 浮层」的复合控件：焦点始终留在正文编辑器里，
 * 当前项靠编辑器上的 `aria-activedescendant` 转发给辅助技术。
 * 原生 select / ul / option 拿不到这套行为（它们要求焦点真的在控件上），
 * 所以整个文件按 ARIA 1.2 的 listbox 模式手写，本规则在这里是误报。
 */

import type { SlashItem } from "@/components/editor/extensions/slash-items";
import { cn } from "@/lib/utils";
import { type Ref, useEffect, useImperativeHandle, useRef, useState } from "react";

/** 命令面板的 listbox id：编辑器用它连上 `aria-controls`。 */
export const SLASH_LISTBOX_ID = "anynote-slash-listbox";

/** 选项 id：稳定、可被 `aria-activedescendant` 引用。 */
export function slashOptionId(index: number) {
  return `anynote-slash-option-${index}`;
}

export type SlashMenuListProps = {
  items: SlashItem[];
  command: (item: SlashItem) => void;
  /** React 19 起 `ref` 作为普通属性传递，无需 forwardRef。 */
  ref?: Ref<SlashMenuListHandle>;
  /**
   * 当前激活项变化时回传选项 id（无选项时 `null`）。
   *
   * 焦点始终留在编辑器里，所以“我高亮的是哪一项”只能通过
   * `aria-activedescendant` 表达，不能靠选项自己拿焦点。
   */
  onActiveOptionChange?: ((optionId: string | null) => void) | undefined;
};

export type SlashMenuListHandle = {
  /** 返回 true 表示已消费该按键（Suggestion 会阻止默认行为）。 */
  onKeyDown: (event: KeyboardEvent) => boolean;
};

/** Slash 菜单弹层：方向键 / Enter 由父级通过 ref 转发。 */
export function SlashMenuList({ items, command, ref, onActiveOptionChange }: SlashMenuListProps) {
  const [selected, setSelected] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const previousItems = useRef(items);

  // 命令列表变化时把高亮重置到第一项。用渲染期派生状态而不是 effect，
  // 避免多一次无谓的提交（React 官方推荐的 adjust-state-during-render 模式）。
  if (previousItems.current !== items) {
    previousItems.current = items;
    if (selected !== 0) {
      setSelected(0);
    }
  }

  useEffect(() => {
    const node = listRef.current?.children[selected];
    if (node instanceof HTMLElement) {
      node.scrollIntoView({ block: "nearest" });
    }
  }, [selected]);

  // 把激活项同步给 `aria-activedescendant`（走查 E-04：此前只有视觉高亮，
  // 辅助技术拿不到"当前选中哪一项"）。
  useEffect(() => {
    onActiveOptionChange?.(items.length === 0 ? null : slashOptionId(selected));
  }, [items.length, onActiveOptionChange, selected]);

  useImperativeHandle(
    ref,
    () => ({
      onKeyDown: (event: KeyboardEvent) => {
        if (items.length === 0) {
          return false;
        }
        if (event.key === "ArrowUp") {
          setSelected((current) => (current + items.length - 1) % items.length);
          return true;
        }
        if (event.key === "ArrowDown") {
          setSelected((current) => (current + 1) % items.length);
          return true;
        }
        if (event.key === "Enter") {
          const item = items[selected];
          if (item) {
            command(item);
          }
          return true;
        }
        return false;
      },
    }),
    [items, selected, command],
  );

  if (items.length === 0) {
    return (
      <output
        className="anynote-slash-menu anynote-slash-menu--empty"
        data-testid="slash-menu"
        aria-live="polite"
      >
        没有匹配的命令
      </output>
    );
  }

  return (
    <div className="anynote-slash-menu" data-testid="slash-menu">
      {/*
        焦点**故意**留在正文里：弹层自己拿不到焦点，当前项靠编辑器上的
        `aria-activedescendant` 转发给辅助技术。原生 select / ul 拿不到这套行为，
        所以这里的 listbox / option 是自定义复合控件（组合框 + 弹层）的一部分。
      */}
      {/* biome-ignore lint/a11y/useSemanticElements: 焦点不在弹层上，原生 select/ul 拿不到 aria-activedescendant 这套行为 */}
      {/* biome-ignore lint/a11y/useFocusableInteractive: listbox 不进 Tab 序列——焦点始终在编辑器里 */}
      <div
        ref={listRef}
        id={SLASH_LISTBOX_ID}
        role="listbox"
        aria-label="插入命令"
        className="anynote-slash-menu__list"
      >
        {/*
          按下时不让焦点离开编辑器（`onMouseDown` 里阻止默认行为，命令仍在 click 里执行）：
          焦点一旦跑到弹层里，`aria-activedescendant` 这条「编辑器 → 当前选项」的关联就断了。
        */}
        {items.map((item, index) => (
          // biome-ignore lint/a11y/useSemanticElements: option 是自定义 listbox 的成员，原生 option 只能待在 select 里
          // biome-ignore lint/a11y/useFocusableInteractive: 选项不进 Tab 序列，激活态由 aria-activedescendant 表达
          // biome-ignore lint/a11y/useKeyWithClickEvents: 键盘（↑ / ↓ / Enter）由弹层在编辑器侧统一处理，见 onKeyDown
          <div
            key={`${item.group}-${item.title}`}
            id={slashOptionId(index)}
            role="option"
            aria-selected={index === selected}
            className={cn("anynote-slash-menu__item", index === selected && "is-selected")}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => command(item)}
          >
            <span className="anynote-slash-menu__title">{item.title}</span>
            <span className="anynote-slash-menu__description">{item.description}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
