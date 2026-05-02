import { Image, Card } from "@nextui-org/react"
import { Avatar } from "@nextui-org/react";
import React from "react";

export default function SiderHeader() {
    return (
        <div
            className="flex flex-row justify-between items-center w-[250px] box-border"
        >
            <div className="flex flex-row items-center">
                <Image
                    className="mr-2 h-[45px]"
                    src={"/images/LOGO.png"}
                    alt={"LOGO"}
                    radius="none"
                />
                <div className="font-bold text-xl">
                    学习随记
                </div>
            </div>
            {/*<div>*/}

            {/*</div>*/}
        </div>
    )
}
