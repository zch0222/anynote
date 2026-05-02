'use client'

import TaskForm from "@/components/task/TaskForm";
import withThemeConfigProvider from "@/components/hoc/withThemeConfigProvider";

function EditTask(params: {
    id: number
}) {
    const { id } = params
    return (
        <div>
            <TaskForm/>
        </div>
    )
}

export default withThemeConfigProvider(EditTask)
