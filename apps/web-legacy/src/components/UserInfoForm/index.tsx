'use client'

import withThemeConfigProvider from "@/components/hoc/withThemeConfigProvider";
import {UserInfo} from "@/types/authTypes";
import {ReactElement} from "react";
import {Avatar, Chip} from "@nextui-org/react";
import {SysUserInfo} from "@/types/manageTypes";

function UserInfoForm({ data }: {
    data: SysUserInfo
}) {

    const userInfoItems: {
        key: number,
        label: string,
        value: ReactElement
    }[] = [
        {
            key: 1,
            label: "用户状态:",
            value: data.status === 0 ? <Chip className="text-white" color="primary">正常</Chip> : <Chip className="text-white">停用</Chip>
        },
        {
            key: 2,
            label: "ID:",
            value: <>{data.id}</>
        },
        {
            key: 3,
            label: "用户名:",
            value: <>{data.username}</>
        },
        {
            key: 4,
            label: "昵称:",
            value: <>{data.nickname}</>
        },
        {
            key: 5,
            label: "所属组织:",
            value: (
                <>
                    {data.organizations.map(item => (
                        <Chip
                            className="mr-2 text-white"
                            key={item.id}
                            color="primary"
                        >
                            {item.organizationName}
                        </Chip>
                    ))}
                </>
            )
        },
        {
            key: 6,
            label: "性别:",
            value: data.sex === 0 ? <Chip className="text-white" color="primary">男</Chip> :
                (data.sex === 1 ? <Chip className="text-white" color="danger">女</Chip> : <Chip className="text-white">未知</Chip>)
        },
        {
            key: 7,
            label: "邮箱:",
            value: <>{data.email}</>
        },
        {
            key: 8,
            label: "手机号码:",
            value: <>{data.phoneNumber}</>
        }
    ]

    return (
        <div className="flex flex-col w-full box-border overflow-y-auto">
            <div className="ml-10 text-2xl">
                用户信息
            </div>
            <div className="flex flex-row items-center ml-10 mb-5 mt-8">
                <Avatar
                    className="w-20 h-20 mr-3"
                    size="lg"
                    src={data.avatar}
                />
                <div className="flex-col justify-center items-center">
                    <div className="mb-1 text-2xl font-bold">
                        {data.nickname}
                    </div>
                    <div>
                        {data.username}
                    </div>
                </div>
            </div>
            {userInfoItems.map(item => (
                <div key={item.key} className="flex flex-row items-center mt-3 ml-10">
                    <div className="mr-5 w-[80px]">
                        {item.label}
                    </div>
                    <div>
                        {item.value}
                    </div>
                </div>
            ))}
        </div>
    )
}


export default withThemeConfigProvider(UserInfoForm)