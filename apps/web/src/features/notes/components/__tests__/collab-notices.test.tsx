import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CollabNotices } from "../collab-notices";

const base = { fatal: null, recoveredMarkdown: null, dismissRecovered: () => {} };

afterEach(() => {
  vi.restoreAllMocks();
});

describe("CollabNotices", () => {
  it("没有需要提示的事时不渲染", () => {
    const { container } = render(<CollabNotices collab={base} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("编辑器版本不符时提示刷新", () => {
    render(<CollabNotices collab={{ ...base, fatal: { kind: "outdated", serverVersion: 2 } }} />);
    expect(screen.getByTestId("collab-outdated")).toHaveTextContent("刷新页面后可以继续编辑");
    expect(screen.getByRole("button", { name: "刷新页面" })).toBeInTheDocument();
  });

  it("笔记已删除时提示只读", () => {
    render(<CollabNotices collab={{ ...base, fatal: { kind: "deleted" } }} />);
    expect(screen.getByTestId("collab-deleted")).toHaveTextContent("这篇笔记已被删除");
  });

  it("谱系重建取回的内容可以复制，也可以关闭", async () => {
    const writeText = vi.fn(async () => {});
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    const dismissRecovered = vi.fn();
    render(
      <CollabNotices
        collab={{ ...base, recoveredMarkdown: "# 标题\n\n没同步的改动", dismissRecovered }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "复制未同步的内容" }));
    expect(writeText).toHaveBeenCalledWith("# 标题\n\n没同步的改动");
    await waitFor(() => expect(screen.getByRole("button", { name: "已复制" })).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: "关闭" }));
    expect(dismissRecovered).toHaveBeenCalledOnce();
  });
});
