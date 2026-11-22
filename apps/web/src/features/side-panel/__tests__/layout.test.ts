import { describe, expect, it } from "vitest";
import { computeLayout, defaultPanelWidth } from "../layout";

/**
 * 侧栏宽度规则测试。
 *
 * @author 称霸幼儿园
 */
describe("侧栏布局", () => {
  /** 常见视口的默认宽度与三列/收起列表/覆盖三种结果。 */
  it("覆盖方案表格里的常见视口", () => {
    const rows = [
      { width: 1664, panelWidth: 666, showList: true, mode: "push" as const },
      { width: 1280, panelWidth: 512, showList: true, mode: "push" as const },
      { width: 1184, panelWidth: 456, showList: true, mode: "push" as const },
      { width: 1110, panelWidth: 382, showList: true, mode: "push" as const },
      { width: 1024, panelWidth: 420, showList: false, mode: "push" as const },
      { width: 1280, panelWidth: 512, showList: true, mode: "push" as const },
      { width: 768, panelWidth: 768, showList: true, mode: "overlay" as const },
      { width: 1024, panelWidth: 420, showList: false, mode: "push" as const },
    ];
    for (const row of rows) {
      const layout = computeLayout({ width: row.width, preferred: null, maximized: false });
      expect(layout.panelWidth).toBe(row.panelWidth);
      expect(layout.showList).toBe(row.showList);
      expect(layout.mode).toBe(row.mode);
    }
  });

  /** 三列与收起列表、覆盖的边界值。 */
  it("处理规则边界", () => {
    expect(computeLayout({ width: 1088, preferred: null, maximized: false }).mode).toBe("push");
    expect(computeLayout({ width: 1088, preferred: null, maximized: false }).showList).toBe(true);
    expect(computeLayout({ width: 1087, preferred: null, maximized: false }).showList).toBe(false);
    expect(computeLayout({ width: 800, preferred: null, maximized: false }).mode).toBe("push");
    expect(computeLayout({ width: 799, preferred: null, maximized: false }).mode).toBe("overlay");
    expect(computeLayout({ width: 799, preferred: null, maximized: false }).canMaximize).toBe(
      false,
    );
  });

  /** 最大化时铺满容器并保留最大化按钮。 */
  it("最大化覆盖容器", () => {
    const layout = computeLayout({ width: 1280, preferred: 512, maximized: true });
    expect(layout.mode).toBe("overlay");
    expect(layout.panelWidth).toBe(1280);
    expect(layout.canMaximize).toBe(true);
  });

  /** 用户拖动宽度被夹在当前规则的上下限内。 */
  it("夹住用户偏好宽度", () => {
    expect(computeLayout({ width: 1664, preferred: 500, maximized: false }).panelWidth).toBe(500);
    expect(computeLayout({ width: 1664, preferred: 100, maximized: false }).panelWidth).toBe(360);
    expect(computeLayout({ width: 1664, preferred: 5000, maximized: false }).panelWidth).toBe(936);
    expect(computeLayout({ width: 1664, preferred: Number.NaN, maximized: false }).panelWidth).toBe(
      666,
    );
  });

  /** 默认宽度四舍五入并夹在 420–720。 */
  it("计算默认宽度", () => {
    expect(defaultPanelWidth(1664)).toBe(666);
    expect(defaultPanelWidth(1024)).toBe(420);
    expect(defaultPanelWidth(2560)).toBe(720);
  });
});
