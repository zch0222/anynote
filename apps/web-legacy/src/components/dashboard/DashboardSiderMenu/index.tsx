'use client'

import {ItemType} from "antd/es/menu/hooks/useItems";
import getKnowledgeBaseSVG from "@/components/svg/KnowledgeBaseSVG";
import { getBotSVG } from "@/components/svg/Bot"
import {UserOutlined, HomeOutlined} from "@ant-design/icons";
import React, {useEffect, useMemo, useState, useContext} from "react";
import { useRouter, usePathname } from "next/navigation";
import {Menu} from "antd";
import withThemeConfigProvider from "@/components/hoc/withThemeConfigProvider"
import { DASHBOARD, WIKIS, CHAT_GPT, MOOC } from "@/constants/route";
import DashboardContext from "@/components/dashboard/Sider/context/DashboardContext";
import Icon from "@ant-design/icons";
import {getMoocSVG} from "@/components/svg/Mooc";

function ManageSiderMenu() {

    const pathname = usePathname()

    const router = useRouter()

    const [selectedKeys, setSelectKeys] = useState<string[]>([])
    const dashboardContextValue = useContext(DashboardContext)

    const defaultSelectedKeys = () => {
        if (pathname.startsWith("/dashboard/wikis")) {
            return ['2']
        }
        else if (pathname.startsWith('/dashboard')) {
            return ['1']
        }
        return []
    }

    useEffect(() => {
        console.log(pathname)
        if (pathname.startsWith("/dashboard/wikis")) {
            setSelectKeys(['2'])
        }
        // else if (pathname.startsWith("/dashboard/mooc")) {
        //     setSelectKeys(['3'])
        // }
        else if (pathname.startsWith('/dashboard/chat')) {
            setSelectKeys(['3'])
        }
        else if (pathname.startsWith('/dashboard')) {
            setSelectKeys(['1'])
        }
        else {
            setSelectKeys([])
        }
    }, [pathname]);

    const menuItems: ItemType[] = [
        {
            key: '1',
            icon: <HomeOutlined style={{fontSize: 18}}/>,
            label: '开始',
            onClick: () => {
                router.push(DASHBOARD)
            }
        },
        {
            key: '2',
            icon: <Icon component={getKnowledgeBaseSVG(18, 18)}/> ,
            label: '知识库',
            onClick: () => {
                router.push(WIKIS)
            }
        },
        // {
        //     key: '3',
        //     icon: <Icon component={getMoocSVG(18, 18)}/> ,
        //     label: 'AI视频慕课',
        //     onClick: () => {
        //         router.push(MOOC)
        //     }
        // },
        {
            key: '3',
            icon: <Icon component={getBotSVG(18, 18)}/> ,
            label: 'AI助手',
            onClick: () => {
                router.push(`${CHAT_GPT}/new`)
            }
        }
    ]

    return (
        <Menu
            inlineCollapsed={dashboardContextValue.inlineCollapsed}
            style={{
                // border: "none !important"
                // border: dashboardContextValue.inlineCollapsed ? "" : "none !important"
                // height: dashboardContextValue.inlineCollapsed ? 80 : 250
            }}
            className="w-full flex-grow"
            mode="inline"
            items={menuItems}
            selectedKeys={selectedKeys}
            // defaultSelectedKeys={defaultSelectedKeys()}
        />
    )
}

export default withThemeConfigProvider(ManageSiderMenu)
