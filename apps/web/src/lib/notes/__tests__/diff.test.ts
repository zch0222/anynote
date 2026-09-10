import { describe, expect, it } from "vitest";
import { diffLines, summarizeDiff } from "../diff";

describe("diffLines", () => {
  it("两份相同内容全部标记为 equal", () => {
    const lines = diffLines("第一行\n第二行", "第一行\n第二行");
    expect(lines).toEqual([
      { op: "equal", text: "第一行" },
      { op: "equal", text: "第二行" },
    ]);
  });

  it("空字符串与空字符串没有差异", () => {
    expect(diffLines("", "")).toEqual([]);
  });

  it("空串与非空串差异全部算一侧独有", () => {
    expect(diffLines("", "新增行")).toEqual([{ op: "added", text: "新增行" }]);
    expect(diffLines("本地行", "")).toEqual([{ op: "removed", text: "本地行" }]);
  });

  it("纯新增：服务端多出的行标为 added", () => {
    const lines = diffLines("公共", "公共\n服务端新增");
    expect(lines).toEqual([
      { op: "equal", text: "公共" },
      { op: "added", text: "服务端新增" },
    ]);
  });

  it("纯删除：本地独有的行标为 removed", () => {
    const lines = diffLines("公共\n本地未保存", "公共");
    expect(lines).toEqual([
      { op: "equal", text: "公共" },
      { op: "removed", text: "本地未保存" },
    ]);
  });

  it("混合修改：按最长公共子序列对齐", () => {
    const lines = diffLines("a\n本地改\nb", "a\n服务端改\nb");
    expect(lines).toEqual([
      { op: "equal", text: "a" },
      { op: "removed", text: "本地改" },
      { op: "added", text: "服务端改" },
      { op: "equal", text: "b" },
    ]);
  });

  it("CRLF 与 LF 视为同一行", () => {
    const lines = diffLines("a\r\nb", "a\nb");
    expect(lines).toEqual([
      { op: "equal", text: "a" },
      { op: "equal", text: "b" },
    ]);
  });
});

describe("summarizeDiff", () => {
  it("分别统计新增与删除行数", () => {
    const summary = summarizeDiff([
      { op: "equal", text: "a" },
      { op: "removed", text: "b" },
      { op: "added", text: "c" },
      { op: "added", text: "d" },
    ]);
    expect(summary).toEqual({ added: 2, removed: 1 });
  });

  it("无差异时计数为 0", () => {
    expect(summarizeDiff([])).toEqual({ added: 0, removed: 0 });
  });
});
