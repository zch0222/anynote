import type { UploadFn } from "@/components/editor/extensions/anynote-image";

/** 编辑器预设名。 */
export type PresetName = "full" | "minimal" | "readonly";

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
};

export const DEFAULT_PLACEHOLDER = "输入 “/” 唤起命令，或直接开始写作…";
