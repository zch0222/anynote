import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { DateTimeField } from "@/features/tasks/components/date-time-field";

/**
 * base-ui 的浮层定位要用 `ResizeObserver`，jsdom 不实现它。
 * 这几个用例只关心「选日 + 改时间 + 确定」的业务分支，定位一律给空实现。
 */
vi.stubGlobal(
  "ResizeObserver",
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
  },
);

/** 固定基准时刻：2026-09-10 10:23（周四），避免用例随真实时钟漂移。 */
const BASE = new Date("2026-09-10T10:23:00");

function open(value = BASE) {
  const onChange = vi.fn();
  render(<DateTimeField label="开始时间" value={value} onChange={onChange} />);
  fireEvent.click(screen.getByLabelText("开始时间"));
  return { onChange };
}

describe("DateTimeField", () => {
  it("触发器展示 MM-dd HH:mm，并按 label 暴露可访问名", () => {
    render(<DateTimeField label="截止时间" value={BASE} onChange={vi.fn()} />);

    const trigger = screen.getByLabelText("截止时间");
    expect(trigger).toHaveTextContent("09-10 10:23");
    expect(trigger).toHaveAttribute("type", "button");
  });

  it("外部值变化时触发器跟着走（受控）", () => {
    const { rerender } = render(<DateTimeField label="开始时间" value={BASE} onChange={vi.fn()} />);
    rerender(
      <DateTimeField label="开始时间" value={new Date("2026-12-01T08:05:00")} onChange={vi.fn()} />,
    );

    expect(screen.getByLabelText("开始时间")).toHaveTextContent("12-01 08:05");
  });

  it("选日 + 改时间 + 确定，把选中的年月日时分回填出去", () => {
    const { onChange } = open();

    // 点日期只改选中格，**此时还不许回填**
    fireEvent.click(screen.getByRole("button", { name: "2026-09-18" }));
    expect(onChange).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText("时间"), { target: { value: "08:05" } });
    expect(onChange).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "确定" }));

    expect(onChange).toHaveBeenCalledTimes(1);
    const next = onChange.mock.calls[0]?.[0] as Date;
    expect(next.getFullYear()).toBe(2026);
    expect(next.getMonth()).toBe(8);
    expect(next.getDate()).toBe(18);
    expect(next.getHours()).toBe(8);
    expect(next.getMinutes()).toBe(5);
    // 秒/毫秒必须归零，否则「开始时间」会带上打开浮层那一刻的秒数
    expect(next.getSeconds()).toBe(0);
    expect(next.getMilliseconds()).toBe(0);
  });

  it("确定后浮层关闭", () => {
    open();

    fireEvent.click(screen.getByRole("button", { name: "2026-09-18" }));
    fireEvent.click(screen.getByRole("button", { name: "确定" }));

    expect(screen.queryByLabelText("时间")).toBeNull();
  });

  it("非法时间不回填、不关浮层，并给出内联提示", () => {
    const { onChange } = open();

    fireEvent.change(screen.getByLabelText("时间"), { target: { value: "25:99" } });
    fireEvent.click(screen.getByRole("button", { name: "确定" }));

    expect(onChange).not.toHaveBeenCalled();
    // 浮层必须还在：关掉等于把用户刚打的字吞了，重开还得再打一遍
    expect(screen.getByLabelText("时间")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("请输入 HH:mm 格式的时间");
    expect(screen.getByLabelText("时间")).toHaveAttribute("aria-invalid", "true");
  });

  it("缺前导零 / 半全角冒号这类输入法产物也按非法处理", () => {
    const { onChange } = open();
    const timeInput = screen.getByLabelText("时间");

    for (const bad of ["8:05", "08：05", "0805", ""]) {
      fireEvent.change(timeInput, { target: { value: bad } });
      fireEvent.click(screen.getByRole("button", { name: "确定" }));
      expect(onChange).not.toHaveBeenCalled();
    }
  });

  it("改回合法值后提示消失", () => {
    open();

    fireEvent.change(screen.getByLabelText("时间"), { target: { value: "99:99" } });
    fireEvent.click(screen.getByRole("button", { name: "确定" }));
    expect(screen.getByRole("alert")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("时间"), { target: { value: "09:30" } });
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("月份切换改的是可见月份，选中的是新月份里的日期", () => {
    const { onChange } = open();

    fireEvent.click(screen.getByRole("button", { name: "上个月" }));
    expect(screen.getByText("2026 年 08 月")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "2026-08-03" }));
    fireEvent.click(screen.getByRole("button", { name: "确定" }));

    const next = onChange.mock.calls[0]?.[0] as Date;
    expect(next.getMonth()).toBe(7);
    expect(next.getDate()).toBe(3);
    // 时间没改，沿用打开时的草稿
    expect(next.getHours()).toBe(10);
    expect(next.getMinutes()).toBe(23);
  });

  it("下个月按钮往回也能走，月份标题跟着变", () => {
    open();

    fireEvent.click(screen.getByRole("button", { name: "下个月" }));
    expect(screen.getByText("2026 年 10 月")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "上个月" }));
    expect(screen.getByText("2026 年 09 月")).toBeInTheDocument();
  });

  it("重新打开时用外部当前值重置草稿，上一次取消的选择不留存", () => {
    const { onChange } = open();

    fireEvent.click(screen.getByRole("button", { name: "2026-09-18" }));
    fireEvent.change(screen.getByLabelText("时间"), { target: { value: "08:05" } });
    // 不点确定，直接关掉浮层
    fireEvent.keyDown(document, { key: "Escape" });
    fireEvent.click(screen.getByLabelText("开始时间"));

    expect(screen.getByLabelText("时间")).toHaveValue("10:23");
    fireEvent.click(screen.getByRole("button", { name: "确定" }));
    const next = onChange.mock.calls[0]?.[0] as Date;
    expect(next.getDate()).toBe(10);
    expect(next.getHours()).toBe(10);
  });

  it("传了 min 时早于下界的日期不可点，下界当天可点", () => {
    render(
      <DateTimeField
        label="截止时间"
        value={BASE}
        onChange={vi.fn()}
        min={new Date("2026-09-15T00:00:00")}
      />,
    );
    fireEvent.click(screen.getByLabelText("截止时间"));

    expect(screen.getByRole("button", { name: "2026-09-14" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "2026-09-15" })).not.toBeDisabled();
  });

  it("disabled 时触发器不可点", () => {
    render(<DateTimeField label="开始时间" value={BASE} onChange={vi.fn()} disabled />);

    expect(screen.getByLabelText("开始时间")).toBeDisabled();
  });

  it("invalid 透传到触发器的 aria-invalid（图例 13 的 danger 描边靠它）", () => {
    render(<DateTimeField label="截止时间" value={BASE} onChange={vi.fn()} invalid />);

    expect(screen.getByLabelText("截止时间")).toHaveAttribute("aria-invalid", "true");
  });
});
