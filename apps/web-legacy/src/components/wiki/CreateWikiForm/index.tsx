'use client'
import {Form, Input, Upload, UploadProps, UploadFile, Button} from "antd";
import { Image } from "@nextui-org/react";
import withThemeConfigProvider from "@/components/hoc/withThemeConfigProvider";
import {useState} from "react";
import { useDispatch, useSelector } from "react-redux";
import { showMessage } from "@/store/message/messageSlice";
import {RcFile, UploadChangeParam} from "antd/es/upload";
import {nanoid} from "nanoid";
import {RootState} from "@/store";
import { createKnowledgeBase } from "@/requests/client/note/knowledgeBase";
import { useRouter } from "next/navigation";
import {WIKI} from "@/constants/route";

function CreateWikiForm() {

    const [isUploadingCover, setIsUploadingCover] = useState<boolean>(false)
    const [cover, setCover] = useState<string>("https://anynote.obs.cn-east-3.myhuaweicloud.com/images/knowledge_base_cover.png")
    const [isCreating, setIsCreating] = useState<boolean>(false)

    const dispatch = useDispatch()
    const user = useSelector((state: RootState) => state.user)

    const router = useRouter()


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

    const onFinish = (value: {
        name: string,
        detail: string
    }) => {
        console.log(value)
        setIsCreating(true)
        createKnowledgeBase({
            ...value,
            cover: cover,
            type: 0
        }).then(
            res => {
                dispatch(showMessage({
                    type: "success",
                    content: "创建成功"
                }))
                router.push(`${WIKI}/${res.data.data.id.toString()}`)
            }
        ).catch(
            e => console.log(e)
        )
    }

    return (
        <div>
            <Form
                layout="vertical"
                onFinish={onFinish}
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
                            />
                        </div>
                        <div>
                            <Upload
                                beforeUpload={beforeUpload}
                                action={`${process.env.NEXT_PUBLIC_BASE_URL}/api/note/bases/covers`}
                                data={{
                                    uploadId: nanoid()
                                }}
                                onChange={handleChange}
                                showUploadList={false}
                                headers={{
                                    "accessToken": user.token?.accessToken || ""
                                }}
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
                        loading={isCreating}
                    >
                        新建
                    </Button>
                </Form.Item>
            </Form>
        </div>
    )
}

export default withThemeConfigProvider(CreateWikiForm)

