import React from "react";
import { VariableOption } from "@/types/aiWorkflowTypes";


const VariableContext = React.createContext<VariableOption[]>([])

export default VariableContext