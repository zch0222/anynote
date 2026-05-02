'use client'
import withThemeConfigProvider from "@/components/hoc/withThemeConfigProvider";
import UserCard from "@/components/UserCard";
import { useContext } from "react";
import DashboardContext from "@/components/dashboard/Sider/context/DashboardContext";

function DashboardFoot() {

    const dashboardContextValue = useContext(DashboardContext)

    return (
        <div className="w-full flex flex-col">
            <UserCard
                isShowSetting={true}
                inlineCollapsed={dashboardContextValue.inlineCollapsed}
            />
        </div>
    )
}

export default withThemeConfigProvider(DashboardFoot)