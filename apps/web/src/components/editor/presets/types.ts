import type { UploadFn } from "@/components/editor/extensions/anynote-image";
import type * as Y from "yjs";

/** 编辑器预设名。 */
export type PresetName = "full" | "minimal" | "readonly" | "collaborative";

/**
 * 协同绑定。provider 只被 CollaborationCaret 用来读 awareness，
 * 这里按结构类型声明，避免编辑器层直接依赖 y-websocket。
 */
export type CollaborationBinding = {
  doc: Y.Doc;
  provider: { awareness: unknown };
  /** 本人在他人光标标签上的显示名与配色。 */
  user: { name: string; color: string };
};

/** 「AI 续写」的调用契约：实现方发起流式补全，扩展只消费增量。 */
export type AiContinueFn = (options: {
  /** 光标前的正文（调用方已截取尾部窗口）。 */
  contextTail: string;
  signal: AbortSignal;
  onDelta: (delta: string) => void;
  onError?: (error: unknown) => void;
}) => Promise<void>;

/** 构建预设时的上下文（上传能力、AI 续写、占位文案等）。 */
export type PresetContext = {
  uploadFn?: UploadFn | undefined;
  aiContinue?: AiContinueFn | undefined;
  placeholder?: string | undefined;
  /** 仅 `collaborative` 预设使用；缺省时该预设退化成本地编辑。 */
  collaboration?: CollaborationBinding | undefined;
  /**
   * 是否保留 StarterKit 自带的本地 undo/redo。默认保留；
   * 协同模式必须传 false，改用 Collaboration 基于 Y.UndoManager 的实现。
   */
  undoRedo?: boolean | undefined;
};

export const DEFAULT_PLACEHOLDER = "输入 “/” 唤起命令，或直接开始写作…";
