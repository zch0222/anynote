'use client'
import { Typography } from "antd";
import {EditOutlined, ReadOutlined, SettingOutlined, UploadOutlined} from "@ant-design/icons";

import Loading from "@/components/Loading";

import { useRouter } from "next/navigation";
import useKnowledgeBase from "@/hooks/useKnowledgeBase";
import withThemeConfigProvider from "@/components/hoc/withThemeConfigProvider";
import CardButton from "../../../../components/CardButton";
import WikiTabs from "@/components/wiki/WikiTabs";
import {createNote} from "@/requests/client/note/note";
import {NOTE} from "@/constants/route";
import { WIKI } from "@/constants/route";
import {CARD_BUTTON_ICON_FONT_SIZE} from "@/constants/size";
import Title from "@/components/Title";
import { Modal } from 'antd';
import {useState} from "react";
import CreateMoocForm from "@/components/MoocCreatForm";

// const { Title } = Typography

function Wiki({params}: {
    params: {
        id: number
    }
}) {
    const {id} = params;
    const router = useRouter()
    const [isModalOpen, setIsModalOpen] = useState(false);

    const {data} = useKnowledgeBase(id);

    const fetchCreateNote = () => {
        createNote({
            title: "无标题笔记",
            knowledgeBaseId: id
        }).then(
            res => {
                router.push(`${NOTE}/${res.data.data.toString()}`)
            }
        ).catch(
            e => console.log(e)
        )
    }

    if (!data) {
        return (
            <div className="flex justify-center items-center w-full h-full">
                <Loading/>
            </div>
        )
    }

    return (
        <div className="flex flex-col h-full box-border overflow-hidden p-8">
            <Title text={data.knowledgeBaseName}/>
            {/*<Title level={3}>{data.knowledgeBaseName}</Title>*/}
            <div className="flex flex-row mb-8">
                {data.permissions === 1 ?
                    <CardButton
                        icon={<SettingOutlined style={{fontSize: 20}}/>}
                        title="管理知识库"
                        clickEvent={() => router.push(`${WIKI}/${id}/manage`)}
                        content="信息、成员、任务"
                    /> : <></>
                }
                <CardButton
                    icon={<EditOutlined style={{fontSize: CARD_BUTTON_ICON_FONT_SIZE}}/>}
                    title="创建新笔记"
                    content="笔记"
                    clickEvent={fetchCreateNote}
                />
                {data.permissions === 1 ?
                    <CardButton
                        icon={<UploadOutlined style={{fontSize: 20}}/>}
                        title="上传新文档"
                        clickEvent={() => router.push(`/dashboard/doc/new?knowledgeBaseId=${id}`)}
                        content="文档"
                    /> : <></>
                }
                {data.permissions === 1 ?
                    <CardButton
                        icon={<ReadOutlined style={{fontSize: 20}}/>}
                        title="上传新慕课"
                        clickEvent={() => setIsModalOpen(true)}
                        content="慕课"
                    /> : <></>
                }
            </div>
            <Modal width={400} title="上传新慕课" open={isModalOpen} onCancel={()=> setIsModalOpen(false)} footer={null}>
                <CreateMoocForm setModalOpen={setIsModalOpen} id={id}/>
            </Modal>
            <WikiTabs
                knowledgeBaseId={id}
            />
        </div>
    )
}

export default withThemeConfigProvider(Wiki)
