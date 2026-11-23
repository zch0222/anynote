import { render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const push = vi.hoisted(() => vi.fn());
vi.mock("@/features/auth/use-me", () => ({ useMe: () => ({ data: undefined }) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("@/features/side-panel/registry", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/features/side-panel/registry")>();
  return {
    ...actual,
    getTabDefinition: (kind: string) => {
      const definition = actual.getTabDefinition(kind);
      return kind === "doc" ? { ...definition, mobile: false } : definition;
    },
  };
});

import { SidePanelMobileHost } from "@/features/side-panel/mobile/host";
import { useSidePanelStore } from "@/features/side-panel/store";

/**
 * 移动端标签定义 mobile 标志的测试。
 *
 * @author 称霸幼儿园
 */
beforeEach(() => {
  push.mockClear();
  useSidePanelStore.setState({ surfaces: {}, guards: {}, newWindowHandlers: {} });
});

describe("移动端标签定义", () => {
  /** mobile 为 false 时仍整页跳转，不打开覆盖层标签。 */
  it("mobile 为 false 时整页跳转", async () => {
    render(
      <SidePanelMobileHost
        surface="chat:c1"
        pending={{
          input: { kind: "citation", citation: { sourceId: "doc:7", kbId: 3 } },
          focus: false,
          seq: 1,
        }}
        panelOpen={false}
        onPanelOpenChange={vi.fn()}
        onTabCountChange={vi.fn()}
      />,
    );

    await waitFor(() => expect(push).toHaveBeenCalledWith("/m/ai/pdf/7"));
    expect(useSidePanelStore.getState().surfaces["chat:c1"]).toBeUndefined();
  });

  /** mobile 为 true 时在覆盖层里打开标签。 */
  it("mobile 为 true 时打开标签", async () => {
    render(
      <SidePanelMobileHost
        surface="chat:c1"
        pending={{
          input: { kind: "citation", citation: { sourceId: "note:5", kbId: 3 } },
          focus: false,
          seq: 1,
        }}
        panelOpen={false}
        onPanelOpenChange={vi.fn()}
        onTabCountChange={vi.fn()}
      />,
    );

    await waitFor(() =>
      expect(useSidePanelStore.getState().surfaces["chat:c1"]?.tabs).toHaveLength(1),
    );
    expect(push).not.toHaveBeenCalled();
  });
});
