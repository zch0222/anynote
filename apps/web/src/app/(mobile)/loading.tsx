import { BrandBoot } from "@/components/layout/brand-boot";
import "@/styles/mobile.css";

/**
 * 移动端路由级启动态（`(mobile)` 段）。
 *
 * 与桌面同一套品牌启动：两端共用组件、共用关键帧，只有"出现前的延迟"不同 ——
 * 移动端网络更慢、路由切换更常被系统打断，120ms 的防闪阈值在这里作用相同。
 */
export default function MobileLoading() {
  return <BrandBoot skeletonAfterMs={0} message="正在准备工作区…" />;
}
