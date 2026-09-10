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
      version: 0,
      state: { sidebarOpen: false },
    });
  });

  it("恢复折叠偏好，不从存储恢复其它字段", async () => {
    localStorage.setItem(
      "anynote-ui",
      JSON.stringify({
        version: 0,
        state: { sidebarOpen: false, commandPaletteOpen: true, accessToken: "invalid" },
      }),
    );
    await useUIStore.persist.rehydrate();
    expect(useUIStore.getState().sidebarOpen).toBe(false);
    expect(useUIStore.getState().commandPaletteOpen).toBe(false);
    expect(useUIStore.getState()).not.toHaveProperty("accessToken");
  });

  it.each([null, {}, { sidebarOpen: "false" }])("忽略不合法的偏好 %s", async (state) => {
    localStorage.setItem("anynote-ui", JSON.stringify({ version: 0, state }));
    await useUIStore.persist.rehydrate();
    expect(useUIStore.getState().sidebarOpen).toBe(true);
  });
});
