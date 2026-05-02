'use client'

import Pagination from "@/components/Pagination";
import createPage from "@/components/hoc/createPage/createPage";
import useMoocList from "@/hooks/mooc/useMoocList";
import {Card, Col, List, Typography} from "antd";
import withThemeConfigProvider from "@/components/hoc/withThemeConfigProvider";
import {NoteKnowledgeBaseDTO} from "@/types/noteTypes";
import {useRouter} from "next/navigation";
import {WIKI} from "@/constants/route";
import {stringToDateString} from "@/utils/date";
import {Image} from "@nextui-org/react";
import {MoocInfo} from "@/types/moocTypes";
import useNoteList from "@/hooks/useNoteList";
import useMoocItemList from "@/hooks/mooc/useMoocItemList";

const {Title} = Typography;
const {Meta} = Card;

const KnowledgeBaseCard = withThemeConfigProvider(function ({data}: {
    data: MoocInfo
}) {
    const router = useRouter();

    const {data: moocItemListData, isLoading} = useMoocItemList({
        params: {
            parentId: 0,
            moocId: data.id as number,
        },
        page: 1,
        pageSize: 3
    })

    const title = (
        <div className={"flex gap-[10px] items-center"}>
            {/*<Image className="object-cover w-[32px] h-[40px]" src={data.cover} alt='cover'/>*/}
            <span>{data.title}</span>
        </div>
    )

    return (
        <Col xs={24} lg={8}>
            <Card
                style={{height: '240px'}}
                hoverable
                title={title}
                onClick={() => router.push(`${WIKI}/${data.id}`)}
            >
                <List
                    locale={{emptyText: "暂无数据"}}
                    dataSource={moocItemListData?.rows}
                    renderItem={(item) => (
                        <List.Item style={{padding: '10px 0'}}>
                            <Typography.Title level={5} style={{
                                margin: 0,
                                whiteSpace: "nowrap",
                                overflow: "hidden",
                                textOverflow: "ellipsis"
                            }}>{item.title}</Typography.Title>
                        </List.Item>
                    )}
                />
            </Card>
        </Col>
    )
})

export default function Mooc() {
    return (
        <div className="flex flex-col w-full h-full flex-col p-8 box-border">
            <Title level={2}>AI视频慕课</Title>

            <div className="flex-grow flex overflow-hidden flex-row p-2">
                <Pagination
                    direction="row"
                    Page={createPage(KnowledgeBaseCard)}
                    swr={useMoocList}
                    params={{
                        permissions: 5
                    }}
                />
            </div>

        </div>
    )
}
