"use client";

import type { SlashItem } from "@/components/editor/extensions/slash-items";
import { cn } from "@/lib/utils";
import { type Ref, useEffect, useImperativeHandle, useRef, useState } from "react";

export type SlashMenuListProps = {
  items: SlashItem[];
  command: (item: SlashItem) => void;
  /** React 19 起 `ref` 作为普通属性传递，无需 forwardRef。 */
  ref?: Ref<SlashMenuListHandle>;
};

export type SlashMenuListHandle = {
  /** 返回 true 表示已消费该按键（Suggestion 会阻止默认行为）。 */
  onKeyDown: (event: KeyboardEvent) => boolean;
};

/** Slash 菜单弹层：方向键 / Enter 由父级通过 ref 转发。 */
export function SlashMenuList({ items, command, ref }: SlashMenuListProps) {
  const [selected, setSelected] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);
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
      <div className="anynote-slash-menu anynote-slash-menu--empty" data-testid="slash-menu">
        没有匹配的命令
      </div>
    );
  }

  return (
    <div className="anynote-slash-menu" data-testid="slash-menu">
      <ul ref={listRef} className="anynote-slash-menu__list">
        {items.map((item, index) => (
          <li key={`${item.group}-${item.title}`}>
            <button
              type="button"
              className={cn("anynote-slash-menu__item", index === selected && "is-selected")}
              onClick={() => command(item)}
            >
              <span className="anynote-slash-menu__title">{item.title}</span>
              <span className="anynote-slash-menu__description">{item.description}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
