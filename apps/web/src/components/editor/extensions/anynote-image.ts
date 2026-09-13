import Image from "@tiptap/extension-image";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet, type EditorView } from "@tiptap/pm/view";

/** 上传进度回调：`percent` 为 0–100 的整数。 */
export type UploadProgressFn = (percent: number) => void;

/** 上传一个文件并返回可直接放进 `src` 的 URL。 */
export type UploadFn = (
  file: File,
  options?: { onProgress?: UploadProgressFn | undefined },
) => Promise<string>;

export type AnynoteImageOptions = {
  uploadFn?: UploadFn | undefined;
  HTMLAttributes?: Record<string, unknown> | undefined;
  /** 上传失败时的回调（默认 console.error，可换成 toast）。 */
  onError?: ((error: unknown) => void) | undefined;
};

/** 指示器 DOM 的测试选择器，单测与 E2E 共用一份，避免两边各写一遍字符串。 */
export const IMAGE_UPLOAD_INDICATOR_SELECTOR = '[data-testid="image-upload-indicator"]';

/** 一次进行中的上传。`pos` 是当前文档坐标，随编辑漂移。 */
type UploadItem = {
  id: string;
  pos: number;
  fileName: string;
  percent: number;
};

type UploadPluginState = { uploads: UploadItem[] };

type UploadMeta =
  | { type: "start"; item: UploadItem }
  | { type: "progress"; id: string; percent: number }
  | { type: "finish"; id: string };

export const IMAGE_UPLOAD_PLUGIN_KEY = new PluginKey<UploadPluginState>("anynoteImageUpload");

let uploadSeq = 0;

/**
 * 自增的上传序号，只用于把进度回调与指示器配对。
 *
 * 刻意不用 `crypto.randomUUID()`：那个 API 只在 secure context 下存在，而这个 id
 * 不需要任何随机性——用它会让明文 HTTP 访问时整个插图功能挂掉。
 */
function nextUploadId(): string {
  uploadSeq += 1;
  return `image-upload-${uploadSeq}`;
}

function clampPercent(percent: number): number {
  if (!Number.isFinite(percent)) {
    return 0;
  }
  return Math.max(0, Math.min(100, Math.round(percent)));
}

/** 「上传中」指示器的 DOM：转圈 + 百分比，插在图片将要落下的位置。 */
function createIndicator(item: UploadItem): HTMLElement {
  const dom = document.createElement("span");
  dom.className = "anynote-image-upload";
  dom.setAttribute("data-testid", "image-upload-indicator");
  dom.setAttribute("data-upload-id", item.id);
  dom.setAttribute("data-percent", String(item.percent));
  // 进度会连续变化，用 role=status 让读屏器以礼貌方式播报，不打断当前朗读
  dom.setAttribute("role", "status");
  dom.setAttribute("aria-label", `图片「${item.fileName}」上传中 ${item.percent}%`);

  const spinner = document.createElement("span");
  spinner.className = "anynote-image-upload__spinner";
  spinner.setAttribute("aria-hidden", "true");

  const text = document.createElement("span");
  text.className = "anynote-image-upload__text";
  text.textContent = `上传中 ${item.percent}%`;

  dom.append(spinner, text);
  return dom;
}

/** 上传成功（`src` 非空）时在同一次事务里落图，失败时只摘掉指示器。 */
function finishUpload(view: EditorView, id: string, src: string | null, alt: string): void {
  const pluginState = IMAGE_UPLOAD_PLUGIN_KEY.getState(view.state);
  const item = pluginState?.uploads.find((entry) => entry.id === id);
  const meta: UploadMeta = { type: "finish", id };
  const tr = view.state.tr.setMeta(IMAGE_UPLOAD_PLUGIN_KEY, meta);

  if (src !== null && item) {
    const node = view.state.schema.nodes.image?.create({ src, alt });
    if (node) {
      // 位置已随编辑映射过，但仍夹一次范围：越界 insert 会直接抛错
      const at = Math.max(0, Math.min(item.pos, tr.doc.content.size));
      tr.insert(at, node);
    }
  }

  view.dispatch(tr);
}

