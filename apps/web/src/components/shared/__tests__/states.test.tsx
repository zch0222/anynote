import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ConnectionBanner, EmptyState, NotFoundState, QueryError } from "../states";

describe("QueryError", () => {
  it("用 role=alert 拼出「{object}加载失败：{message}」，读屏可立刻播报", () => {
    render(<QueryError object="笔记" error={new Error("网络连接超时，请检查网络后重试")} />);

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("笔记加载失败：网络连接超时，请检查网络后重试");
  });

  it("点重试触发回调", () => {
    const onRetry = vi.fn();
    render(<QueryError object="笔记" error={new Error("服务暂时不可用")} onRetry={onRetry} />);

    fireEvent.click(screen.getByRole("button", { name: "重试" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("retrying 时按钮禁用并显示转圈", () => {
    const onRetry = vi.fn();
    const { container } = render(
      <QueryError object="笔记" error={new Error("服务暂时不可用")} onRetry={onRetry} retrying />,
    );

    const button = screen.getByRole("button", { name: /重试中…/ });
    expect(button).toBeDisabled();
    expect(container.querySelector('[data-slot="spinner"]')).toBeInTheDocument();

    // 禁用态下重复点击不应再发请求
    fireEvent.click(button);
    expect(onRetry).not.toHaveBeenCalled();
  });

  it("不传 onRetry 时不渲染重试按钮（重试无意义的场景）", () => {
    render(<QueryError object="知识库" error={new Error("找不到这个知识库")} />);

    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("compact 形态去掉图标、缩小内边距，仍是 alert", () => {
    const { container } = render(
      <QueryError object="知识库" error={new Error("加载失败")} compact />,
    );

    expect(screen.getByRole("alert")).toHaveTextContent("知识库加载失败：加载失败");
    // 紧凑形态靠没图标 + px-2.5 py-2 省高度，侧栏与对话框里才塞得下
    expect(container.querySelector("svg")).not.toBeInTheDocument();
    expect(container.querySelector('[data-slot="query-error"]')?.className).toContain("px-2.5");
  });

  it("组件内部就把实现细节换成兜底文案，调用方漏套 toUserMessage 也不会漏出来", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    render(<QueryError object="协同文档" error={new Error("请确认 collab 服务已启动")} />);

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("协同文档加载失败：服务暂时不可用，请稍后重试");
    expect(alert).not.toHaveTextContent("collab");
    spy.mockRestore();
  });

  /**
   * `message` 是兼容入口：M12 期间多个 feature 工作流并发改造这 24 处，
   * 一部分调用点自己套了 `toUserMessage` 传字符串。两条路径都要能用，
   * 但 `message` 一旦给了就以它为准，不再二次转换（否则会把用户文案当实现细节再洗一遍）。
   */
  it("兼容 message 写法：传字符串时不重复转换", () => {
    render(<QueryError object="笔记" message="服务暂时不可用，请稍后重试" />);

    expect(screen.getByRole("alert")).toHaveTextContent("笔记加载失败：服务暂时不可用，请稍后重试");
  });

  it("两种写法都给时 message 优先", () => {
    render(<QueryError object="笔记" error={new Error("原始错误")} message="已转好的文案" />);

    expect(screen.getByRole("alert")).toHaveTextContent("笔记加载失败：已转好的文案");
  });

  it("error 与 message 都不给也不崩，退回兜底文案", () => {
    render(<QueryError object="笔记" />);

    expect(screen.getByRole("alert")).toHaveTextContent("笔记加载失败：服务暂时不可用，请稍后重试");
  });
});

describe("EmptyState", () => {
  it("渲染标题与说明，虚线框是它的固定形态", () => {
    const { container } = render(
      <EmptyState title="这个知识库还没有笔记" hint="新建一篇，开始记录。" />,
    );

    expect(screen.getByText("这个知识库还没有笔记")).toBeInTheDocument();
    expect(screen.getByText("新建一篇，开始记录。")).toBeInTheDocument();
    expect(container.querySelector('[data-slot="empty-state"]')?.className).toContain(
      "border-dashed",
    );
  });

  it("至多一个动作：只渲染调用方给的那一个按钮", () => {
    render(<EmptyState title="还没有资料" action={<button type="button">去上传</button>} />);

    expect(screen.getAllByRole("button")).toHaveLength(1);
    expect(screen.getByRole("button", { name: "去上传" })).toBeInTheDocument();
  });

  it("不给动作时没有按钮（D-09 成员 Tab 这类空态）", () => {
    render(<EmptyState title="这个知识库还没有其他成员。" />);

    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});

describe("NotFoundState", () => {
  it("拼出「找不到这个{object}」并给返回链接", () => {
    render(<NotFoundState object="知识库" backHref="/notes" backLabel="回到知识库列表" />);

    expect(screen.getByText("找不到这个知识库")).toBeInTheDocument();
    expect(screen.getByText("它可能已被删除，或者你还没有访问权限。")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "回到知识库列表" })).toHaveAttribute("href", "/notes");
  });
});

describe("ConnectionBanner", () => {
  it("默认用协同场景文案，点「重新连接」触发回调", () => {
    const onReconnect = vi.fn();
    render(<ConnectionBanner onReconnect={onReconnect} />);

    expect(screen.getByRole("status")).toHaveTextContent("连接已断开，恢复后会自动同步你的改动");
    fireEvent.click(screen.getByRole("button", { name: "重新连接" }));
    expect(onReconnect).toHaveBeenCalledTimes(1);
  });

  it("reconnecting 时禁用并显示「连接中…」，避免重复发起", () => {
    const onReconnect = vi.fn();
    render(<ConnectionBanner onReconnect={onReconnect} reconnecting />);

    const button = screen.getByRole("button", { name: "连接中…" });
    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(onReconnect).not.toHaveBeenCalled();
  });

  it("不传 onReconnect 时只有提示、没有按钮", () => {
    render(<ConnectionBanner message="协同服务暂时连不上" />);

    expect(screen.getByRole("status")).toHaveTextContent("协同服务暂时连不上");
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
