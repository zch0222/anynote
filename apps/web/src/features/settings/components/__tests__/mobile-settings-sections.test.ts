import { SETTINGS_SECTIONS } from "@/features/settings/components/account-settings";
import { MOBILE_SETTINGS_SECTIONS } from "@/features/settings/components/mobile/settings-sections";
import { describe, expect, it } from "vitest";

/**
 * 移动端的分节表是**手抄**的一份（见 `settings-sections.ts` 的注释：
 * 直接 import 桌面那份会把 react-hook-form 整棵树打进 `/m/me` 首屏，
 * 实测多出 13.4 KB，而 `/m/*` 的预算只剩不到 20KB）。
 *
 * 手抄就要防漂移。这个测试是**唯一**允许 import 桌面那份的地方——
 * 测试代码不进产物，所以既能比对又不会把依赖带进首屏。
 */
describe("移动端设置分节表", () => {
  it("与桌面 SETTINGS_SECTIONS 逐项一致", () => {
    expect(MOBILE_SETTINGS_SECTIONS.map((item) => item.key)).toEqual(
      SETTINGS_SECTIONS.map((item) => item.key),
    );
    expect(MOBILE_SETTINGS_SECTIONS.map((item) => item.label)).toEqual(
      SETTINGS_SECTIONS.map((item) => item.label),
    );
  });

  it("顺序也一致——「我的」按这个顺序铺四行", () => {
    expect(MOBILE_SETTINGS_SECTIONS).toHaveLength(SETTINGS_SECTIONS.length);
  });
});
