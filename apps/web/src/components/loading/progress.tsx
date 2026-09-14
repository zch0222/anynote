import { cn } from "@/lib/utils";
import { Spinner } from "./spinner";

/**
 * 进度（设计稿 P14「03 进度 Progress」）。
 *
 * 与 `Spinner` 的分工是**能不能算出来**：进度处理可量化任务
 * （PDF 上传、笔记图片分片直传、批量导入），一律用 `--accent`；
 * 算不出总量的等待才用转圈，不要用进度条假装有进度。
 *
 * 三条实测契约：
 * 1. **环形 44 / 20 两档，条形高 4、全圆**。尺寸与形态都是定值，不做流式自适应。
 * 2. **过渡 240ms ease-out**：分片上报是脉冲式的，不加过渡会看到台阶感。
 * 3. **百分比文字用 `tabular-nums`**：等宽数字，跳数时宽度不抖。
 */

/** 环形内部坐标系，40 见方；描边 5.6 → 与 Spinner 同一套比例。 */
const RING_VIEW_BOX = 40;
const RING_STROKE = 5.6;
const RING_RADIUS = (RING_VIEW_BOX - RING_STROKE) / 2;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

/** 尺寸走类名而不是内联 style：仓库约定「样式只用 Tailwind」。 */
const RING_SIZES = {
  /** 主进度：上传 / 导入的主视觉。设计稿实测外径 44。 */
  default: { px: 44, className: "size-11" },
  /** 行内紧凑档，跟在文字旁边。设计稿实测外径 20。 */
  compact: { px: 20, className: "size-5" },
} as const;

export type ProgressRingSize = keyof typeof RING_SIZES;

const TONE_TEXT = {
  /** 默认：可量化任务一律 accent。 */
  accent: "text-accent",
  /** 完成态，如批量导入全部成功。 */
  success: "text-success",
} as const;

const TONE_STROKE = {
  accent: "stroke-accent",
  success: "stroke-success",
} as const;

const TONE_BG = {
  accent: "bg-accent",
  success: "bg-success",
} as const;

export type ProgressTone = keyof typeof TONE_TEXT;

/** 夹到 0–100 的整数；非有限值（NaN / Infinity）按 0 处理，不让 NaN 漏进 SVG 属性。 */
export function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

/**
 * 环形进度。
 *
 * `role="progressbar"` + `aria-valuenow` 让读屏能播报真实数值——
 * 光有一个转动的圈，对看不见的用户等于"什么都没发生"。
 */
export function ProgressRing({
  value,
  size = "default",
  tone = "accent",
  label,
  className,
}: {
  /** 0–100，非有限值与越界值都会被夹住。 */
  value: number;
  size?: ProgressRingSize;
  tone?: ProgressTone;
  /** 可访问名，如「PDF 上传进度」。 */
  label: string;
  className?: string;
}) {
  const percent = clampPercent(value);
  const { px, className: sizeClass } = RING_SIZES[size];
  const dash = (RING_CIRCUMFERENCE * percent) / 100;

  return (
    /*
     * 不给 `tabIndex`：`progressbar` 是**只读**角色，ARIA 规范明确它不该进 Tab 序列。
     * 加 tabIndex 会多出一个按下去什么也不发生的焦点停靠点，对键盘用户是负担。
     * （本仓 `components/ui/segmented.tsx` 对同类误报也用 biome-ignore。）
     */
    // biome-ignore lint/a11y/useFocusableInteractive: progressbar 是只读角色，ARIA 规范要求它不进 Tab 序列
    <div
      data-slot="progress-ring"
      data-size={size}
      data-value={percent}
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent}
      className={cn("relative inline-grid shrink-0 place-items-center", sizeClass, className)}
    >
      <svg
        viewBox={`0 0 ${RING_VIEW_BOX} ${RING_VIEW_BOX}`}
        width={px}
        height={px}
        aria-hidden="true"
      >
        <circle
          cx={RING_VIEW_BOX / 2}
          cy={RING_VIEW_BOX / 2}
          r={RING_RADIUS}
          fill="none"
          strokeWidth={RING_STROKE}
          className="stroke-separator"
        />
        <circle
          cx={RING_VIEW_BOX / 2}
          cy={RING_VIEW_BOX / 2}
          r={RING_RADIUS}
          fill="none"
          strokeWidth={RING_STROKE}
          strokeLinecap="round"
          strokeDasharray={`${dash} ${RING_CIRCUMFERENCE}`}
          // 从 12 点方向起画：SVG 的 0° 在 3 点方向，不减这 90° 进度会从右边起跑
          transform={`rotate(-90 ${RING_VIEW_BOX / 2} ${RING_VIEW_BOX / 2})`}
          className={TONE_STROKE[tone]}
        />
      </svg>
      {/*
        百分比放在圆环中央。20px 档塞不下两位数，设计稿那里也没有数字——
        紧凑档只画环，数值交给旁边的文字。
      */}
      {size === "default" ? (
        <span className={cn("tabular absolute text-[0.625rem] font-medium", TONE_TEXT[tone])}>
          {percent}%
        </span>
      ) : null}
    </div>
  );
}

