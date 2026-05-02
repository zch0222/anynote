'use client'

import {Card, CardBody, CardHeader} from "@nextui-org/card";
import withThemeConfigProvider from "@/components/hoc/withThemeConfigProvider";
import {useCallback, useEffect, useState} from "react";
import {NodeData} from "@/types/aiWorkflowTypes";
import {Handle, Position} from 'reactflow';
import NodeHeader from "@/components/AIWorkflow/components/NodeHeader";
import NodeInputForm from "./components/NodeInputForm";

function WhisperNode(props: {
    data: NodeData<{

    }>,
    id: string
}) {
    const { data, id } = props

    console.log("WHISPER UPDATE")

    return (
        <>
            <Handle id="left" type="target" position={Position.Left} />
            <Handle id="right" type="source" position={Position.Right}/>
            <Card
                title="Whisper"
                className="flex flex-col"
            >
                <NodeHeader
                    title={"Whisper"}
                    description="将音频/视频转换为文字"
                />
                <NodeInputForm
                    title="Whisper参数"
                    params={[
                        {
                            key: "url",
                            value: "TEST"
                        }
                    ]}
                />
            </Card>
        </>
    )
}

export default withThemeConfigProvider(WhisperNode)