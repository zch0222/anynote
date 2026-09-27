import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { leaveRecentlyConfirmed } from "../leave-confirmation";
import { useLeaveGuard } from "../use-leave-guard";

function Page({ active, onNavigate }: { active: boolean; onNavigate: () => void }) {
  useLeaveGuard(active, "改动尚未同步，确定离开吗？");
  return (
    <>
      <a
        href="/notes/1"
        onClick={(event) => {
          event.preventDefault();
          onNavigate();
        }}
      >
        站内链接
      </a>
      <a href="https://example.com/x">站外链接</a>
    </>
  );
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useLeaveGuard", () => {
  it("需要拦截时关页先弹确认", () => {
    render(<Page active onNavigate={() => {}} />);
    const event = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
  });

  it("站内跳转时弹确认框，取消即阻止跳转", () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    const onNavigate = vi.fn();
    render(<Page active onNavigate={onNavigate} />);

    fireEvent.click(screen.getByText("站内链接"));

    expect(confirm).toHaveBeenCalledWith("改动尚未同步，确定离开吗？");
    expect(onNavigate).not.toHaveBeenCalled();
  });

  it("确认离开时照常跳转", () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const onNavigate = vi.fn();
    render(<Page active onNavigate={onNavigate} />);

    fireEvent.click(screen.getByText("站内链接"));

    expect(onNavigate).toHaveBeenCalledOnce();
  });

  it("站外链接与带修饰键的点击交给浏览器", () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<Page active onNavigate={() => {}} />);

    fireEvent.click(screen.getByText("站外链接"));
    fireEvent.click(screen.getByText("站内链接"), { metaKey: true });

    expect(confirm).not.toHaveBeenCalled();
  });

  it("站内确认离开后，紧随其后的整页卸载不再弹第二次确认", () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<Page active onNavigate={() => {}} />);

    fireEvent.click(screen.getByText("站内链接"));
    const event = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(false);
  });

  it("取消离开不留记录，之后关页照常拦截；页面卸载时清掉确认记录", () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    const { unmount } = render(<Page active onNavigate={() => {}} />);

    fireEvent.click(screen.getByText("站内链接"));
    const first = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(first);
    expect(first.defaultPrevented).toBe(true);

    confirm.mockReturnValue(true);
    fireEvent.click(screen.getByText("站内链接"));
    unmount();
    expect(leaveRecentlyConfirmed()).toBe(false);
  });

  it("不需要拦截时什么都不做", () => {
    const confirm = vi.spyOn(window, "confirm");
    const onNavigate = vi.fn();
    render(<Page active={false} onNavigate={onNavigate} />);

    fireEvent.click(screen.getByText("站内链接"));
    const event = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(event);

    expect(confirm).not.toHaveBeenCalled();
    expect(onNavigate).toHaveBeenCalledOnce();
    expect(event.defaultPrevented).toBe(false);
  });
});
