'use client'

import {useRouter} from "next/navigation";
import TaskForm from "@/components/task/TaskForm";
import BackButton from "@/components/BackButton";
import withThemeConfigProvider from "@/components/hoc/withThemeConfigProvider";
import {useCallback} from "react";
import { TaskFormType } from "@/components/task/TaskForm";
import { createTask } from "@/requests/client/note/noteTask";
import { useDispatch } from "react-redux";
import { showMessage } from "@/store/message/messageSlice";
import Title from "@/components/Title";

function CreateTask() {

    const dispatch = useDispatch()
    const router = useRouter()

    const onFinish = useCallback(async (value: TaskFormType) => {
        console.log(value)
        await createTask({
            startTime: value.startTime.toString(),
            endTime: value.endTime.toString(),
            taskName: value.taskName,
            knowledgeBaseId: value.knowledgeBaseId,
            taskDescribe: value.taskDescribe
        }).then(res => dispatch(showMessage({type: "success", content: "创建成功"}))).catch(e => console.log(e))
    }, [dispatch])

    return (
        <div className="flex flex-col w-full h-full p-5">
            <Title text={"创建任务"}/>
            <div className="flex-grow overflow-y-auto">
                <TaskForm
                    onFinish={onFinish}
                    isShowKnowledgeBase={true}
                />
            </div>
        </div>
    )
}

export default withThemeConfigProvider(CreateTask)
