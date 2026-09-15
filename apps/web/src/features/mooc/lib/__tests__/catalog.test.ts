import { describe, expect, it, vi } from "vitest";
import { firstPlayable, isPlayable, nextPlayable } from "../catalog";

/**
 * 目录：
 *   1 第 1 章
 *   ├─ 11 视频 A
 *   └─ 12 文档 B
 *   2 第 2 章
 *   └─ 21 视频 C
 *   3 顶层视频 D
 */
const TREE: Record<number, Array<Record<string, unknown>>> = {
  0: [
    { id: 1, title: "第 1 章", moocItemType: 0 },
    { id: 2, title: "第 2 章", moocItemType: 0 },
    { id: 3, title: "顶层视频 D", moocItemType: 1, objectName: "d.mp4" },
  ],
  1: [
    { id: 11, title: "视频 A", moocItemType: 1, objectName: "a.mp4" },
    { id: 12, title: "文档 B", moocItemType: 2 },
  ],
  2: [{ id: 21, title: "视频 C", moocItemType: 1, objectName: "c.mp4" }],
  3: [],
};

function loader() {
  return vi.fn((parentId: number) => Promise.resolve((TREE[parentId] ?? []) as never));
}

describe("目录遍历", () => {
  it("章节不算可播放内容，视频与文档算", () => {
    expect(isPlayable({ id: 1, moocItemType: 0 })).toBe(false);
    expect(isPlayable({ id: 1, moocItemType: 1 })).toBe(true);
    expect(isPlayable({ id: 1, moocItemType: 2 })).toBe(true);
    expect(isPlayable({ id: 1, moocItemType: null })).toBe(false);
  });

  it("第一个可播放条目在最深的第一个章节里，并带出所属章节", async () => {
    const load = loader();
    const found = await firstPlayable(load);
    expect(found?.item.id).toBe(11);
    expect(found?.chapter?.id).toBe(1);
  });

  it("惰性遍历：找到第一个视频就停，不为后面的章节发请求", async () => {
    const load = loader();
    await firstPlayable(load);
    // 只取了顶层与第 1 章；第 2 章、第 3 章从未被请求
    expect(load.mock.calls.map((call) => call[0])).toEqual([0, 1]);
  });

  it("顶层直接是视频时，chapter 为 null", async () => {
    const load = vi.fn((parentId: number) =>
      Promise.resolve(
        (parentId === 0 ? [{ id: 3, title: "顶层视频 D", moocItemType: 1 }] : []) as never,
      ),
    );
    const found = await firstPlayable(load);
    expect(found?.item.id).toBe(3);
    expect(found?.chapter).toBeNull();
  });

  it("没有可播放内容时返回 null", async () => {
    const load = vi.fn(() => Promise.resolve([] as never));
    expect(await firstPlayable(load)).toBeNull();
  });

  it("下一节按目录顺序跨章节接上", async () => {
    const load = loader();
    // 视频 A → 同章的文档 B
    expect((await nextPlayable(load, 11))?.item.id).toBe(12);
    // 文档 B → 跨到第 2 章的视频 C
    expect((await nextPlayable(load, 12))?.item.id).toBe(21);
    // 视频 C → 跨到顶层的视频 D
    const last = await nextPlayable(load, 21);
    expect(last?.item.id).toBe(3);
    expect(last?.chapter).toBeNull();
  });

  it("最后一节没有下一节", async () => {
    const load = loader();
    expect(await nextPlayable(load, 3)).toBeNull();
  });

  it("当前条目是章节时，下一节是它内部第一个可播放条目", async () => {
    const load = loader();
    expect((await nextPlayable(load, 1))?.item.id).toBe(11);
  });

  it("当前条目不在目录里时返回 null（目录被改过，不瞎跳）", async () => {
    const load = loader();
    expect(await nextPlayable(load, 999)).toBeNull();
  });
});
