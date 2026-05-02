'use client'

import { Popover } from "antd";
import { Card, Modal, ModalContent, ModalHeader, ModalBody, ModalFooter, Button, Tabs, Tab } from "@nextui-org/react";
import Pagination from "@/components/Pagination";
import createPage from "@/components/hoc/createPage/createPage";
import useNoteTaskSubmissionsInfoList from "@/hooks/useNoteTaskSubmissionsInfoList";
import useAdminNoteTask from "@/hooks/useAdminNoteTask";
import Title from "@/components/Title";
import withThemeConfigProvider from "@/components/hoc/withThemeConfigProvider";
import Loading from "@/components/Loading";
import TaskManageNoteEditChart from "@/components/task";
import {NoteTaskSubmissionInfo} from "@/types/noteTypes";
import NoteIcon from "@/components/svg/NoteIcon";
import { getDateString } from "@/utils/date";
import {useTheme} from "next-themes";
import {useState} from "react";
import {NOTE} from "@/constants/route";
import {EditOutlined, MoreOutlined} from "@ant-design/icons";
import {RED} from "@/constants/color";
import CardButton from "@/components/CardButton";
import useRouter from "@/hooks/useRouter";
import {CARD_BUTTON_ICON_FONT_SIZE} from "@/constants/size";
import MarkDownViewer from "@/components/MarkDownViewer";
import TaskSubmissionList from "@/components/task/TaskSubmissionList";
import { returnTaskSubmission } from "@/requests/client/note/noteTask";
import { useDispatch } from "react-redux";
import { showMessage } from "@/store/message/messageSlice";

function Task({params}: {
    params: {
        id: number
    }
}) {
    const { push } = useRouter()
    const {id} = params
    const { data } = useAdminNoteTask(id)
    const [userTaskStatus, setUserTaskStatus] = useState(1)



    const tabs = [
        {
            id: 1,
            title: "已提交"
        },
        {
            id: 0,
            title: "未提交"
        },
        {
            id: 3,
            title: "已退回"
        }
    ]

    return (
        <div className="w-full h-full flex flex-col p-5">
            <Title text={data === undefined ? "加载中..." : data.taskName}/>
            <div className="mb-2">
                <CardButton
                    icon={<EditOutlined style={{fontSize: CARD_BUTTON_ICON_FONT_SIZE}}/>}
                    title="编辑任务"
                    content="修改任务信息"
                    clickEvent={() => push({
                        pathname: `/dashboard/task/${id}/edit`,
                        params: [
                            {
                                key: "taskName",
                                value: data?.taskName || "",
                            },
                            {
                                key: "startTime",
                                value: encodeURI(data?.startTime || "")
                            },
                            {
                                key: "endTime",
                                value: encodeURI(data?.endTime || "")
                            }
                        ]
                    })}
                />
            </div>
            <TaskManageNoteEditChart noteTaskId={id}/>
            {data?.taskDescribe ?
                <Card
                    className="flex flex-col w-full p-2 max-h-[300px] overflow-y-auto"
                    radius="sm"
                >
                    <div className="text-xl font-bold mb-3">任务描述：</div>
                    <MarkDownViewer content={data.taskDescribe} />
                </Card>
                : <></>}

            <div className="flex-grow overflow-hidden">
                <Tabs
                    items={tabs}
                >
                    {(item) => (
                        <Tab className="h-full" key={item.id} title={item.title}>
                            <div className="overflow-hidden h-full pb-5">
                                <TaskSubmissionList
                                    noteTaskId={id}
                                    userTaskStatus={item.id}
                                />
                            </div>
                        </Tab>
                    )}
                </Tabs>
            </div>
        </div>
    )
}

export default withThemeConfigProvider(Task)
