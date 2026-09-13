import { TiptapEditorImpl } from "@/components/editor/core/tiptap-editor";
import {
  AnynoteImage,
  IMAGE_UPLOAD_INDICATOR_SELECTOR,
  type UploadFn,
} from "@/components/editor/extensions/anynote-image";
import { MarkdownBridge } from "@/lib/editor/markdown";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 「每条插图入口都要有提示」的回归保护。
 *
 * 指示器本身的行为在 `anynote-image.test.ts` 里测；这里只盯一件事：
 * **工具栏 / 粘贴 / 拖拽三条路径都接到了同一个带进度的实现**，
 * 任何一条绕过去自己 insertContent，用户就会重新陷入"不知道在传"的状态。
 */

function makeFile(name = "note.png", type = "image/png") {
  return new File([new Uint8Array(8)], name, { type });
}

function deferredUpload() {
  let onProgress: ((percent: number) => void) | undefined;
  let resolve!: (src: string) => void;
  const promise = new Promise<string>((res) => {
    resolve = res;
  });
  const uploadFn: UploadFn = (_file, options) => {
    onProgress = options?.onProgress;
    return promise;
  };
  return { uploadFn, resolve, progress: (p: number) => onProgress?.(p) };
}

let editors: Editor[] = [];
afterEach(() => {
  for (const editor of editors) editor.destroy();
  editors = [];
});

/**
 * jsdom 没有实现 `document.elementFromPoint`，而拖拽要用 `posAtCoords` 定位落点。
 * 补一个恒返回编辑器 DOM 的桩，让落点解析走到真实逻辑而不是绕过它。
 */
beforeEach(() => {
  document.elementFromPoint = () => document.querySelector(".ProseMirror");
});

function createEditor(uploadFn: UploadFn) {
  const editor = new Editor({
    extensions: [StarterKit, MarkdownBridge, AnynoteImage.configure({ uploadFn })],
    content: "<p></p>",
  });
  editors.push(editor);
  return editor;
}

/**
 * 模拟 ProseMirror 的事件分发：依次问每个插件的 handler，谁先返回 true 就归谁。
 *
 * 不能只看第一个 handler——StarterKit / tiptap-markdown 也注册了 handlePaste，
 * 停在第一个会拿到别人的返回值，测不到我们的插件。
 */
function callHandler(editor: Editor, name: "handlePaste" | "handleDrop", event: unknown): boolean {
  let handled = false;
  let seen = false;
  editor.view.someProp(name, (handler) => {
    if (handled) return true;
    seen = true;
    const result = (handler as (view: unknown, event: unknown) => boolean)(editor.view, event);
    if (result === true) handled = true;
    return undefined;
  });
  expect(seen).toBe(true);
  return handled;
}

/**
 * 造一个足够完整的 ClipboardEvent 替身。
 *
 * 必须带 `getData` / `types`：我们返回 false 之后，事件会继续交给其他扩展
 * （如 ordered-list 的粘贴规则），它们会真的去读剪贴板文本。
 */
function pasteEvent(files: File[]): ClipboardEvent {
  const items = files.map((file) => ({
    kind: "file",
    type: file.type,
    getAsFile: () => file,
  }));
  return {
    clipboardData: {
      items,
      types: ["Files"],
      getData: () => "",
    },
    preventDefault: vi.fn(),
  } as unknown as ClipboardEvent;
}

function dropEvent(files: File[]): DragEvent {
  return {
    dataTransfer: { files },
    clientX: 0,
    clientY: 0,
    preventDefault: vi.fn(),
  } as unknown as DragEvent;
}

