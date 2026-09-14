"use client";

import { useRouteProgress } from "@/hooks/use-route-progress";
import { cn } from "@/lib/utils";

/**
 * 顶栏路由进度条（设计稿 P16「路由切换 · 移动端顶栏进度条」）。
 *
 * 与 `BrandBoot` 的分工：整页初始化用启动页，**站内路由切换**用这条细进度条——
 * 切页时把整屏换成启动页会丢掉"我还在原页面"的空间连续性，而一条 2px 的条
 * 既说明了"在加载"，也不打断用户的视线。
 *
 * 无障碍角色用 `status` 而不是 `progressbar`：这是**不确定型**进度
 * （不知道还要多久，3s 渐进制到 90% 只是观感），报不出真实的
 * `aria-valuenow`。挂 `progressbar` 却不给数值，读屏会说"进度条 0%"
 * 或干脆沉默；`status` + 一句隐藏文字才是它真正能传达的信息。
 */
export function RouteProgressBar({ className }: { className?: string }) {
  const active = useRouteProgress();

  return (
    /*
     * 不活跃时整条不渲染（而不是渲染一条透明的）：
     * 留着会多一个 status 区域，读屏会在每次页面切换时都播报一次。
     *
     * 用 `<output>`（隐式 role=status）而不是 `role="progressbar"`：
     * 这是**不确定型**进度——不知道还要多久，3s 渐进制到 90% 只是观感，
     * 报不出真实的 `aria-valuenow`。挂 progressbar 却不给数值，读屏会说
     * "进度条 0%" 或干脆沉默；status + 一句隐藏文字才是它真正能传达的信息。
     */
    active ? (
      /*
       * 容器**高度归零**，可见的 2px 由绝对定位的子元素画出来。
       *
       * 这是一个修掉的真 bug：原来容器自己就是 `h-0.5`，一条 2px 的条实打实
       * 占在顶栏与内容区之间的文档流里——它一亮，下面所有内容被推下去 2px；
       * 导航结束它被卸载，内容又弹回来。切一次页面抖两次，切得越勤抖得越勤。
       *
       * 所以两层分工：外层只负责定位与状态播报（零高度），
       * 内层负责那 2px 像素（脱离文档流）。视觉位置与「紧跟顶栏」完全一致，
       * 但它不再参与布局——`h-0` + `absolute` 是这条要求的最小实现。
       *
       * 高度不能用 `overflow-hidden` 去"裁"：`h-0` + `overflow-hidden` 会把绝对定位
       * 的条一并裁掉，进度条直接消失。归零靠容器不占位，不靠裁剪。
       *
       * `pointer-events-none` 是配套的：条现在是**浮**在内容上沿的，不吃掉
       * 那 2px 上的点击（否则顶栏评论区、卡片顶边会变得点不中）。
       */
      <output
        data-slot="route-progress"
        className={cn("pointer-events-none sticky top-14 z-30 block h-0 w-full", className)}
      >
        <span className="sr-only">页面加载中</span>
        <span
          data-slot="boot-bar"
          className="absolute inset-x-0 top-0 h-0.5 origin-left animate-boot-bar rounded-full bg-accent"
        />
      </output>
    ) : null
  );
}
