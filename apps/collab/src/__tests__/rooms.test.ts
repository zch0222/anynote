import { describe, expect, it } from "vitest";
import { docRoomName, parseHandshake, parseRoom, roomName } from "../rooms.ts";

const docId = "0198f2b1-7c5a-4d6e-9a11-2f3c4d5e6f70".replace(/-/g, "");

describe("parseRoom", () => {
  it("识别索引房间与文档房间", () => {
    expect(parseRoom("index")).toEqual({ kind: "index" });
    expect(parseRoom(`doc:${docId}`)).toEqual({ kind: "doc", docId });
  });

  it("拒绝未知前缀与空房间名", () => {
    for (const name of ["", "doc", "note:1", "index/", "doc:"]) {
      expect(parseRoom(name)).toBeNull();
    }
  });

  it("拒绝带路径分隔符或 .. 的文档 id（防目录穿越）", () => {
    for (const id of ["../../etc/passwd", "a/b", "a\b", "..", "%2e%2e"]) {
      expect(parseRoom(`doc:${id}`)).toBeNull();
    }
  });

  it("拒绝过短或过长的文档 id", () => {
    expect(parseRoom("doc:abc")).toBeNull();
    expect(parseRoom(`doc:${"a".repeat(65)}`)).toBeNull();
    expect(parseRoom(`doc:${"a".repeat(64)}`)).toEqual({ kind: "doc", docId: "a".repeat(64) });
  });

  it("roomName 是 parseRoom 的逆运算", () => {
    for (const name of ["index", docRoomName(docId)]) {
      const parsed = parseRoom(name);
      expect(parsed).not.toBeNull();
      expect(roomName(parsed as NonNullable<typeof parsed>)).toBe(name);
    }
  });
});

describe("parseHandshake", () => {
  it("从 URL 取出房间与令牌", () => {
    expect(parseHandshake(`/doc:${docId}?token=abc`)).toEqual({
      room: { kind: "doc", docId },
      token: "abc",
    });
    expect(parseHandshake("/index?token=abc")).toEqual({ room: { kind: "index" }, token: "abc" });
  });

  it("房间名经过 URL 编码时同样能解析", () => {
    expect(parseHandshake(`/doc%3A${docId}?token=abc`)).toEqual({
      room: { kind: "doc", docId },
      token: "abc",
    });
  });

  it("缺令牌、缺房间或 URL 非法时返回 null", () => {
    expect(parseHandshake(undefined)).toBeNull();
    expect(parseHandshake(`/doc:${docId}`)).toBeNull();
    expect(parseHandshake("/?token=abc")).toBeNull();
    expect(parseHandshake("/unknown-room?token=abc")).toBeNull();
  });

  it("没有前导斜杠时同样能解析，畸形 URL 返回 null", () => {
    expect(parseHandshake("index?token=abc")?.room).toEqual({ kind: "index" });
    // '//' 会被当成 protocol-relative 写法，缺 host 的 http URL 直接解析失败
    expect(parseHandshake("///index?token=abc")).toBeNull();
  });
});
