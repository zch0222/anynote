import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PasswordInput } from "../password-input";

/** 按 [data-slot] 取真实的 <input>：图标按钮在 DOM 里排在它后面，`getByRole` 会同时命中两个。 */
function input() {
  return document.querySelector<HTMLInputElement>('[data-slot="password-input"]');
}

describe("PasswordInput", () => {
  it("初始为密文，按钮提示「显示密码」且未按下", () => {
    render(<PasswordInput aria-label="密码" />);

    expect(input()).toHaveAttribute("type", "password");
    const toggle = screen.getByRole("button", { name: "显示密码" });
    expect(toggle).toHaveAttribute("aria-pressed", "false");
  });

  it("点击切换 type 与 aria-pressed，再点回来", () => {
    render(<PasswordInput aria-label="密码" />);

    fireEvent.click(screen.getByRole("button", { name: "显示密码" }));
    expect(input()).toHaveAttribute("type", "text");
    expect(screen.getByRole("button", { name: "隐藏密码" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    fireEvent.click(screen.getByRole("button", { name: "隐藏密码" }));
    expect(input()).toHaveAttribute("type", "password");
    expect(screen.getByRole("button", { name: "显示密码" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("切换只看 type 属性：input 节点不重挂，光标与已输入的明文都留着", () => {
    render(<PasswordInput aria-label="密码" />);

    const before = input();
    fireEvent.change(before as HTMLInputElement, { target: { value: "hunter2" } });
    fireEvent.click(screen.getByRole("button", { name: "显示密码" }));

    // 同一个 DOM 节点 = 没有重挂，否则 base-ui / React 会重置 selectionStart
    expect(input()).toBe(before);
    expect(screen.getByLabelText("密码")).toHaveValue("hunter2");
  });

  it("透传 input 的其余属性", () => {
    render(<PasswordInput aria-label="密码" placeholder="至少 8 位" disabled />);

    const element = screen.getByLabelText("密码");
    expect(element).toHaveAttribute("placeholder", "至少 8 位");
    expect(element).toBeDisabled();
  });
});
