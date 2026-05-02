'use client'

import ReactFlow, {Controls, Background, applyEdgeChanges, applyNodeChanges, addEdge, XYPosition} from 'reactflow';
import withThemeConfigProvider from "@/components/hoc/withThemeConfigProvider";
import {useState, useCallback, useMemo, useEffect, useRef} from "react";
import { Node, Edge } from "reactflow"

import StartNode from "./StartNode";
import 'reactflow/dist/style.css';
import {Button} from "@nextui-org/react";
import {nanoid} from "nanoid";
import {VariableOption, WorkflowData, WorkflowEdge, WorkflowNode} from "@/types/aiWorkflowTypes";
import {data} from "autoprefixer";
import {node} from "prop-types";
import WhisperNode from "./WhisperNode";
import VariableContext from "./context/VariableContext";

const nodeTypes = {
    startNode: StartNode,
    whisperNode: WhisperNode
}





function AIWorkflow() {



    const [nodes, setNodes] = useState<Node[]>([]);

    const [edges, setEdges] = useState<Edge[]>([
        // { id: '1-2', source: '1', sourceHandle: 'right', target: '2' }
    ]);

    const updateNode = useCallback((id: string, data: any) => {
        console.log(id, data)
        setNodes(prevNodes => {
            return prevNodes.map(node => {
                if (node.id === id) {
                    node.data = {
                        ...node.data,
                        data: data
                    }
                }
                return node;
            })
        })

    }, [])

    const variables: VariableOption[] = useMemo(() => (
        nodes.map(node => {
            if ("startNode" === node.type) {
                console.log(node)
                return {
                    label: "Start",
                    value: node.id,
                    children: node.data.data.map((item: { key: any; value: any; }) => (
                        {
                            label: item.key,
                            value: item.value
                        }
                    ))
                }
            }
            return {
                label: node.id,
                value: node.id,
                children: [
                    {
                        label: "output",
                        value: "output"
                    }
                ]
            }
        })
    ), [nodes])

    const convertDataToNodeList = useCallback((wData: WorkflowData) => {
        return wData.nodes.map(node => {
            return {
                id: node.data.id,
                type: node.data.type,
                data: {
                    data: node.data.data,
                    onNodeUpdate: updateNode
                },
                position: { x: 0, y: 0 }
            }
        })
    }, [updateNode])

    const convertDataToEdgeList = useCallback((wData: WorkflowData) => {
        return wData.edges.map(edge => (
            {
                id: edge.id,
                source: edge.source,
                target: edge.target,
                sourceHandle: edge.sourceHandle
            }
        ))
    }, [])

    const parseNodeEdgeIndexList = (edges: Edge[], nodes: WorkflowNode[]) => {
        const sourceNodeIdEdgeDict: Record<string, number[]> = {}
        edges.forEach((edge, index) => {
            console.log(index)
            if (!(edge.source in sourceNodeIdEdgeDict)) {
                sourceNodeIdEdgeDict[edge.source] = []
            }
            sourceNodeIdEdgeDict[edge.source].push(index)
        })
        nodes.forEach(node => {
            if (sourceNodeIdEdgeDict[node.data.id]) {
                node.edgeIndexList = sourceNodeIdEdgeDict[node.data.id]
            }
            else {
                node.edgeIndexList = []
            }

        })
    }

    const convertEdgeListToDataEdgeList = (edges: Edge[]): WorkflowEdge[] => {
        return edges.map(edge => (
            {
                id: edge.id,
                source: edge.source,
                target: edge.target,
                sourceHandle: edge.sourceHandle
            }
        ))
    }

    const convertNodeListToDataNodeList = (nodes: Node[]): WorkflowNode[] => {
        const wNodes = nodes.map(node => (
            {
                data: {
                    id: node.id,
                    type: node.type,
                    data: node.data,
                    position: node.position
                },
                edgeIndexList: []
            }
        ))
        parseNodeEdgeIndexList(edges, wNodes)
        return wNodes
    }

    useEffect(() => {
        const initData: WorkflowData = {
            nodes: [
                {
                    data: {
                        id: '1',
                        type: 'startNode',
                        data: [
                            {
                                id: nanoid(),
                                key: "",
                                type: "string",
                                description: "",
                                defaultValue: "",
                            },
                        ],
                        position: { x: 0, y: 0 },
                    },
                    edgeIndexList: [0]
                },
                {
                    data: {
                        id: '2',
                        data: { label: 'World' },
                        position: { x: 100, y: 100 },
                    },
                    edgeIndexList: []
                },
                {
                    data: {
                        id: '3',
                        type: 'whisperNode',
                        data: {},
                        position: { x: 300, y: 300 },
                    },
                    edgeIndexList: []
                },
            ],
            edges: [
                {
                    id: '1-2',
                    source: '1',
                    sourceHandle: 'right',
                    target: '2'
                }
            ]
        }
        setNodes(convertDataToNodeList(initData))
        setEdges(convertDataToEdgeList(initData))
    }, [convertDataToEdgeList, convertDataToNodeList]);

    const onNodesChange = useCallback(
        // @ts-ignore
        (changes: any) => setNodes((nds) => applyNodeChanges(changes, nds)),
        [],
    );
    const onEdgesChange = useCallback(
        // @ts-ignore
        (changes: any) => setEdges((eds) => applyEdgeChanges(changes, eds)),
        [],
    );

    const onConnect = useCallback(
        // @ts-ignore
        (params: any) => setEdges((eds) => addEdge(params, eds)),
        [],
    );

    const onStart = () => {
        const wData: WorkflowData = {
            nodes: convertNodeListToDataNodeList(nodes),
            edges: convertEdgeListToDataEdgeList(edges)
        }
        console.log(wData)
    }

    return (
        <div className="w-full h-full">
            <Button
                className="text-white"
                color="primary"
                onPress={onStart}
            >
                运行
            </Button>
            <VariableContext.Provider
                value={variables}
            >
                <ReactFlow
                    //@ts-ignore
                    nodes={nodes}
                    onNodesChange={onNodesChange}
                    edges={edges}
                    onEdgesChange={onEdgesChange}
                    onConnect={onConnect}
                    nodeTypes={nodeTypes}
                >
                    <Background />
                    <Controls />
                </ReactFlow>
            </VariableContext.Provider>

        </div>
    )
}

export default withThemeConfigProvider(AIWorkflow)
