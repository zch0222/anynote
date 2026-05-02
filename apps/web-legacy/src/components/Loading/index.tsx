'use client'
import { Spin } from "antd";
import { LoadingOutlined } from '@ant-design/icons';

export default function Loading({ size }: {
    size?: "large" | "default" | "small"
}) {
    return (
        <div className="flex mt-50 w-full h-full justify-center items-center">
            <Spin
              size={size || "large"}
            />
        </div>
    )
}
