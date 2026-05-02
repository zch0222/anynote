'use client'
import { useCallback } from "react";

import { useDispatch } from "react-redux";
import { showMessage } from "@/store/message/messageSlice";
import { updateKnowledgeBase } from "@/requests/client/note/knowledgeBase";
import useKnowledgeBase from "@/hooks/useKnowledgeBase";
import WikiInfoForm from "@/components/wiki/WikiInfoForm";
import Loading from "@/components/Loading";

function WikiManageInfoTab({ id }: {
    id: number
}) {

    const dispatch = useDispatch()

    const changeWikiInfo = useCallback((value: {
        name: string,
        detail: string,
        cover: string
    }) => {
        updateKnowledgeBase({
            knowledgeBaseId: id,
            ...value
        }).then(res => {
            dispatch(showMessage({
                type: "success",
                content: "修改成功"
            }))

        }).catch(e => {
            console.log(e)
        })
    }, [id, dispatch])

    const {data} = useKnowledgeBase(id);

    if (!data) {
        return <Loading/>
    }


    return (
        <div
            className="w-[500px] pl-2"
        >
            <WikiInfoForm
                onFinish={changeWikiInfo}
                buttonText={"保存"}
                initialValues={{
                    name: data.knowledgeBaseName,
                    detail: data.detail,
                    cover: data.cover
                }}
            />
        </div>
    )
}

export default WikiManageInfoTab