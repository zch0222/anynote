'use client'

import {Menu} from "antd";
import withThemeConfigProvider from "@/components/hoc/withThemeConfigProvider";
import React, {useMemo} from "react";
import {ItemType} from "antd/es/menu/hooks/useItems";
import Title from "@/components/Title";
import useRouter from "@/hooks/useRouter";
import UserCard from "@/components/UserCard";

function SettingsSide() {

    const {pathname} = useRouter()

    const defaultSelectedKeys = useMemo(() => {
        if (pathname.startsWith('/settings/profile')) {
            return ['userInfo']
        }
        return []
    }, [pathname])

    const menuItems: ItemType[] = useMemo(() => (
        [
            {
                key: "userInfo",
                label: (
                    <div>
                        用户信息
                    </div>
                ),
            }
        ]
    ), [])

    return (
        <div className="flex flex-col h-full w-[250px] pt-2">
            <Title text="设置"/>
            <div className="pb-3">
                <UserCard/>
            </div>
            <Menu
                className="w-full flex-grow"
                style={{
                    border: "none !important"
                }}
                mode="inline"
                items={menuItems}
                defaultSelectedKeys={defaultSelectedKeys}
            />
        </div>
    )
}

export default withThemeConfigProvider(SettingsSide)