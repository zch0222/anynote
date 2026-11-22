import { ResizeHandle } from "@/features/side-panel/desktop/resize-handle";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

/**
 * 拖拽条键盘与双击测试。
 *
 * @author 称霸幼儿园
 */
describe("侧栏拖拽条", () => {
  /** 方向键每次 16px，Home / End 到上下限。 */
  it("键盘调整宽度", () => {
    const onCommit = vi.fn();
    render(
      <ResizeHandle
        width={500}
        minWidth={360}
        maxWidth={900}
        onResize={vi.fn()}
        onCommit={onCommit}
        onReset={vi.fn()}
      />,
    );
    const handle = screen.getByRole("separator");

    fireEvent.keyDown(handle, { key: "ArrowLeft" });
    expect(onCommit).toHaveBeenLastCalledWith(516);
    fireEvent.keyDown(handle, { key: "ArrowRight" });
    expect(onCommit).toHaveBeenLastCalledWith(484);
    fireEvent.keyDown(handle, { key: "Home" });
    expect(onCommit).toHaveBeenLastCalledWith(360);
    fireEvent.keyDown(handle, { key: "End" });
    expect(onCommit).toHaveBeenLastCalledWith(900);
    expect(handle).toHaveAttribute("aria-valuenow", "500");
    expect(handle).toHaveAttribute("aria-valuemin", "360");
    expect(handle).toHaveAttribute("aria-valuemax", "900");
  });

  /** 双击恢复默认宽度。 */
  it("双击复位", () => {
    const onReset = vi.fn();
    render(
      <ResizeHandle
        width={500}
        minWidth={360}
        maxWidth={900}
        onResize={vi.fn()}
        onCommit={vi.fn()}
        onReset={onReset}
      />,
    );
    fireEvent.doubleClick(screen.getByRole("separator"));
    expect(onReset).toHaveBeenCalledOnce();
  });
});
