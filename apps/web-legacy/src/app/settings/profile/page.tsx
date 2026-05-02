'use client'
import withThemeConfigProvider from "@/components/hoc/withThemeConfigProvider";
import {Avatar, Chip, Input, Button} from "@nextui-org/react";
import useMyUserInfo from "@/hooks/useMyUserInfo";
import Loading from "@/components/Loading";
import {ReactElement} from "react";
import { useState } from "react";
import { showMessage } from "@/store/message/messageSlice";
import { setUserInfo, clearUserInfo } from "@/store/user/userSlice";
import { useDispatch } from "react-redux";
import { resetPassword } from "@/requests/client/auth/auth";
import { useRouter } from "next/navigation";

function User() {

    const { data, error } = useMyUserInfo()
    const [oldPassword, setOldPassword] = useState<string>("")
    const [newPassword, setNewPassword] = useState<string>("")
    const [repeatPassword, setRepeatPassword] = useState<string>("")
    const dispatch = useDispatch()
    const [isUpdatingPassword, setIsUpdatePassword] = useState<boolean>(false)
    const router = useRouter()

    const changePassword = () => {
        if (newPassword !== repeatPassword) {
            dispatch(showMessage({
                type: "warning",
                content: "两次密码不一致"
            }))
            return
        }
        // if (newPassword.length < 6 || newPassword.length > 15) {
        //     dispatch(showMessage({
        //         type: "warning",
        //         content: "密码长度必须在6-15位"
        //     }))
        //     return
        // }
        // const regex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*[@#$%^&+=]).*$/;
        // if (!regex.test(newPassword)) {
        //     dispatch(showMessage({
        //         type: "warning",
        //         content: "密码必须包含大写字母、小写字母和特殊字符"
        //     }))
        //     return
        // }

        setIsUpdatePassword(true)
        resetPassword({
            oldPassword: oldPassword,
            newPassword: newPassword
        }).then(res => {
            dispatch(showMessage({
                type: "success",
                content: "修改成功"
            }))
            dispatch(setUserInfo(res.data.data))
        }).catch(
            e => console.log(e)
        ).finally(
            () => setIsUpdatePassword(false)
        )
    }

    const logout = () => {
        dispatch(clearUserInfo())
        router.push("/login")
        dispatch(showMessage({
            type: "success",
            content: "退出登录成功"
        }))
    }


    if (!data) {
        return (
            <Loading/>
        )
    }

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
        <div className="flex flex-col w-full h-full p-5 box-border overflow-y-auto">
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
            <div className="ml-10 mt-8 text-base font-bold">
                修改密码
            </div>
            <div className="ml-10">
                <Input
                    type="password"
                    label="旧密码"
                    variant="underlined"
                    onValueChange={(value: string) => setOldPassword(value)}
                />
                <Input
                    type="password"
                    label="新密码"
                    variant="underlined"
                    onValueChange={(value: string) => setNewPassword(value)}
                />
                <Input
                    type="password"
                    label="重复密码"
                    variant="underlined"
                    onValueChange={(value: string) => setRepeatPassword(value)}
                />
            </div>
            <div className="ml-10 mt-1">
                <Button isLoading={isUpdatingPassword} onClick={changePassword} className="mt-2 text-white" color="primary">修改密码</Button>
            </div>
            <div className="ml-10 mt-3">
                <Button onPress={logout} className="text-white" color="danger">
                    退出登录
                </Button>
            </div>
        </div>
    )
}

export default withThemeConfigProvider(User)

