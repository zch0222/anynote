import { describe, expect, it } from "vitest";
import { type BaseScopeSource, selectBases } from "../knowledge-base-gallery";

const base = (id: number, name = `库 ${id}`) => ({ id, knowledgeBaseName: name });

/**
 * 三个分段对应三个**不同口径**的后端查询，不是同一份数据的本地切片。
 * 这些用例钉住的是"哪个分段读哪一份数据、以及去重规则"。
 */
describe("知识库画廊分段筛选", () => {
  const source: BaseScopeSource = {
    mine: [base(1, "我参与的 A"), base(2, "我参与的 B"), base(3, "我参与的 C")],
    managed: [base(2, "我管理的 B")],
    organization: [base(9, "组织库 X"), base(2, "组织里的 B")],
  };

  it("全部 = 我参与的 ∪ 组织库", () => {
    const result = selectBases("all", source);
    expect(result.map((item) => item.id)).toEqual([1, 2, 3, 9]);
  });

  it("我的 = 我管理的，不掺组织库", () => {
    const result = selectBases("mine", source);
    expect(result.map((item) => item.id)).toEqual([2]);
  });

  it("组织 = 组织库，不掺普通库", () => {
    const result = selectBases("organization", source);
    expect(result.map((item) => item.id)).toEqual([9, 2]);
  });

  it("同时出现在两个来源的库只出现一次", () => {
    const all = selectBases("all", source);
    expect(all.filter((item) => item.id === 2)).toHaveLength(1);
    // 去重保留先出现的那份（普通库），名称也随之保留
    expect(all.find((item) => item.id === 2)?.knowledgeBaseName).toBe("我参与的 B");
  });

  it("空数据不炸，返回空数组", () => {
    const empty: BaseScopeSource = { mine: [], managed: [], organization: [] };
    for (const scope of ["all", "mine", "organization"] as const) {
      expect(selectBases(scope, empty)).toEqual([]);
    }
  });

  it("保持后端返回的顺序（后端已按 update_time desc 排过）", () => {
    const ordered: BaseScopeSource = {
      mine: [base(30), base(10), base(20)],
      managed: [],
      organization: [],
    };
    expect(selectBases("all", ordered).map((item) => item.id)).toEqual([30, 10, 20]);
  });
});
