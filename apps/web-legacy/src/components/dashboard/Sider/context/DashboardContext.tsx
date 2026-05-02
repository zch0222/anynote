import React from "react";
import {bool} from "prop-types";

export interface DashboardContextType {
    inlineCollapsed: boolean
    setInlineCollapsed(collapsed: boolean): void
}

const DashboardContext = React.createContext<DashboardContextType>({
    inlineCollapsed: false,
    setInlineCollapsed(collapsed: boolean) {}
})

export default DashboardContext