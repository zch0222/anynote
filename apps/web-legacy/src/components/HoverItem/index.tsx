'use client'
import withThemeConfigProvider from "@/components/hoc/withThemeConfigProvider";
import React, {useState} from "react";
import {useTheme} from "next-themes";


function HoverItem({children, height, onClick, className}: {
    children: React.ReactNode,
    height: number,
    onClick: () => void,
    className: string
}) {

    const [isHovered, setIsHovered] = useState(false);
    const {theme} = useTheme()
    const hoveredBg = 'light' === theme ? 'bg-[#FAFAFA]' :  'bg-[#262626]'

    return (
        <div
            className={`${className} w-full p-2 cursor-pointer ${isHovered ? hoveredBg : ''}`}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
            onClick={onClick}
        >
            {children}
        </div>
    )
}

export default withThemeConfigProvider(HoverItem)
