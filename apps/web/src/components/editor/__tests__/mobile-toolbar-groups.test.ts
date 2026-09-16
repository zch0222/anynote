import {
  MOBILE_OVERFLOW,
  MOBILE_OVERFLOW_GROUPS,
  MOBILE_PRIMARY,
} from "@/components/editor/core/mobile-toolbar-groups";
import {
  FULL_LAYOUT,
  MINIMAL_LAYOUT,
  TOOLBAR_COMMAND_IDS,
  TOOLBAR_DIVIDER,
} from "@/components/editor/core/toolbar-commands";
import { describe, expect, it } from "vitest";

describe("移动端工具条命令分组", () => {
  /*
   * M-09 画板实测的命令集是
   * `B I H2 •列表 1.列表 ☑列表 🔗链接 🖼图片 ⋯`——**8 个命令 + 末位「⋯」**。
   * 早先是 10 个且以 `image, codeBlock, undo` 结尾，390 宽下多出「<>」按钮，
   * 把画板的「⋯」挤出右缘。所以这里断言的是精确集合，不只是长度。
   */
  it("常驻 8 个命令，与 M-09 画板逐个对齐", () => {
    expect(MOBILE_PRIMARY).toEqual([
      "bold",
      "italic",
      "heading2",
      "bulletList",
      "orderedList",
      "taskList",
      "link",
      "image",
    ]);
  });

  it("常驻与「更多」不重叠", () => {
    const overlap = MOBILE_PRIMARY.filter((id) => MOBILE_OVERFLOW.includes(id));
    expect(overlap).toEqual([]);
  });

  it("两者合起来覆盖全部注册命令——漏掉的命令在手机上永远点不到", () => {
    const covered = new Set([...MOBILE_PRIMARY, ...MOBILE_OVERFLOW]);
    expect([...covered].sort()).toEqual([...TOOLBAR_COMMAND_IDS].sort());
  });

  it("分组内部不重复", () => {
    expect(new Set(MOBILE_OVERFLOW).size).toBe(MOBILE_OVERFLOW.length);
  });

  it("高频写作命令在常驻里，低频的代码块与撤销退到「更多」", () => {
    for (const id of ["bold", "italic", "heading2", "bulletList", "image"] as const) {
      expect(MOBILE_PRIMARY).toContain(id);
    }
    // 这两个是画板没画、且曾经挤掉「⋯」的按钮：仍可达，但不再常驻
    for (const id of ["codeBlock", "undo"] as const) {
      expect(MOBILE_PRIMARY).not.toContain(id);
      expect(MOBILE_OVERFLOW).toContain(id);
    }
  });

  it("每个分组都有标题与至少一个命令", () => {
    for (const group of MOBILE_OVERFLOW_GROUPS) {
      expect(group.label.length).toBeGreaterThan(0);
      expect(group.ids.length).toBeGreaterThan(0);
    }
  });
});

describe("桌面排版表", () => {
  it("full 覆盖全部命令，顺序里带分隔符", () => {
    const commands = FULL_LAYOUT.filter((slot) => slot !== TOOLBAR_DIVIDER);
    expect([...commands].sort()).toEqual([...TOOLBAR_COMMAND_IDS].sort());
    expect(FULL_LAYOUT).toContain(TOOLBAR_DIVIDER);
  });

  it("minimal 是 full 的子集，且不含块级命令", () => {
    const commands = MINIMAL_LAYOUT.filter((slot) => slot !== TOOLBAR_DIVIDER);
    for (const id of commands) expect(TOOLBAR_COMMAND_IDS).toContain(id);
    for (const id of ["table", "image", "codeBlock", "taskList"] as const) {
      expect(commands).not.toContain(id);
    }
  });

  it("排版表里没有重复命令", () => {
    const commands = FULL_LAYOUT.filter((slot) => slot !== TOOLBAR_DIVIDER);
    expect(new Set(commands).size).toBe(commands.length);
  });
});