/**
 * 条形进度。高 4、全圆，可带右侧百分比。
 *
 * `showValue=false` 用于外层已经有百分比文字的场景（如编辑器里的上传占位，
 * 那里百分比在行尾），避免同一个数字在一行里出现两次。
 */
export function ProgressBar({
  value,
  tone = "accent",
  label,
  showValue = false,
  className,
}: {
  value: number;
  tone?: ProgressTone;
  label: string;
  showValue?: boolean;
  className?: string;
}) {
  const percent = clampPercent(value);
  return (
    <div className={cn("flex items-center gap-2", className)} data-slot="progress-bar">
      {/* biome-ignore lint/a11y/useFocusableInteractive: progressbar 是只读角色，ARIA 规范要求它不进 Tab 序列 */}
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        data-value={percent}
        className="h-1 min-w-0 flex-1 overflow-hidden rounded-full bg-separator"
      >
        <div
          // 宽度是这里唯一的动态值，走 CSS 变量而不是内联 width（仓库约定）
          style={{ "--progress": `${percent}%` } as React.CSSProperties}
          className={cn(
            "h-full w-(--progress) rounded-full transition-[width] duration-240 ease-out",
            TONE_BG[tone],
          )}
        />
      </div>
      {showValue ? (
        <span className="tabular shrink-0 text-xs text-label-secondary">{percent}%</span>
      ) : null}
    </div>
  );
}

/**
 * 行内上传占位（设计稿 P14 底部「行内 · 编辑器图片上传占位」）。
 *
 * 转圈 + 文案 + 右端百分比铺满一行，右端百分比等宽。编辑器正文里它插在图片将要落下的
 * 位置，所以必须**单行、不换行、宽度吃满**——多行会把它下面的正文顶来顶去。
 *
 * `label` 默认是设计稿原文「图片上传中」而不是具体文件名：占位块的宽度只有正文列
 * 那么宽，长文件名会把这一行撑得忽长忽短，上传途中正文一直在跳。
 * 文件名没有丢，它在 `title` 与无障碍名里（见 `anynote-image.ts` 的指示器）。
 */
export function InlineUploadProgress({
  label = "图片上传中",
  value,
  className,
}: {
  label?: string;
  value: number;
  className?: string;
}) {
  const percent = clampPercent(value);
  return (
    <div
      data-slot="inline-upload"
      data-value={percent}
      className={cn(
        "flex w-full items-center gap-2.5 rounded-md bg-block px-3 py-2.5 text-footnote text-label-secondary",
        className,
      )}
    >
      <Spinner size="inline" className="text-accent" />
      <span className="min-w-0 flex-1 truncate">{label}</span>
      <span className="tabular shrink-0 text-label-tertiary">{percent}%</span>
    </div>
  );
}
