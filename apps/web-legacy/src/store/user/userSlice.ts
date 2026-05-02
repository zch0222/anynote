
import { createSlice, PayloadAction } from "@reduxjs/toolkit";
import { UserInfo } from "@/types/authTypes";
import jsCookie from "js-cookie"
import { parseCookies } from 'nookies'
import {cookies} from "next/headers";


const initialState: UserInfo = getUserInfo()

export function getUserInfo() {
    console.log("get userInfo-----")
    if (typeof window !== "undefined") {
        const userInfo = jsCookie.get("userInfo")
        if (userInfo) {
            console.log(userInfo)
            return JSON.parse(userInfo)
        }
    }
    else {
        console.log("Server")
        const { cookies } = require('next/headers');
        // console.log(typeof cookies().get("userInfo"))
        const cookieUser = cookies().get("userInfo")
        if (cookieUser) {
            return cookieUser
        }
    }
    return {
        username: "test",
        nickname: "",
        role: "",
        avatar: "",
        token: null
    }
}

async function saveUserInfo(userInfo: UserInfo) {
    const { default: jsCookie } = await import("js-cookie");
    jsCookie.set("userInfo", JSON.stringify(userInfo))
    console.log("saving----------")
    // localStorage.setItem("userInfo", JSON.stringify(userInfo))
}

async function removeUserInfo() {
    const { default: jsCookie } = await import("js-cookie");
    jsCookie.remove("userInfo")
}

export const userSlice = createSlice({
    name: "userSlice",
    initialState,
    reducers: {
        setUserInfo: (state, action: PayloadAction<UserInfo>) => {
            saveUserInfo(action.payload).then();
            console.log(action.payload)
            return action.payload;
        },
        clearUserInfo: (state) => {
            removeUserInfo().then();
            return initialState
        }
    }
})

export const { setUserInfo, clearUserInfo } = userSlice.actions

export default userSlice.reducer
