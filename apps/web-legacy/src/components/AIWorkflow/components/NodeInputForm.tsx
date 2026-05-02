'use client'

import { useState } from "react";
import withThemeConfigProvider from "@/components/hoc/withThemeConfigProvider";
import { Cascader, Input } from "antd";
import {useContext} from "react";
import VariableContext from "../context/VariableContext";

function NodeInputForm({title, params}: {
    title: string
    params: {
        key: string,
        label: string
    }[],
    values: {

    }[]
}) {

    const variable = useContext(VariableContext);
    console.log(variable)


    return (
        <div className="w-full flex flex-col items-center p-2">
            <div
                className="text-base self-start"
            >
                {title}
            </div>
            {params.map(param => (
                <div
                    className="flex flex-row mt-1"
                    key={param.key}
                >
                    <Input className="mr-2" value={param.key}/>
                    <div>
                        <Cascader className="nodrag" options={variable} />
                    </div>
                </div>
            ))}
        </div>
    )
}

export default withThemeConfigProvider(NodeInputForm)

