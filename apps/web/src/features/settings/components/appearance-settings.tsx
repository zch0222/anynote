"use client";

import { cn } from "@/lib/utils";
import { Info, Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useRef, useState } from "react";

type ThemeValue = "light" | "dark" | "system";

/**
 * `ThemedThumb` 用的两套字面色值。
 *
 * 缩略图必须**同时**展示浅色与深色两态，所以不能引用当前主题的语义 Token
 * （在深色下 `bg-surface` 会把"浅色预览"也画成黑的，三张卡看起来一模一样）。
 * 这里抄的是 `globals.css` 里两套 Token 的实体值，改主题色板时要回来同步。
 */
const THUMB_TOKENS = {
  light: {
    sidebar: "bg-[#f7f7f9]",
    page: "bg-[#f2f2f7]",
    card: "bg-[#ffffff]",
    line: "bg-[#e5e5ea]",
    accent: "bg-[#0071e3]",
  },
  dark: {
    sidebar: "bg-[#17171a]",
    page: "bg-[#000000]",
    card: "bg-[#1c1c1e]",
    line: "bg-[#3a3a3c]",
    accent: "bg-[#0a84ff]",
  },
} as const;

/**
 * 主题预览缩略（D-13 图例 3）。
 *
 * 用 Token 直接画侧栏 + 内容卡，不截图：截图会随字体与渲染差异漂移，
 * 而且每加一个主题就要出一张图。这里两个色板只是几行 div，
 * 换色板时改 `THUMB_TOKENS` 一处即可。
 */
function ThemedThumb({ tone }: { tone: "light" | "dark" | "split" }) {
  const half = (side: "light" | "dark") => {
    const tokens = THUMB_TOKENS[side];
    return (
      <div className={cn("flex h-full flex-1", tokens.page)}>
        {/* 侧栏：比页面底再深/浅一档，缩略上才看得出这是"两栏" */}
        <div className={cn("flex w-1/4 flex-col gap-1 p-1.5", tokens.sidebar)}>
          <div className={cn("h-1 w-3/4 rounded-full", tokens.accent)} />
          <div className={cn("h-1 w-full rounded-full", tokens.line)} />
          <div className={cn("h-1 w-2/3 rounded-full", tokens.line)} />
        </div>
        {/* 内容卡：一张卡片 + 两行文字占位 */}
        <div className="flex flex-1 flex-col gap-1 p-1.5">
          <div className={cn("flex flex-1 flex-col gap-1 rounded-sm p-1.5", tokens.card)}>
            <div className={cn("h-1 w-1/2 rounded-full", tokens.line)} />
            <div className={cn("h-1 w-5/6 rounded-full", tokens.line)} />
            <div className={cn("h-1 w-2/3 rounded-full", tokens.line)} />
          </div>
        </div>
      </div>
    );
  };

  if (tone === "split") {
    // 「跟随系统」用对角劈开的两态：一眼看出"由系统决定"，而不是第三种配色
    return (
      <div className="flex h-full w-full overflow-hidden" aria-hidden="true">
        {half("light")}
        {half("dark")}
      </div>
    );
  }
  return (
    <div className="h-full w-full" aria-hidden="true">
      {half(tone)}
    </div>
  );
}

const THEME_OPTIONS: {
  value: ThemeValue;
  label: string;
  icon: typeof Sun;
  tone: "light" | "dark" | "split";
}[] = [
  { value: "light", label: "浅色", icon: Sun, tone: "light" },
  { value: "dark", label: "深色", icon: Moon, tone: "dark" },
  { value: "system", label: "跟随系统", icon: Monitor, tone: "split" },
];

