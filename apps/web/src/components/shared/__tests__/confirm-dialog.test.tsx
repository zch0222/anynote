import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { ConfirmDialog } from "../confirm-dialog";

/** 打开状态由调用方持有，所以每个用例都要自带一个宿主。 */
function Harness({
  onConfirm,
  pending: initialPending = false,
}: {
  onConfirm: () => void;
  pending?: boolean;
}) {
  const [open, setOpen] = useState(true);
  const [pending, setPending] = useState(initialPending);

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={setOpen}
      title="删除这篇笔记？"
      description="删除后无法恢复。"
      confirmLabel="删除"
      pendingLabel="删除中…"
      tone="danger"
      pending={pending}
      onConfirm={() => {
        setPending(true);
        onConfirm();
      }}
    />
  );
}

describe("ConfirmDialog", () => {
  it("打开时焦点落在「取消」，回车不会直接触发破坏性操作", async () => {
    render(<Harness onConfirm={vi.fn()} />);

    // base-ui 的初始聚焦不在本次 commit 内同步生效（等弹层挂载完再聚焦），
    // 所以要等一拍——直接断言会读到 body，误判成没聚焦。
    await waitFor(() => expect(screen.getByRole("button", { name: "取消" })).toHaveFocus());
  });

  it("pending 时两个按钮都禁用，确认键换成 pendingLabel", () => {
    render(<Harness onConfirm={vi.fn()} pending />);

    expect(screen.getByRole("button", { name: "取消" })).toBeDisabled();
    const confirm = screen.getByRole("button", { name: /删除中…/ });
    expect(confirm).toBeDisabled();
  });

  it("连点确认只回调一次：首次点击进入 pending，后续点击被禁用挡下", () => {
    const onConfirm = vi.fn();
    render(<Harness onConfirm={onConfirm} />);

    const confirm = screen.getByRole("button", { name: "删除" });
    fireEvent.click(confirm);
    fireEvent.click(confirm);
    fireEvent.click(confirm);

    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("pending 时点取消不会关闭对话框", () => {
    const onConfirm = vi.fn();
    render(<Harness onConfirm={onConfirm} />);

    fireEvent.click(screen.getByRole("button", { name: "删除" }));

    // 取消键此时已禁用；即便事件仍被派发也不应把对话框关掉
    fireEvent.click(screen.getByRole("button", { name: "取消" }));
    expect(screen.getByText("删除后无法恢复。")).toBeInTheDocument();
  });

  it("未 pending 时点取消会请求关闭", () => {
    render(<Harness onConfirm={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "取消" }));

    expect(screen.queryByText("删除后无法恢复。")).not.toBeInTheDocument();
  });
});