describe("粘贴图片：走带进度的上传入口", () => {
  it("粘贴时出现指示器，进度回调被转发，完成后换成 image 节点", async () => {
    const upload = deferredUpload();
    const editor = createEditor(upload.uploadFn);

    const handled = callHandler(editor, "handlePaste", pasteEvent([makeFile("粘贴.png")]));
    expect(handled).toBe(true);

    const dom = editor.view.dom.querySelector(IMAGE_UPLOAD_INDICATOR_SELECTOR);
    expect(dom).not.toBeNull();
    expect(dom?.textContent).toContain("上传中");

    upload.progress(30);
    expect(
      editor.view.dom.querySelector(IMAGE_UPLOAD_INDICATOR_SELECTOR)?.getAttribute("data-percent"),
    ).toBe("30");

    upload.resolve("/api/proxy/file/objects/3/redirect");
    await waitFor(() =>
      expect(editor.view.dom.querySelector(IMAGE_UPLOAD_INDICATOR_SELECTOR)).toBeNull(),
    );
    expect(editor.getHTML()).toContain('alt="粘贴.png"');
  });

  it("剪贴板里没有图片时不拦截事件（让默认粘贴行为继续）", () => {
    const upload = deferredUpload();
    const editor = createEditor(upload.uploadFn);

    const handled = callHandler(editor, "handlePaste", pasteEvent([]));
    expect(handled).toBe(false);
    expect(editor.view.dom.querySelector(IMAGE_UPLOAD_INDICATOR_SELECTOR)).toBeNull();
  });

  it("非图片类型（如文本文件）不触发上传", () => {
    const upload = deferredUpload();
    const editor = createEditor(upload.uploadFn);

    const handled = callHandler(
      editor,
      "handlePaste",
      pasteEvent([makeFile("说明.txt", "text/plain")]),
    );
    expect(handled).toBe(false);
  });
});

describe("拖拽图片：走带进度的上传入口", () => {
  it("拖入图片时出现指示器并最终落图", async () => {
    const upload = deferredUpload();
    const editor = createEditor(upload.uploadFn);

    const handled = callHandler(editor, "handleDrop", dropEvent([makeFile("拖拽.png")]));
    expect(handled).toBe(true);
    expect(editor.view.dom.querySelector(IMAGE_UPLOAD_INDICATOR_SELECTOR)).not.toBeNull();

    upload.resolve("/api/proxy/file/objects/4/redirect");
    await waitFor(() =>
      expect(editor.view.dom.querySelector(IMAGE_UPLOAD_INDICATOR_SELECTOR)).toBeNull(),
    );
    expect(editor.getHTML()).toContain('alt="拖拽.png"');
  });

  it("拖入非图片文件不拦截", () => {
    const upload = deferredUpload();
    const editor = createEditor(upload.uploadFn);

    const handled = callHandler(
      editor,
      "handleDrop",
      dropEvent([makeFile("a.zip", "application/zip")]),
    );
    expect(handled).toBe(false);
  });
});

describe("工具栏图片按钮：走带进度的上传入口", () => {
  it("选中文件后出现指示器，上传中提示可见", async () => {
    const upload = deferredUpload();
    const { container } = render(
      <TiptapEditorImpl preset="full" value="" uploadFn={upload.uploadFn} />,
    );

    // 工具栏的 pickImage 会造一个隐藏 file input 并 click()；
    // jsdom 不弹系统对话框，这里把创建出来的 input 截下来手动喂文件。
    const inputs: HTMLInputElement[] = [];
    const originalCreate = document.createElement.bind(document);
    const spy = vi
      .spyOn(document, "createElement")
      .mockImplementation((tag: string, options?: ElementCreationOptions) => {
        const element = originalCreate(tag, options);
        if (tag === "input") inputs.push(element as HTMLInputElement);
        return element;
      });

    fireEvent.click(await screen.findByRole("button", { name: "图片" }));
    spy.mockRestore();

    const input = inputs.at(-1);
    expect(input).toBeDefined();
    expect(input?.type).toBe("file");

    const file = makeFile("工具栏.png");
    Object.defineProperty(input, "files", { value: [file], configurable: true });
    fireEvent.change(input as HTMLInputElement);

    await waitFor(() =>
      expect(container.querySelector(IMAGE_UPLOAD_INDICATOR_SELECTOR)).not.toBeNull(),
    );
    expect(container.querySelector(IMAGE_UPLOAD_INDICATOR_SELECTOR)?.textContent).toContain(
      "上传中",
    );

    upload.resolve("/api/proxy/file/objects/5/redirect");
    await waitFor(() =>
      expect(container.querySelector(IMAGE_UPLOAD_INDICATOR_SELECTOR)).toBeNull(),
    );
  });

  it("未配置 uploadFn 时点图片按钮只提示，不产生指示器", async () => {
    const { container } = render(<TiptapEditorImpl preset="full" value="" />);
    fireEvent.click(await screen.findByRole("button", { name: "图片" }));
    expect(container.querySelector(IMAGE_UPLOAD_INDICATOR_SELECTOR)).toBeNull();
  });
});