/** 系统当前是不是深色（`matchMedia`，与 next-themes 的 `enableSystem` 同一判据）。 */
function useSystemPrefersDark(): boolean {
  const [prefersDark, setPrefersDark] = useState(false);

  useEffect(() => {
    const query = window.matchMedia("(prefers-color-scheme: dark)");
    const sync = () => setPrefersDark(query.matches);
    sync();
    // 用户改系统外观时说明文字要跟着变，否则它会一直说"当前系统为浅色"
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);

  return prefersDark;
}

/**
 * 外观设置（D-13 图例 3 · 5）。
 *
 * 三张带预览的单选卡，点了立即生效（next-themes 已经做了持久化，没有"保存"按钮）。
 * 用 radiogroup 而不是三个开关：这是同一件事的三选一，读屏要能听出"2 / 3"。
 */
export function AppearanceSettings() {
  const { theme, setTheme } = useTheme();
  const systemPrefersDark = useSystemPrefersDark();
  const groupRef = useRef<HTMLDivElement>(null);

  /*
   * `theme` 在挂载前是 undefined（服务端不知道 localStorage），此时不高亮任何一张。
   * 早先的实现会把 `undefined === "light"` 判成 false，于是首帧三张卡全是未选中态，
   * 看起来像"偏好丢了"。这里只在拿到值之后才比。
   */
  const current = theme as ThemeValue | undefined;

  /** 方向键切换（D-13 图例 3 明确要求）。 */
  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    const index = THEME_OPTIONS.findIndex((option) => option.value === current);
    if (index === -1) return;

    let next = index;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      next = (index + 1) % THEME_OPTIONS.length;
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      next = (index - 1 + THEME_OPTIONS.length) % THEME_OPTIONS.length;
    } else if (event.key === "Home") {
      next = 0;
    } else if (event.key === "End") {
      next = THEME_OPTIONS.length - 1;
    } else {
      return;
    }

    event.preventDefault();
    const value = THEME_OPTIONS[next]?.value;
    if (value) setTheme(value);
    // 焦点跟着选中项走：roving tabindex 下不移动焦点的话，第二次按方向键
    // 事件仍落回同一个已失焦的元素上，读屏会念错当前项。
    const buttons = groupRef.current?.querySelectorAll<HTMLButtonElement>('[role="radio"]');
    buttons?.[next]?.focus();
  }

  /*
   * 两个词都带「色」字：模板里直接拼「当前系统为{systemTone}」，不再补后缀——
   * 早先写成 `{label}色` 会得到「浅色色」。
   */
  const systemTone: "浅色" | "深色" = systemPrefersDark ? "深色" : "浅色";
  const effectiveTone: "浅色" | "深色" =
    current === "dark" || (current !== "light" && systemPrefersDark) ? "深色" : "浅色";

  return (
    /*
      H-13：主题选择在**一张白卡**里（画板实测内容区近白占比 38.4%，实现是 6.0%）。
      卡内的标题是「主题」而不是「外观」，说明是「选择界面主题，跟随系统会随操作系统
      自动切换明暗。」——画板原文如此。原实现写「外观」+「点了立即生效。」，
      两者都没说清这个页面最需要解释的一件事：**跟随系统是什么意思**。
      页头（`设置` + 副标题）在设置布局里，本组件只管卡片。
    */
    <div className="max-w-2xl" data-testid="settings-appearance">
      <section className="rounded-lg bg-surface p-5 shadow-card">
        <div className="space-y-1">
          <h2 className="text-headline text-label">主题</h2>
          <p className="text-footnote text-label-tertiary">
            选择界面主题，跟随系统会随操作系统自动切换明暗。
          </p>
        </div>

        <div
          ref={groupRef}
          role="radiogroup"
          aria-label="主题"
          className="mt-4 grid gap-3 sm:grid-cols-3"
          onKeyDown={handleKeyDown}
        >
          {THEME_OPTIONS.map(({ value, label, icon: Icon, tone }, index) => {
            const active = current === value;
            return (
              <button
                key={value}
                type="button"
                // biome-ignore lint/a11y/useSemanticElements: 单选卡带预览缩略，原生 input[type=radio] 画不出这种形态；语义由 role + aria-checked + 方向键补全
                role="radio"
                aria-checked={active}
                // roving tabindex：整组只占一个 tab 位，组内用方向键走
                tabIndex={active || (current === undefined && index === 0) ? 0 : -1}
                onClick={() => setTheme(value)}
                data-testid={`theme-option-${value}`}
                className={cn(
                  "flex cursor-pointer flex-col gap-2 rounded-md border-2 p-2 text-left outline-none transition-colors",
                  "focus-visible:ring-2 focus-visible:ring-ring",
                  active ? "border-accent" : "border-separator hover:border-label-tertiary",
                )}
              >
                {/* 图例 3：预览缩略 132 高、圆角 12——`rounded-xl` 是 14，差一档看得见 */}
                <span className="block h-[132px] w-full overflow-hidden rounded-[12px] border border-separator">
                  <ThemedThumb tone={tone} />
                </span>
                <span className="flex items-center gap-2 px-1 pb-1">
                  {/* 单选圆 18：用 border + 内点画，保证两态下都是语义色 */}
                  <span
                    aria-hidden="true"
                    className={cn(
                      "grid size-[18px] shrink-0 place-items-center rounded-full border-2",
                      active ? "border-accent" : "border-separator",
                    )}
                  >
                    {active ? <span className="size-2 rounded-full bg-accent" /> : null}
                  </span>
                  <Icon className="size-[15px] shrink-0 text-label-secondary" aria-hidden="true" />
                  <span className="text-sm text-label">{label}</span>
                </span>
              </button>
            );
          })}
        </div>

        {/* D-13 图例 5：说清「跟随系统」此刻的结果，以及偏好不跨设备 */}
        <p
          className="mt-4 flex items-start gap-1.5 text-footnote text-label-tertiary"
          data-testid="appearance-effective"
        >
          <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          当前系统为{systemTone}，界面正在使用{effectiveTone}。偏好只保存在这台设备的浏览器里。
        </p>
      </section>
    </div>
  );
}
