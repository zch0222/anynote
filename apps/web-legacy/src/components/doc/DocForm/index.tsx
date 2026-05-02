'use client'
import withThemeConfigProvider from "@/components/hoc/withThemeConfigProvider";
import { useState, useRef } from "react";
import { Form, Input, Upload, Button, UploadFile } from "antd";
import {Progress} from "@nextui-org/react";
import {RcFile} from "antd/es/upload";
import {showMessage} from "@/store/message/messageSlice";
import { useDispatch } from "react-redux";
import {docUploadTempLink, completeDocUpload} from "@/requests/client/note/doc";
import useRouter from "@/hooks/useRouter";
import {HuaweiOBSTemporarySignature} from "@/types/fileTypes";
import {uploadFile} from "@/requests/client/file/huaweiObs";
import {calculateFileHash} from "@/utils/fileUtil";

export interface DocFormType {
    knowledgeBaseId: number,
}

function DocForm() {
    const { searchParams, router } = useRouter()

    const dispatch = useDispatch()
    const [docUploadFileList, setDocUploadFileList] = useState<UploadFile[]>([])
    const [knowledgeBaseId, setKnowledgeBaseId] =
        useState<number>(parseInt(searchParams.get("knowledgeBaseId") || "-1"))

    const uploadId = useRef<string>("")

    const beforeUpload = (file: RcFile) => {
        const isJpgOrPng = file.type === 'application/pdf' ;
        if (!isJpgOrPng) {
            dispatch(showMessage({
                type: "error",
                content: "上传文档类型只能为pdf"
            }))
        }
        const isLt200M = file.size / 1024 / 1024 < 200;
        if (!isLt200M) {
            dispatch(showMessage({
                type: "error",
                content: "图片大小必须小于200MB"
            }))
        }
        return isJpgOrPng && isLt200M;
    };

    const finishUpload = (params: {
        docName: string,
        hash: string,
        knowledgeBaseId: number
    }) => {
        completeDocUpload({
            ...params,
            uploadId: uploadId.current
        }).then(
            res => {
                console.log(res.data.data)
                setDocUploadFileList([{
                    uid: "0",
                    name: params.docName,
                    status: "done",
                    percent: 100
                }])
                showMessage({
                    type: "success",
                    content: "上传成功"
                })
                router.replace(`/doc/${res.data.data.id}`)
            }
        ).catch(e => {
            setDocUploadFileList([{
                uid: "0",
                name: params.docName,
                status: "error",
                percent: 100
            }])
        })
    }

    const startUploadDoc = (signature: HuaweiOBSTemporarySignature, file: File) => {
        const reader = new FileReader()
        reader.onload = () => {
            uploadFile({
                signature: signature,
                fileArrayBuffer: reader.result,
                contentType: file.type,
                onUploadProgress: (progressEvent) => {
                    console.log(progressEvent)
                    if (progressEvent.progress) {
                        setDocUploadFileList([{
                            uid: "0",
                            name: file.name,
                            status: "uploading",
                            percent: progressEvent.progress * 100
                        }])
                    }
                }
            }).then(res => {
                const hash = calculateFileHash(reader)
                finishUpload({
                    docName: file.name,
                    hash: hash,
                    knowledgeBaseId: knowledgeBaseId
                })
            }).catch(
                e => console.log(e)
            )
        }
        reader.readAsArrayBuffer(file)
    }

    const customRequest = (option: any) => {
        console.log(option)
        const { file } = option
        setDocUploadFileList([{
            uid: "0",
            name: file.name,
            status: "uploading",
            percent: 0
        }])
        docUploadTempLink({
            fileName: file.name,
            contentType: "application/pdf",
            knowledgeBaseId: knowledgeBaseId
        }).then(
            res => {
                const data = res.data.data
                console.log(res.data.data)
                uploadId.current = data.uploadId
                startUploadDoc(data, file)
            }
        ).catch(
            e => console.log(e)
        )
    }

    return (
        <Form
            className="w-full max-w-[450px]"
        >
            <Form.Item
                name="doc"
            >
                <Upload
                    accept="application/pdf"
                    beforeUpload={beforeUpload}
                    customRequest={customRequest}
                    fileList={docUploadFileList}
                >
                    <Button>上传</Button>
                </Upload>
            </Form.Item>
            {/*<Form.Item*/}
            {/*    name="docName"*/}
            {/*    label="文档名称"*/}
            {/*>*/}
            {/*    <Input/>*/}
            {/*</Form.Item>*/}


        </Form>
    )
}

export default withThemeConfigProvider(DocForm)