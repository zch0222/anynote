"use client";

import { MobileScreen } from "@/components/layout/mobile/mobile-screen";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * tab 根路由的临时页面（M10.1 T1.11）。
 *
 * 存在的意义只有一个：让五个 tab 在 M10.2 / M10.3 / M10.4 并行开工期间都可达，
 * 每个真实页面落地时**替换掉**对应的 `<MobilePlaceholder />`，这个组件最终会被删掉。
 */
export function MobilePlaceholder({ title, description }: { title: string; description: string }) {
  return (
    <MobileScreen title={title}>
      <div className="space-y-4 p-4" data-testid="mobile-placeholder">
        <p className="text-sm text-muted-foreground">{description}</p>
        <div aria-hidden="true" className="space-y-3">
          {[0, 1, 2].map((item) => (
            <Skeleton key={item} className="h-16 rounded-xl" />
          ))}
        </div>
      </div>
    </MobileScreen>
  );
}
