/**
 * AI 聊天模型选项。取值与旧前端 `apps/web-legacy/src/constants/model.ts` 一致，
 * 偏好持久化在 localStorage（后续后端提供用户级配置时再迁移）。
 */
export const AI_MODEL_OPTIONS = [
  { value: "deepseek_deepseek-r1", label: "DeepSeek R1" },
  { value: "deepseek_gpt-4o-mini", label: "GPT-4o mini" },
] as const;

export type AIModelValue = (typeof AI_MODEL_OPTIONS)[number]["value"];

export const DEFAULT_AI_MODEL: AIModelValue = AI_MODEL_OPTIONS[0].value;

export function resolveModel(value: string | null | undefined): AIModelValue {
  return AI_MODEL_OPTIONS.some((option) => option.value === value)
    ? (value as AIModelValue)
    : DEFAULT_AI_MODEL;
}

const STORAGE_KEY = "anynote-ai-model";

export function loadPreferredModel(): AIModelValue {
  if (typeof window === "undefined") {
    return DEFAULT_AI_MODEL;
  }
  return resolveModel(window.localStorage.getItem(STORAGE_KEY));
}

export function savePreferredModel(value: AIModelValue): void {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(STORAGE_KEY, value);
}
