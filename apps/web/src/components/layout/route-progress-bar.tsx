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
      <output
        data-slot="route-progress"
        className={cn("sticky top-14 z-30 block h-0.5 w-full overflow-hidden", className)}
      >
        <span className="sr-only">页面加载中</span>
        <span
          data-slot="boot-bar"
          className="block h-full w-full origin-left animate-boot-bar rounded-full bg-accent"
        />
      </output>
    ) : null
  );
}
