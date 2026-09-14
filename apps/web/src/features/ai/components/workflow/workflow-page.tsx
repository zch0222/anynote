"use client";

import { PanelSkeleton } from "@/components/loading/skeletons";
import dynamic from "next/dynamic";

// ReactFlow 依赖容器测量，进 SSR 会 hydration 抖动；懒加载与编辑器同策略。
const WorkflowCanvas = dynamic(
  () => import("./workflow-canvas").then((mod) => mod.WorkflowCanvas),
  {
    ssr: false,
    loading: () => <PanelSkeleton className="h-[calc(100svh-9rem)]" />,
  },
);

export default function WorkflowPage() {
  return <WorkflowCanvas />;
}
