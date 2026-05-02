'use client'

import AIWorkflow from "@/components/AIWorkflow";
import withThemeConfigProvider from "@/components/hoc/withThemeConfigProvider";

function AIWorkflowDemo() {

    return (
        <div className="w-full h-[600px]">
            <AIWorkflow/>
        </div>
    )
}

export default withThemeConfigProvider(AIWorkflowDemo)