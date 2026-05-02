import { XYPosition } from "reactflow";

export interface NodeData<T> {
    nodeId: string,
    onNodeUpdate: (id: string, data: T) => void,
    data: T
}

export interface WorkflowEdge {
    id: string,
    source: string,
    target: string,
    sourceHandle: string | null | undefined;
}

export interface WorkflowNode {
    data: {
        id: string,
        type?: string,
        data: any,
        position: XYPosition
    },
    edgeIndexList: number[],
}

export interface WorkflowData {
    nodes: WorkflowNode[],
    edges: WorkflowEdge[]
}

export interface VariableOption {
    value: string;
    label: string;
    children?: VariableOption[];
}