import { full } from "@/components/editor/presets/full";
import { minimal } from "@/components/editor/presets/minimal";
import { readonly } from "@/components/editor/presets/readonly";
import type { PresetContext, PresetName } from "@/components/editor/presets/types";
import type { Extensions } from "@tiptap/core";

export type { PresetContext, PresetName } from "@/components/editor/presets/types";
export type { AiContinueFn } from "@/components/editor/presets/types";
export { DEFAULT_PLACEHOLDER } from "@/components/editor/presets/types";

type PresetFactory = (ctx: PresetContext) => Extensions;

/** 预设 → 扩展列表工厂。`readonly` 忽略上下文（不需要上传能力与占位符）。 */
export const presets: Record<PresetName, PresetFactory> = {
  full,
  minimal,
  readonly,
};
