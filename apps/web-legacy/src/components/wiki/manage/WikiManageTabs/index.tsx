'use client'
import {Tabs, Tab} from "@nextui-org/react";
import WikiManageInfoTab from "../WikiManageInfoTab";
import WikiManageTaskTab from "@/components/wiki/manage/WikiManageTaskTab";
import WikiManageMemberTab from "@/components/wiki/manage/WikiManageMemberTab";
import useRouter from "@/hooks/useRouter";

import withThemeConfigProvider from "@/components/hoc/withThemeConfigProvider";
import {Key, useEffect} from "react";



function WikiManageTabs({ id }: {
    id: number
}) {

    const { setSearchParams, searchParams } = useRouter()

    const onTabChange = (key: Key) => {
        setSearchParams([{key: "tab", value: key.toString()}])
    }


    return (
        <Tabs
            selectedKey={searchParams.get('tab') || 'info'}
            onSelectionChange={onTabChange}
        >
            <Tab className="w-full h-full overflow-hidden" key="info" title="知识库信息">
                <WikiManageInfoTab id={id}/>
            </Tab>
            <Tab className="w-full h-full overflow-hidden" key="members" title="成员管理">
                <WikiManageMemberTab id={id}/>
            </Tab>
            <Tab className="w-full h-full overflow-hidden" key="tasks" title="任务管理">
                <WikiManageTaskTab id={id}/>
            </Tab>
        </Tabs>
    )
}

export default withThemeConfigProvider(WikiManageTabs)