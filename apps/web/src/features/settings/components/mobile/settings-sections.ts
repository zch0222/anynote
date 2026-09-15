/**
 * 移动端「我的 → 设置」的四个分节。
 *
 * **为什么不直接 `import { SETTINGS_SECTIONS } from "../account-settings"`**：
 * 那是一个桌面版组件文件，顶层 import 了 react-hook-form、`@hookform/resolvers/zod`
 * 与整棵表单依赖树。为了四个字符串把它们打进 `/m/me` 的首屏，实测多出 13.4 KB
 * （gzip）——`/m/*` 的预算是 250KB，这一条就占掉了余量的一大半。
 *
 * 与桌面保持同步靠 `__tests__/settings-sections.test.ts`：它在**测试里**才 import
 * 桌面那份（测试不进产物），逐项比对 key 与 label。桌面加一个分节而移动端漏了，
 * 单测会红。
 */
export type MobileSettingsSection = "profile" | "appearance" | "ai" | "integrations";

export const MOBILE_SETTINGS_SECTIONS: { key: MobileSettingsSection; label: string }[] = [
  { key: "profile", label: "账号" },
  { key: "appearance", label: "外观" },
  { key: "ai", label: "AI" },
  { key: "integrations", label: "集成" },
];
