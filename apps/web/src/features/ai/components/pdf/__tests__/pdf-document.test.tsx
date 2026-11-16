import { render, waitFor } from "@testing-library/react";
import { type ReactNode, useEffect, useRef } from "react";
import { describe, expect, it, vi } from "vitest";

vi.mock("react-pdf", () => ({
  pdfjs: { GlobalWorkerOptions: {} },
  Document: ({
    children,
    onLoadSuccess,
  }: { children: ReactNode; onLoadSuccess: (pdf: { numPages: number }) => void }) => {
    const loaded = useRef(onLoadSuccess);
    useEffect(() => {
      loaded.current({ numPages: 2 });
    }, []);
    return <div>{children}</div>;
  },
  Page: ({ onRenderSuccess, pageNumber }: { onRenderSuccess: () => void; pageNumber: number }) => {
    const rendered = useRef(onRenderSuccess);
    useEffect(() => {
      rendered.current();
    }, []);
    return <span>{pageNumber}</span>;
  },
}));
import { PdfDocument } from "../pdf-document";

/**
 * PDF 引用页渲染与重复定位测试。
 *
 * @author 称霸幼儿园
 */
describe("PdfDocument", () => {
  /** 页面渲染完成后定位，并支持重复点击同一页引用。 */
  it("渲染完成后滚动到引用页", async () => {
    const scroll = vi.spyOn(Element.prototype, "scrollIntoView");
    const { container, rerender } = render(
      <PdfDocument url="/test.pdf" width={600} page={2} navigationKey={0} />,
    );
    await waitFor(() => expect(scroll).toHaveBeenCalled());
    expect(scroll.mock.instances.at(-1)).toBe(container.querySelector('[data-pdf-page="2"]'));
    scroll.mockClear();
    rerender(<PdfDocument url="/test.pdf" width={600} page={2} navigationKey={1} />);
    expect(scroll).toHaveBeenCalledOnce();
  });
});
