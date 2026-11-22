import { describe, expect, it } from "vitest";
import { groupConversations } from "../conversation-groups";
import type { Conversation } from "../schemas";

function conversation(id: number, scope?: Conversation["scope"]): Conversation {
  return { id, title: `会话 ${id}`, scope };
}

/**
 * 会话知识库分组规则测试。
 *
 * @author 称霸幼儿园
 */
describe("groupConversations", () => {
  /** 普通知识库按目录顺序排列，特殊会话与全部知识库依次置底。 */
  it("按范围归类并固定特殊分组顺序", () => {
    const groups = groupConversations(
      [
        conversation(1, { knowledgeBaseIds: [1], refs: [] }),
        conversation(2, { knowledgeBaseIds: [2], refs: [] }),
        conversation(3, { knowledgeBaseIds: [], refs: [] }),
        conversation(4, null),
        conversation(5, { knowledgeBaseIds: [1, 2], refs: [] }),
        conversation(6, { knowledgeBaseIds: [], refs: ["doc:9"] }),
        conversation(7, { knowledgeBaseIds: [1], refs: [] }),
        conversation(8, { knowledgeBaseIds: [1], refs: ["doc:9"] }),
      ],
      [
        { id: 2, knowledgeBaseName: "知识库二" },
        { id: 1, knowledgeBaseName: "知识库一" },
      ],
    );

    expect(groups.map((group) => group.key)).toEqual(["kb:2", "kb:1", "other", "all"]);
    expect(groups.map((group) => group.label)).toEqual([
      "知识库二",
      "知识库一",
      "其他会话",
      "全部知识库",
    ]);
    expect(groups[1]?.conversations.map((row) => row.id)).toEqual([1, 7]);
    expect(groups[2]?.conversations.map((row) => row.id)).toEqual([5, 6, 8]);
    expect(groups[3]?.conversations.map((row) => row.id)).toEqual([3, 4]);
  });

  /** 空知识库不产生分组，未命名和不可见知识库使用约定名称。 */
  it("忽略空分组并解析知识库展示名称", () => {
    const groups = groupConversations(
      [
        conversation(1, { knowledgeBaseIds: [1], refs: [] }),
        conversation(2, { knowledgeBaseIds: [99], refs: [] }),
      ],
      [
        { id: 1, knowledgeBaseName: null },
        { id: 2, knowledgeBaseName: "没有会话的知识库" },
      ],
    );

    expect(groups.map((group) => [group.key, group.label])).toEqual([
      ["kb:1", "未命名知识库"],
      ["kb:99", "知识库 99"],
    ]);
  });
});
