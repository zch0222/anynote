"use client";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useMe } from "@/features/auth/use-me";
import { ApiError } from "@/lib/api/errors";
import { useRouter } from "next/navigation";
import { type ReactNode, useEffect } from "react";

export function WorkspaceSession({ children }: { children: ReactNode }) {
  const { isPending, isError, error, refetch } = useMe();
  const router = useRouter();
  useEffect(() => {
    if (isError && error instanceof ApiError && error.status === 401) router.replace("/login");
  }, [isError, error, router]);
  if (isPending)
    return (
      <output className="block space-y-4">
        <span className="sr-only">正在加载工作区</span>
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-64 w-full" />
      </output>
    );
  if (isError)
    return (
      <div role="alert" className="space-y-4">
        <p className="text-sm text-destructive">加载用户信息失败，请稍后重试</p>
        <Button variant="outline" onClick={() => refetch()}>
          重试
        </Button>
      </div>
    );
  return children;
}
