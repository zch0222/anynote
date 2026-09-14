import { cn } from "@/lib/utils";

/**
 * 转圈（设计稿 P14「02 转圈 Spinner」）。
 *
 * 处理**不可量化的行内等待**：按钮提交、下拉加载、局部刷新、Toast。
 * 语义是「不知道还要多久」，所以只有"在转"这一个信息，没有百分比——
 * 能算出进度就该换成 `Progress`。
 *
 * 形态按设计稿实测：**一圈灰轨道 + 一段蓝色弧**（不是单根留缺口的圆环）。
 * 有轨道才能同时读出"转到了哪里"和"总共多少"，缺了轨道在 12px 下就只剩一个点。
 * 弧长固定为 80°（周长 22%），两端圆头。
 *
 * 三个不能随手改的约束：
 * 1. **只有 4 个尺寸**（12 行内 / 14 徽标 / 16 默认 / 20 按钮）。尺寸散开会让同一屏
 *    出现三种转圈，看起来像三个不同组件。
 * 2. **只有"转 / 停"两态**，所以是 `linear`——加缓动反而会看出顿挫。
 * 3. **颜色继承 `currentColor` 的只有弧**，轨道走 `--separator`：
 *    弧跟着所在文字变（按钮里跟按钮色、危险操作里跟 danger），轨道始终是背景性的。
 */

/** 内部坐标系。所有尺寸共用它，缩放交给 width/height，比例因此天然一致。 */
const VIEW_BOX = 40;
/** 半径 + 描边一半 = 20，正好把 40 的盒子吃满。描边占比 14%，与设计稿实测一致。 */
const STROKE = 5.6;
const RADIUS = (VIEW_BOX - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
/** 弧长占整圈的比例：80°。 */
const ARC_RATIO = 80 / 360;

const SPINNER_SIZES = {
  /** 行内文字之间，如「上传中 42%」前面的圈。 */
  inline: 12,
  /** 徽标 / 标签内，如「已索引」这类紧跟文字的状态位。 */
  badge: 14,
  /** 默认，独立占位时用。 */
  default: 16,
  /** 按钮内，与 16/20px 图标同档。 */
  button: 20,
} as const;

export type SpinnerSize = keyof typeof SPINNER_SIZES;

export const SPINNER_SIZE_PX = SPINNER_SIZES;

export function Spinner({
  size = "default",
  className,
  label,
}: {
  size?: SpinnerSize;
  className?: string;
  /**
   * 可访问名。**不传即 `aria-hidden`**：转圈十有八九紧挨着「上传中…」这类文字，
   * 再播报一次"加载中"只会让读屏用户听两遍。只有它独自承载状态时才传。
   */
  label?: string | undefined;
}) {
  const px = SPINNER_SIZES[size];
  return (
    <svg
      data-slot="spinner"
      data-size={size}
      viewBox={`0 0 ${VIEW_BOX} ${VIEW_BOX}`}
      width={px}
      height={px}
      role={label ? "status" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className={cn("inline-block shrink-0", className)}
    >
      <circle
        cx={VIEW_BOX / 2}
        cy={VIEW_BOX / 2}
        r={RADIUS}
        fill="none"
        strokeWidth={STROKE}
        className="stroke-separator"
      />
      {/*
        旋转挂在弧自己身上而不是整个 <svg> 上：svg 元素若被 display:inline-block 之外
        的布局（如 flex 收缩）影响，整体旋转会让转圈看起来在绕圈外一点转。
      */}
      <circle
        cx={VIEW_BOX / 2}
        cy={VIEW_BOX / 2}
        r={RADIUS}
        fill="none"
        strokeWidth={STROKE}
        strokeLinecap="round"
        strokeDasharray={`${CIRCUMFERENCE * ARC_RATIO} ${CIRCUMFERENCE}`}
        className="origin-center animate-spin-loading stroke-current"
      />
    </svg>
  );
}
