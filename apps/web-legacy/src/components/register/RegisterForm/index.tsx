'use client'

import withThemeConfigProvider from "@/components/hoc/withThemeConfigProvider";
import {Form, Input, Radio} from "antd";
import {Button} from "@nextui-org/react";
import { useCookies } from "react-cookie"

import {useState} from "react";
import { register } from "@/requests/client/auth/auth";
import {useDispatch} from "react-redux";
import { showMessage } from "@/store/message/messageSlice";
import {setUserInfo} from "@/store/user/userSlice";
import {useRouter} from "next/navigation";
import {DASHBOARD} from "@/constants/route";

function RegisterForm() {

    const [isLoading, setIsLoading] = useState(false);
    const dispatch = useDispatch()
    const [cookies, setCookie, removeCookie] = useCookies(['user']);

    const router = useRouter()


    const onFinish = (value: {
        username: string,
        nickname: string,
        password: string,
        repeatPassword: string,
        email?: string,
        sex: number
    }) => {
        if (value.password !== value.repeatPassword) {
            dispatch(showMessage({
                type: "warning",
                content: "输入的两次密码不相同"
            }))
            return
        }
        setIsLoading(true)
        register(value).then(
            res => {

                setCookie("user", JSON.stringify(res.data.data), {
                    path: "/",
                    maxAge: 3600 * 24 * 7,
                    sameSite: true
                })
                dispatch(setUserInfo(res.data.data))
                dispatch(showMessage({
                    content: "注册成功，即将自动登录",
                    type: "success",
                }))
                router.push(DASHBOARD)
            }
        ).catch(
            e => console.log(e)
        ).finally(
            () => {
                setIsLoading(false)
            }
        )
    }

    return (
        <div className="flex flex-col items-center w-full h-full">
            <Form
                labelCol={{ span: 8 }}
                wrapperCol={{ span: 16 }}
                style={{ maxWidth: 600 }}
                onFinish={onFinish}
            >
                <Form.Item
                    label="用户名"
                    name="username"
                    labelCol={{ span: 24 }}
                    wrapperCol={{ span: 24 }}
                    rules={[
                        { required: true, message: '请输入用户名' },
                        { pattern: new RegExp("^[a-zA-Z0-9]{6,15}$"), message: "用户名必须是8到15位，只能包含数字和字母" }
                    ]}
                >
                    <Input />
                </Form.Item>

                <Form.Item
                    label="昵称"
                    name="nickname"
                    labelCol={{ span: 24 }}
                    wrapperCol={{ span: 24 }}
                    rules={[
                        { required: true, message: '请输入昵称' }
                    ]}
                >
                    <Input/>
                </Form.Item>

                <Form.Item
                    label="密码"
                    name="password"
                    labelCol={{ span: 24 }}
                    wrapperCol={{ span: 24 }}
                    rules={[
                        { required: true, message: '请输入密码' },
                        {
                            pattern: new RegExp("^(?=.*[0-9])(?=.*[a-z])(?=.*[A-Z])[a-zA-Z0-9]{8,15}$"),
                            message: "密码必须是8到15位，且包含大写字母、小写字母和数字"
                        }
                    ]}
                >
                    <Input.Password/>
                </Form.Item>

                <Form.Item
                    label="重复密码"
                    name="repeatPassword"
                    labelCol={{ span: 24 }}
                    wrapperCol={{ span: 24 }}
                    rules={[
                        { required: true, message: '请再次输入密码' },
                        {
                            pattern: new RegExp("^(?=.*[0-9])(?=.*[a-z])(?=.*[A-Z])[a-zA-Z0-9]{8,15}$"),
                            message: "密码必须是8到15位，且包含大写字母、小写字母和数字"
                        }
                    ]}
                >
                    <Input.Password/>
                </Form.Item>

                <Form.Item
                    label="邮箱"
                    name="email"
                    labelCol={{ span: 24 }}
                    wrapperCol={{ span: 24 }}
                    rules={[
                        {
                            pattern: new RegExp("^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,6}$|^$"),
                            message: "邮箱格式不正确"
                        }
                    ]}
                >
                    <Input/>
                </Form.Item>

                <Form.Item
                    label="性别"
                    name="sex"
                    labelCol={{ span: 24 }}
                    wrapperCol={{ span: 24 }}
                    rules={[
                        {
                            required: true,
                            message: "请选择性别"
                        }
                    ]}
                >
                    <Radio.Group>
                        <Radio value={0}>男</Radio>
                        <Radio value={1}>女</Radio>
                    </Radio.Group>
                </Form.Item>

                <Button
                    className="w-full text-white"
                    isLoading={isLoading}
                    color="primary"
                    type="submit"
                >
                    注册
                </Button>
            </Form>
        </div>
    )
}

export default withThemeConfigProvider(RegisterForm);