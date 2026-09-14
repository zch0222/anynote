"use client";

import { BrandBoot } from "@/components/layout/brand-boot";
import { Button } from "@/components/ui/button";
import { useMe } from "@/features/auth/use-me";
import { ApiError } from "@/lib/api/errors";
import { useRouter } from "next/navigation";
import { type ReactNode, useEffect } from "react";

/**
 * 两个外壳（桌面 `AppShell` / 移动 `MobileShell`）共用的会话闸门。
 *
 * 加载态用**品牌启动**而不是两块灰条（设计稿 P16：「全屏初始化的唯一形态，
 * 替换现在的『两块灰条 + 一行正在加载…』」）。这一层正是那句话指的现场：
 * 会话未知时整站都渲染不出来，是真正的"全屏初始化"，也只有这一刻
 * 值得把品牌放上去——它决定了用户对这个产品的第一印象。
 */
export function WorkspaceSession({ children }: { children: ReactNode }) {
  const { isPending, isError, error, refetch } = useMe();
  const router = useRouter();
  useEffect(() => {
    if (isError && error instanceof ApiError && error.status === 401) router.replace("/login");
  }, [isError, error, router]);
  if (isPending) return <BrandBoot />;
  if (isError)
    return (
      <div role="alert" className="space-y-4">
        <p className="text-sm text-danger">加载用户信息失败，请稍后重试</p>
        <Button variant="outline" onClick={() => refetch()}>
          重试
        </Button>
      </div>
    );
  return children;
}
