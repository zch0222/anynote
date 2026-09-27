import { beforeEach, describe, expect, it } from "vitest";
import { useUIStore } from "./ui-store";

beforeEach(() => {
  localStorage.clear();
  useUIStore.setState({ sidebarOpen: true, commandPaletteOpen: false });
});

describe("工作区 UI 状态", () => {
  it("只持久化 sidebar，不保存命令面板、资料或凭据", () => {
    useUIStore.getState().setSidebarOpen(false);
    useUIStore.getState().setCommandPaletteOpen(true);
    expect(useUIStore.getState().commandPaletteOpen).toBe(true);
    expect(JSON.parse(localStorage.getItem("anynote-ui") || "{}")).toEqual({
      version: 1,
      state: { sidebarOpen: false },
    });
  });

  it("恢复折叠偏好，不从存储恢复其它字段", async () => {
    localStorage.setItem(
      "anynote-ui",
      JSON.stringify({
        version: 1,
        state: { sidebarOpen: false, commandPaletteOpen: true, accessToken: "invalid" },
      }),
    );
    await useUIStore.persist.rehydrate();
    expect(useUIStore.getState().sidebarOpen).toBe(false);
    expect(useUIStore.getState().commandPaletteOpen).toBe(false);
    expect(useUIStore.getState()).not.toHaveProperty("accessToken");
  });

  it.each([null, {}, { sidebarOpen: "false" }])("忽略不合法的偏好 %s", async (state) => {
    localStorage.setItem("anynote-ui", JSON.stringify({ version: 1, state }));
    await useUIStore.persist.rehydrate();
    expect(useUIStore.getState().sidebarOpen).toBe(true);
  });

  /*
   * v0 的偏好不可信：桌面侧栏那时不响应它，而编辑器里每次 Cmd / Ctrl + B 加粗
   * 都会把它翻转一次。侧栏能收起之后照单全收，一部分用户打开页面就是收起的。
   */
  it("v0 的偏好一律作废，回到展开", async () => {
    localStorage.setItem(
      "anynote-ui",
      JSON.stringify({ version: 0, state: { sidebarOpen: false } }),
    );
    await useUIStore.persist.rehydrate();
    expect(useUIStore.getState().sidebarOpen).toBe(true);
  });
});
