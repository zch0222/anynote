import type { KnowledgeBase } from "@anynote/api-core/note-schemas";
import type { Conversation } from "./schemas";

export const CONVERSATION_GROUP_PREVIEW_SIZE = 5;

export type ConversationKnowledgeBase = Pick<KnowledgeBase, "id" | "knowledgeBaseName">;

export type ConversationGroup = {
  key: string;
  label: string;
  conversations: readonly Conversation[];
};

const ALL_KNOWLEDGE_BASES_KEY = "all";
const OTHER_CONVERSATIONS_KEY = "other";

function knowledgeBaseGroupKey(knowledgeBaseId: number): string {
  return `kb:${knowledgeBaseId}`;
}

function conversationGroupKey(conversation: Conversation): string {
  const scope = conversation.scope;
  if (!scope) return ALL_KNOWLEDGE_BASES_KEY;
  const { knowledgeBaseIds, refs } = scope;
  if (refs.length === 0) {
    if (knowledgeBaseIds.length === 0) return ALL_KNOWLEDGE_BASES_KEY;
    const knowledgeBaseId = knowledgeBaseIds[0];
    if (knowledgeBaseIds.length === 1 && knowledgeBaseId !== undefined) {
      return knowledgeBaseGroupKey(knowledgeBaseId);
    }
  }
  return OTHER_CONVERSATIONS_KEY;
}

/**
 * 按已保存的检索范围整理会话，知识库按传入顺序排列，特殊分组固定在末尾。
 *
 * @param conversations 按后端列表顺序排列的会话
 * @param knowledgeBases 当前可见知识库及其展示名称
 * @returns 只包含会话的分组，其他会话位于全部知识库之前
 * @author 称霸幼儿园
 */
export function groupConversations(
  conversations: readonly Conversation[],
  knowledgeBases: readonly ConversationKnowledgeBase[],
): ConversationGroup[] {
  const rowsByKey = new Map<string, Conversation[]>();
  const knowledgeBaseOrder: number[] = [];
  for (const conversation of conversations) {
    const key = conversationGroupKey(conversation);
    const rows = rowsByKey.get(key);
    if (rows) {
      rows.push(conversation);
    } else {
      rowsByKey.set(key, [conversation]);
      if (key.startsWith("kb:")) knowledgeBaseOrder.push(Number(key.slice(3)));
    }
  }

  const groups: ConversationGroup[] = [];
  const namedKnowledgeBaseIds = new Set<number>();
  for (const base of knowledgeBases) {
    const key = knowledgeBaseGroupKey(base.id);
    const rows = rowsByKey.get(key);
    if (!rows || namedKnowledgeBaseIds.has(base.id)) continue;
    namedKnowledgeBaseIds.add(base.id);
    groups.push({
      key,
      label: base.knowledgeBaseName || "未命名知识库",
      conversations: rows,
    });
  }
  for (const knowledgeBaseId of knowledgeBaseOrder) {
    if (namedKnowledgeBaseIds.has(knowledgeBaseId)) continue;
    const key = knowledgeBaseGroupKey(knowledgeBaseId);
    const rows = rowsByKey.get(key);
    if (!rows) continue;
    groups.push({ key, label: `知识库 ${knowledgeBaseId}`, conversations: rows });
  }

  const other = rowsByKey.get(OTHER_CONVERSATIONS_KEY);
  if (other) groups.push({ key: OTHER_CONVERSATIONS_KEY, label: "其他会话", conversations: other });
  const all = rowsByKey.get(ALL_KNOWLEDGE_BASES_KEY);
  if (all) {
    groups.push({ key: ALL_KNOWLEDGE_BASES_KEY, label: "全部知识库", conversations: all });
  }
  return groups;
}
