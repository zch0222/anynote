import { TooltipProvider } from "@/components/ui/tooltip";
import { TaskHeatmap } from "@/features/tasks/components/task-heatmap";
import type { TaskHeatmap as TaskHeatmapData } from "@/features/tasks/schemas";
import { ApiError } from "@/lib/api/errors";
import { renderWithProviders } from "@/test/render";
import { fireEvent, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/features/tasks/use-task-detail", async () => {
  const actual = await vi.importActual<typeof import("@/features/tasks/use-task-detail")>(
    "@/features/tasks/use-task-detail",
  );
  return { ...actual, useTaskHeatmapQuery: vi.fn() };
});

import { useTaskHeatmapQuery } from "@/features/tasks/use-task-detail";

/** 三名成员 × 3 天；`today` 是 09-02，所以 09-03 是「未到」。 */
const DATA: TaskHeatmapData = {
  startDate: "2026-09-01",
  endDate: "2026-09-03",
  today: "2026-09-02",
  days: ["2026-09-01", "2026-09-02", "2026-09-03"],
  members: [
    { userId: 7, nickname: "林一", total: 40, counts: [20, 20, 0] },
    { userId: 8, nickname: "陈可", total: 10, counts: [4, 6, 0] },
    { userId: 9, username: "zhouning", total: 0, counts: [0, 0, 0] },
  ],
};

function setup(override: Record<string, unknown> = {}) {
  vi.mocked(useTaskHeatmapQuery).mockReturnValue({
    isPending: false,
    isError: false,
    data: DATA,
    refetch: vi.fn(),
    isFetching: false,
    ...override,
  } as never);
  return renderWithProviders(<TaskHeatmap taskId={9} />);
}

