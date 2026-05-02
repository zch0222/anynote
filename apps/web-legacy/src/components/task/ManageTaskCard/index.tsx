'use client'

// import { Progress } from "antd";
import withThemeConfigProvider from "@/components/hoc/withThemeConfigProvider";
import {AdminNoteTask} from "@/types/noteTypes";
import Loading from "@/components/Loading";
import {Card, Chip, Progress} from "@nextui-org/react";
import { getDateString } from "@/utils/date";
import {useMemo} from "react";
import { useRouter } from "next/navigation";
import { RED } from "@/constants/color"
import {id} from "postcss-selector-parser";
import MarkDownViewer from "@/components/MarkDownViewer";

function ManageTaskCard({ data }: {
    data: AdminNoteTask
}) {
    const router = useRouter()

    const statusChip = useMemo(() => {
        const now = new Date().getTime()
        const startTime = new Date(data.startTime).getTime()
        const endTime = new Date(data.endTime).getTime()

        console.log(now, startTime, endTime)
        if (startTime > now) {
            return <Chip aria-label="未开始" className="text-white" color="warning">未开始</Chip>
        }
        else if (endTime > now) {
            return <Chip aria-label="进行中" className="text-white" color="primary">进行中</Chip>
        }
        else {
            return <Chip aria-label="已结束" className="text-white" color="danger">已结束</Chip>
        }
    }, [data])


    if (!data) {
        return <Loading/>
    }



    return (
        <Card
            className="flex flex-col m-2 p-3 w-full max-w-[400px] cursor-pointer"
            radius="sm"
            isHoverable={true}
            isPressable
            onPress={() => router.push(`/dashboard/task/${data.id}`)}
            aria-label={"任务名称"}
        >
            <div className="flex flex-row justify-between w-full">
                <div className="text-xl font-bold mb-1">{data.taskName}</div>
                <div>{statusChip}</div>
            </div>
            <div className="text-base mt-1">
                {`开始时间: ${getDateString(new Date(data.startTime))}`}
            </div>
            <div className="text-base mt-1">
                {`结束时间: ${getDateString(new Date(data.endTime))}`}
            </div>
            <div className="flex w-full flex-row mt-2 items-center">
                <Progress aria-label="progress" size="lg" value={data.submissionProgress * 100}/>
                <div className="ml-2">{`${data.submittedCount}/${data.needSubmitCount}`}</div>
            </div>
            {/*{data?.taskDescribe ?*/}
            {/*    <div className="flex flex-col items-start mt-1">*/}
            {/*        <div className="text-base">任务描述：</div>*/}
            {/*        <MarkDownViewer content={data.taskDescribe}/>*/}
            {/*    </div>*/}
            {/*    : <></>}*/}
        </Card>
    )
}

export default withThemeConfigProvider(ManageTaskCard)

