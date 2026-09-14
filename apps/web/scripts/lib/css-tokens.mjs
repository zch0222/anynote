/**
 * Design Token 引用审计（判定逻辑；读盘外壳在 `scripts/check-css-tokens.mjs`）。
 *
 * 背景：`src/styles/tiptap.css` 曾长期使用 shadcn v3 时代的变量名
 * （`--muted` / `--border` / `--card` / `--radius` / `--foreground` …），
 * 而这套设计系统从定义之初用的就是另一套语义名（`--separator` / `--surface-block` /
 * `--label-primary` …）。**CSS 自定义属性没有定义时，`var()` 会让整条声明失效**
 * （invalid at computed-value time），既不报错也不回退——于是代码块在浅色与深色下
 * 都是「没有底色、没有边框、没有圆角」的一段裸文字，而构建、类型检查、单测、
 * 视觉巡检全都不响。
 *
 * 这里把「引用的 Token 必须有人定义」变成可执行的判定，让同一类静默失效不可能再溜过去。
 */
import { join, relative } from "node:path";

/**
 * Tailwind 自己在产物里生成的变量命名空间。
 *
 * 这些名字出现在 `@theme` 的编译结果里而不是源码的 `var()` 中，所以列在这里只是
 * 防止将来源码里出现合法的 Tailwind 命名空间引用时误报。**不要**把整套 `--color-*`
 * 放进来：`--color-*` 是我们自己 `@theme inline` 里显式声明的语义映射，
 * 放行就等于放弃对它们的检查。
 */
const TAILWIND_OWNED = [/^--tw-/, /^--default-/];

/**
 * 由第三方或运行时注入、源码里查不到字面定义的变量。
 *
 * 每一条都要写清「谁注入的」，否则这个清单会变成掩盖问题的垃圾桶。
 */
export const RUNTIME_PROVIDED = new Map([
  ["--shiki-light", "Shiki 分词结果写进装饰 span 的内联 style（lib/editor/shiki.ts）"],
  ["--shiki-dark", "同上"],
  ["--radix-accordion-content-height", "Base UI / Radix 手风琴在展开时测量并注入"],
  ["--accordion-panel-height", "同上"],
  [
    "--font-geist-sans",
    "next/font 生成的 __variable_* 类名提供（app/layout.tsx 挂在 <body> 上），不写在任何 CSS 里",
  ],
  ["--font-geist-mono", "同上"],
]);

/**
 * `--name:` / `"--name":` / `["--name" as string]:` 形式的定义。
 *
 * 最后一种是本仓真实存在的写法（协同光标把运行时取到的颜色注入成自定义属性，
 * 见 `features/collab/components/collab-status.tsx`）：TS 要求对自定义属性名做
 * 类型断言才能塞进 `style` 对象，于是名字和冒号之间会多出 `" as string]`。
 * 不支持这个写法就会把它误判成「未定义」，然后把一条真实定义逼进白名单。
 */
