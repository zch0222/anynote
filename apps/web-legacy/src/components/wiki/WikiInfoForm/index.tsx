'use client'

import withThemeConfigProvider from "@/components/hoc/withThemeConfigProvider";
import {Button, Form, Input, Upload, UploadFile, UploadProps} from "antd";
import {Image} from "@nextui-org/react";
import {nanoid} from "nanoid";
import {useRef, useState} from "react";
import {RcFile, UploadChangeParam} from "antd/es/upload";
import {showMessage} from "@/store/message/messageSlice";
import { useDispatch, useSelector } from "react-redux";
import {RootState} from "@/store";
import{ UploadRequestOption } from 'rc-upload/lib/interface'
import { createCoverUploadTempLink, completeCoverUpload } from "@/requests/client/note/knowledgeBase";
import { uploadFile } from "@/requests/client/file/huaweiObs";
import {HuaweiOBSTemporarySignature} from "@/types/fileTypes";
import * as urlLib from 'url';
import {removeAllUrlParameter} from "@/utils/urlUtil";
import { calculateFileHash } from "@/utils/fileUtil";

function WikiInfoForm({ onFinish, buttonText, initialValues }: {
    onFinish: (value: {
        name: string,
        cover: string,
        detail: string
    }) => void,
    buttonText: string,
    initialValues: {
        name: string,
        detail: string,
        cover: string
    }
}) {
    const [isUploadingCover, setIsUploadingCover] = useState<boolean>(false)
    const [cover, setCover] = useState<string>(initialValues.cover)
    const [isLoading, setIsLoading] = useState<boolean>(false)
    const dispatch = useDispatch()
    const user = useSelector((state: RootState) => state.user)

    const coverUploadIdRef = useRef("")
    const coverHash = useRef("")

    const beforeUpload = (file: RcFile) => {
        const isJpgOrPng = file.type === 'image/jpeg' || file.type === 'image/png' || file.type === "image/jpg";
        if (!isJpgOrPng) {
            dispatch(showMessage({
                type: "error",
                content: "上传图片类型只能为jpeg、jpg、png"
            }))
        }
        const isLt2M = file.size / 1024 / 1024 < 2;
        if (!isLt2M) {
            dispatch(showMessage({
                type: "error",
                content: "图片大小必须小于2MB"
            }))
        }
        return isJpgOrPng && isLt2M;
    };

    const finishUploadCover = (signature: HuaweiOBSTemporarySignature) => {
        setCover(removeAllUrlParameter(signature.signedUrl))

        completeCoverUpload({
            uploadId: signature.uploadId,
            hash: coverHash.current
        }).then(
            res => dispatch(showMessage({
                type: "success",
                content: "上传成功"
            }))
        ).finally(
            () => {
                setIsUploadingCover(false)
                coverUploadIdRef.current = ""
                coverHash.current = ""
            }
        )
    }

    const startUploadCover = (signature: HuaweiOBSTemporarySignature, file: File) => {
        const reader = new FileReader()
        reader.onload = () => {
            uploadFile({
                signature: signature,
                fileArrayBuffer: reader.result,
                contentType: file.type
            }).then(res => {
                console.log("SUCCESS")
                finishUploadCover(signature)
            }).catch(e => {
                dispatch(showMessage({
                    type: "error",
                    content: "上传封面失败"
                }))
                console.log(e)
            })
            coverHash.current = calculateFileHash(reader)
        }
        reader.readAsArrayBuffer(file)
    }

    const uploadCover = (value: {
        file: File
    }) => {
        console.log(value)
        coverUploadIdRef.current = nanoid()
        createCoverUploadTempLink({
            fileName: value.file.name,
            contentType: value.file.type,
            uploadId: coverUploadIdRef.current
        }).then(
            res => {
                const data = res.data.data
                console.log(data)
                startUploadCover(data, value.file)
            }
        ).catch(
            e => {
                console.log(e)
                dispatch(showMessage({
                    type: "error",
                    content: "上传封面失败"
                }))
            }
        )
    }

    const getBase64 = (img: RcFile, callback: (url: string) => void) => {
        const reader = new FileReader();
        reader.addEventListener('load', () => callback(reader.result as string));
        reader.readAsDataURL(img);
    };

    const handleChange: UploadProps['onChange'] = (info: UploadChangeParam<UploadFile>) => {
        if (info.file.status === 'uploading') {
            setIsUploadingCover(true)
            return;
        }
        if (info.file.status === 'done') {
            // Get this url from response in real world.
            getBase64(info.file.originFileObj as RcFile, (url) => {
                setIsUploadingCover(false);
                setCover(url);
            });
        }
    };

    const finish = (value: {
        name: string,
        detail: string
    }) => {
        onFinish({
            cover: cover,
            ...value
        })
    }

    return (
        <div>
            <Form
                layout="vertical"
                initialValues={initialValues}
                onFinish={finish}
            >
                <Form.Item>
                    <div className="flex flex-row items-center">
                        <div className="mr-3">
                            <Image
                                className="object-cover"
                                isLoading={isUploadingCover}
                                src={cover}
                                width={120}
                                height={150}
                                alt="cover"
                            />
                        </div>
                        <div>
                            <Upload
                                beforeUpload={beforeUpload}
                                // action={`${process.env.NEXT_PUBLIC_BASE_URL}/api/note/bases/covers`}
                                // data={{
                                //     uploadId: nanoid()
                                // }}
                                // @ts-ignore
                                customRequest={uploadCover}
                                onChange={handleChange}
                                showUploadList={false}
                                // headers={{
                                //     "accessToken": user.token?.accessToken || ""
                                // }}
                                // method="PUT"
                            >
                                <Button>上传</Button>
                            </Upload>
                        </div>
                    </div>
                </Form.Item>
                <Form.Item
                    name="name"
                >
                    <Input placeholder={"知识库名称"}/>
                </Form.Item>
                <Form.Item
                    name="detail"
                >
                    <Input.TextArea placeholder="知识库描述(选填)"/>
                </Form.Item>
                <Form.Item>
                    <Button
                        className="bg-[#01B96B]"
                        type="primary"
                        htmlType="submit"
                        size="large"
                        block={true}
                        loading={isLoading}
                    >
                        {buttonText}
                    </Button>
                </Form.Item>
            </Form>
        </div>
    )
}

export default withThemeConfigProvider(WikiInfoForm)