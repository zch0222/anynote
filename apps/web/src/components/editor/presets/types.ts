import type { UploadFn } from "@/components/editor/extensions/anynote-image";

/** 编辑器预设名。 */
export type PresetName = "full" | "minimal" | "readonly";

/** 构建预设时的上下文（上传能力、占位文案等）。 */
export type PresetContext = {
  uploadFn?: UploadFn | undefined;
  placeholder?: string | undefined;
};

export const DEFAULT_PLACEHOLDER = "输入 “/” 唤起命令，或直接开始写作…";
