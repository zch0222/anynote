
import {Layout, Menu} from "antd";

import WikiSider from "@/components/wiki/WikiSider";
import React from "react";

export default function WikisLayout({children}: {
    children: React.ReactNode
}) {



    return (
        <div className="flex-grow flex flex-row w-full h-full">
            <div className="w-[250px]">
                <WikiSider/>
            </div>
            <div className="flex-grow h-full">
                {children}
            </div>
        </div>
    )

}
