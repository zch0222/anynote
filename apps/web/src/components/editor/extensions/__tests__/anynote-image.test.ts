import {
  AnynoteImage,
  IMAGE_UPLOAD_INDICATOR_SELECTOR,
  type UploadFn,
  uploadImageAt,
} from "@/components/editor/extensions/anynote-image";
import { MarkdownBridge, getMarkdown } from "@/lib/editor/markdown";
import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * 上传指示器的核心行为。
 *
 * 这里刻意用**核心 `Editor`（prosemirror 层）而不是 React 组件**：指示器是
 * `Decoration.widget`，它的生命周期完全由 ProseMirror 的插件状态决定，
 * 在 view 层断言最贴近真实行为，也避免测试被 React 重渲染干扰。
 */

function makeFile(name = "note.png", type = "image/png") {
  return new File([new Uint8Array(8)], name, { type });
}

/** 可控的上传实现：手动 resolve / reject，并把 onProgress 暴露给用例。 */
function deferredUpload() {
  let onProgress: ((percent: number) => void) | undefined;
  let resolve!: (src: string) => void;
  let reject!: (error: unknown) => void;

  const promise = new Promise<string>((res, rej) => {
    resolve = res;
    reject = rej;
  });

  const uploadFn: UploadFn = (_file, options) => {
    onProgress = options?.onProgress;
    return promise;
  };

  return {
    uploadFn,
    resolve,
    reject,
    progress: (percent: number) => onProgress?.(percent),
    /** 已拿到 onProgress 说明 uploadFn 已经真的被调用了。 */
    started: () => onProgress !== undefined,
  };
}

function createEditor(uploadFn?: UploadFn) {
  const editor = new Editor({
    extensions: [
      StarterKit,
      // 真实编辑器总是挂 MarkdownBridge（见 presets/full.ts）；不挂的话
      // getMarkdown() 恒为空串，「占位符没进正文」这类断言会变成永远成立的假绿。
      MarkdownBridge,
      uploadFn ? AnynoteImage.configure({ uploadFn }) : AnynoteImage,
    ],
    content: "<p></p>",
  });
  return editor;
}

/** 指示器宿主元素（widget 的 DOM）。 */
function indicator(editor: Editor): HTMLElement | null {
  return editor.view.dom.querySelector<HTMLElement>(IMAGE_UPLOAD_INDICATOR_SELECTOR);
}

let editors: Editor[] = [];

function track(editor: Editor): Editor {
  editors.push(editor);
  return editor;
}

afterEach(() => {
  for (const editor of editors) {
    editor.destroy();
  }
  editors = [];
});

