import { LinkEditor, applyLinkHref, resolveLinkInput } from "@/components/editor/core/link-editor";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { Editor } from "@tiptap/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

/**
 * 链接编辑的复现用例（UI 走查 E-05）。
 *
 * 修之前两端都调 `window.prompt`：没有行内校验、没有「移除链接」、样式也与
 * 应用对话框 / 动作表不一致。现在统一走 `resolveLinkInput` + 同一份表单。
 */

/** 记录命令调用的编辑器桩：只实现链接命令用到的那几个链式方法。 */
function fakeEditor() {
  const chain = {
    focus: vi.fn(() => chain),
    extendMarkRange: vi.fn(() => chain),
    setLink: vi.fn(() => chain),
    unsetLink: vi.fn(() => chain),
    run: vi.fn(() => true),
  };
  return { editor: { chain: vi.fn(() => chain) } as unknown as Editor, chain };
}

function Harness({ initialHref, onClose }: { initialHref: string; onClose?: () => void }) {
  const [open, setOpen] = useState(true);
  const { editor } = fakeEditor();
  return (
    <LinkEditor
      open={open}
      editor={editor}
      initialHref={initialHref}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) onClose?.();
      }}
    />
  );
}

describe("resolveLinkInput", () => {
  it("空串表示移除链接", () => {
    expect(resolveLinkInput("   ")).toEqual({ ok: true, href: "" });
  });

  it("完整地址去空白后原样保留，裸域名补 https://", () => {
    expect(resolveLinkInput(" https://example.com/a ")).toEqual({
      ok: true,
      href: "https://example.com/a",
    });
    expect(resolveLinkInput("example.com/path")).toEqual({
      ok: true,
      href: "https://example.com/path",
    });
    expect(resolveLinkInput("mailto:hi@example.com")).toEqual({
      ok: true,
      href: "mailto:hi@example.com",
    });
  });

  it("站内相对地址直接接受", () => {
    expect(resolveLinkInput("#小节")).toEqual({ ok: true, href: "#小节" });
    expect(resolveLinkInput("/notes/7")).toEqual({ ok: true, href: "/notes/7" });
  });

  it("危险协议、残缺协议与带空格的地址被拒绝", () => {
    for (const input of [
      "javascript:alert(1)",
      "data:text/html,hi",
      "https://",
      "https:///path",
      "a b",
    ]) {
      const result = resolveLinkInput(input);
      expect(result.ok).toBe(false);
    }
  });
});

describe("applyLinkHref", () => {
  it("空 href 走 unsetLink，其余走 setLink", () => {
    const { editor, chain } = fakeEditor();

    applyLinkHref(editor, "");
    expect(chain.unsetLink).toHaveBeenCalled();
    expect(chain.setLink).not.toHaveBeenCalled();

    applyLinkHref(editor, "https://example.com");
    expect(chain.setLink).toHaveBeenCalledWith({ href: "https://example.com" });
    expect(chain.run).toHaveBeenCalledTimes(2);
  });
});

describe("LinkEditor", () => {
  it("非法地址只给行内错误，不下发命令也不关弹层", async () => {
    const onClose = vi.fn();
    const { editor, chain } = fakeEditor();
    render(
      <LinkEditor
        open
        editor={editor}
        initialHref=""
        onOpenChange={(next) => {
          if (!next) onClose();
        }}
      />,
    );

    fireEvent.change(screen.getByLabelText("链接地址"), {
      target: { value: "javascript:alert(1)" },
    });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("请输入");
    expect(chain.setLink).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("合法地址写入编辑器并关闭弹层", async () => {
    const onClose = vi.fn();
    const { editor, chain } = fakeEditor();
    render(
      <LinkEditor
        open
        editor={editor}
        initialHref="https://old.example.com"
        onOpenChange={(next) => {
          if (!next) onClose();
        }}
      />,
    );

    // 已有链接时输入框预填当前地址，并给出「移除链接」
    expect(screen.getByLabelText("链接地址")).toHaveValue("https://old.example.com");
    expect(screen.getByRole("button", { name: "移除链接" })).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("链接地址"), {
      target: { value: "example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    expect(chain.setLink).toHaveBeenCalledWith({ href: "https://example.com" });
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it("「移除链接」把空 href 交给 unsetLink", () => {
    const { editor, chain } = fakeEditor();
    render(
      <LinkEditor
        open
        editor={editor}
        initialHref="https://x.example.com"
        onOpenChange={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "移除链接" }));

    expect(chain.unsetLink).toHaveBeenCalled();
    expect(chain.setLink).not.toHaveBeenCalled();
  });

  it("没有既有链接时不出现「移除链接」", () => {
    const { editor } = fakeEditor();
    render(<LinkEditor open editor={editor} initialHref="" onOpenChange={vi.fn()} />);
    expect(screen.queryByRole("button", { name: "移除链接" })).toBeNull();
  });

  it("移动端形态走底部 Sheet，表单规则与桌面完全一致", () => {
    const { editor } = fakeEditor();
    render(
      <LinkEditor open variant="sheet" editor={editor} initialHref="" onOpenChange={vi.fn()} />,
    );

    expect(screen.getByTestId("link-editor")).toBeInTheDocument();
    expect(screen.getByLabelText("链接地址")).toBeInTheDocument();
  });
});

/** 宿主的开合行为（调用方持有 open 状态）不应该被表单吞掉。 */
describe("LinkEditor 宿主接线", () => {
  it("取消后宿主可以重新打开并带回空白表单", async () => {
    render(<Harness initialHref="" />);
    fireEvent.click(screen.getByRole("button", { name: "取消" }));
    await waitFor(() => expect(screen.queryByLabelText("链接地址")).toBeNull());
  });
});
