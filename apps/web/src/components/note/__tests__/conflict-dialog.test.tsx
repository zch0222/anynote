import { renderWithProviders } from "@/test/render";
import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ConflictDialog } from "../conflict-dialog";

const conflict = {
  local: { title: "本地标题", content: "公共\n本地未保存的行" },
  server: {
    title: "服务端标题",
    content: "公共\n服务端新增的行",
    version: "1757520000000",
    updateTime: "2026-09-11T03:00:00.000Z",
  },
};

describe("ConflictDialog", () => {
  it("无冲突时不渲染弹窗", () => {
    renderWithProviders(<ConflictDialog conflict={null} onResolve={() => undefined} />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("展示标题与文字差异（- 本地独有 / + 服务端独有）", () => {
    renderWithProviders(<ConflictDialog conflict={conflict} onResolve={() => undefined} />);

    expect(screen.getByRole("dialog")).toHaveTextContent("这篇笔记已被其他会话修改");
    const pre = screen.getByRole("dialog").querySelector("pre");
    expect(pre?.textContent).toContain("- 本地未保存的行");
    expect(pre?.textContent).toContain("+ 服务端新增的行");
  });

  it("点击「放弃我的改动」回传 useServer", () => {
    const onResolve = vi.fn();
    renderWithProviders(<ConflictDialog conflict={conflict} onResolve={onResolve} />);

    fireEvent.click(screen.getByRole("button", { name: "放弃我的改动" }));
    expect(onResolve).toHaveBeenCalledExactlyOnceWith("useServer");
  });

  it("点击「用我的改动覆盖」回传 keepLocal", () => {
    const onResolve = vi.fn();
    renderWithProviders(<ConflictDialog conflict={conflict} onResolve={onResolve} />);

    fireEvent.click(screen.getByRole("button", { name: "用我的改动覆盖" }));
    expect(onResolve).toHaveBeenCalledExactlyOnceWith("keepLocal");
  });
});
