'use client'
import dynamic from 'next/dynamic'
import SiderHeader from "@/components/dashboard/SiderHeader";
import DashboardFoot from "@/components/dashboard/DashboardFoot";
import {Button, Card} from "antd";
import { useRouter, usePathname } from "next/navigation";
import React from "react";
import withThemeConfigProvider from "../../hoc/withThemeConfigProvider"
import DashboardSiderMenu from "../DashboardSiderMenu";
import SearchNoteInput from "@/components/dashboard/SearchNoteInput";
import { useSelector } from "react-redux";
import {RootState} from "@/store";
import DashboardContext from "./context/DashboardContext";
import { DashboardContextType } from "./context/DashboardContext";
import { useState } from "react";
import { MenuFoldOutlined, MenuUnfoldOutlined } from "@ant-design/icons";

// const DashboardFoot = dynamic(() => import("@/components/dashboard/DashboardFoot"),
//     {ssr: false})

function DashboardSider() {

    const router = useRouter()
    const pathname = usePathname()
    const [inlineCollapsed, setInlineCollapsed] = useState<boolean>(false)
    const [dashboardContextValue, setDashboardContextValue] =
        useState<DashboardContextType>({
            inlineCollapsed: inlineCollapsed,
            setInlineCollapsed: setInlineCollapsed
        })
    const cardStyle = {
        padding: 0,
        borderRadius: 0,
        border: "none"
    }
    const bodyStyle = {
        padding: 0,
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column"
    }
    const cardClassName = "h-full flex flex-col"

    const sideRouter = useSelector((state: RootState) => state.sideRouter)
    const { path } = sideRouter



    return (
        <div className={`w-[${inlineCollapsed ? '80' : '250'}px] h-full border-r-[1px]`}>
            <DashboardContext.Provider
                value={{
                    inlineCollapsed: inlineCollapsed,
                    setInlineCollapsed: setInlineCollapsed
                }}
            >
                <Card
                    className={cardClassName}
                    style={cardStyle}
                    // @ts-ignore
                    bodyStyle={bodyStyle}
                >
                    <div className={`w-full flex p-5 flex-row ${inlineCollapsed ? 'justify-center' : 'justify-between'} items-center`}>
                        {
                            inlineCollapsed ?
                                <div></div>
                                :
                                <SiderHeader/>
                        }
                        <div>
                            <Button
                                onClick={() => setInlineCollapsed(!inlineCollapsed)}
                                icon={inlineCollapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
                            />
                        </div>
                    </div>
                    <SearchNoteInput/>
                    <DashboardSiderMenu/>
                    <DashboardFoot/>
                </Card>
            </DashboardContext.Provider>

        </div>
    )
}

export default withThemeConfigProvider(DashboardSider)
