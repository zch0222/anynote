'use client'

import withThemeConfigProvider from "@/components/hoc/withThemeConfigProvider";

function ChartsDemo() {
    return (
        <div className="flex flex-col items-center w-full">
            <div className="w-[400px] h-[100px] flex flex-col mt-[20px] mb-[20px] justify-center items-center">
                <div className="text-3xl font-bold">
                    任务统计
                </div>
            </div>
            <div>

            </div>
        </div>
    )
}

export default withThemeConfigProvider(ChartsDemo)