/**
 * 插图入口：先放一个占位指示器 → 上传（带进度）→ 把指示器换成真正的 image 节点。
 *
 * 工具栏、Slash 菜单、粘贴、拖拽四条路径**共用这一个实现**，否则每条都会漏掉提示。
 * 指示器是 ProseMirror 的 widget decoration（不是文档节点），因此：
 * - 不会进入 Markdown 序列化，上传途中自动保存不会把占位符写进正文；
 * - 协同模式下纯属本地 UI，不会同步给其他人。
 */
export function uploadImageAt(
  view: EditorView,
  uploadFn: UploadFn,
  file: File,
  options: { pos?: number | undefined; onError?: ((error: unknown) => void) | undefined } = {},
): Promise<void> {
  const at = options.pos ?? view.state.selection.from;
  const id = nextUploadId();
  const item: UploadItem = { id, pos: at, fileName: file.name, percent: 0 };

  const startMeta: UploadMeta = { type: "start", item };
  view.dispatch(view.state.tr.setMeta(IMAGE_UPLOAD_PLUGIN_KEY, startMeta));

  return uploadFn(file, {
    onProgress: (percent) => {
      if (view.isDestroyed) {
        return;
      }
      const progressMeta: UploadMeta = {
        type: "progress",
        id,
        percent: clampPercent(percent),
      };
      view.dispatch(view.state.tr.setMeta(IMAGE_UPLOAD_PLUGIN_KEY, progressMeta));
    },
  }).then(
    (src) => {
      if (view.isDestroyed) {
        return;
      }
      finishUpload(view, id, src, file.name);
    },
    (error: unknown) => {
      // 失败必须摘掉指示器，否则正文里会永远留一个转圈的占位
      if (!view.isDestroyed) {
        finishUpload(view, id, null, file.name);
      }
      options.onError?.(error);
    },
  );
}

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

    return [
      new Plugin<UploadPluginState>({
        key: IMAGE_UPLOAD_PLUGIN_KEY,
        state: {
          init: () => ({ uploads: [] }),
          apply: (tr, value) => {
            const meta = tr.getMeta(IMAGE_UPLOAD_PLUGIN_KEY) as UploadMeta | undefined;
            let uploads = value.uploads;

            if (meta?.type === "finish") {
              uploads = uploads.filter((item) => item.id !== meta.id);
            } else if (meta?.type === "progress") {
              uploads = uploads.map((item) =>
                item.id === meta.id ? { ...item, percent: meta.percent } : item,
              );
            }

            // 上传途中用户继续编辑时，指示器要跟着自己的位置走，不能停在旧坐标上
            if (tr.docChanged && uploads.length > 0) {
              uploads = uploads.map((item) => ({ ...item, pos: tr.mapping.map(item.pos) }));
            }

            // start 最后处理：新坐标已属于新文档，不该再被映射一次
            if (meta?.type === "start") {
              uploads = [...uploads, meta.item];
            }

            return { uploads };
          },
        },
        props: {
          decorations(state) {
            const pluginState = IMAGE_UPLOAD_PLUGIN_KEY.getState(state);
            if (!pluginState || pluginState.uploads.length === 0) {
              return null;
            }
            return DecorationSet.create(
              state.doc,
              pluginState.uploads.map((item) =>
                // percent 进 spec：数值一变 eq 即为 false，widget 才会重绘
                Decoration.widget(item.pos, () => createIndicator(item), {
                  side: -1,
                  percent: item.percent,
                }),
              ),
            );
          },
          handlePaste: (view, event) => {
            const files = filesFromClipboard(event);
            if (files.length === 0) {
              return false;
            }
            event.preventDefault();
            for (const file of files) {
              void uploadImageAt(view, uploadFn, file, { onError });
            }
            return true;
          },
          handleDrop: (view, event) => {
            const files = pickImageFiles(event.dataTransfer);
            if (files.length === 0) {
              return false;
            }
            event.preventDefault();
            const coords = view.posAtCoords({ left: event.clientX, top: event.clientY });
            files.forEach((file, index) => {
              void uploadImageAt(view, uploadFn, file, {
                pos: coords === null ? undefined : coords.pos + index,
                onError,
              });
            });
            return true;
          },
        },
      }),
    ];
  },
});
