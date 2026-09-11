import {
  COLLAB_INDEX_ROOM,
  collabDocRoom,
  createCollabDocId,
  isCollabDocId,
} from "@/lib/collab/rooms";
import { describe, expect, it } from "vitest";

describe("房间命名契约", () => {
  it("索引房间名与服务端一致", () => {
    expect(COLLAB_INDEX_ROOM).toBe("index");
  });

  it("文档房间名是 doc: 前缀", () => {
    expect(collabDocRoom("abcdefgh")).toBe("doc:abcdefgh");
  });

  it("接受 8~64 位 URL 安全字符", () => {
    expect(isCollabDocId("abcdefgh")).toBe(true);
    expect(isCollabDocId("a".repeat(64))).toBe(true);
    expect(isCollabDocId("abc-_123")).toBe(true);
  });

  it("拒绝过短、过长与含路径分隔符的 id（与服务端同一套规则）", () => {
    for (const id of ["abc", "a".repeat(65), "../etc", "a/b", "a\b", "a b", "", "a.b"]) {
      expect(isCollabDocId(id)).toBe(false);
    }
  });

  it("createCollabDocId 产出的 id 必然合法且不重复", () => {
    const ids = Array.from({ length: 20 }, () => createCollabDocId());
    for (const id of ids) expect(isCollabDocId(id)).toBe(true);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
