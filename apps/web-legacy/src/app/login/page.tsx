'use client'

import {Typography, Input, Checkbox, Form, Space} from "antd";
import {Card, Button} from "@nextui-org/react";
import { login } from "@/requests/client/auth/auth";
import { useCookies } from "react-cookie"
import withThemeConfigProvider from "../../components/hoc/withThemeConfigProvider";
import { useRouter } from "next/navigation";
import { RootState } from "@/store";
import { useSelector, useDispatch } from "react-redux";
import { showMessage } from "@/store/message/messageSlice";
import { Image } from "antd";
import {setUserInfo} from "@/store/user/userSlice";
import {useEffect, useState} from "react";
import { DASHBOARD } from "@/constants/route";
import Loading from "@/components/Loading";

type FieldType = {
    username?: string;
    password?: string;
    remember?: string;
};

function Login() {
    const [cookies, setCookie, removeCookie] = useCookies(['user']);
    const [isLoading, setIsLoading] = useState(false);
    const dispatch = useDispatch();
    const router = useRouter()

    console.log()
    //
    // const { data, error, Loading, run } = useRequest(login, {
    //     manual: true
    // })

    const user = useSelector((state: RootState) => state.user)
    const message = useSelector((state: RootState) => state.message)
    // const dispatch = useDispatch()
    //
    console.log(user)

    // useEffect(() => {
    //     if (user.token) {
    //         router.push(DASHBOARD)
    //     }
    // }, [user, router]);

    const onFinish = async (value: {
        username: string,
        password: string
    }) => {
        setIsLoading(true)
        console.log(value)
        login({
            username: value.username,
            password: value.password
        }).then(
            res => {
                console.log(res)
                setCookie("user", JSON.stringify(res.data.data), {
                    path: "/",
                    maxAge: 3600 * 24 * 7,
                    sameSite: true
                })
                dispatch(setUserInfo(res.data.data))
                dispatch(showMessage({
                    type: "success",
                    content: "登录成功"
                }))
                router.push(DASHBOARD)
            }
        ).catch(
            e => console.log(e)
        ).finally(
            () => {
                setIsLoading(false)
            }
        );
    }

    // if (user.token) {
    //     return <Loading/>
    // }

    return (
        <div className="flex items-center justify-center h-full">
            <Card className="h-[450px] w-[70%] max-w-[350px] p-6">
                <div className="flex flex-col justify-center items-center">
                    <Image src="https://anynote.obs.cn-east-3.myhuaweicloud.com/anynote_%20Shanghai/assets/LOGO.png" preview={false} width={60} alt="logo"/>
                    <Typography.Title className="mt-3" level={3}>
                        登录
                    </Typography.Title>
                </div>
                <Form
                    name="basic"
                    labelCol={{ span: 8 }}
                    wrapperCol={{ span: 16 }}
                    style={{ maxWidth: 600 }}
                    initialValues={{ remember: true }}
                    onFinish={onFinish}
                    // onFinishFailed={onFinishFailed}
                    autoComplete="off"
                >
                    <Form.Item<FieldType>
                        label="用户名"
                        name="username"
                        labelCol={{ span: 24 }}
                        wrapperCol={{ span: 24 }}
                        rules={[{ required: true, message: '请输入用户名' }]}
                    >
                        <Input />
                    </Form.Item>

                    <Form.Item<FieldType>
                        labelCol={{ span: 24 }}
                        wrapperCol={{ span: 24 }}
                        label="密码"
                        name="password"
                        rules={[{ required: true, message: '请输入密码' }]}
                    >
                        <Input.Password/>
                    </Form.Item>

                    <Form.Item
                        className="mt-5"
                        labelCol={{ span: 24 }}
                        wrapperCol={{ span: 24 }}
                    >
                        <Button
                            className="w-full text-white"
                            isLoading={isLoading}
                            color="primary"
                            type="submit"
                        >
                            登录
                        </Button>
                    </Form.Item>

                </Form>
                <Button
                    className="w-[50px]"
                    size="sm"
                    onPress={() => router.push("/register")}
                >
                    注册账号
                </Button>
            </Card>
        </div>
    )
}

// @ts-ignore
// export const getServerSideProps = wrapper.getServerSideProps((store) => {
//     // return async function (conext: GetServerSidePropsContext) {
//     //     store.dispatch(setUserInfo({
//     //         username: "测试用户222",
//     //         nickname: "",
//     //         role: "",
//     //         avatar: "",
//     //         token: null
//     //     }))
//     //
//     //     const test = "ttt"
//     //     return {
//     //         props: {
//     //             test: test
//     //         }
//     //     }
//     // }
// })

export default withThemeConfigProvider(Login)
