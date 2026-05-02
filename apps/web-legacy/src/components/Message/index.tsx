'use client'
import { message } from "antd";
import { RootState } from "@/store";
import { useSelector, useDispatch } from "react-redux";
import { showMessage } from "@/store/message/messageSlice";


import withThemeConfigProvider from "../hoc/withThemeConfigProvider";
import {useEffect} from "react";

function Message() {
    const [messageApi, contextHolder] = message.useMessage();
    const messageArgs = useSelector((state: RootState) => state.message)
    const dispatch = useDispatch()

    useEffect(() => {
        if (messageArgs.isDestroy === true) {
            messageApi.destroy(messageArgs.key)
        }
        else if (messageArgs.content) {
            messageApi.open(messageArgs).then(r => {})
            dispatch(showMessage({
                content: null
            }))
        }
    }, [dispatch, messageApi, messageArgs])

    return (
        <>
            {contextHolder}
        </>
    )
}

export default withThemeConfigProvider(Message)
