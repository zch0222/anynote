import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { MobileActionSheet } from "@/components/layout/mobile/mobile-action-sheet";
import { renderWithProviders } from "@/test/render";

describe("MobileActionSheet", () => {
  it("受控打开时渲染标题与全部动作", () => {
    renderWithProviders(
      <MobileActionSheet
        open
        title="笔记操作"
        description="移动到别的知识库或删除"
        actions={[
          { label: "移动到…", onSelect: vi.fn() },
          { label: "删除笔记", destructive: true, confirm: "再点一次确认删除", onSelect: vi.fn() },
        ]}
      />,
    );
    expect(screen.getByText("笔记操作")).toBeInTheDocument();
    expect(screen.getByText("移动到别的知识库或删除")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "移动到…" })).toBeInTheDocument();
  });

  it("点普通动作立即执行并关闭", () => {
    const onSelect = vi.fn();
    const onOpenChange = vi.fn();
    renderWithProviders(
      <MobileActionSheet
        open
        onOpenChange={onOpenChange}
        title="操作"
        actions={[{ label: "移动到…", onSelect }]}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "移动到…" }));
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("危险动作需要二次确认：第一次点击只换文案，不执行", () => {
    const onSelect = vi.fn();
    renderWithProviders(
      <MobileActionSheet
        open
        title="操作"
        actions={[{ label: "删除笔记", destructive: true, confirm: "再点一次确认删除", onSelect }]}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "删除笔记" }));
    expect(onSelect).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "再点一次确认删除" }));
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it("禁用的动作点不动", () => {
    const onSelect = vi.fn();
    renderWithProviders(
      <MobileActionSheet
        open
        title="操作"
        actions={[{ label: "提交任务", disabled: true, onSelect }]}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "提交任务" }));
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("非受控时由触发元素打开", () => {
    renderWithProviders(
      <MobileActionSheet
        trigger={<button type="button">打开操作</button>}
        title="操作"
        actions={[{ label: "重命名", onSelect: vi.fn() }]}
      />,
    );
    expect(screen.queryByRole("button", { name: "重命名" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "打开操作" }));
    expect(screen.getByRole("button", { name: "重命名" })).toBeInTheDocument();
  });
});
