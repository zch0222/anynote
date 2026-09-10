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
});
