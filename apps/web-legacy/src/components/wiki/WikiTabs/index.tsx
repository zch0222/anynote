'use client'
import { Radio } from "antd";
import {Tabs, Tab} from "@nextui-org/react";
import withThemeConfigProvider from "@/components/hoc/withThemeConfigProvider";
import {Key, useState} from "react";

import NoteTab from "./NoteTab";
import TaskTab from "./TaskTab";
import DocTab from "./DocTab";
import useRouter from "@/hooks/useRouter";
import MoocTab from "@/components/wiki/WikiTabs/MoocTab";


function WikiTabs({ knowledgeBaseId }: {
    knowledgeBaseId: number
}) {

    // const [selectTab, setSelectTab] = useState("note")
    const { setSearchParams, searchParams } = useRouter()

    const onTabChange = (key: Key) => {
        setSearchParams([{key: "tab", value: key.toString()}])
    }


    return (
        <div className="flex-grow flex overflow-hidden flex-col">
            {/*<Radio.Group*/}
            {/*    value={selectTab}*/}
            {/*    onChange={(e) => {*/}
            {/*        setSelectTab(e.target.value)*/}
            {/*    }}*/}
            {/*>*/}
            {/*    <Radio.Button*/}
            {/*        value="note"*/}
            {/*    >*/}
            {/*        笔记*/}
            {/*    </Radio.Button>*/}
            {/*    <Radio.Button*/}
            {/*        value="task"*/}
            {/*    >*/}
            {/*        任务*/}
            {/*    </Radio.Button>*/}
            {/*</Radio.Group>*/}
            {/*{selectTab === "note" ? <NoteTab knowledgeBaseId={knowledgeBaseId}/> : <TaskTab knowledgeBaseId={knowledgeBaseId}/>}*/}

            <Tabs
                selectedKey={searchParams.get("tab") || "info"}
                onSelectionChange={onTabChange}
            >
                <Tab className="w-full h-full overflow-hidden" key="note" title="笔记">
                    <NoteTab knowledgeBaseId={knowledgeBaseId}/>
                </Tab>
                <Tab className="w-full h-full overflow-hidden" key="task" title="任务">
                    <TaskTab knowledgeBaseId={knowledgeBaseId}/>
                </Tab>
                <Tab className="w-full h-full overflow-hidden" key="doc" title="文档">
                    <DocTab knowledgeBaseId={knowledgeBaseId}/>
                </Tab>
                <Tab className="w-full h-full overflow-hidden" key="video" title="慕课">
                    <MoocTab knowledgeBaseId={knowledgeBaseId}/>
                </Tab>
            </Tabs>

        </div>
    )
}

export default withThemeConfigProvider(WikiTabs)
