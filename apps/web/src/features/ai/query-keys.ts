import type { Conversation } from "./schemas";

// 层级 query key：域 key 是所有子 key 的前缀（features/_keys.test.ts 守护）。
export const aiQueryKeys = {
  all: ["ai"] as const,
  conversations: ["ai", "conversations"] as const,
  conversationList: (pageSize: number) => ["ai", "conversations", "list", pageSize] as const,
  conversationDetail: (conversationId: number) =>
    ["ai", "conversations", "detail", conversationId] as const,
  docs: ["ai", "docs"] as const,
  docList: (knowledgeBaseId: number) => ["ai", "docs", "list", knowledgeBaseId] as const,
  docDetail: (docId: number) => ["ai", "docs", "detail", docId] as const,
};

/** 会话在流式 store 中的 key（与 query key 无关，只要求稳定且不与 "new"/"doc*" 冲突）。 */
export function conversationKey(conversationId: number | { id: number }): string {
  const id = typeof conversationId === "number" ? conversationId : conversationId.id;
  return `c${id}`;
}

/** 新会话（尚无 conversationId）在流式 store 中的固定 key。 */
export const NEW_CONVERSATION_KEY = "new";
