import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  MAX_SURFACES,
  loadSidePanelState,
  saveSidePanelState,
  serializeSurface,
} from "../persistence";
import { clearSidePanelStorage, sidePanelStorageKey } from "../storage-keys";
import { emptySurface } from "../store";
import { type SurfaceState, type TabId, asTabId } from "../types";

/**
 * 侧栏持久化测试。
 *
 * @author 称霸幼儿园
 */
const USER = 7;

function noteSurface(id = 5, touchedAt = 100): SurfaceState {
  const surface = emptySurface();
  surface.open = true;
  surface.maximized = true;
  surface.tabs = [
    {
      id: asTabId("t1"),
      kind: "note",
      family: "resource",
      ref: { type: "note", id, kbId: 3 },
    },
  ];
  surface.activeId = asTabId("t1");
  surface.recent = [asTabId("t1")];
  surface.seq = 1;
  surface.navigation = { t1: { locator: { section: "第一章" }, revision: 3 } };
  surface.hints = { t1: { title: "复习笔记", kbName: "复习库" } };
  surface.touchedAt = touchedAt;
  return surface;
}

function storedSurface(tabs: Array<{ id: string; kind: string; ref: unknown }>) {
  return {
    open: true,
    activeId: tabs[0]?.id ?? null,
    tabs,
    recent: tabs[0] ? [tabs[0].id] : [],
    seq: tabs.length,
    touchedAt: 1,
  };
}

beforeEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("侧栏持久化", () => {
  /** 键带用户 id，往返后保留标识，丢弃标题、定位与最大化。 */
  it("按用户写入并恢复标识", () => {
    saveSidePanelState(USER, { "chat:c1": noteSurface() });
    const raw = localStorage.getItem(sidePanelStorageKey(USER));
    expect(raw).not.toBeNull();
    expect(raw).not.toContain("复习笔记");
    expect(raw).not.toContain("复习库");
    expect(raw).not.toContain("第一章");
    expect(raw).not.toContain("maximized");
    expect(raw).not.toContain("navigation");
    expect(raw).not.toContain("hints");

    const loaded = loadSidePanelState(USER);
    expect(loaded?.["chat:c1"]?.tabs).toEqual(noteSurface().tabs);
    expect(loaded?.["chat:c1"]?.maximized).toBe(false);
    expect(loaded?.["chat:c1"]?.navigation).toEqual({});
    expect(loaded?.["chat:c1"]?.hints).toEqual({});
  });

  /** 损坏 JSON、结构不符与版本不符都只删除该用户的键。 */
  it("校验失败时删除该用户的键", () => {
    const key = sidePanelStorageKey(USER);
    localStorage.setItem(key, "{");
    expect(loadSidePanelState(USER)).toBeNull();
    expect(localStorage.getItem(key)).toBeNull();

    localStorage.setItem(
      key,
      JSON.stringify({
        version: 1,
        surfaces: {
          "chat:c1": {
            open: true,
            activeId: "t1",
            tabs: [{ id: "t1", kind: "note", ref: { type: "note", id: 0, kbId: 3 } }],
            recent: ["t1"],
            seq: 1,
            touchedAt: 1,
          },
        },
      }),
    );
    expect(loadSidePanelState(USER)).toBeNull();
    expect(localStorage.getItem(key)).toBeNull();

    localStorage.setItem(key, JSON.stringify({ version: 2, surfaces: {} }));
    expect(loadSidePanelState(USER)).toBeNull();
    expect(localStorage.getItem(key)).toBeNull();
  });

  /** 超过 50 个会话分区时按 touchedAt 淘汰最旧的。 */
  it("淘汰超出上限的分区", () => {
    const surfaces: Record<string, SurfaceState> = {};
    for (let index = 1; index <= MAX_SURFACES + 1; index += 1) {
      surfaces[`chat:c${index}`] = noteSurface(index, index);
    }
    saveSidePanelState(USER, surfaces);
    const loaded = loadSidePanelState(USER);
    expect(Object.keys(loaded ?? {})).toHaveLength(MAX_SURFACES);
    expect(loaded?.["chat:c1"]).toBeUndefined();
    expect(loaded?.[`chat:c${MAX_SURFACES + 1}`]).toBeDefined();
  });

  /** 存储配额或隐私模式抛错时不影响内存状态。 */
  it("写入失败不抛出", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("quota");
    });
    expect(() => saveSidePanelState(USER, { "chat:c1": noteSurface() })).not.toThrow();
  });

  /** 只写拿到会话 id 的 chat:c<正整数> 分区，新会话与非法键都不写。 */
  it("只写拿到会话 id 的分区", () => {
    saveSidePanelState(USER, {
      "chat:new": noteSurface(1),
      "chat:new:kb3": noteSurface(2),
      "chat:c0": noteSurface(3),
      "chat:c12": noteSurface(4),
    });
    const raw = localStorage.getItem(sidePanelStorageKey(USER)) ?? "";
    expect(raw).toContain("chat:c12");
    expect(raw).not.toContain("chat:new");
    expect(raw).not.toContain("chat:c0");
    expect(Object.keys(loadSidePanelState(USER) ?? {})).toEqual(["chat:c12"]);
  });

  /** 读取时忽略旧版本写入的 chat:new* 分区。 */
  it("读取时忽略新会话分区", () => {
    const key = sidePanelStorageKey(USER);
    localStorage.setItem(
      key,
      JSON.stringify({
        version: 1,
        surfaces: {
          "chat:new": storedSurface([
            { id: "t1", kind: "note", ref: { type: "note", id: 5, kbId: 3 } },
          ]),
          "chat:c1": storedSurface([
            { id: "t1", kind: "note", ref: { type: "note", id: 6, kbId: 3 } },
          ]),
        },
      }),
    );
    const loaded = loadSidePanelState(USER);
    expect(loaded?.["chat:new"]).toBeUndefined();
    expect(loaded?.["chat:c1"]).toBeDefined();

    localStorage.setItem(
      key,
      JSON.stringify({
        version: 1,
        surfaces: {
          "chat:new": storedSurface([
            { id: "t1", kind: "note", ref: { type: "note", id: 5, kbId: 3 } },
          ]),
        },
      }),
    );
    expect(loadSidePanelState(USER)).toBeNull();
  });

  /** 未注册的 kind、kind 与 ref.type 不一致、标签 id 重复都删除该用户的键。 */
  it("恢复时校验标签类型与唯一性", () => {
    const key = sidePanelStorageKey(USER);
    const invalidTabs = [
      [{ id: "t1", kind: "summary", ref: { type: "note", id: 5, kbId: 3 } }],
      [{ id: "t1", kind: "doc", ref: { type: "note", id: 5, kbId: 3 } }],
      [
        { id: "t1", kind: "note", ref: { type: "note", id: 5, kbId: 3 } },
        { id: "t1", kind: "note", ref: { type: "note", id: 6, kbId: 3 } },
      ],
    ];
    for (const tabs of invalidTabs) {
      localStorage.setItem(
        key,
        JSON.stringify({ version: 1, surfaces: { "chat:c1": storedSurface(tabs) } }),
      );
      expect(loadSidePanelState(USER)).toBeNull();
      expect(localStorage.getItem(key)).toBeNull();
    }
  });

  /** 只写 chat 分区，页面类标签不写。 */
  it("只写会话分区与资源标签", () => {
    const withPage = noteSurface();
    withPage.tabs = [
      ...withPage.tabs,
      { id: asTabId("t2"), kind: "summary", family: "page", contentId: "c1" },
    ];
    withPage.seq = 2;
    saveSidePanelState(USER, { "chat:c1": withPage, "pdf:doc:3": noteSurface(9) });
    const raw = localStorage.getItem(sidePanelStorageKey(USER)) ?? "";
    expect(raw).toContain("chat:c1");
    expect(raw).not.toContain("pdf:doc:3");
    expect(raw).not.toContain("summary");
    expect(serializeSurface(withPage).tabs).toHaveLength(1);
  });

  /** 没有用户 id 时不读不写。 */
  it("没有用户 id 时不读不写", () => {
    expect(loadSidePanelState(0)).toBeNull();
    saveSidePanelState(0, { "chat:c1": noteSurface() });
    expect(localStorage.length).toBe(0);
  });

  /** 登出删除全部侧栏键，保留其他本地数据。 */
  it("登出清理全部侧栏键", () => {
    localStorage.setItem(sidePanelStorageKey(1), "{}");
    localStorage.setItem(sidePanelStorageKey(2), "{}");
    localStorage.setItem("anynote-ui", "{}");
    clearSidePanelStorage();
    expect(localStorage.getItem(sidePanelStorageKey(1))).toBeNull();
    expect(localStorage.getItem(sidePanelStorageKey(2))).toBeNull();
    expect(localStorage.getItem("anynote-ui")).toBe("{}");
  });

  /** 活动标签指向被丢弃的页面标签时回退到最后一个资源标签。 */
  it("回退失效的活动标签", () => {
    const surface = noteSurface();
    surface.tabs = [
      {
        id: asTabId("t1"),
        kind: "note",
        family: "resource",
        ref: { type: "note", id: 5, kbId: 3 },
      },
      { id: asTabId("t2"), kind: "summary", family: "page", contentId: "c1" },
    ];
    surface.activeId = "t2" as TabId;
    surface.seq = 2;
    expect(serializeSurface(surface).activeId).toBe("t1");
  });
});
