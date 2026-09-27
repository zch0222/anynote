import { describe, expect, it } from "vitest";
import { noteRoomName, parseHandshake, parseLineage, parseRoom, roomName } from "../rooms.ts";

describe("parseRoom", () => {
  it("只认 note:<正整数>", () => {
    expect(parseRoom("note:1")).toEqual({ kind: "note", noteId: 1 });
    expect(parseRoom("note:1234567890")).toEqual({ kind: "note", noteId: 1234567890 });
    expect(parseRoom("note:9007199254740991")).toEqual({
      kind: "note",
      noteId: 9007199254740991,
    });
  });

  it("拒绝已退役的 index / doc:<uuid> 契约（方案 §8，无过渡期）", () => {
    for (const name of [
      "index",
      "index/",
      "doc:abcdefgh",
      "doc:0198f2b1-7c5a-4d6e-9a11-2f3c4d5e6f70",
      "docs",
    ]) {
      expect(parseRoom(name)).toBeNull();
    }
  });

  it("拒绝 0、前导零、负号、正号与小数", () => {
    for (const name of [
      "note:0",
      "note:00",
      "note:01",
      "note:007",
      "note:-1",
      "note:+1",
      "note:1.5",
    ]) {
      expect(parseRoom(name)).toBeNull();
    }
  });

  it("拒绝空 noteId、缺前缀与超长数字", () => {
    for (const name of ["", "note:", "note", ":", "note:1:2", `note:${"9".repeat(20)}`]) {
      expect(parseRoom(name)).toBeNull();
    }
  });

  it("拒绝带路径分隔符或 .. 的值（防目录穿越）", () => {
    for (const raw of ["../etc/passwd", "1/../2", "1/2", "%2e%2e", "1\\2", "1 ", " 1"]) {
      expect(parseRoom(`note:${raw}`)).toBeNull();
    }
  });

  it("超出安全整数范围的 noteId 被拒", () => {
    // 2^53 已不是安全整数（Number 会把它舍成 9007199254740992），必须挡在门外
    expect(parseRoom("note:9007199254740992")).toBeNull();
  });

  it("roomName 是 parseRoom 的逆运算", () => {
    for (const name of ["note:1", "note:42", "note:9007199254740991"]) {
      const parsed = parseRoom(name);
      expect(parsed).not.toBeNull();
      expect(roomName(parsed as NonNullable<typeof parsed>)).toBe(name);
    }
  });

  it("noteRoomName 直接产出规范房间名", () => {
    expect(noteRoomName(42)).toBe("note:42");
  });
});

describe("parseHandshake", () => {
  it("从 URL 取出房间与令牌；没有版本与谱系参数时分别为 null 与 unknown", () => {
    expect(parseHandshake("/note:42?token=abc")).toEqual({
      room: { kind: "note", noteId: 42 },
      token: "abc",
      editorVersion: null,
      lineage: { kind: "unknown" },
    });
  });

  it("房间名经过 URL 编码时同样能解析", () => {
    expect(parseHandshake("/note%3A42?token=abc")).toMatchObject({
      room: { kind: "note", noteId: 42 },
      token: "abc",
    });
  });

  it("取出编辑器版本与谱系参数", () => {
    const epoch = "7d4f0c9e-1b2a-4c3d-8e9f-0a1b2c3d4e5f";
    expect(
      parseHandshake(
        `/note:42?token=abc&editorVersion=3&lineage=${encodeURIComponent(`epoch:${epoch}`)}`,
      ),
    ).toMatchObject({ editorVersion: 3, lineage: { kind: "epoch", epoch } });
    expect(parseHandshake("/note:42?token=abc&lineage=fresh")).toMatchObject({
      lineage: { kind: "fresh" },
    });
  });

  it("非法的编辑器版本视为缺失", () => {
    expect(parseHandshake("/note:42?token=abc&editorVersion=v1")).toMatchObject({
      editorVersion: null,
    });
    expect(parseHandshake("/note:42?token=abc&editorVersion=-1")).toMatchObject({
      editorVersion: null,
    });
  });

  it("缺令牌、缺房间、旧房间名或 URL 非法时返回 null", () => {
    expect(parseHandshake(undefined)).toBeNull();
    expect(parseHandshake("/note:42")).toBeNull();
    expect(parseHandshake("/?token=abc")).toBeNull();
    expect(parseHandshake("/index?token=abc")).toBeNull();
    expect(parseHandshake("/doc:abcdefgh?token=abc")).toBeNull();
    expect(parseHandshake("/note:0?token=abc")).toBeNull();
  });

  it("没有前导斜杠时的行为与 URL 解析器一致，畸形 URL 返回 null", () => {
    // 注意：`note:42` 无前导斜杠时会被 URL 解析器当成 scheme（`note:`）而不是路径，
    // 结果 pathname 是 "42" 而非 "note:42"。真实客户端永远以 `/` 开头，
    // 这里只钉住「不会误解出房间」，不额外发明一套规则。
    expect(parseHandshake("note:42?token=abc")).toBeNull();
    // '//' 会被当成 protocol-relative 写法，缺 host 的 http URL 直接解析失败
    expect(parseHandshake("///note:42?token=abc")).toBeNull();
  });
});

describe("parseLineage", () => {
  it("fresh 与合法的 epoch:<uuid> 原样解析", () => {
    expect(parseLineage("fresh")).toEqual({ kind: "fresh" });
    expect(parseLineage("epoch:7d4f0c9e-1b2a-4c3d-8e9f-0a1b2c3d4e5f")).toEqual({
      kind: "epoch",
      epoch: "7d4f0c9e-1b2a-4c3d-8e9f-0a1b2c3d4e5f",
    });
  });

  it("缺失、unknown、格式不对的 epoch 一律视为 unknown", () => {
    expect(parseLineage(null)).toEqual({ kind: "unknown" });
    expect(parseLineage("unknown")).toEqual({ kind: "unknown" });
    expect(parseLineage("epoch:not-a-uuid")).toEqual({ kind: "unknown" });
    expect(parseLineage("epoch:7D4F0C9E-1B2A-4C3D-8E9F-0A1B2C3D4E5F")).toEqual({ kind: "unknown" });
  });
});