describe("TaskHeatmap", () => {
  beforeEach(() => {
    vi.mocked(useTaskHeatmapQuery).mockReset();
  });

  it("渲染标题、成员行与日期列", () => {
    setup();
    expect(screen.getByText("成员编辑活跃度")).toBeInTheDocument();
    expect(screen.getByTestId("task-heatmap")).toBeInTheDocument();
    expect(screen.getByTestId("heat-row-member-7")).toHaveTextContent("林一");
    expect(screen.getByTestId("heat-row-member-8")).toHaveTextContent("陈可");
    // 没有昵称时退回用户名
    expect(screen.getByTestId("heat-row-member-9")).toHaveTextContent("zhouning");
  });

  /** 图例 19：每格可聚焦且 aria-label 是「昵称 · MM-dd 编辑 n 次」。 */
  it("每格的 aria-label 是「昵称 · MM-dd 编辑 n 次」，且是按钮（可聚焦）", () => {
    setup();
    const cell = screen.getByTestId("heat-cell-member-7-2026-09-01");
    expect(cell).toHaveAttribute("aria-label", "林一 · 09-01 编辑 20 次");
    expect(cell.tagName).toBe("BUTTON");
  });

  /**
   * 图例 18：档位按**当日最大次数**线性分 1–5，0 次落 0 档。
   *
   * 这里的 max 是 `counts` 里的最大值（本用例是 20），不是行上的 `total`
   * （林一 total 40，但分两天各编辑 20 次）——色阶要表达的是"某一天有多活跃"，
   * 拿 total 当分母会让一个天天都在改的人每天都显示成最浅的蓝。
   */
  it("档位 class：当日最大值落 5 档、0 次落 0 档、中间值按比例", () => {
    setup();
    // max = 20 → 20 次是满档
    expect(screen.getByTestId("heat-cell-member-7-2026-09-01")).toHaveAttribute("data-level", "5");
    expect(screen.getByTestId("heat-cell-member-7-2026-09-01").className).toContain("bg-heat-5");
    // 4 次 → ceil(4/20*5) = 1
    expect(screen.getByTestId("heat-cell-member-8-2026-09-01")).toHaveAttribute("data-level", "1");
    // 6 次 → ceil(6/20*5) = 2
    expect(screen.getByTestId("heat-cell-member-8-2026-09-02")).toHaveAttribute("data-level", "2");
    // 0 次落 0 档
    expect(screen.getByTestId("heat-cell-member-9-2026-09-01")).toHaveAttribute("data-level", "0");
    expect(screen.getByTestId("heat-cell-member-9-2026-09-01").className).toContain("bg-heat-0");
  });

  /** 图例 17：`today` 之后的列画描边空格（bg-heat-future）。 */
  it("未来列用 heat-future 底色，且不参与档位", () => {
    setup();
    const future = screen.getByTestId("heat-cell-member-7-2026-09-03");
    expect(future).toHaveAttribute("data-level", "future");
    expect(future.className).toContain("bg-heat-future");
    expect(future.className).toContain("border-separator");
    // 今天不算未到
    expect(screen.getByTestId("heat-cell-member-7-2026-09-02")).not.toHaveAttribute(
      "data-level",
      "future",
    );
  });

  /** 图例 16：404（B-1 未上线）时整卡不渲染。 */
  it("404 时整卡不渲染", () => {
    setup({
      isError: true,
      data: undefined,
      error: new ApiError(404, "B0500", "服务响应格式异常"),
    });
    expect(screen.queryByTestId("task-heatmap-card")).toBeNull();
    expect(screen.queryByText("成员编辑活跃度")).toBeNull();
  });

  it("其他错误走 QueryError（带重试），不是悄悄隐藏", () => {
    const refetch = vi.fn();
    setup({
      isError: true,
      data: undefined,
      error: new Error("网络异常"),
      refetch,
    });
    expect(screen.getByRole("alert")).toHaveTextContent("编辑活跃度加载失败：网络异常");
    fireEvent.click(screen.getByRole("button", { name: "重试" }));
    expect(refetch).toHaveBeenCalled();
  });

  /** 图例 18：超过 12 人折叠成「其余 N 人」。 */
  it("超过 12 人时折叠成「其余 N 人」一行", () => {
    const members = Array.from({ length: 15 }, (_, index) => ({
      userId: index + 1,
      nickname: `成员${index + 1}`,
      total: 100 - index,
      counts: [index, 0, 0],
    }));
    setup({ data: { ...DATA, members } });

    expect(screen.getByTestId("heat-row-rest")).toHaveTextContent("其余 3 人");
    // 第 13 名以后不再单独出行
    expect(screen.queryByTestId("heat-row-member-13")).toBeNull();
    // 前 12 名照常
    expect(screen.getByTestId("heat-row-member-12")).toBeInTheDocument();
    // 折叠行的计数是逐日相加：12 + 13 + 14
    expect(screen.getByTestId("heat-cell-rest-2026-09-01")).toHaveAttribute(
      "aria-label",
      "其余 3 人 · 09-01 编辑 39 次",
    );
  });

  it("图例含 6 档色块与「未到」", () => {
    setup();
    const legend = screen.getByTestId("heat-legend");
    expect(within(legend).getByText("少")).toBeInTheDocument();
    expect(within(legend).getByText("多")).toBeInTheDocument();
    expect(within(legend).getByText("未到")).toBeInTheDocument();
    for (let level = 0; level <= 5; level += 1) {
      expect(screen.getByTestId(`heat-legend-${level}`).className).toContain(`bg-heat-${level}`);
    }
  });

  it("没有任何编辑记录时给空提示而不是空网格", () => {
    setup({ data: { ...DATA, days: [], members: [] } });
    expect(screen.getByText(/还没有可统计的编辑记录/)).toBeInTheDocument();
    expect(screen.queryByTestId("task-heatmap")).toBeNull();
  });

  it("加载中显示骨架", () => {
    setup({ isPending: true, data: undefined });
    expect(screen.queryByTestId("task-heatmap")).toBeNull();
    expect(screen.getByText("成员编辑活跃度")).toBeInTheDocument();
  });

  /**
   * 图例 19：悬停出现 Tooltip。
   *
   * 注意 `TooltipProvider delay={0}`：全局 Provider 用的是 Base UI 默认的
   * 600ms 悬停延迟，jsdom 里没有真实的悬停计时，等到超时也看不到浮层。
   * 产品行为由全局 Provider 决定，这里只验证"内容与 aria-label 同源"。
   */
  it("悬停出 Tooltip，内容与 aria-label 一致", async () => {
    vi.mocked(useTaskHeatmapQuery).mockReturnValue({
      isPending: false,
      isError: false,
      data: DATA,
      refetch: vi.fn(),
      isFetching: false,
    } as never);
    renderWithProviders(
      <TooltipProvider delay={0}>
        <TaskHeatmap taskId={9} />
      </TooltipProvider>,
    );

    const cell = screen.getByTestId("heat-cell-member-7-2026-09-01");
    fireEvent.mouseOver(cell);
    fireEvent.mouseEnter(cell);
    fireEvent.pointerEnter(cell);

    expect(await screen.findByText("林一 · 09-01 编辑 20 次")).toBeInTheDocument();
  });
});
