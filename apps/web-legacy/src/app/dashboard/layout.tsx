import {Layout, Menu} from "antd";

import DashboardSider from "../../components/dashboard/Sider";
import React from "react";

export default function DashboardLayout({children}: {
    children: React.ReactNode
}) {

    return (
        <div className="flex-grow flex flex-row w-full h-full">
            <DashboardSider/>
            <div className="flex-grow h-full overflow-x-auto overflow-y-hidden">
                {children}
            </div>
        </div>
    )
}
