'use client'
import {Card, Col, List, Typography} from "antd";
import {Image} from "@nextui-org/react";
import {useRouter} from "next/navigation";
import {WIKI} from "@/constants/route";

import Pagination from "@/components/Pagination";

import useNoteKnowledgeBaseList from "@/hooks/useNoteKnowledgeBaseList";

import createPage from "@/components/hoc/createPage/createPage";
import withThemeConfigProvider from "@/components/hoc/withThemeConfigProvider";
import {NoteKnowledgeBaseDTO} from "@/types/noteTypes";
import useNoteList from "@/hooks/useNoteList";
import {stringToDateString} from "@/utils/date";


const {Title, Paragraph} = Typography;

const KnowledgeBaseCard = withThemeConfigProvider(function ({data}: {
    data: NoteKnowledgeBaseDTO
}) {

    const {data: noteListData, isLoading} = useNoteList({
        params: {
            knowledgeBaseId: data.id
        },
        page: 1,
        pageSize: 3
    })

    const router = useRouter();

    const title = (
        <div className={"flex gap-[10px] items-center"}>
            <Image className="object-cover w-[32px] h-[40px]" src={data.cover} alt='cover'/>
            <span>{data.knowledgeBaseName}</span>
        </div>
    )

    console.log(noteListData)
    return (
        <Col xs={24} lg={8}>
            {/*<Card*/}
            {/*    bordered={false}*/}
            {/*    hoverable*/}
            {/*    className="border-none p-0 w-[200px]"*/}
            {/*    style={{*/}
            {/*        marginRight: 24,*/}
            {/*        marginTop: 16,*/}
            {/*        height: 315*/}
            {/*    }}*/}
            {/*    cover={<Image className="object-cover w-[200px] h-[250px]" src={data.cover} alt='cover'/>}*/}
            {/*    // isPressable*/}
            {/*    onClick={() => router.push(`${WIKI}/${data.id}`)}*/}
            {/*>*/}
            {/*    <Meta title={data.knowledgeBaseName}/>*/}
            {/*</Card>*/}
            <Card
                style={{height: '240px'}}
                hoverable
                title={title}
                onClick={() => router.push(`${WIKI}/${data.id}`)}
            >
                <List
                    locale={{emptyText: "暂无数据"}}
                    dataSource={noteListData?.rows}
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
})

function Wikis() {
    return (
        <div className="flex flex-col w-full h-full flex-col p-8 box-border">
            <Title level={2}>知识库</Title>

            <div className="flex-grow flex overflow-hidden flex-row w-full">
                <Pagination
                    direction="row"
                    Page={createPage(KnowledgeBaseCard)}
                    swr={useNoteKnowledgeBaseList}
                    params={{
                        permissions: 5
                    }}
                />
            </div>

        </div>
    )
}

export default withThemeConfigProvider(Wikis)

