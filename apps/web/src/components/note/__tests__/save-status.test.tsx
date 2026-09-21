import { renderWithProviders } from "@/test/render";
import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SaveStatusBadge } from "../save-status";

describe("SaveStatusBadge", () => {
  it.each([
    ["saved", "已保存"],
    ["pending", "待保存"],
    ["saving", "保存中"],
    ["offline", "离线，改动已暂存"],
    ["error", "保存失败，正在重试"],
    ["conflict", "内容有冲突"],
  ] as const)("状态 %s 展示对应文案", (status, label) => {
    renderWithProviders(<SaveStatusBadge status={status} lastSavedAt={null} />);
    expect(screen.getByRole("status")).toHaveTextContent(label);
  });

  it("已保存且带时间时展示时:分", () => {
    renderWithProviders(
      <SaveStatusBadge status="saved" lastSavedAt={new Date(2026, 8, 11, 9, 5)} />,
    );
    expect(screen.getByRole("status")).toHaveTextContent("已保存 09:05");
  });

  /**
   * 协同模式（§7.4）：正文由在场所有人共同推进，本地 `lastSavedAt` 与本房间是否同步无关，
   * 停在「已保存 12 分钟前」会让用户以为内容没被同步。
   */
  it("协同连接正常时「已保存」改说「已同步」且不显示时间", () => {
    renderWithProviders(
      <SaveStatusBadge status="saved" lastSavedAt={new Date(2026, 8, 11, 9, 5)} collabConnected />,
    );
    const badge = screen.getByRole("status");
    expect(badge).toHaveTextContent("已同步");
    expect(badge).not.toHaveTextContent("09:05");
  });

  it.each([
    ["saving", "保存中"],
    ["error", "保存失败，正在重试"],
    ["conflict", "内容有冲突"],
    ["pending", "待保存"],
  ] as const)("协同模式下状态 %s 仍按本地状态显示（%s），不被连接状态盖掉", (status, label) => {
    renderWithProviders(<SaveStatusBadge status={status} lastSavedAt={null} collabConnected />);
    expect(screen.getByRole("status")).toHaveTextContent(label);
  });
});
