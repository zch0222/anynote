'use client'
import { Card } from "antd";
import { HistoryOutlined, DeleteOutlined } from "@ant-design/icons";
import withThemeConfigProvider from "@/components/hoc/withThemeConfigProvider";
import {Listbox, ListboxItem, Modal, ModalContent, ModalHeader, ModalBody, ModalFooter, Button} from "@nextui-org/react";
import { useRouter } from "next/navigation";
import {NOTE} from "@/constants/route";
import { deleteNote } from "@/requests/client/note/note";
import { useDispatch } from "react-redux";
import { showMessage } from "@/store/message/messageSlice";
import TaskIcon from "@/components/svg/TaskIcon";
import {useRef, useState} from "react";
import {TaskSubmitRefType} from "@/components/task/TaskSubmit";
import TaskSubmit from "@/components/task/TaskSubmit";

function DrawerContent({ id, knowledgeBaseId, permissions }: {
    id: number,
    knowledgeBaseId: number,
    permissions: number
}) {

    const router = useRouter()
    const dispatch = useDispatch()
    const [isSubmitModalOpen, setIsSubmitModalOpen] = useState<boolean>(false)
    const taskSubmitRef = useRef<TaskSubmitRefType>({
        submit: async () => {}
    })
    const [isSubmitting, setIsSubmitting] = useState<boolean>(false)



    const fetchDeleteNote = (id: number) => {
        deleteNote({id: id}).then(
            res => {
                dispatch(showMessage({
                    type: "success",
                    content: "删除成功"
                }))
                router.back()
            }
        ).catch(
            e => console.log(e)
        )
    }

    return (
        <div className="flex flex-col items-center">
            <Listbox
                className="bg-gray-100 rounded-sm"
                aria-label="Actions"
            >
                <ListboxItem onClick={() => setIsSubmitModalOpen(true)} isDisabled={permissions !== 7} key="submit">
                    <div className="flex flex-row items-center">
                        <TaskIcon width={18} height={18}/>
                        <div className="ml-1">提交任务</div>
                    </div>
                </ListboxItem>
                <ListboxItem onClick={() => router.push(`${NOTE}/${id}/history`)} className="flex flex-row items-center" key="history">
                    <span className="mr-2"><HistoryOutlined/></span>
                    <span>查看历史记录</span>
                </ListboxItem>
                <ListboxItem onClick={() => fetchDeleteNote(id)} key="delete" isDisabled={permissions !== 7} className="text-danger accent-red-600">
                    <span className="mr-2"><DeleteOutlined/></span>
                    <span>删除笔记</span>
                </ListboxItem>
            </Listbox>
            <Modal
                isOpen={isSubmitModalOpen}
                onClose={() => {
                    setIsSubmitModalOpen(false)
                }}
                placement="top"
                scrollBehavior="inside"
                backdrop="blur"
            >
                <ModalContent>
                    {(onClose) => (
                        <>
                            <ModalHeader className="flex flex-col gap-1">提交任务</ModalHeader>
                            <ModalBody>
                                <TaskSubmit
                                    knowledgeBaseId={knowledgeBaseId}
                                    taskRef={taskSubmitRef}
                                    noteId={id}
                                />
                            </ModalBody>
                            <ModalFooter>
                                <Button variant="light" onPress={onClose}>
                                    取消
                                </Button>
                                <Button
                                    isLoading={isSubmitting}
                                    color="primary"
                                    onPress={() => {
                                        setIsSubmitting(true)
                                        taskSubmitRef.current?.submit().then(
                                            res => {
                                                dispatch(showMessage({
                                                    type: "success",
                                                    content: "提交成功"
                                                }))
                                                onClose()
                                            }
                                        ).catch(e => console.log(e)).finally(() => setIsSubmitting(false))
                                    }}
                                >
                                    提交
                                </Button>
                            </ModalFooter>
                        </>
                    )}
                </ModalContent>
            </Modal>
        </div>
    )
}

export default withThemeConfigProvider(DrawerContent)
