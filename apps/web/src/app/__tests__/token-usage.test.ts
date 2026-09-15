import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * 填充层级的静态守卫（UI 补稿 Q-01 #1–#3）。
 *
 * 深色下 `--surface-grouped` 是纯黑，任何「悬停 / 选中 / 菜单高亮 / 页脚」底
 * 借用它都会失去反馈（悬停无变化）或变成一条黑带（对话框页脚）。
 * 这类错误只有在**深色截图**下才看得出来，代码评审也容易放过，
 * 所以用一条会失败的遍历把规则钉死。
 *
 * `bg-grouped` 只允许剩一种用法：页面底色（body、分组页背景、只读展示块）。
 * 交互前缀与 `/60` 半透明（页脚专用写法）一律走 `--fill-*`。
 */

const SRC_ROOT = resolve(__dirname, "../..");

/** 允许出现 `bg-grouped` 的例外：整屏 / 分组页的底色，以及非交互的展示块。 */
const ALLOWED = [
  // 分组页与整屏底色
  "app/globals.css",
  "components/layout/app-shell.tsx",
  "components/layout/app-header.tsx",
  "components/layout/mobile/mobile-shell.tsx",
  "app/(auth)/cli/authorize/page.tsx",
  // 骨架与占位：不是交互底色
  "components/ui/skeleton.tsx",
  "components/layout/workspace-placeholder.tsx",
];

const INTERACTIVE_PATTERN =
  /(?:hover|focus|focus-visible|aria-expanded|data-selected|data-open|data-popup-open|has-aria-expanded):bg-grouped|bg-grouped\/\d+/g;

/** 递归收集 `src/**` 下的源码文件，测试自身排除在外。 */
function collectSourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === "__tests__" || entry === ".next") continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...collectSourceFiles(full));
      continue;
    }
    if (/\.(tsx?|css)$/.test(entry) && !/\.test\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

describe("填充 Token 守卫", () => {
  it("交互态与页脚不再借用 bg-grouped", () => {
    const violations: string[] = [];

    for (const file of collectSourceFiles(SRC_ROOT)) {
      const rel = relative(SRC_ROOT, file);
      if (ALLOWED.includes(rel)) continue;

      const lines = readFileSync(file, "utf8").split("\n");
      lines.forEach((line, index) => {
        // 注释里提到旧写法是允许的（说明为什么改），只看真实类名
        if (/^\s*(\*|\/\/)/.test(line)) return;
        if (INTERACTIVE_PATTERN.test(line)) {
          violations.push(`${rel}:${index + 1}  ${line.trim().slice(0, 120)}`);
        }
      });
    }

    expect(
      violations,
      `以下位置仍在交互态/页脚借用 bg-grouped：\n${violations.join("\n")}`,
    ).toEqual([]);
  });

  it("输入控件圆角为 10（rounded-md），不是 14", () => {
    // 2026-09-15 拍板：Input / Textarea / InputGroup 的圆角从 rounded-lg(14) 收成 rounded-md(10)
    for (const file of ["components/ui/input.tsx", "components/ui/textarea.tsx"]) {
      const source = readFileSync(join(SRC_ROOT, file), "utf8");
      expect(source, `${file} 不应再出现 rounded-lg`).not.toMatch(/rounded-lg/);
    }
  });
});
