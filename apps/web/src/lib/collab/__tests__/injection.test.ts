import {
  COLLAB_INJECT_ORIGIN,
  COLLAB_META_KEY,
  COLLAB_SAVED_VERSION_KEY,
  COLLAB_SEEDED_KEY,
  collabMeta,
  readSavedVersion,
  shouldInject,
  writeSavedVersion,
} from "@/lib/collab/injection";
import { describe, expect, it } from "vitest";
import * as Y from "yjs";

/** 真值表：五条前置条件里任意一条不成立都不注入。 */
describe("shouldInject 真值表", () => {
  const base = {
    synced: true,
    isEmpty: true,
    seeded: undefined,
    peerClientIds: [7],
    selfClientId: 7,
  };

  it("全部成立才注入", () => {
    expect(shouldInject(base)).toBe(true);
    expect(shouldInject({ ...base, seeded: false })).toBe(true);
  });

  it("未完成同步不注入（此刻的「空」不是真的空）", () => {
    expect(shouldInject({ ...base, synced: false })).toBe(false);
  });

  it("文档非空不注入", () => {
    expect(shouldInject({ ...base, isEmpty: false })).toBe(false);
  });

  it("已被别人 seeded 就不注入（带本地状态重连的客户端走这条）", () => {
    expect(shouldInject({ ...base, seeded: true })).toBe(false);
  });

  it("awareness 里不止我一个就不注入", () => {
    expect(shouldInject({ ...base, peerClientIds: [7, 8] })).toBe(false);
    expect(shouldInject({ ...base, peerClientIds: [8] })).toBe(false);
  });

  it("awareness 为空（还没看到自己）同样不注入", () => {
    expect(shouldInject({ ...base, peerClientIds: [] })).toBe(false);
  });

  it("只有自己但不是第一个 clientID 时也不注入（顺序无关，按集合判定）", () => {
    expect(shouldInject({ ...base, peerClientIds: [7], selfClientId: 7 })).toBe(true);
    expect(shouldInject({ ...base, peerClientIds: [7], selfClientId: 8 })).toBe(false);
  });
});

describe("共享 meta", () => {
  it("meta 是 Y.Map('meta')，随文档走", () => {
    const doc = new Y.Doc();
    expect(collabMeta(doc)).toBe(doc.getMap(COLLAB_META_KEY));
  });

  it("savedVersion 默认没有；写入后可读回", () => {
    const doc = new Y.Doc();
    expect(readSavedVersion(doc)).toBeNull();

    writeSavedVersion(doc, "1758297600000");

    expect(readSavedVersion(doc)).toBe("1758297600000");
    expect(collabMeta(doc).get(COLLAB_SAVED_VERSION_KEY)).toBe("1758297600000");
  });

  it("savedVersion 非法值一律当没有（空串 / 数字）", () => {
    const doc = new Y.Doc();
    writeSavedVersion(doc, "");
    expect(readSavedVersion(doc)).toBeNull();
    collabMeta(doc).set(COLLAB_SAVED_VERSION_KEY, 42);
    expect(readSavedVersion(doc)).toBeNull();
  });

  it("注入 origin 是独特的 Symbol，可用于过滤保存排队", () => {
    expect(typeof COLLAB_INJECT_ORIGIN).toBe("symbol");
  });

  it("savedVersion 的变化能被其他端观察到（同步靠 Y.Map）", () => {
    const a = new Y.Doc();
    const b = new Y.Doc();
    Y.applyUpdate(a, Y.encodeStateAsUpdate(b));
    Y.applyUpdate(b, Y.encodeStateAsUpdate(a));

    writeSavedVersion(a, "1");
    Y.applyUpdate(b, Y.encodeStateAsUpdate(a));

    expect(readSavedVersion(b)).toBe("1");
    expect(collabMeta(a).get(COLLAB_SEEDED_KEY)).toBeUndefined();
  });
});
