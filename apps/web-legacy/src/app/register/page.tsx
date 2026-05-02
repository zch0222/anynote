import { Card } from "@nextui-org/react"
import {Image, Typography} from "antd";
import RegisterForm from "@/components/register/RegisterForm";

function Register() {


    return (
        <div className="flex justify-center items-center w-full h-full">
            <Card
                className="flex flex-col items-center h-[800px] w-[70%] max-w-[350px] p-6"
            >
                <div className="flex flex-col justify-center items-center">
                    <Image src="https://anynote.obs.cn-east-3.myhuaweicloud.com/anynote_%20Shanghai/assets/LOGO.png"
                           preview={false} width={60} alt="logo"/>
                    <div className="text-2xl font-bold mt-3">
                        注册
                    </div>
                    <div className="w-full">
                        <RegisterForm/>
                    </div>
                </div>
            </Card>
        </div>
    )
}

export default Register
