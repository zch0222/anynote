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
  it("常驻 10 个命令——再多单行横滑就失去意义", () => {
    expect(MOBILE_PRIMARY).toHaveLength(10);
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

  it("高频写作命令在常驻里", () => {
    for (const id of ["bold", "italic", "bulletList", "undo", "image"] as const) {
      expect(MOBILE_PRIMARY).toContain(id);
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
