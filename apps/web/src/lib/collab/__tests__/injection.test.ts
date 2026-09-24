import {
  COLLAB_INJECT_ORIGIN,
  COLLAB_META_KEY,
  COLLAB_META_ORIGIN,
  COLLAB_SAVED_VERSION_KEY,
  COLLAB_SEEDED_KEY,
  collabMeta,
  electInjector,
  isCollabInternalOrigin,
  readSavedVersion,
  shouldInject,
  writeSavedVersion,
} from "@/lib/collab/injection";
import { describe, expect, it } from "vitest";
import * as Y from "yjs";

/** 真值表：四条前置条件里任意一条不成立都不注入。 */
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

  /**
   * 回归：两端同时首连时**必须有人注入**。
   *
   * 旧规则是「awareness 里只有我」，两端互见即双双让路，房间永远停在空态——
   * 两边都显示空白正文，用户一打字就把库里的正文覆盖掉。实测第二端在 1 秒内
   * 进来就会触发（含同一用户开两个标签页）。
   */
  it("两端同时在场时，clientID 小的那个注入、另一个让路", () => {
    const together = { ...base, peerClientIds: [7, 8] };
    expect(shouldInject({ ...together, selfClientId: 7 })).toBe(true);
    expect(shouldInject({ ...together, selfClientId: 8 })).toBe(false);
  });

  it("三端同时在场也只选出一个", () => {
    const ids = [12, 5, 9];
    const elected = ids.filter((id) =>
      shouldInject({ ...base, peerClientIds: ids, selfClientId: id }),
    );
    expect(elected).toEqual([5]);
  });

  it("awareness 还没回灌自己的状态时，按「只有我」处理而不是袖手旁观", () => {
    expect(shouldInject({ ...base, peerClientIds: [], selfClientId: 7 })).toBe(true);
  });

  it("awareness 里只有别人（自己的状态未到）时让给更小的那个", () => {
    expect(shouldInject({ ...base, peerClientIds: [3], selfClientId: 7 })).toBe(false);
    expect(shouldInject({ ...base, peerClientIds: [9], selfClientId: 7 })).toBe(true);
  });
});

describe("electInjector", () => {
  it("把自己并进候选集后取最小 clientID", () => {
    expect(electInjector([7, 8], 8)).toBe(7);
    expect(electInjector([], 8)).toBe(8);
    expect(electInjector([9, 10], 8)).toBe(8);
  });

  it("结论与顺序无关（各端看到的 awareness 顺序可能不同）", () => {
    expect(electInjector([3, 1, 2], 4)).toBe(1);
    expect(electInjector([2, 3, 1], 4)).toBe(1);
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

  /**
   * 回归：写 meta 不是正文编辑，不该被当成一次本地改动。
   *
   * 从前它没有 origin，于是「保存成功 → 写 meta → 又排一次保存」，每个编辑批次
   * 固定多一个来回；而这条多余的保存又恰好补上了另一个缺陷（origin 回调取到的
   * 正文落后一次击键），两个错凑成一个对。修一个就必须同时修另一个。
   */
  it("savedVersion 的写入带 META origin，可被保存排队过滤掉", () => {
    const doc = new Y.Doc();
    const origins: unknown[] = [];
    doc.on("update", (_update: Uint8Array, origin: unknown) => origins.push(origin));

    writeSavedVersion(doc, "1758297600000");

    expect(origins).toEqual([COLLAB_META_ORIGIN]);
    expect(origins.every(isCollabInternalOrigin)).toBe(true);
  });

  it("注入与 meta 的 origin 都算「协同运行时自己写的」，其余一律算本地编辑", () => {
    expect(isCollabInternalOrigin(COLLAB_INJECT_ORIGIN)).toBe(true);
    expect(isCollabInternalOrigin(COLLAB_META_ORIGIN)).toBe(true);
    expect(isCollabInternalOrigin(null)).toBe(false);
    expect(isCollabInternalOrigin(Symbol("别处"))).toBe(false);
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
