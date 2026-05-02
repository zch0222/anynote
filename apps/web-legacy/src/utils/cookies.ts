// import { cookies } from 'next/headers'
// import jsCookie from "js-cookie"

import {readdirSync} from "fs";



export const getCookie = (key: string) => {
    if (typeof window !== "undefined") {
        return  getCookieFromBrowser(key).then(res => {
            return res
        })
    }
    else {
       return getCookieFromServer(key).then(res => {
            return res
        })
    }

}

// export const setCookie = (key: string, value: string) => {
//     return typeof window !== "undefined" ?
//         getCookieFromBrowser(key).then(res => res) :
//         getCookieFromServer(key).then(res => res)
// }
//
// const setCookieFromBrowser = async (key: string, value: string) => {
//     const { default: jsCookie } = await import("js-cookie");
//     jsCookie.set()
// }

const getCookieFromBrowser = async (key: string) => {
    const { default: jsCookie } = await import("js-cookie");
    return jsCookie.get(key)
}

const getCookieFromServer = async (key: string) => {
    const { cookies } = await import("next/headers");
    const cookieStore = cookies()
    return cookieStore.get(key)?.value
}




