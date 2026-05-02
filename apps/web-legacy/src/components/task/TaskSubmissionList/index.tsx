'use client'
import withThemeConfigProvider from "@/components/hoc/withThemeConfigProvider";
import Pagination from "@/components/Pagination";
import createPage from "@/components/hoc/createPage/createPage";
import useNoteTaskSubmissionsInfoList from "@/hooks/useNoteTaskSubmissionsInfoList";
import {NoteTaskSubmissionInfo} from "@/types/noteTypes";
import {useTheme} from "next-themes";
import {useState} from "react";
import {useDispatch} from "react-redux";
import Loading from "@/components/Loading";
import {RED} from "@/constants/color";
import {NOTE} from "@/constants/route";
import NoteIcon from "@/components/svg/NoteIcon";
import {getDateString} from "@/utils/date";
import {Popover} from "antd";
import {MoreOutlined} from "@ant-design/icons";
import {Button, Modal, ModalBody, ModalContent, ModalFooter, ModalHeader} from "@nextui-org/react";
import {returnTaskSubmission} from "@/requests/client/note/noteTask";
import {showMessage} from "@/store/message/messageSlice";


function SubmissionItem({ data }: {
    data: NoteTaskSubmissionInfo
}) {
    const {theme} = useTheme()
    const [isHovered, setIsHovered] = useState(false);
    const [isReturning, setIsReturning] = useState<boolean>(false)
    const [isRetunMoadalOpen, setIsReturnModalOpen] = useState<boolean>(false)
    const dispatch = useDispatch()

    if (!data) {
        return <Loading/>
    }

    const hoveredBg = 'light' === theme ? 'bg-[#FAFAFA]' :  'bg-[#262626]'

    const moreContent = (
        <div className="flex flex-col w-[120px] select-none">
            <div
                className={`p-1 ${isHovered ? hoveredBg : ''} cursor-pointer`}
                style={{
                    color: RED
                }}
                onClick={(e) => {
                    e.stopPropagation()
                    setIsReturnModalOpen(true)
                }}
            >
                退回
            </div>
        </div>
    )

    if (data.id !== undefined && data.id !==null) {
        return (
            <>
                <div
                    className={`flex flex-row justify-between items-center w-full p-2 cursor-pointer ${isHovered ? hoveredBg : ''}`}
                    onMouseEnter={() => setIsHovered(true)}
                    onMouseLeave={() => setIsHovered(false)}
                    onClick={() => window.open(`${NOTE}/${data.noteId}`)}
                >
                    <div className="flex flex-row items-center">
                        <NoteIcon width={40} height={40}/>
                        <div className="flex flex-col ml-1">
                            <div>{data.noteTitle}</div>
                            <div className="text-sm text-gray-500">
                                <span className="font-bold mr-1">{data.submissionNickname}</span>
                                <span>{`提交时间: ${getDateString(new Date(data.submitTime))}`}</span>
                            </div>

                        </div>
                    </div>
                    <div
                        className="p-2"
                        onClick={(e) => {
                            e.stopPropagation()
                        }}
                    >
                        <Popover
                            content={moreContent}
                            trigger="click"
                            overlayStyle={{
                                padding: 0
                            }}
                        >
                            <MoreOutlined
                                style={{
                                    fontSize: 18
                                }}
                            />
                        </Popover>
                    </div>
                </div>
                <Modal
                    isOpen={isRetunMoadalOpen}
                    onClose={() => {
                        setIsReturnModalOpen(false)
                    }}
                >
                    <ModalContent>
                        {(onClose) => (
                            <>
                                <ModalHeader className="flex flex-col gap-1">退回任务</ModalHeader>
                                <ModalBody>
                                    确定要退回任务吗？退回后用户可以在任务时间内再次提交。
                                </ModalBody>
                                <ModalFooter>
                                    <Button variant="light" onPress={onClose}>
                                        取消
                                    </Button>
                                    <Button
                                        isLoading={isReturning}
                                        color="primary"
                                        onPress={() => {
                                            setIsReturning(true)
                                            returnTaskSubmission(data.id).then(res => {
                                                dispatch(showMessage({
                                                    type: "success",
                                                    content: "退回成功"
                                                }))
                                                onClose()
                                            }).catch((e) => console.log(e)).finally(() => {
                                                setIsReturning(false)
                                            })
                                        }}
                                    >
                                        退回
                                    </Button>
                                </ModalFooter>
                            </>
                        )}
                    </ModalContent>
                </Modal>
            </>
        )
    }
    else {
        return (
            <>
                <div className="flex flex-col w-full p-2">
                    <div className="text-base font-bold">
                        {data.submissionNickname}
                    </div>
                    <div className="text-sm text-gray-500">
                        {data.submissionUsername}
                    </div>
                </div>
            </>
        )
    }
}

function TaskSubmissionList({noteTaskId, userTaskStatus}: {
    noteTaskId: number,
    userTaskStatus: number
}) {

    return (
        <Pagination
            Page={createPage(SubmissionItem)}
            swr={useNoteTaskSubmissionsInfoList}
            params={{
                noteTaskId: noteTaskId,
                userTaskStatus: userTaskStatus
            }}
            direction="col"
            isShowTotal={true}
        />
    )
}

export default withThemeConfigProvider(TaskSubmissionList)
