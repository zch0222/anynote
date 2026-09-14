"use client";

import { AnynoteLogo } from "@/components/layout/brand-logo";
import { Skeleton } from "@/components/ui/skeleton";
import { useDelayedFlag } from "@/hooks/use-delayed-flag";
import { cn } from "@/lib/utils";

/**
 * 品牌启动（设计稿 P16「05 品牌启动 Brand boot」）。
 *
 * 全屏初始化的**唯一形态**，替换掉原来「两块灰条 + 一行正在加载…」那种
 * 没有任何品牌信息的裸骨架。三条设计决策：
 *
 * 1. **只动 Logo，不转圈**。转圈是通用语，Logo 才是品牌语；而且启动态是
 *    "第一次见到这个产品"的时刻，值得把品牌放上去。
 * 2. **首帧之后才出现**（`delayMs`）。路由切换如果 50ms 就完成了，
 *    闪一下启动页比不闪更糟——那会让人觉得"这软件一直在重新加载"。
 * 3. **超过 `skeletonAfterMs` 仍未就绪就换骨架兜底**。网络慢到一定程度时，
 *    一直转 Logo 反而不如给出**结构占位**——用户能提前看到"这里将出现什么"。
 */
export function BrandBoot({
  /** 全屏铺满（路由级 loading.tsx）。传 false 时只占父容器（内嵌用法）。 */
  fullscreen = true,
  /** 出现前的延迟，默认 120ms：把"一眼就加载完"的快速切换滤掉。 */
  delayMs = 120,
  /** 超过这么久还没就绪就切骨架兜底；传 0 关闭。默认 1200ms。 */
  skeletonAfterMs = 1200,
  /** 文案。设计稿是「正在准备工作区…」。 */
  message = "正在准备工作区…",
  className,
}: {
  fullscreen?: boolean;
  delayMs?: number;
  skeletonAfterMs?: number;
  message?: string;
  className?: string;
}) {
  const visible = useDelayedFlag(delayMs);
  const showSkeleton = skeletonAfterMs > 0 && useDelayedFlag(skeletonAfterMs);

  if (!visible) {
    // 延迟窗口内**什么都不渲染**：这里返回 null 而不是透明的占位块，
    // 因为父容器（loading.tsx）本身已经是空的，多一层空 div 只会多一次布局抖动
    return null;
  }

  return (
    /*
     * `<output>` 承载状态：它的隐式 role 就是 `status`（等价 `aria-live="polite"`），
     * 与 `components/note/save-status.tsx` 同一套做法——全仓的"状态播报"只有这一种写法。
     *
     * 关键是**文案必须进 DOM**：只有视觉动效不算状态可见（设计稿 P16 的无障碍要求）。
     * 动效本身 aria-hidden：读屏用户不需要知道"书在画第几笔"。
     */
    <output
      data-slot="brand-boot"
      data-phase={showSkeleton ? "skeleton" : "logo"}
      className={cn(
        "grid place-items-center",
        fullscreen ? "min-h-svh w-full" : "h-full w-full",
        className,
      )}
    >
      {showSkeleton ? (
        <BootSkeleton />
      ) : (
        <div className="flex flex-col items-center gap-4">
          <AnynoteLogo animated size={56} />
          <div className="space-y-1 text-center">
            <p className="text-title font-semibold text-label">Anynote</p>
            <p className="text-footnote text-label-secondary">{message}</p>
          </div>
        </div>
      )}
    </output>
  );
}

/**
 * 骨架兜底（设计稿 P16「骨架兜底 · 超过 1.2s 仍未就绪才切换」）。
 *
 * 刻意只用**两行**：一行标题位、一块正文位。启动阶段的骨架不承诺具体结构
 * （这时还不知道要渲染的是列表还是文章），给一个假的列表反而会在真内容
 * 到达时二次跳动。
 */
function BootSkeleton() {
  return (
    <div className="w-full max-w-md space-y-3 px-6" aria-hidden="true">
      <Skeleton className="h-7 w-2/3" />
      <Skeleton className="h-24 w-full rounded-lg" />
    </div>
  );
}
