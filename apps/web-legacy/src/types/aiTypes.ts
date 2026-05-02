import {BaseEntity} from "@/types/requestTypes";

export interface ChatConversationInfoVO {
    id: number;
    title: string;
    type: number;
    docId: number;
    permission: number;
    createBy?: number;
    createTime?: string;
    updateBy?: number;
    updateTime?: string;
}

export interface ChatMessage extends BaseEntity {
    id: string;
    conversationId?: number;
    orderIndex?: number;
    content: string;
    role: number;
    type?: number;
    docId?: number;
    deleted?: number;
    status?: string
}


export interface ChatConversationVO {
    conversation: ChatConversationInfoVO,
    messages: ChatMessage[]
}
