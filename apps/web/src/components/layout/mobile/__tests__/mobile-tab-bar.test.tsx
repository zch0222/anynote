import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const pathname = vi.hoisted(() => ({ current: "/m/dashboard" }));

vi.mock("next/navigation", () => ({
  usePathname: () => pathname.current,
}));

import { MobileTabBar } from "@/components/layout/mobile/mobile-tab-bar";
import { mobileTabs } from "@/components/layout/navigation";
import { renderWithProviders } from "@/test/render";

describe("MobileTabBar", () => {
  it("四格顺序、目标与当前格高亮（aria-current）正确", () => {
    pathname.current = "/m/notes/3/7"; // 深层路由也要点亮所属 tab
    renderWithProviders(<MobileTabBar />);

    const links = screen.getAllByRole("link");
    expect(links.map((a) => a.textContent)).toEqual(mobileTabs.map((t) => `${t.title}`));
    expect(links.map((a) => a.getAttribute("href"))).toEqual(mobileTabs.map((t) => t.href));
    expect(links[1]?.getAttribute("aria-current")).toBe("page");
    expect(links[0]?.getAttribute("aria-current")).toBeNull();
  });

  /**
   * 复现「底栏图标不居中、padding 不对」：`text-[0.6875rem]`（任意值字号）不带
   * 行高，标签继承 body 的 24px 行盒——11px 的字悬在 24px 行盒中部，图标被顶到
   * 胶囊上沿（顶留白 1px）、文字视觉下坠（底留白 7px），整格上下节奏失衡
   * （设计稿 M-01 底栏像素实测：图标 ≈22px、顶留白 ≈5、图标-文字 ≈7、文字行 ≈13）。
   * 修复 = 图标 22px + 标签显式 13px 行盒 + 图标-文字 5px 间距，48 高胶囊内
   * 上下各留 ≈4px。
   */
  it("图标与标签自带紧凑行高节奏，不继承 body 的 24px 行盒", () => {
    renderWithProviders(<MobileTabBar />);

    for (const link of screen.getAllByRole("link")) {
      const icon = link.querySelector("svg");
      expect(icon, "tab 图标").toHaveClass("size-[22px]");

      const label = link.querySelector("span");
      expect(label, "tab 标签").toHaveClass("leading-[13px]");
      expect(link.className).toContain("gap-[5px]");
    }
  });
});
