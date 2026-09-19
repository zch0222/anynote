import { cn } from "@/lib/utils";
import { Sparkles } from "lucide-react";

/**
 * 落地页（D-19 / M-14）里那几块**纯装饰**的积木。
 *
 * 它们不对应任何真实数据——落地页对访客公开，不查业务接口，画板上的
 * 「128 篇笔记」「3 人正在编辑」都是示意值。所以这里全是无状态的小组件，
 * 参数就是画板上量出来的尺寸，没有任何 hook 与请求。
 *
 * 抽出来单独放的理由：这些形状在五张 Bento 卡里各自只出现一次，
 * 但**尺寸与色阶的注释比形状本身重要**（哪一格用 heat-3、进度填到几成），
 * 混在卡片组件的 JSX 里就淹没了。
 */

/**
 * 图标块：Bento 卡与 AI 卡头部那个圆角方块。
 *
 * 尺寸走类名而不是内联 style：**移动 36 / 桌面 40**（画板两版实测），
 * 内联 style 没法按断点切换，也会被「动态值走 CSS 变量」的约定挡下。
 */
export function IconTile({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      data-slot="landing-icon-tile"
      className={cn(
        "grid size-9 shrink-0 place-items-center rounded-[10px] text-white md:size-10",
        className,
      )}
    >
      {children}
    </span>
  );
}

/**
 * 知识库卡里的 5 格计数。
 *
 * 两态是**两套尺寸**，不是缩放：桌面格高 70 / 内边距 13 / 数值与标签间距 5
 * （画板 D-19 实测 1707..1777），移动格高 60 / 内边距 10 / 两者无间距
 * （画板 M-14 实测 1141..1201）。移动端格子薄——因为它是两列，格子本来就宽。
 */
export function CountCell({
  value,
  label,
  tone,
}: {
  value: string;
  label: string;
  tone: string;
}) {
  return (
    <div className="rounded-[10px] bg-block px-3.5 py-[10.5px] md:py-[13px]">
      <div className={cn("text-[21px] leading-[21px] font-semibold", tone)}>{value}</div>
      <div className="text-footnote leading-[18px] text-label-secondary md:mt-[5px]">{label}</div>
    </div>
  );
}

/** 骨架条：笔记卡、协同卡里那几根示意正文的浅灰长条。 */
export function SkeletonBar({
  width,
  tall = false,
  strong = false,
  className,
}: {
  /** 用百分比而不是像素：卡片宽度在桌面 / 移动两态不同，写死像素会溢出。 */
  width: string;
  tall?: boolean;
  strong?: boolean;
  /** 允许调用方按断点切换显隐（笔记卡移动端只画一根条）。 */
  className?: string;
}) {
  return (
    <span
      style={{ width }}
      className={cn(
        "block rounded-full",
        tall ? "h-2.5" : "h-2",
        // 首根条形比其余深一档（画板 D-19 卡片 2 实测 #E6E6EA vs #F2F2F7）：
        // 全用同一档会让四根条糊成一块，看不出"这是几行字"。
        strong ? "bg-separator" : "bg-block",
        className,
      )}
    />
  );
}

/** 协同卡里的重叠头像。画板上桌面 32、移动 28，重叠 8。 */
export function AvatarStack({
  colors,
  className,
}: {
  colors: readonly string[];
  className?: string;
}) {
  return (
    <span className={cn("flex items-center", className)} aria-hidden="true">
      {colors.map((color, index) => (
        <span
          key={color}
          style={{ marginLeft: index === 0 ? 0 : -8 }}
          className={cn("block size-7 rounded-full md:size-8", color)}
        />
      ))}
    </span>
  );
}

/**
 * 慕课卡里的播放器示意：绿色大圆角块 + 居中白色播放键 + 底部进度条。
 */
export function PlayerMock() {
  return (
    <div className="space-y-2.5">
      <div className="relative grid h-[72px] place-items-center rounded-[12px] bg-success">
        <span className="grid size-8 place-items-center rounded-full bg-white">
          <span
            // 播放三角用 CSS 边框画：比内嵌一个 SVG 轻，且不需要额外的 aria 语义
            // （整个播放器都是装饰，读屏由卡片的标题与正文承担）。
            aria-hidden="true"
            className="ml-0.5 block size-0 border-y-[6px] border-l-[9px] border-y-transparent border-l-success"
          />
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-block">
        <span className="block h-full w-[39%] rounded-full bg-success" />
      </div>
    </div>
  );
}

/**
 * 任务卡里的热力行。
 *
 * 色阶直接用**站内同一套** `heat-1..5`（features 里的任务热力图也用它），
 * 不另配一组营销色——同一件事在两个页面颜色不同，是最容易被当成 bug 的那种不一致。
 * 画板上的 7 格是 `1 2 3 4 5 3 1`，这里照抄。
 */
export function HeatRow() {
  /*
   * 7 格是**固定顺序**的色阶（浅 → 深 → 浅），不是一份会增删的列表，
   * 所以以位置为 key 是安全的：整行是装饰（`aria-hidden`），没有状态挂在格子上。
   */
  const cells = [
    { day: "一", tone: "bg-heat-1" },
    { day: "二", tone: "bg-heat-2" },
    { day: "三", tone: "bg-heat-3" },
    { day: "四", tone: "bg-heat-4" },
    { day: "五", tone: "bg-heat-5" },
    { day: "六", tone: "bg-heat-3" },
    { day: "日", tone: "bg-heat-1" },
  ];
  return (
    <div className="flex gap-1.5" aria-hidden="true">
      {cells.map((cell) => (
        <span key={cell.day} className={cn("block h-6 w-6 rounded-[6px]", cell.tone)} />
      ))}
    </div>
  );
}

/** 细进度条：任务卡底部那条「8 / 12 已提交」。 */
export function MiniProgress({ percent, tone }: { percent: number; tone: string }) {
  return (
    <div className="h-1.5 overflow-hidden rounded-full bg-block">
      <span className={cn("block h-full rounded-full", tone)} style={{ width: `${percent}%` }} />
    </div>
  );
}

/** AI 问答卡里的星形图标（画板用的是四角星光，不是 lucide 的 sparkle 轮廓）。 */
export function SparkIcon({ className }: { className?: string }) {
  return <Sparkles className={className} aria-hidden="true" />;
}
