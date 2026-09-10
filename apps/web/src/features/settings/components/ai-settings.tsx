"use client";

import { type AIModelValue, AI_MODEL_OPTIONS } from "@/features/ai/model-options";
import { loadPreferredModel, savePreferredModel } from "@/features/ai/model-options";
import { useEffect, useState } from "react";
import { toast } from "sonner";

/** AI 设置：对话模型偏好（localStorage 持久化，聊天页读取）。 */
export function AiSettings() {
  const [model, setModel] = useState<AIModelValue | null>(null);

  useEffect(() => {
    setModel(loadPreferredModel());
  }, []);

  return (
    <div className="max-w-2xl space-y-4" data-testid="settings-ai">
      <div>
        <h2 className="text-lg font-semibold">AI</h2>
        <p className="text-sm text-muted-foreground">选择 AI 对话使用的默认模型。</p>
      </div>
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="默认模型">
        {AI_MODEL_OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            // biome-ignore lint/a11y/useSemanticElements: 保持与全站一致的自定义按钮风格
            role="radio"
            aria-checked={model === option.value}
            onClick={() => {
              setModel(option.value);
              savePreferredModel(option.value);
              toast.success(`已切换到 ${option.label}`);
            }}
            className={`cursor-pointer rounded-lg border px-4 py-2 text-sm outline-none transition-colors ${
              model === option.value
                ? "border-primary bg-primary/5 text-primary"
                : "hover:bg-accent/50"
            }`}
            data-testid={`model-option-${option.value}`}
          >
            {option.label}
          </button>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">偏好保存在本设备浏览器中。</p>
    </div>
  );
}
