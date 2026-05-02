'use client'
import { useState } from "react";
import { Modal, ModalContent, ModalHeader, ModalBody } from "@nextui-org/react";
import CardButton from "@/components/CardButton";
import {ContainerOutlined, EditOutlined} from "@ant-design/icons";
import CreateWikiForm from "@/components/wiki/CreateWikiForm";
import InfiniteScroll from "@/components/InfiniteScroll";
import useNoteListV2 from "@/hooks/useNoteListV2";
import AutoInfiniteScroll from "@/components/AutoInfiniteScroll";

import withThemeConfigProvider from "@/components/hoc/withThemeConfigProvider";
import NoteItem from "@/components/note/NoteItem";
import {getChatConversationList} from "@/requests/client/ai/chat";
import {getNoteList} from "@/requests/client/note/note";

function DashboardHomeButtons() {

    const [isCreateWikiOpen, setIsCreateWikiOpen] = useState<boolean>(false)

    return (
        <div className="flex flex-col w-full h-full">
            <div className="flex flex-row mt-3">
                <CardButton
                    title="新建笔记"
                    content="文档"
                    clickEvent={() => console.log(1)}
                    icon={<EditOutlined style={{fontSize: 20}}/>}
                />

                <CardButton
                    title="新建知识库"
                    content="知识库"
                    clickEvent={() => setIsCreateWikiOpen(true)}
                    icon={<ContainerOutlined style={{fontSize: 20}}/>}
                />
                <Modal
                    isOpen={isCreateWikiOpen}
                    onClose={() => setIsCreateWikiOpen(false)}
                >
                    <ModalContent>
                        <ModalHeader>
                            创建知识库
                        </ModalHeader>
                        <ModalBody>
                            <CreateWikiForm/>
                        </ModalBody>
                    </ModalContent>
                </Modal>
            </div>
            <div
                className="text-2xl font-bold mt-5 mb-2"
            >
                最近更新
            </div>
            <div className="flex-grow w-full overflow-hidden pb-10">
                <InfiniteScroll
                    swr={useNoteListV2}
                    params={{}}
                    Item={NoteItem}
                    rowHeight={60}
                    getPage={getNoteList}
                />
            </div>
        </div>
    )
}

export default withThemeConfigProvider(DashboardHomeButtons)
