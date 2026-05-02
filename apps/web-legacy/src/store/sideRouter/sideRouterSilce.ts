import { createSlice, PayloadAction } from "@reduxjs/toolkit";

export enum SIDE_PATH {
    MANAGE = "MANAGE",
    MANAGE_USER = "MANAGE_USER"
}

interface SideRouterType {
    path: SIDE_PATH
}

const initialState: SideRouterType = {
    path: SIDE_PATH.MANAGE
}

const sideRouterSlice = createSlice({
    name: "sideRouterSlice",
    initialState,
    reducers: {
        setSideRouter: (state, action: PayloadAction<SideRouterType>) => {
            return action.payload
        }
    }
})

export const { setSideRouter } = sideRouterSlice.actions

export default sideRouterSlice.reducer