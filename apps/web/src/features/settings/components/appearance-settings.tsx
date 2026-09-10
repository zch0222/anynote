"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";

const THEME_OPTIONS = [
  { value: "light", label: "浅色", icon: Sun },
  { value: "dark", label: "深色", icon: Moon },
  { value: "system", label: "跟随系统", icon: Monitor },
] as const;

/** 外观设置：主题三选一（next-themes，与 M4 全局主题同一来源）。 */
export function AppearanceSettings() {
  const { theme, setTheme } = useTheme();

  return (
    <div className="max-w-2xl space-y-4" data-testid="settings-appearance">
      <div>
        <h2 className="text-lg font-semibold">外观</h2>
        <p className="text-sm text-muted-foreground">选择界面主题，跟随系统会自动切换明暗。</p>
      </div>
      <div className="flex gap-2" role="radiogroup" aria-label="主题">
        {THEME_OPTIONS.map(({ value, label, icon: Icon }) => (
          <button
            key={value}
            type="button"
            // biome-ignore lint/a11y/useSemanticElements: 保持与全站一致的自定义按钮风格
            role="radio"
            aria-checked={theme === value}
            onClick={() => {
              setTheme(value);
            }}
            className={`flex cursor-pointer items-center gap-2 rounded-lg border px-4 py-2 text-sm outline-none transition-colors ${
              theme === value ? "border-primary bg-primary/5 text-primary" : "hover:bg-accent/50"
            }`}
            data-testid={`theme-option-${value}`}
          >
            <Icon className="size-4" aria-hidden="true" />
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
