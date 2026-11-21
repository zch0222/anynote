import { fireEvent, screen } from "@testing-library/react";
import { expect } from "vitest";

/** 用真实指针事件序列选择 Base UI 项，并阻止退回无语义弹层色的原生 select。 */
export async function selectThemedOption(trigger: HTMLElement, name: string | RegExp) {
  fireEvent.pointerDown(trigger, { button: 0 });
  fireEvent.click(trigger);
  const option = await screen.findByRole("option", { name });
  expect(option.closest('[data-slot="select-content"]')).toHaveClass(
    "bg-popover",
    "text-popover-foreground",
  );
  fireEvent.pointerDown(option, { pointerType: "mouse" });
  fireEvent.click(option);
}
