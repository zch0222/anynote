'use client'

import { Typography } from "antd";
import DashboardHomeButtons from "@/components/dashboard/DashboardHomeButtons";

import withThemeConfigProvider from "@/components/hoc/withThemeConfigProvider";


const { Title } = Typography;


function Dashboard() {

    return (
        <div className="static flex w-full h-full flex-col p-8">
            <Title level={2}>开始</Title>
            <DashboardHomeButtons/>
        </div>
    )
}

export default withThemeConfigProvider(Dashboard)
