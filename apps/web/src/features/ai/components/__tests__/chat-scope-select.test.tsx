import { selectThemedOption } from "@/test/select";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("../../use-chat-scope", () => ({
  useChatKnowledgeBasesQuery: () => ({
    isSuccess: true,
    data: [{ id: 3, knowledgeBaseName: "课程库" }],
  }),
}));
import { ChatScopeSelect } from "../chat-scope-select";

/**
 * 范围交互测试。
 *
 * @author 称霸幼儿园
 */
describe("ChatScopeSelect", () => {
  /** 指定库与全部范围使用明确的请求结构。 */
  it("用语义主题弹层支持单库和全部范围，运行期间禁用", async () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <ChatScopeSelect
        scope={{ knowledgeBaseIds: [], refs: [] }}
        disabled={false}
        onChange={onChange}
      />,
    );
    const trigger = screen.getByRole("combobox", { name: "检索范围" });
    expect(trigger).toHaveTextContent("全部知识库");
    await selectThemedOption(trigger, "课程库");
    expect(onChange).toHaveBeenLastCalledWith({ knowledgeBaseIds: [3], refs: [] });
    await selectThemedOption(trigger, "全部知识库");
    expect(onChange).toHaveBeenLastCalledWith({ knowledgeBaseIds: [], refs: [] });
    rerender(
      <ChatScopeSelect scope={{ knowledgeBaseIds: [3], refs: [] }} disabled onChange={onChange} />,
    );
    expect(screen.getByLabelText("检索范围")).toBeDisabled();
  });
});
