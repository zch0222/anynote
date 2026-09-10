"use client";

import { useMe } from "@/features/auth/use-me";
import { ApiError } from "@/lib/api/errors";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function DashboardPage() {
  const router = useRouter();
  const { data, isPending, isError, error } = useMe();

  // Cookie 缺失已由 middleware 拦截；这里兜底"BFF 刷新后仍 401"的失效会话。
  useEffect(() => {
    if (isError && error instanceof ApiError && error.status === 401) {
      router.replace("/login");
    }
  }, [isError, error, router]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/30 px-4">
      {isPending ? (
        <p className="text-sm text-muted-foreground">正在加载…</p>
      ) : isError ? (
        <p className="text-sm text-destructive">加载用户信息失败，请稍后重试</p>
      ) : (
        <div className="text-center">
          <h1 className="text-2xl font-semibold">欢迎回来，{data?.nickname || data?.username}</h1>
          <p className="mt-2 text-sm text-muted-foreground">工作台建设中（M4 AppShell）</p>
        </div>
      )}
    </main>
  );
}
