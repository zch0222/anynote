"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { WorkflowData, WorkflowNodeData } from "@/features/ai/schemas";
import {
  loadWorkflow,
  runWorkflow,
  saveWorkflow,
  validateWorkflow,
} from "@/features/ai/workflow-storage";
import {
  Background,
  type Connection,
  Controls,
  type Edge,
  type Node,
  ReactFlow,
  addEdge,
  useEdgesState,
  useNodesState,
} from "@xyflow/react";
import { Play, Plus, Save } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { workflowNodeTypes } from "./nodes";

import "@xyflow/react/dist/style.css";

const DEFAULT_NODES: Node[] = [
  {
    id: "start-1",
    type: "start",
    position: { x: 80, y: 160 },
    data: { label: "开始" },
  },
];

let nextNodeId = 1;

function createNodeId(prefix: string): string {
  nextNodeId += 1;
  return `${prefix}-${Date.now()}-${nextNodeId}`;
}

/**
 * AI 工作流画布（M7.2）：节点 / 边用 zod schema 校验（features/ai/schemas.ts），
 * 自动持久化 localStorage；「运行」走 runWorkflow 对接点（后端执行端点待接入）。
 */
export function WorkflowCanvas() {
  const [nodes, setNodes, onNodesChange] = useNodesState(DEFAULT_NODES);
  const [edges, setEdges, onEdgesChange] = useEdgesState(DEFAULT_EDGES);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const loadedRef = useRef(false);

  // 挂载后读取本地持久化（SSR 首屏渲染默认图，客户端恢复）
  useEffect(() => {
    if (loadedRef.current) {
      return;
    }
    loadedRef.current = true;
    const saved = loadWorkflow();
    if (saved) {
      setNodes(
        saved.nodes.map((node) => ({
          id: node.id,
          type: node.type,
          position: node.position,
          data: node.data,
        })),
      );
      setEdges(
        saved.edges.map((edge) => ({ id: edge.id, source: edge.source, target: edge.target })),
      );
    }
  }, [setNodes, setEdges]);

  // 变更后 800ms 静默持久化；数据非法（如节点名被清空）时保留旧值
  useEffect(() => {
    if (!loadedRef.current) {
      return;
    }
    const timer = setTimeout(() => {
      const data = toWorkflowData(nodes, edges);
      const valid = validateWorkflow(data);
      if (valid) {
        saveWorkflow(valid);
      }
    }, 800);
    return () => {
      clearTimeout(timer);
    };
  }, [nodes, edges]);

  const selectedNode = nodes.find((node) => node.id === selectedId) ?? null;

  const onConnect = useCallback(
    (connection: Connection) => {
      setEdges((current) =>
        addEdge(
          { ...connection, id: `e-${connection.source}-${connection.target}-${Date.now()}` },
          current,
        ),
      );
    },
    [setEdges],
  );

  const addNode = useCallback(
    (type: "start" | "whisper") => {
      const id = createNodeId(type);
      setNodes((current) => [
        ...current,
        {
          id,
          type,
          position: {
            x: 240 + ((current.length * 60) % 240),
            y: 120 + ((current.length * 50) % 200),
          },
          data: type === "start" ? { label: "开始" } : { label: "语音转写", prompt: "" },
        },
      ]);
      setSelectedId(id);
    },
    [setNodes],
  );

  const updateSelectedNode = useCallback(
    (patch: Partial<WorkflowNodeData>) => {
      if (!selectedId) {
        return;
      }
      setNodes((current) =>
        current.map((node) =>
          node.id === selectedId ? { ...node, data: { ...node.data, ...patch } } : node,
        ),
      );
    },
    [selectedId, setNodes],
  );

  const handleRun = useCallback(async () => {
    const data = toWorkflowData(nodes, edges);
    setRunning(true);
    try {
      await runWorkflow(data);
    } catch (error) {
      toast.info(error instanceof Error ? error.message : "运行失败");
    } finally {
      setRunning(false);
    }
  }, [nodes, edges]);

  const handleSaveNow = useCallback(() => {
    const valid = validateWorkflow(toWorkflowData(nodes, edges));
    if (!valid) {
      toast.error("工作流数据不合法：检查节点名称与连线");
      return;
    }
    saveWorkflow(valid);
    toast.success("已保存");
  }, [nodes, edges]);

  return (
    <div className="flex h-[calc(100svh-9rem)] min-h-0 flex-col" data-testid="workflow-canvas">
      <div className="flex flex-wrap items-center gap-2 border-b pb-3">
        <Button variant="outline" size="sm" onClick={() => addNode("start")}>
          <Plus className="size-4" aria-hidden="true" />
          开始节点
        </Button>
        <Button variant="outline" size="sm" onClick={() => addNode("whisper")}>
          <Plus className="size-4" aria-hidden="true" />
          转写节点
        </Button>
        <div className="flex-1" />
        <Button variant="ghost" size="sm" onClick={handleSaveNow}>
          <Save className="size-4" aria-hidden="true" />
          保存
        </Button>
        <Button
          size="sm"
          disabled={running}
          onClick={() => void handleRun()}
          data-testid="workflow-run"
        >
          <Play className="size-4" aria-hidden="true" />
          {running ? "运行中…" : "运行"}
        </Button>
      </div>

      <div className="flex min-h-0 flex-1 gap-3 pt-3">
        <div className="min-w-0 flex-1 overflow-hidden rounded-xl border">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={workflowNodeTypes}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeClick={(_, node) => {
              setSelectedId(node.id);
            }}
            onPaneClick={() => {
              setSelectedId(null);
            }}
            deleteKeyCode={["Backspace", "Delete"]}
            fitView
            proOptions={{ hideAttribution: true }}
          >
            <Background />
            <Controls />
          </ReactFlow>
        </div>

        <aside className="hidden w-64 shrink-0 space-y-4 rounded-xl border p-4 lg:block">
          {selectedNode ? (
            <>
              <p className="text-sm font-medium">节点设置</p>
              <div className="space-y-2">
                <Label htmlFor="workflow-node-label">名称</Label>
                <Input
                  id="workflow-node-label"
                  value={String(selectedNode.data.label ?? "")}
                  onChange={(event) => {
                    updateSelectedNode({ label: event.target.value });
                  }}
                  maxLength={30}
                  data-testid="workflow-node-label"
                />
              </div>
              {selectedNode.type === "whisper" ? (
                <div className="space-y-2">
                  <Label htmlFor="workflow-node-prompt">转写提示词</Label>
                  <Input
                    id="workflow-node-prompt"
                    value={String(selectedNode.data.prompt ?? "")}
                    onChange={(event) => {
                      updateSelectedNode({ prompt: event.target.value });
                    }}
                    maxLength={500}
                    placeholder="交给 whisper 的说明（占位）"
                    data-testid="workflow-node-prompt"
                  />
                </div>
              ) : null}
              <p className="text-xs text-muted-foreground">按 Delete / Backspace 删除选中节点。</p>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">点击节点编辑属性；拖拽节点边缘连线。</p>
          )}
        </aside>
      </div>
    </div>
  );
}

function toWorkflowData(nodes: Node[], edges: Edge[]): WorkflowData {
  return {
    nodes: nodes.map((node) => ({
      id: node.id,
      type: node.type === "whisper" ? "whisper" : "start",
      position: { x: node.position.x, y: node.position.y },
      data: {
        label: String(node.data.label ?? ""),
        ...(node.data.prompt ? { prompt: String(node.data.prompt) } : {}),
      },
    })),
    edges: edges.map((edge) => ({ id: edge.id, source: edge.source, target: edge.target })),
  };
}

const DEFAULT_EDGES: Edge[] = [];
