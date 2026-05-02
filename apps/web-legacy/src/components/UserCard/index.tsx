'use client'
import {Avatar, Button} from "@nextui-org/react";
import { useSelector } from "react-redux";
import withThemeConfigProvider from "@/components/hoc/withThemeConfigProvider";
import {RootState} from "@/store";
import {SettingOutlined} from "@ant-design/icons";
import { useRouter } from "next/navigation";
import {useEffect, useState} from "react";
import { UserInfo } from "@/types/authTypes";

function UserCard({isShowSetting, inlineCollapsed} :{
    isShowSetting: boolean,
    inlineCollapsed?: boolean
}) {

    const user = useSelector((state: RootState) => state.user)
    const router = useRouter()
    const [userInfo, setUserInfo] = useState<{
        username: string,
        nickname: string
    }>({
        username: "loading...",
        nickname: "loading..."
    })

    useEffect(() => {
        setUserInfo({
            username: user.username,
            nickname: user.nickname
        })
    }, [user])

    return (
        <div className={`w-full flex flex-row ${inlineCollapsed ? 'justify-center' : 'justify-between'} items-center p-2`}>
            <div className="flex flex-row items-center">
                <Avatar src={user.avatar}/>
                {
                    inlineCollapsed ?
                        <></>
                        :
                        <div className="flex flex-col ml-3">
                            <div className="text-base font-bold">{userInfo.nickname}</div>
                            <div className="text-sm text-gray-500">{userInfo.username}</div>
                        </div>
                }
            </div>
            {
                inlineCollapsed ?
                    <></>
                    :
                    <div>
                        {isShowSetting ?
                            <Button onPress={() => router.push("/settings/profile")} isIconOnly={true} variant="light">
                                <SettingOutlined style={{fontSize: 18}}/>
                            </Button> : <></>
                        }
                    </div>
            }
        </div>
    )
}

export default withThemeConfigProvider(UserCard)