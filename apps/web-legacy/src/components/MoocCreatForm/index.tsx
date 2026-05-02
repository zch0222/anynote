'use client'

import {Button, Card, Form, Image, Input, Upload} from "antd";
import {RcFile} from "antd/es/upload";
import {showMessage} from "@/store/message/messageSlice";
import {useDispatch} from "react-redux";
import {createMooc, createMoocCoverUploadTask} from "@/requests/client/note/mooc";
import {upload} from "@/utils/uploadUtil";
import {getObjectUrlByObjectName} from "@/requests/client/file/oss";
import {useState} from "react";
import {MoocInfo} from "@/types/moocTypes";
import ImageByName from "@/components/ImageByName";

function CreateMoocForm({id, setModalOpen}: {id: number; setModalOpen: (value: boolean) => void}) {
    const dispatch = useDispatch()
    const [coverName, setCoverName] = useState<string>()
    const [form] = Form.useForm();

    const beforeUpload = (file: RcFile) => {
        console.log(file.type)
        const isJpgOrPng = file.type === 'image/jpeg';
        if (!isJpgOrPng) {
            dispatch(showMessage({
                type: "error",
                content: "上传文档类型只能为jpg"
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

    const uploadCover = (option: any) => {
        const {file} = option
        createMoocCoverUploadTask({
            fileName: file.name,
            hash: "TEST",
            fileSize: file.size / 1024 / 1024,
            contentType: file.type
        }).then(res => {
            const data = res.data.data;
            upload(data.uploadId, file, (percent: number, isDone: boolean, ossSliceUploadComposeOV) => {
                if (isDone && ossSliceUploadComposeOV) {
                    setCoverName(ossSliceUploadComposeOV.objectName)
                } else {
                    console.log("PERCENT:" + percent)
                }
            });
        })
    }

    const onFinish = (value:any) => {
        console.log(value)
        const data = {
            title: value.title as string,
            cover: coverName as string,
            moocDescription: value.moocDescription,
            knowledgeBaseId: id,
            dataScope: 3
        }
        createMooc(data).then((res) => {
            console.log(res)
            form.resetFields();
            setCoverName(undefined);
            setModalOpen(false)
        })
    }
    return (
        <div className={"mt-[30px]"}>
            <Form
                form={form}
                onFinish={onFinish}
            >
                <Form.Item
                    name="cover"
                >
                    <Upload
                        showUploadList={false}
                        beforeUpload={beforeUpload}
                        customRequest={uploadCover}
                    >
                        <Card bodyStyle={{padding: '10px', display: 'flex', alignItems: 'center',justifyContent: 'center'}}>
                            <ImageByName
                                preview={false}
                                height={64}
                                alt={'知识库图标'}
                                name={coverName}
                            />
                        </Card>
                    </Upload>
                </Form.Item>
                <Form.Item
                    name="title"
                    rules={[{required:true, message: "请输入慕课名称"}]}
                >
                    <Input placeholder={"慕课名称"}/>
                </Form.Item>
                <Form.Item
                    name="moocDescription"
                >
                    <Input.TextArea placeholder="慕课描述(选填)" rows={4}/>
                </Form.Item>
                <Form.Item>
                    <Button
                        className="bg-[#01B96B]"
                        type="primary"
                        htmlType="submit"
                        size="large"
                        block={true}
                    >
                        新建
                    </Button>
                </Form.Item>
            </Form>
        </div>
    )
}

export default CreateMoocForm
