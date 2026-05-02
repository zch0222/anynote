'use client'
import { Space, Card } from "antd";


import withThemeConfigProvider from "@/components/hoc/withThemeConfigProvider";
import React from "react";

interface FunctionButtonProps {
    title: string,
    content?: string,
    clickEvent: () => void,
    icon: any
}

const CardButton: React.FC<FunctionButtonProps> = ({
                                                           title,
                                                           content,
                                                           clickEvent,
                                                           icon
                                                       }) => {

    return (
        <div>
            <Space>
                <Card className="flex flex-row items-center w-60" style={{border: '1px #01B96B solid', marginRight: 25}} bodyStyle={{display: 'flex', padding: '5px 10px'}}
                      hoverable onClick={clickEvent}>
                    <div className="flex justify-center items-center">
                        {icon}
                    </div>
                    <div className="pl-4">
                        <div className="text-base">{title}</div>
                        <div className="text-gray-400">{content}</div>
                    </div>
                </Card>
            </Space>
        </div>
    )
}
export default withThemeConfigProvider(CardButton)
