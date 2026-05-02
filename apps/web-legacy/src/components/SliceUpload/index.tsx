'use client'
import {Upload} from "antd";
import {ReactNode} from "react";
import {RcFile} from "antd/es/upload";

export default function SliceUpload({ children, beforeUpload }: {
    children: ReactNode,
    beforeUpload: (file: RcFile) => void | undefined
}) {
    return (
        <Upload

            beforeUpload={beforeUpload}
        >
            {children}
        </Upload>
    )
}