const DEFINITION = /(--[a-zA-Z0-9-]+)["']?(?:\s+as\s+[\w.<>[\]]+)?\s*\]?\s*:/g;
/** `var(--name` 形式的引用，含带 fallback 的写法。 */
const REFERENCE = /var\(\s*(--[a-zA-Z0-9-]+)/g;

/** 收集一段源码里定义的自定义属性名。 */
export function collectDefinitions(source) {
  const names = new Set();
  for (const match of source.matchAll(DEFINITION)) {
    names.add(match[1]);
  }
  return names;
}

/** 收集一段源码里引用的自定义属性名。 */
export function collectReferences(source) {
  const names = new Set();
  for (const match of source.matchAll(REFERENCE)) {
    names.add(match[1]);
  }
  return names;
}

function isOwnedByFramework(name) {
  return TAILWIND_OWNED.some((pattern) => pattern.test(name)) || RUNTIME_PROVIDED.has(name);
}

/**
 * 找出「被引用但全仓都没有定义」的变量。
 *
 * 判定口径刻意放宽到「**全仓任何被扫描的文件**定义过就算数」而不是「同文件 / 同作用域」：
 * 这个检查要抓的是「这个名字是谁都没写过的外来词」，不是级联作用域分析。
 * 收紧到作用域需要真正的 CSS 解析器，收益不抵复杂度。
 *
 * @param {{path: string, source: string}[]} entries 待扫描的源码
 * @returns {{undefinedTokens: {name: string, files: string[]}[], referenced: number, defined: number}}
 */
export function analyzeTokenReferences(entries) {
  const defined = new Set();
  for (const entry of entries) {
    for (const name of collectDefinitions(entry.source)) {
      defined.add(name);
    }
  }

  const references = new Map();
  for (const entry of entries) {
    for (const name of collectReferences(entry.source)) {
      if (!references.has(name)) references.set(name, new Set());
      references.get(name).add(entry.path);
    }
  }

  const undefinedTokens = [];
  for (const [name, files] of references) {
    if (defined.has(name) || isOwnedByFramework(name)) continue;
    undefinedTokens.push({ name, files: [...files].sort() });
  }
  undefinedTokens.sort((a, b) => a.name.localeCompare(b.name));

  return {
    undefinedTokens,
    referenced: references.size,
    defined: defined.size,
  };
}

/** 把审计结果渲染成给人看的多行报告。 */
export function formatReport(result) {
  if (result.undefinedTokens.length === 0) {
    return `Token 引用审计通过：${result.referenced} 个被引用的自定义属性全部有定义。`;
  }
  const lines = [
    `发现 ${result.undefinedTokens.length} 个「被引用但无人定义」的 CSS 变量。`,
    "未定义的 var() 会让整条声明失效且不报错，必须改成设计系统里真实存在的 Token：",
    "",
  ];
  for (const token of result.undefinedTokens) {
    lines.push(`  ${token.name}`);
    for (const file of token.files) lines.push(`      ${file}`);
  }
  return lines.join("\n");
}

/** 扫描范围：应用源码与构建期脚本。 */
export const SCAN_ROOTS = ["src", "scripts"];
const SCAN_EXTENSIONS = /\.(css|tsx?|mjs)$/;
const SKIP_DIRS = new Set(["node_modules", ".next", ".output"]);
/**
 * 测试文件不参与扫描。
 *
 * 单测里必然出现刻意编造的变量名（用来验证"缺失能被抓到"），把它们当真实引用
 * 会让门禁永远红着——最后只能靠"往白名单里塞"绕过，门禁就废了。
 */
const SKIP_FILE = /\.(test|spec)\.[cm]?[jt]sx?$/;

/**
 * 收集待审计的源码。
 *
 * 抽成一个函数是为了让**命令行与单测跑同一份口径**：早先单测只挑三个样式表来读，
 * 而命令行扫全仓 270+ 个文件，覆盖面差着一整个数量级却都显示绿色。
 *
 * @param {string} appRoot `apps/web` 的绝对路径
 * @param {typeof import("node:fs")} fs
 */
export function collectEntries(appRoot, fs) {
  const entries = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) continue;
        walk(full);
      } else if (SCAN_EXTENSIONS.test(entry.name) && !SKIP_FILE.test(entry.name)) {
        entries.push({
          path: relative(appRoot, full).replace(/\\/g, "/"),
          source: fs.readFileSync(full, "utf8"),
        });
      }
    }
  };
  for (const root of SCAN_ROOTS) {
    const absolute = join(appRoot, root);
    if (fs.existsSync(absolute)) walk(absolute);
  }
  return entries;
}

/**
 * 读盘跑完整审计（命令行门禁与单测共用）。
 *
 * @param {string} appRoot `apps/web` 的绝对路径
 * @param {typeof import("node:fs")} fs
 */
export function auditAppTokens(appRoot, fs) {
  const entries = collectEntries(appRoot, fs);
  return { ...analyzeTokenReferences(entries), filesScanned: entries.length };
}
