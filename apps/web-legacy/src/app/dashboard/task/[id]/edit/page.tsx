'use client'

import TaskForm, {TaskFormType} from "@/components/task/TaskForm";
import withThemeConfigProvider from "@/components/hoc/withThemeConfigProvider";
import Title from "@/components/Title";
import {useCallback} from "react";
import { useDispatch } from "react-redux";
import { editTask } from "@/requests/client/note/noteTask";
import { showMessage } from "@/store/message/messageSlice";
import useAdminNoteTask from "@/hooks/useAdminNoteTask";
import identifyShadowedGlobals from "sucrase/dist/types/identifyShadowedGlobals";
import Loading from "@/components/Loading";


function EditTask({params}: {
    params: {
        id: number
    }
}) {

    const dispatch = useDispatch()

    const { id } = params
    const { data } = useAdminNoteTask(id)

    const onFinish = useCallback(async (value: TaskFormType) => {
        await editTask({
            id: id,
            taskName: value.taskName,
            startTime: value.startTime.toString(),
            endTime: value.endTime.toString(),
            taskDescribe: value.taskDescribe
        }).then(res => {
            dispatch(showMessage({
                type: "success",
                content: "修改成功"
            }))
        }).catch(
            e => {
                console.log(e)
                dispatch(showMessage({
                    type: "error",
                    content: "未知错误"
                }))
            }
        )
    }, [id, dispatch])

    if (!data) {
        return (
            <div className="w-full h-full">
                <Loading/>
            </div>
        )
    }


    return (
        <div className="flex flex-col w-full h-full p-5">
            <Title text="修改任务"/>
            <div className="flex-grow overflow-y-auto">
                <TaskForm
                    onFinish={onFinish}
                    isShowKnowledgeBase={false}
                    taskDescribe={data.taskDescribe}
                />
            </div>
        </div>
    )
}

export default withThemeConfigProvider(EditTask)