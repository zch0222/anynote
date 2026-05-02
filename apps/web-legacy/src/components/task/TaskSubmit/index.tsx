'use client'

import withThemeConfigProvider from "@/components/hoc/withThemeConfigProvider";
import React, {MutableRefObject, useCallback, useMemo, useState} from "react";
import {NoteTask} from "@/types/noteTypes";
import Loading from "@/components/Loading";
import HoverItem from "@/components/HoverItem";
import Pagination from "@/components/Pagination";
import createPage from "@/components/hoc/createPage/createPage";
import useNoteTaskList from "@/hooks/useNoteTaskList";
import {PRIMARY_COLOR} from "@/constants/color";
import {getDateString} from "@/utils/date";
import {Chip} from "@nextui-org/react";
import { useDispatch } from "react-redux";
import { showMessage } from "@/store/message/messageSlice";
import { submitTask } from "@/requests/client/note/noteTask";


export interface TaskSubmitRefType {
    submit: () => Promise<any>
}

const TaskSubmit = React.forwardRef((props: {
    knowledgeBaseId: number,
    noteId: number,
    taskRef: MutableRefObject<TaskSubmitRefType>
}, ref) => {
    const [selectedTaskId, setSelectedTaskId] = useState(-1)
    const {knowledgeBaseId, taskRef, noteId} = props
    const dispatch = useDispatch()

    taskRef.current.submit = async () => {
        return new Promise<any>((resolve, reject) => {
            if (-1 === selectedTaskId) {
                dispatch(showMessage({
                    type: "warning",
                    content: "请先选择任务"
                }))
                reject("请先选择任务")
                return
            }
            submitTask({
                noteTaskId: selectedTaskId,
                noteId: noteId
            }).then((res => resolve("提交成功"))).catch(e => reject(e))
        })
    }

    const SubmitItem = useCallback(function ({data}: {
        data: NoteTask
    }) {
        const now = new Date().getTime()
        const startTime = new Date(data.startTime).getTime()
        const endTime = new Date(data.endTime).getTime()
        const statusChip = () => {
            console.log(now, startTime, endTime)
            if (startTime > now) {
                return <Chip aria-label="未开始" size="sm" className="text-white" color="warning">未开始</Chip>
            }
            else if (endTime > now) {
                return <Chip aria-label="进行中" size="sm" className="text-white" color="primary">进行中</Chip>
            }
            else {
                return <Chip aria-label="已结束" size="sm" className="text-white" color="danger">已结束</Chip>
            }
        }

        const submitStatusChip = () => {
            if (0 === data.submissionStatus) {
                return <Chip className="text-white" color="danger" aria-label="未提交">未提交</Chip>
            }
            else if (1 === data.submissionStatus) {
                return <Chip className="text-white" color="primary" aria-label="已提交">已提交</Chip>
            }
            else if (2 === data.submissionStatus) {
                return <Chip className="text-white" color="primary" aria-label="无需提交">无需提交</Chip>
            }
            else if (3 === data.submissionStatus) {
                return <Chip className="text-white" color="warning" aria-label="被退回">被退回</Chip>
            }
            else {
                return <Chip className="text-white" color="default" aria-label="未知状态">未知状态</Chip>
            }
        }
        if (!data) {
            return <Loading/>
        }

        const onClick = () => {
            if ((data.submissionStatus === 0 || data.submissionStatus === 3) && now > startTime && now < endTime) {
                setSelectedTaskId(data.id)
            }
            else if (data.submissionStatus === 1) {
                dispatch(showMessage({
                    type: "warning",
                    content: "任务已经提交，不能重复提交"
                }))
            }
            else if (data.submissionStatus === 2) {
                dispatch(showMessage({
                    type: "warning",
                    content: "无需提交此任务"
                }))
            }
            else if (now <= startTime) {
                dispatch(showMessage({
                    type: "warning",
                    content: "任务未开始"
                }))
            }
            else if (now >= endTime) {
                dispatch(showMessage({
                    type: "warning",
                    content: "任务已结束"
                }))
            }
            else {
                dispatch(showMessage({
                    type: "error",
                    content: "未知异常，请联系管理员"
                }))
            }
        }


        return (
            <HoverItem
                className={`flex flex-col ${selectedTaskId === data.id ? `border border-[${PRIMARY_COLOR}] border-2` : ""}`}
                onClick={onClick}
            >
                <div className="flex flex-row justify-between items-center text-base font-bold">
                    <div>{data.taskName}</div>
                    {statusChip()}
                </div>
                <div className="text-sm">
                    <span>开始时间：</span><span>{`${getDateString(new Date(data.startTime))}`}</span>
                </div>
                <div className="text-sm">
                    <span>结束时间：</span><span>{`${getDateString(new Date(data.endTime))}`}</span>
                </div>
                <div className="mt-2">
                    {submitStatusChip()}
                </div>
            </HoverItem>
        )
    }, [selectedTaskId, dispatch])

    return (
        <Pagination
            Page={createPage(SubmitItem)}
            swr={useNoteTaskList}
            params={{knowledgeBaseId: knowledgeBaseId}}
            direction={'col'}
        />
    )
})

TaskSubmit.displayName = "TaskSubmit"

export default withThemeConfigProvider(TaskSubmit)