"use client";

import { Handle, type Node, type NodeProps, Position } from "@xyflow/react";
import { AudioLines, Play } from "lucide-react";
import type { WorkflowNodeData } from "../../schemas";

/** 画布节点类型（zod schema 见 features/ai/schemas.ts）。 */
export type WorkflowFlowNode = Node<WorkflowNodeData & { prompt?: string | undefined }, string>;

/** 开始节点：工作流入口，不可删除的唯一源头。 */
export function StartNode({ data, selected }: NodeProps<WorkflowFlowNode>) {
  return (
    <div
      className={`rounded-xl border bg-card px-4 py-3 shadow-sm ${selected ? "border-primary ring-2 ring-primary/30" : ""}`}
      data-testid="workflow-node-start"
    >
      <div className="flex items-center gap-2 text-sm font-medium">
        <Play className="size-4 text-primary" aria-hidden="true" />
        {data.label}
      </div>
      <Handle type="source" position={Position.Right} />
    </div>
  );
}

/** 语音转写节点（whisper）：后端执行端点接入后生效。 */
export function WhisperNode({ data, selected }: NodeProps<WorkflowFlowNode>) {
  return (
    <div
      className={`w-56 rounded-xl border bg-card px-4 py-3 shadow-sm ${selected ? "border-primary ring-2 ring-primary/30" : ""}`}
      data-testid="workflow-node-whisper"
    >
      <div className="flex items-center gap-2 text-sm font-medium">
        <AudioLines className="size-4 text-primary" aria-hidden="true" />
        {data.label}
      </div>
      {data.prompt ? (
        <p className="mt-1 line-clamp-2 text-xs text-muted-foreground" title={data.prompt}>
          {data.prompt}
        </p>
      ) : null}
      <Handle type="target" position={Position.Left} />
      <Handle type="source" position={Position.Right} />
    </div>
  );
}

export const workflowNodeTypes = { start: StartNode, whisper: WhisperNode };
