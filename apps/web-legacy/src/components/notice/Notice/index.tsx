'use client'

import withThemeConfigProvider from "@/components/hoc/withThemeConfigProvider";
import {notice} from "@/requests/client/notify/notification";
import {useEffect, useRef} from "react";
import {EventSourceMessage} from "@microsoft/fetch-event-source";
import { useSelector } from "react-redux";
import {RootState} from "@/store";
import { notification } from "antd";

function Notice() {

    const [api, contextHolder] = notification.useNotification();

    const controller = useRef(new AbortController());
    const user = useSelector((state: RootState) => state.user);

    useEffect(() => {
        console.log(user)
        if (!user.token) {
            return
        }
        notice({
            platform: "WEB",
            onmessage: (event: EventSourceMessage) => {
                console.log(event.data)
                console.log("event", event.event)
                if ("message" == event.event) {
                    const notice = JSON.parse(event.data)
                    api.info({
                        message: notice.title,
                        description: notice.content
                    })

                }
            },
            onerror: (e: ErrorEvent) => {
                console.log(e)
                controller.current.abort()
            },
            signal: controller.current.signal
        }).catch(e => {
            console.log(e)

        }).finally(
            () => {
                console.log("END NOTICE")
            }
        )
        return () => {
            controller.current.abort()
        };
    }, [api, user]);

    return (
        <>
            {contextHolder}
        </>
    )
}

export default withThemeConfigProvider(Notice)