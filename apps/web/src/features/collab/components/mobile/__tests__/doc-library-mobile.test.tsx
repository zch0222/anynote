import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => router,
  usePathname: () => "/m/docs",
}));

const index = vi.hoisted(() => ({
  docs: [] as Array<Record<string, unknown>>,
  status: "connected" as string,
  error: null as Error | null,
  createDoc: vi.fn(),
  removeDoc: vi.fn(),
  peers: [],
}));
vi.mock("@/features/collab/use-collab-index", () => ({ useCollabIndex: () => index }));

import { MobileDocLibrary } from "@/features/collab/components/mobile/doc-library-mobile";
import { renderWithProviders } from "@/test/render";

function setDocs(docs: Array<Record<string, unknown>>, status = "connected") {
  index.docs = docs;
  index.status = status;
  index.error = null;
}

const DOC = {
  id: "doc-1",
  title: "周会纪要",
  createdBy: "小明",
  createdAt: 1_757_000_000_000,
  updatedAt: 1_757_000_000_000,
};

describe("MobileDocLibrary", () => {
  it("单列渲染文档并跳移动端详情", () => {
    setDocs([DOC]);
    renderWithProviders(<MobileDocLibrary />);

    expect(screen.getByRole("link", { name: /周会纪要/ })).toHaveAttribute("href", "/m/docs/doc-1");
  });

  it("协同未连接时禁用新建并显示骨架", () => {
    setDocs([], "connecting");
    renderWithProviders(<MobileDocLibrary />);

    expect(screen.getByTestId("mobile-doc-create")).toBeDisabled();
  });

  it("连接失败时给出排查提示", () => {
    setDocs([], "error");
    index.error = new Error("ECONNREFUSED");
    renderWithProviders(<MobileDocLibrary />);

    expect(screen.getByText(/协同服务连接失败：ECONNREFUSED/)).toBeInTheDocument();
  });

  it("空文档库给创建引导", () => {
    setDocs([]);
    renderWithProviders(<MobileDocLibrary />);
    expect(screen.getByText("还没有协同文档")).toBeInTheDocument();
  });

  it("删除走底部动作表且需要二次确认——触摸端没有 hover", () => {
    setDocs([DOC]);
    index.removeDoc.mockReturnValue(true);
    renderWithProviders(<MobileDocLibrary />);

    fireEvent.click(screen.getByRole("button", { name: "周会纪要 的操作" }));
    fireEvent.click(screen.getByRole("button", { name: "从文档库移除" }));
    expect(index.removeDoc).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "再点一次确认移除" }));
    expect(index.removeDoc).toHaveBeenCalledWith("doc-1");
  });

  it("新建表单走底部弹层，创建成功后进详情页", async () => {
    setDocs([]);
    index.createDoc.mockReturnValue({ id: "doc-9" });
    renderWithProviders(<MobileDocLibrary />);

    fireEvent.click(screen.getByTestId("mobile-doc-create"));
    const input = await screen.findByLabelText("标题");
    fireEvent.change(input, { target: { value: "新文档" } });
    fireEvent.submit(input.closest("form") as HTMLFormElement);

    await vi.waitFor(() => {
      expect(index.createDoc).toHaveBeenCalledWith("新文档");
    });
    expect(router.push).toHaveBeenCalledWith("/m/docs/doc-9");
  });
});
