import { TaskTable } from "@/features/tasks/components/task-table";
import { renderWithProviders } from "@/test/render";
import { fireEvent, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const TASKS = [
  {
    id: 1,
    taskName: "读书笔记",
    taskDescribe: "写一篇读后感",
    startTime: "2026-09-01T00:00:00",
    endTime: "2099-01-01T00:00:00",
    submissionStatus: 0,
    submitTime: null,
  },
  {
    id: 2,
    taskName: "周报整理",
    taskDescribe: null,
    startTime: "2026-09-01T00:00:00",
    endTime: "2020-01-01T00:00:00",
    submissionStatus: 1,
    submitTime: "2026-09-02T10:00:00",
  },
  {
    id: 3,
    taskName: "已退回任务",
    taskDescribe: null,
    startTime: null,
    endTime: "2099-01-01T00:00:00",
    submissionStatus: 2,
    submitTime: null,
  },
];

describe("TaskTable", () => {
  it("渲染全部任务行与状态徽章", () => {
    renderWithProviders(<TaskTable tasks={TASKS} loading={false} />);
    expect(screen.getByTestId("task-row-1")).toBeTruthy();
    expect(screen.getByTestId("task-row-2")).toBeTruthy();
    expect(screen.getByText("未提交")).toBeTruthy();
    expect(screen.getByText("已提交")).toBeTruthy();
    expect(screen.getByText("已退回")).toBeTruthy();
  });

  it("进行中且未提交的任务显示提交按钮；已提交/已过期不显示", () => {
    renderWithProviders(<TaskTable tasks={TASKS} loading={false} />);
    expect(screen.getByTestId("task-submit-1")).toBeTruthy();
    expect(screen.getByTestId("task-submit-3")).toBeTruthy();
    expect(screen.queryByTestId("task-submit-2")).toBeNull();
  });

  it("加载态渲染骨架", () => {
    const { container } = renderWithProviders(<TaskTable tasks={[]} loading />);
    expect(container.querySelector(".animate-pulse")).toBeTruthy();
    expect(screen.queryByTestId("task-table")).toBeNull();
  });

  it("空数据展示空态行", () => {
    renderWithProviders(<TaskTable tasks={[]} loading={false} />);
    expect(screen.getByText("这个知识库下还没有任务")).toBeTruthy();
  });

  it("点击提交按钮打开提交对话框（渲染选中的任务标题）", async () => {
    renderWithProviders(<TaskTable tasks={TASKS} loading={false} />);
    fireEvent.click(screen.getByTestId("task-submit-1"));
    const dialog = await screen.findByRole("dialog");
    expect(await within(dialog).findByText(/读书笔记/)).toBeTruthy();
  });
});
