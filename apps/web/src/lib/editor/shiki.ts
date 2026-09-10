/**
 * Shiki 高亮器：整包懒加载。
 *
 * - `shiki/core`、JS 正则引擎、主题、语法全部用动态 import，只有页面真的渲染代码块时才下载，
 *   因此 Shiki 不计入编辑器主 chunk（实测编辑器主 chunk 因此从 341 KB 降到 266 KB gzip）。
 * - 用 JS 正则引擎而非 oniguruma wasm：无需额外 wasm 资源，更适合浏览器 + 代码分割场景。
 * - 语言按需加载并缓存，重复请求不会重复加载语法包。
 */

/** 只声明真正用到的那部分 API，避免把 `shiki` 的类型导入变成运行时依赖。 */
type HighlighterCoreLike = {
  getLoadedLanguages(): string[];
  loadLanguage(language: unknown): Promise<void>;
  codeToHtml(
    code: string,
    options: {
      lang: string;
      themes: { light: string; dark: string };
      defaultColor: false;
    },
  ): string;
};

/** 常用语言 → 动态加载器。新增语言只在这里加一行。 */
const LANGUAGE_LOADERS: Record<string, () => Promise<unknown>> = {
  javascript: () => import("@shikijs/langs/javascript"),
  typescript: () => import("@shikijs/langs/typescript"),
  jsx: () => import("@shikijs/langs/jsx"),
  tsx: () => import("@shikijs/langs/tsx"),
  json: () => import("@shikijs/langs/json"),
  html: () => import("@shikijs/langs/html"),
  css: () => import("@shikijs/langs/css"),
  xml: () => import("@shikijs/langs/xml"),
  python: () => import("@shikijs/langs/python"),
  java: () => import("@shikijs/langs/java"),
  go: () => import("@shikijs/langs/go"),
  rust: () => import("@shikijs/langs/rust"),
  c: () => import("@shikijs/langs/c"),
  cpp: () => import("@shikijs/langs/cpp"),
  csharp: () => import("@shikijs/langs/csharp"),
  sql: () => import("@shikijs/langs/sql"),
  bash: () => import("@shikijs/langs/bash"),
  shellscript: () => import("@shikijs/langs/shellscript"),
  yaml: () => import("@shikijs/langs/yaml"),
  markdown: () => import("@shikijs/langs/markdown"),
  diff: () => import("@shikijs/langs/diff"),
  latex: () => import("@shikijs/langs/latex"),
};

/** Shiki 内置的特殊语言，无需加载语法数据。 */
const SPECIAL_LANGUAGES = ["text", "plaintext", "plain", "txt", "ansi"] as const;

/** 常见别名归一化。 */
const LANGUAGE_ALIASES: Record<string, string> = {
  js: "javascript",
  ts: "typescript",
  sh: "bash",
  shell: "shellscript",
  zsh: "bash",
  yml: "yaml",
  py: "python",
  "c++": "cpp",
  cs: "csharp",
  golang: "go",
  plaintext: "text",
  txt: "text",
};

export const SUPPORTED_LANGUAGES: readonly string[] = [
  ...SPECIAL_LANGUAGES,
  ...Object.keys(LANGUAGE_LOADERS),
];

/** 别名归一化，未知语言返回 undefined（由调用方降级为 text）。 */
export function normalizeLanguage(language?: string | null): string | undefined {
  if (!language) {
    return undefined;
  }
  const key = language
    .trim()
    .toLowerCase()
    .replace(/^language-/, "");
  if ((SPECIAL_LANGUAGES as readonly string[]).includes(key)) {
    return "text";
  }
  if (LANGUAGE_LOADERS[key]) {
    return key;
  }
  const alias = LANGUAGE_ALIASES[key];
  if (!alias) {
    return undefined;
  }
  return (SPECIAL_LANGUAGES as readonly string[]).includes(alias) ? "text" : alias;
}

let highlighterPromise: Promise<HighlighterCoreLike> | null = null;

/** 懒创建单例（首次调用才加载 shiki 核心 + 双主题）。 */
async function createHighlighter(): Promise<HighlighterCoreLike> {
  const [{ getSingletonHighlighterCore }, { createJavaScriptRegexEngine }] = await Promise.all([
    import("shiki/core"),
    import("shiki/engine/javascript"),
  ]);
  const highlighter = await getSingletonHighlighterCore({
    themes: [import("@shikijs/themes/github-light"), import("@shikijs/themes/github-dark")],
    // 语言全部按需加载，初始不预载任何语法
    langs: [],
    engine: createJavaScriptRegexEngine(),
  });
  return highlighter as unknown as HighlighterCoreLike;
}

export function getHighlighter(): Promise<HighlighterCoreLike> {
  highlighterPromise ??= createHighlighter();
  return highlighterPromise;
}

const pendingLanguages = new Map<string, Promise<void>>();

async function ensureLanguage(
  highlighter: HighlighterCoreLike,
  language: string,
): Promise<boolean> {
  if (language === "text" || highlighter.getLoadedLanguages().includes(language)) {
    return true;
  }
  const loader = LANGUAGE_LOADERS[language];
  if (!loader) {
    return false;
  }
  let pending = pendingLanguages.get(language);
  if (!pending) {
    pending = highlighter
      .loadLanguage(loader())
      .then(() => undefined)
      .finally(() => pendingLanguages.delete(language));
    pendingLanguages.set(language, pending);
  }
  await pending;
  return true;
}

/**
 * 把代码高亮成同时支持亮/暗主题的 HTML。
 * 通过 `defaultColor: false` 让颜色只以 CSS 变量输出，主题切换由 `tiptap.css` 控制，无需重新高亮。
 */
export async function highlightToHtml(code: string, language?: string | null): Promise<string> {
  const highlighter = await getHighlighter();
  const normalized = normalizeLanguage(language);
  const loaded = normalized ? await ensureLanguage(highlighter, normalized) : false;
  return highlighter.codeToHtml(code, {
    lang: loaded && normalized ? normalized : "text",
    themes: { light: "github-light", dark: "github-dark" },
    defaultColor: false,
  });
}
