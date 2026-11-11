import {
  SLASH_LISTBOX_ID,
  SlashMenuList,
  type SlashMenuListHandle,
  slashOptionId,
} from "@/components/editor/core/slash-menu";
import type { SlashItem } from "@/components/editor/extensions/slash-items";
import { act, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

/**
 * Slash 菜单的可访问性语义（UI 走查 E-04）。
 *
 * 修之前：容器与列表都没有 role、`aria-selected` 永远为 0 项、
 * 编辑器上也没有 `aria-activedescendant`——视觉用户看到高亮，
 * 辅助技术却不知道当前选的是哪一条。
 */
const ITEMS: SlashItem[] = [
  {
    title: "一级标题",
    description: "大标题",
    group: "标题",
    keywords: ["h1"],
    run: vi.fn(),
  },
  {
    title: "表格",
    description: "3 × 3 表格",
    group: "块",
    keywords: ["table"],
    run: vi.fn(),
  },
];

function renderMenu({
  items = ITEMS,
  command = vi.fn(),
  onActiveOptionChange = vi.fn(),
}: {
  items?: SlashItem[];
  command?: (item: SlashItem) => void;
  onActiveOptionChange?: (optionId: string | null) => void;
} = {}) {
  const handle: { current: SlashMenuListHandle | null } = { current: null };
  render(
    <SlashMenuList
      items={items}
      command={command}
      onActiveOptionChange={onActiveOptionChange}
      ref={(next) => {
        handle.current = next;
      }}
    />,
  );
  return { handle, command, onActiveOptionChange };
}

describe("SlashMenuList 的 listbox 语义", () => {
  it("列表是 listbox，每项是 option，且只有第一项被标记为选中", () => {
    renderMenu();

    const listbox = screen.getByRole("listbox", { name: "插入命令" });
    expect(listbox).toHaveAttribute("id", SLASH_LISTBOX_ID);

    const options = screen.getAllByRole("option");
    expect(options).toHaveLength(2);
    expect(options[0]).toHaveAttribute("id", slashOptionId(0));
    expect(options[0]).toHaveAttribute("aria-selected", "true");
    expect(options[1]).toHaveAttribute("aria-selected", "false");
  });

  it("方向键改变 aria-selected，并把新激活项 id 回传给编辑器", () => {
    const { handle, onActiveOptionChange } = renderMenu();

    // 打开时先同步一次，调用方才好把 aria-activedescendant 写上
    expect(onActiveOptionChange).toHaveBeenLastCalledWith(slashOptionId(0));

    act(() => {
      expect(handle.current?.onKeyDown(new KeyboardEvent("keydown", { key: "ArrowDown" }))).toBe(
        true,
      );
    });

    const options = screen.getAllByRole("option");
    expect(options[0]).toHaveAttribute("aria-selected", "false");
    expect(options[1]).toHaveAttribute("aria-selected", "true");
    expect(onActiveOptionChange).toHaveBeenLastCalledWith(slashOptionId(1));
  });

  it("Enter 执行当前激活项", () => {
    const command = vi.fn();
    const { handle } = renderMenu({ command });

    act(() => {
      handle.current?.onKeyDown(new KeyboardEvent("keydown", { key: "ArrowDown" }));
    });
    act(() => {
      expect(handle.current?.onKeyDown(new KeyboardEvent("keydown", { key: "Enter" }))).toBe(true);
    });

    expect(command).toHaveBeenCalledWith(ITEMS[1]);
  });

  it("没有匹配项时给出可播报的空态，并清空激活项", () => {
    const { onActiveOptionChange } = renderMenu({ items: [] });
    // 空态用 <output>（隐式 role=status）+ aria-live，读屏会在过滤到 0 条时播报一次
    const empty = screen.getByRole("status");
    expect(empty).toHaveAttribute("data-testid", "slash-menu");
    expect(empty).toHaveAttribute("aria-live", "polite");
    expect(empty).toHaveTextContent("没有匹配的命令");
    expect(onActiveOptionChange).toHaveBeenLastCalledWith(null);
    expect(screen.queryByRole("option")).toBeNull();
  });
});
