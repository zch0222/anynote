'use client'
import useDocList from "@/hooks/useDocList";
import withThemeConfigProvider from "@/components/hoc/withThemeConfigProvider";
import Pagination from "@/components/Pagination";
import createPage from "@/components/hoc/createPage/createPage";
import { useRouter } from "next/navigation";
import {MoocInfo} from "@/types/moocTypes";
import useMoocList from "@/hooks/mooc/useMoocList";
import useMoocItemList from "@/hooks/mooc/useMoocItemList";
import {Col, List, Typography, Card} from "antd";
import {MOOC, WIKI} from "@/constants/route";
import {stringToDateString} from "@/utils/date";

function MoocItem({ data }: {
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
                style={{height: '220px'}}
                hoverable
                title={title}
                onClick={() => router.push(`${MOOC}/${data.id}`)}
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
                            <Typography.Text style={{
                                whiteSpace: "nowrap",
                                overflow: "hidden",
                                textOverflow: "ellipsis"
                            }}>{stringToDateString(item.updateTime, "YYYY/MM/DD HH:mm")}</Typography.Text>
                        </List.Item>
                    )}
                />
            </Card>
        </Col>
    )
}

function MoocTab({knowledgeBaseId }: {
    knowledgeBaseId: number
}) {

    return (
        <div className="h-full pt-2 overflow-hidden">
            <Pagination
                Page={createPage(MoocItem)}
                swr={useMoocList}
                params={{
                    knowledgeId: knowledgeBaseId
                }}
                direction={"row"}
            />
        </div>
    )
}

export default withThemeConfigProvider(MoocTab)
