import { cn } from "@/lib/utils";

/**
 * Anynote 品牌标记：蓝色圆角方块 + 白色摊开的书。
 *
 * 为什么是 SVG 手绘而不是 `lucide-react` 的 `BookOpen`：
 * 设计稿 P16 的启动动效是**三段描边依次绘制**（左页落笔 → 右页落笔 → 书脊收笔），
 * 描边动画要能单独控制每条路径的 `stroke-dashoffset`，而图标库的子路径没有稳定语义，
 * 换一个图标版本就散架了。
 *
 * 几何按设计稿实测（归一化到 24 单位方块，即整个蓝方块）：
 * - 外侧页边 x = 6.4 / 17.6，书脊 x = 12
 * - 页顶外角 y = 4.6，书脊顶 y = 6.7，页底外角 y = 17.0，书脊底 y = 18.7
 * - 描边宽 0.82（实测 1.77pt / 52pt 方块）
 * 两个关键形状特征不能省：**顶边向中间下沉、底边也向中间下沉** ——
 * 少了这两个斜面，书就成了一个方框。
 *
 * `pathLength="100"` 把三条路径长度归一化：书脊只有一条短线，
 * 不归一化它会"唰"一下画完，看不出是三笔。
 */

/** 三条描边各自的动画类名，与 globals.css 的 `--animate-logo-*` 一一对应。 */
const DRAW_ANIMATION = {
  page1: "animate-logo-page-1",
  page2: "animate-logo-page-2",
  spine: "animate-logo-spine",
} as const;

const PAGE_LEFT = "M12 6.7 L6.4 4.6 L6.4 17 L12 18.7";
const PAGE_RIGHT = "M12 6.7 L17.6 4.6 L17.6 17 L12 18.7";
const SPINE = "M12 6.7 L12 18.7";

export function AnynoteLogo({
  className,
  /** 是否播放三段描边动画（启动页用）。默认静态。 */
  animated = false,
  /** 蓝方块边长（px）。内部图形按比例缩放，所以只需给这一个数。 */
  size = 40,
  /** 无障碍名。装饰性用法（旁边已有「Anynote」字标）留空即 `aria-hidden`。 */
  label,
}: {
  className?: string;
  animated?: boolean;
  size?: number;
  label?: string | undefined;
}) {
  return (
    <span
      data-slot="brand-logo"
      data-size={size}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      style={{ width: size, height: size }}
      className={cn(
        // 圆角取实测 24.8%（设计稿的 App 图标是超椭圆，短边占比固定）。
        // 用百分比而不是固定 px：换尺寸时比例不走样，也不必为每档再配一个类。
        "grid shrink-0 place-items-center rounded-[25%] bg-accent",
        className,
      )}
    >
      <svg
        viewBox="0 0 24 24"
        width={size}
        height={size}
        fill="none"
        stroke="#ffffff"
        strokeWidth={0.82}
        strokeLinecap="round"
        strokeLinejoin="round"
        // 图形本身永远对读屏隐藏：语义由外层 span 承担（传 label 时是 role="img"，
        // 不传时整体 aria-hidden）。所以这里不需要 <title>。
        aria-hidden="true"
        data-slot="boot-logo"
      >
        <path
          data-logo-stroke="page1"
          pathLength={100}
          d={PAGE_LEFT}
          strokeDasharray={100}
          strokeDashoffset={animated ? undefined : 0}
          className={animated ? DRAW_ANIMATION.page1 : undefined}
        />
        <path
          data-logo-stroke="page2"
          pathLength={100}
          d={PAGE_RIGHT}
          strokeDasharray={100}
          strokeDashoffset={animated ? undefined : 0}
          className={animated ? DRAW_ANIMATION.page2 : undefined}
        />
        <path
          data-logo-stroke="spine"
          pathLength={100}
          d={SPINE}
          strokeDasharray={100}
          strokeDashoffset={animated ? undefined : 0}
          className={animated ? DRAW_ANIMATION.spine : undefined}
        />
      </svg>
    </span>
  );
}
