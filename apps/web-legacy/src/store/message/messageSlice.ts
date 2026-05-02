import { createSlice, PayloadAction } from "@reduxjs/toolkit";
import {ArgsProps} from "antd/es/message";

interface MessageProps extends ArgsProps{
    isDestroy?: boolean
}

const initialState: MessageProps = {
    content: null
}


export const messageSlice = createSlice({
    name: "messageSlice",
    initialState,
    reducers: {
        showMessage: (state, action: PayloadAction<MessageProps>) => {
            return action.payload
        }
    }
})

export const { showMessage } = messageSlice.actions

export default messageSlice.reducer
