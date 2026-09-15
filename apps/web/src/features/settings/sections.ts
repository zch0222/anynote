/**
 * 设置页的四个分节。
 *
 * **为什么单独一个文件而不是放在 `components/account-settings.tsx`**：
 * 那个文件顶层 import 了 react-hook-form、`@hookform/resolvers/zod` 与整棵表单
 * 依赖树。分节表要被 `settings-page.tsx`（选项卡）与移动端 `mobile-settings.tsx`
 * 同时引用，放在组件文件里就会为四个字符串把整棵表单树打进这些页面的首屏——
 * 实测桌面 `/settings/*` 因此从 288.7KB 涨到 306.4KB（预算 300KB）。
 *
 * 真相只有这一份。桌面与移动端的分节一致性由
 * `components/__tests__/settings-sections.test.ts` 与
 * `components/__tests__/mobile-settings-sections.test.ts` 两边比对守护。
 */
export type SettingsSection = "profile" | "appearance" | "ai" | "integrations";

export const SETTINGS_SECTIONS: { key: SettingsSection; label: string }[] = [
  { key: "profile", label: "账号" },
  { key: "appearance", label: "外观" },
  { key: "ai", label: "AI" },
  { key: "integrations", label: "集成" },
];

/** 是否是合法的分节段（`/settings/<section>` 的解析与校验共用）。 */
export function isSettingsSection(value: string | undefined): value is SettingsSection {
  return SETTINGS_SECTIONS.some((section) => section.key === value);
}
