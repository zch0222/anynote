"use client";

import { Skeleton } from "@/components/ui/skeleton";
import dynamic from "next/dynamic";

/**
 * 协同页面的懒加载入口。
 *
 * yjs + y-websocket 加起来在首屏 JS 里占 ~40KB gzip，而这两页在拿到协同令牌、
 * 连上 WebSocket 之前本来就渲染不出内容——静态引入会把 /docs 顶出 300KB 预算
 * （见 scripts/bundle-report.mjs 的 M8.3 判定）。与编辑器整包同样处理：
 * `dynamic(..., { ssr: false })`。
 */
function LoadingCard() {
  return (
    <div className="space-y-3 rounded-xl border bg-card p-4" aria-busy="true">
      <Skeleton className="h-8 w-2/3" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-5/6" />
    </div>
  );
}

export const CollabDocLibrary = dynamic(
  () => import("./doc-library").then((mod) => mod.CollabDocLibrary),
  { ssr: false, loading: LoadingCard },
);

export const CollabDocWorkspace = dynamic(
  () => import("./doc-workspace").then((mod) => mod.CollabDocWorkspace),
  { ssr: false, loading: LoadingCard },
);