describe("图片上传指示器", () => {
  it("上传开始后立刻出现指示器，且此时正文里没有 image 节点", async () => {
    const upload = deferredUpload();
    const editor = track(createEditor(upload.uploadFn));

    const pending = uploadImageAt(editor.view, upload.uploadFn, makeFile());

    expect(upload.started()).toBe(true);
    const dom = indicator(editor);
    expect(dom).not.toBeNull();
    expect(dom?.getAttribute("data-percent")).toBe("0");
    expect(dom?.textContent).toContain("上传中");
    // 还没传完，正文里不该有图片
    expect(editor.getHTML()).not.toContain("<img");

    upload.resolve("/api/proxy/file/objects/9/redirect");
    await pending;
  });

  it("进度回调会更新指示器上的百分比文案", async () => {
    const upload = deferredUpload();
    const editor = track(createEditor(upload.uploadFn));

    const pending = uploadImageAt(editor.view, upload.uploadFn, makeFile());

    upload.progress(42);
    const dom = indicator(editor);
    expect(dom?.getAttribute("data-percent")).toBe("42");
    expect(dom?.textContent).toContain("42%");

    upload.resolve("/api/proxy/file/objects/9/redirect");
    await pending;
  });

  it("百分比被夹到 0–100 且取整", async () => {
    const upload = deferredUpload();
    const editor = track(createEditor(upload.uploadFn));

    const pending = uploadImageAt(editor.view, upload.uploadFn, makeFile());

    upload.progress(140);
    expect(indicator(editor)?.getAttribute("data-percent")).toBe("100");

    upload.progress(-5);
    expect(indicator(editor)?.getAttribute("data-percent")).toBe("0");

    upload.progress(33.6);
    expect(indicator(editor)?.getAttribute("data-percent")).toBe("34");

    upload.resolve("/api/proxy/file/objects/9/redirect");
    await pending;
  });

  it("非法进度值（NaN）不会污染文案", async () => {
    const upload = deferredUpload();
    const editor = track(createEditor(upload.uploadFn));

    const pending = uploadImageAt(editor.view, upload.uploadFn, makeFile());
    upload.progress(Number.NaN);
    expect(indicator(editor)?.getAttribute("data-percent")).toBe("0");

    upload.resolve("/api/proxy/file/objects/9/redirect");
    await pending;
  });

  it("上传成功后指示器消失，并在原位置插入 image 节点", async () => {
    const upload = deferredUpload();
    const editor = track(createEditor(upload.uploadFn));

    const pending = uploadImageAt(editor.view, upload.uploadFn, makeFile("封面.png"));
    expect(indicator(editor)).not.toBeNull();

    upload.resolve("/api/proxy/file/objects/9/redirect");
    await pending;

    expect(indicator(editor)).toBeNull();
    expect(editor.getHTML()).toContain('src="/api/proxy/file/objects/9/redirect"');
    expect(editor.getHTML()).toContain('alt="封面.png"');
  });

  it("上传失败时指示器被摘掉，且不留下 image 节点（否则会永远转圈）", async () => {
    const upload = deferredUpload();
    const onError = vi.fn();
    const editor = track(createEditor(upload.uploadFn));

    const pending = uploadImageAt(editor.view, upload.uploadFn, makeFile(), { onError });
    expect(indicator(editor)).not.toBeNull();

    upload.reject(new Error("网络断了"));
    await pending;

    expect(indicator(editor)).toBeNull();
    expect(editor.getHTML()).not.toContain("<img");
    expect(onError).toHaveBeenCalledWith(expect.any(Error));
  });

  it("上传途中指示器不进 Markdown，自动保存不会把占位符写进正文", async () => {
    const upload = deferredUpload();
    const editor = track(createEditor(upload.uploadFn));

    const pending = uploadImageAt(editor.view, upload.uploadFn, makeFile());
    upload.progress(50);

    // widget decoration 是本地 UI，不属于文档内容
    expect(getMarkdown(editor)).not.toContain("上传中");
    expect(getMarkdown(editor)).not.toContain("image-upload");
    expect(editor.state.doc.textContent).not.toContain("上传中");

    upload.resolve("/api/proxy/file/objects/9/redirect");
    await pending;
    expect(getMarkdown(editor)).toContain("![note.png](/api/proxy/file/objects/9/redirect)");
  });

  it("多个文件并行上传时各自持有独立进度", async () => {
    const upload = deferredUpload();
    const editor = track(createEditor(upload.uploadFn));

    const first = uploadImageAt(editor.view, upload.uploadFn, makeFile("a.png"));
    const second = uploadImageAt(editor.view, upload.uploadFn, makeFile("b.png"));

    expect(editor.view.dom.querySelectorAll(IMAGE_UPLOAD_INDICATOR_SELECTOR)).toHaveLength(2);

    upload.resolve("/api/proxy/file/objects/1/redirect");
    await Promise.all([first, second]);

    // 同一个 promise 被两个上传共享，两个指示器应同时收尾
    expect(editor.view.dom.querySelectorAll(IMAGE_UPLOAD_INDICATOR_SELECTOR)).toHaveLength(0);
  });

  it("上传途中用户继续编辑，指示器位置跟着文档漂移而不是停在旧坐标", async () => {
    const upload = deferredUpload();
    const editor = track(createEditor(upload.uploadFn));

    const pending = uploadImageAt(editor.view, upload.uploadFn, makeFile(), { pos: 1 });
    const before = indicator(editor);
    expect(before).not.toBeNull();

    // 在指示器位置之前插入文字，指示器的文档坐标应该被映射后移
    editor.commands.insertContentAt(1, "前面的字");

    upload.resolve("/api/proxy/file/objects/7/redirect");
    await pending;

    // 插入的文字仍在，且图片落在它之后，说明位置映射生效（没有被顶回文档开头）
    expect(editor.state.doc.textContent).toContain("前面的字");
    const html = editor.getHTML();
    expect(html.indexOf("前面的字")).toBeLessThan(html.indexOf("<img"));
  });

  it("编辑器销毁后到达的进度 / 结果不会抛错", async () => {
    const upload = deferredUpload();
    const editor = createEditor(upload.uploadFn);

    const pending = uploadImageAt(editor.view, upload.uploadFn, makeFile());
    editor.destroy();

    expect(() => upload.progress(80)).not.toThrow();
    upload.resolve("/api/proxy/file/objects/9/redirect");
    await expect(pending).resolves.toBeUndefined();
  });
});

describe("未配置上传能力时的行为", () => {
  it("不注册上传插件，也不渲染任何指示器", () => {
    const editor = track(createEditor());
    expect(editor.view.dom.querySelector(IMAGE_UPLOAD_INDICATOR_SELECTOR)).toBeNull();
  });
});
