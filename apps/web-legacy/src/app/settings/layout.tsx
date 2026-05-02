import React from "react";
import SettingsSide from "@/components/settings/SettingsSide";

export default function SettingsLayout({
   children,
}: {
    children: React.ReactNode
}) {

    return (
        <div className="flex flex-row w-full h-full">
            <div>
                <SettingsSide/>
            </div>
            <div>{children}</div>
        </div>
    )
}