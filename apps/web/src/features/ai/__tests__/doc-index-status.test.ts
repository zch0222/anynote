import { describe, expect, it } from "vitest";
import { docIndexLabel, isDocIndexPending } from "../doc-index-status";
import { DOC_INDEXED, scopeDocId } from "../schemas";

/**
 * 资料索引枚举与轮询终态测试。
 *
 * @author 称霸幼儿园
 */
describe("资料索引状态", () => {
  /** PDF 历史会话继续使用单资料范围。 */
  it("识别恢复后的单资料会话", () => {
    expect(scopeDocId({ knowledgeBaseIds: [], refs: ["doc:7"] })).toBe(7);
    expect(scopeDocId({ knowledgeBaseIds: [3], refs: ["doc:7"] })).toBeUndefined();
    expect(scopeDocId({ knowledgeBaseIds: [], refs: ["note:7"] })).toBeUndefined();
  });
  /** 已索引值与后端 DocIndexStatus 保持一致。 */
  it("完整区分五种后端状态", () => {
    expect(DOC_INDEXED).toBe(0);
    expect([0, 1, 2, 3, 4, 99, null].map(docIndexLabel)).toEqual([
      "已索引",
      "索引构建中",
      "索引失败",
      "未索引",
      "无法提取文本",
      "状态未知",
      "状态未知",
    ]);
    expect([0, 1, 2, 3, 4, 99].map(isDocIndexPending)).toEqual([
      false,
      true,
      false,
      false,
      false,
      false,
    ]);
  });
});
