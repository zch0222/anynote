import Image from "@tiptap/extension-image";
import { Plugin } from "@tiptap/pm/state";
import type { EditorView } from "@tiptap/pm/view";

/** 上传一个文件并返回可直接放进 `src` 的 URL。 */
export type UploadFn = (file: File) => Promise<string>;

export type AnynoteImageOptions = {
  uploadFn?: UploadFn | undefined;
  HTMLAttributes?: Record<string, unknown> | undefined;
  /** 上传失败时的回调（默认 console.error，可换成 toast）。 */
  onError?: ((error: unknown) => void) | undefined;
};

function pickImageFiles(list: DataTransfer | null | undefined): File[] {
  if (!list) {
    return [];
  }
  return Array.from(list.files).filter((file) => file.type.startsWith("image/"));
}

function filesFromClipboard(event: ClipboardEvent): File[] {
  const items = event.clipboardData?.items;
  if (!items) {
    return [];
  }
  return Array.from(items)
    .filter((item) => item.kind === "file" && item.type.startsWith("image/"))
    .map((item) => item.getAsFile())
    .filter((file): file is File => file !== null);
}

/**
 * `anynote-image`：在官方 Image 基础上接入上传。
 * 支持工具栏插入 / 粘贴 / 拖拽三种入口，统一走 `uploadFn` → 插入 `image` 节点。
 * Markdown 序列化沿用 tiptap-markdown 内置的 `image` 规则（`![alt](src)`）。
 */
export const AnynoteImage = Image.extend<AnynoteImageOptions>({
  addOptions() {
    return {
      ...this.parent?.(),
    };
  },

  addProseMirrorPlugins() {
    const uploadFn = this.options.uploadFn;
    if (!uploadFn) {
      return [];
    }
    const onError = this.options.onError ?? ((error: unknown) => console.error(error));

    const insert = async (view: EditorView, file: File, pos?: number) => {
      try {
        const src = await uploadFn(file);
        const node = view.state.schema.nodes.image?.create({ src, alt: file.name });
        if (!node) {
          return;
        }
        const at = pos ?? view.state.selection.from;
        view.dispatch(view.state.tr.insert(at, node));
      } catch (error) {
        onError(error);
      }
    };

    const insertMany = (view: EditorView, files: File[], pos?: number) => {
      files.forEach((file, index) => {
        void insert(view, file, pos === undefined ? undefined : pos + index);
      });
    };

    return [
      new Plugin({
        props: {
          handlePaste: (view, event) => {
            const files = filesFromClipboard(event);
            if (files.length === 0) {
              return false;
            }
            event.preventDefault();
            insertMany(view, files);
            return true;
          },
          handleDrop: (view, event) => {
            const files = pickImageFiles(event.dataTransfer);
            if (files.length === 0) {
              return false;
            }
            event.preventDefault();
            const coords = view.posAtCoords({ left: event.clientX, top: event.clientY });
            insertMany(view, files, coords?.pos);
            return true;
          },
        },
      }),
    ];
  },
});
