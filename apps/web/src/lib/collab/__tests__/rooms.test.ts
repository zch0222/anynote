import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  COLLAB_NOTE_ID_MAX_LENGTH,
  COLLAB_NOTE_ID_PATTERN,
  COLLAB_ROOM_PREFIX,
  collabNoteRoom,
  isCollabNoteRoom,
  parseCollabRoom,
} from "@/lib/collab/rooms";
import { describe, expect, it } from "vitest";

describe("房间命名契约（前端侧）", () => {
  it("前缀与 noteId 规则跟目标态一致", () => {
    expect(COLLAB_ROOM_PREFIX).toBe("note:");
    expect(parseCollabRoom("note:42")).toEqual({ kind: "note", noteId: 42 });
    expect(collabNoteRoom(42)).toBe("note:42");
    expect(isCollabNoteRoom("note:42")).toBe(true);
  });

  it("拒绝 0、前导零、负数、小数、空值与超长数字", () => {
    for (const name of [
      "note:0",
      "note:00",
      "note:01",
      "note:-1",
      "note:+1",
      "note:1.5",
      "note:",
      "note:1:2",
      `note:${"9".repeat(20)}`,
    ]) {
      expect(parseCollabRoom(name)).toBeNull();
      expect(isCollabNoteRoom(name)).toBe(false);
    }
  });

  it("拒绝已退役的 index / doc:<uuid> 契约与路径穿越值", () => {
    for (const name of [
      "index",
      "doc:abcdefgh",
      "doc:0198f2b1-7c5a-4d6e-9a11-2f3c4d5e6f70",
      "note:../etc/passwd",
      "note:1/2",
      "note:1\\2",
      "note: 1",
    ]) {
      expect(parseCollabRoom(name)).toBeNull();
    }
  });

  it("超出安全整数范围被拒", () => {
    expect(parseCollabRoom("note:9007199254740992")).toBeNull();
    expect(parseCollabRoom("note:9007199254740991")).not.toBeNull();
  });
});

/**
 * 对拍测试：直接读服务端源文件，比对三处必须逐字一致的字面量。
 *
 * 两侧各自维护一份契约是刻意的（服务端不能 import 前端源码），代价是容易改一边忘一边；
 * 这条用例把这个代价压到「CI 立刻红」，而不是「线上连不上、只在协同日志里看到 400」。
 */
describe("与服务端 apps/collab/src/rooms.ts 对拍", () => {
  const serverSource = readFileSync(join(process.cwd(), "..", "collab", "src", "rooms.ts"), "utf8");

  it("前缀一致", () => {
    expect(serverSource).toContain(`name.startsWith("${COLLAB_ROOM_PREFIX}")`);
    expect(serverSource).toContain(`name.slice("${COLLAB_ROOM_PREFIX}".length)`);
  });

  it("noteId 正则与长度上限一致", () => {
    expect(serverSource).toContain(COLLAB_NOTE_ID_PATTERN.source);
    expect(serverSource).toContain(`const MAX_NOTE_ID_LENGTH = ${COLLAB_NOTE_ID_MAX_LENGTH};`);
  });

  it("两处都做安全整数校验", () => {
    expect(serverSource).toContain("Number.isSafeInteger(noteId)");
  });
});
