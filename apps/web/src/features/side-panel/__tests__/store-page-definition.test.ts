import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../registry", () => ({
  resourceKind: (type: string) => type,
  tabDefinitions: [{ kind: "summary", family: "page", multiple: true, mobile: true }],
}));

import { useSidePanelStore } from "../store";

/**
 * 页面类标签读取定义字段的测试。
 *
 * @author 称霸幼儿园
 */
const SURFACE = "chat:c1";

function tabs() {
  return useSidePanelStore.getState().surfaces[SURFACE]?.tabs ?? [];
}

beforeEach(() => {
  useSidePanelStore.setState({ surfaces: {}, guards: {}, newWindowHandlers: {} });
});

describe("页面类标签定义", () => {
  /** 调用方未显式传参时按定义里的 multiple 决定是否新建。 */
  it("读取定义里的 multiple", () => {
    const store = useSidePanelStore.getState();
    store.openPage(SURFACE, "summary", "c1");
    store.openPage(SURFACE, "summary", "c1");
    expect(tabs()).toHaveLength(2);
  });

  /** 显式传参覆盖定义。 */
  it("调用方覆盖 multiple", () => {
    const store = useSidePanelStore.getState();
    store.openPage(SURFACE, "summary", "c1", false);
    store.openPage(SURFACE, "summary", "c1", false);
    expect(tabs()).toHaveLength(1);
  });
});
