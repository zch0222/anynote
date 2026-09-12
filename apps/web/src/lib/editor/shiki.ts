/**
 * Shiki 高亮器：整包懒加载。
 *
 * - `shiki/core`、JS 正则引擎、主题、语法全部用动态 import，只有页面真的渲染代码块时才下载，
 *   因此 Shiki 不计入编辑器主 chunk（实测编辑器主 chunk 因此从 341 KB 降到 266 KB gzip）。
 * - 用 JS 正则引擎而非 oniguruma wasm：无需额外 wasm 资源，更适合浏览器 + 代码分割场景。
 * - 语言按需加载并缓存，重复请求不会重复加载语法包。
 */

/** 只声明真正用到的那部分 API，避免把 `shiki` 的类型导入变成运行时依赖。 */
type ThemedTokenLike = {
  content: string;
  /** 相对于整段代码（含换行）的起始偏移，0 起。 */
  offset: number;
  fontStyle?: number;
  /** `defaultColor: false` 下只有 `--shiki-light` / `--shiki-dark` 两个自定义属性。 */
  htmlStyle?: Record<string, string>;
};

type HighlighterCoreLike = {
  getLoadedLanguages(): string[];
  loadLanguage(language: unknown): Promise<void>;
  codeToTokens(
    code: string,
    options: {
      lang: string;
      themes: { light: string; dark: string };
      defaultColor: false;
    },
  ): { tokens: ThemedTokenLike[][] };
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

/**
 * 语言下拉框的可选项。
 * `SPECIAL_LANGUAGES` 里的 `plaintext` / `txt` 等都会被归一化成 `text`，
 * 列出来只会得到几个指向同一结果的重复选项，所以只保留 `text`。
 */
export const SUPPORTED_LANGUAGES: readonly string[] = ["text", ...Object.keys(LANGUAGE_LOADERS)];

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
/** 已 resolve 的单例句柄：`tokenize` 必须同步拿到它，不能 await。 */
let highlighter: HighlighterCoreLike | null = null;

/** 懒创建单例（首次调用才加载 shiki 核心 + 双主题）。 */
async function createHighlighter(): Promise<HighlighterCoreLike> {
  const [{ getSingletonHighlighterCore }, { createJavaScriptRegexEngine }] = await Promise.all([
    import("shiki/core"),
    import("shiki/engine/javascript"),
  ]);
  const created = await getSingletonHighlighterCore({
    themes: [import("@shikijs/themes/github-light"), import("@shikijs/themes/github-dark")],
    // 语言全部按需加载，初始不预载任何语法
    langs: [],
    engine: createJavaScriptRegexEngine(),
  });
  highlighter = created as unknown as HighlighterCoreLike;
  return highlighter;
}

export function getHighlighter(): Promise<HighlighterCoreLike> {
  highlighterPromise ??= createHighlighter();
  return highlighterPromise;
}

const pendingLanguages = new Map<string, Promise<void>>();

/** 语法是否已经在单例里，可以同步 tokenize。 */
function isLanguageReady(current: HighlighterCoreLike, language: string): boolean {
  return language === "text" || current.getLoadedLanguages().includes(language);
}

async function ensureLanguage(current: HighlighterCoreLike, language: string): Promise<boolean> {
  if (isLanguageReady(current, language)) {
    return true;
  }
  const loader = LANGUAGE_LOADERS[language];
  if (!loader) {
    return false;
  }
  let pending = pendingLanguages.get(language);
  if (!pending) {
    pending = current
      .loadLanguage(loader())
      .then(() => undefined)
      .finally(() => pendingLanguages.delete(language));
    pendingLanguages.set(language, pending);
  }
  await pending;
  return true;
}

/** Shiki `FontStyle` 位掩码（与 `@shikijs/types` 的枚举一致，这里避免值导入）。 */
const FONT_STYLE_ITALIC = 1;
const FONT_STYLE_BOLD = 2;
const FONT_STYLE_UNDERLINE = 4;
const FONT_STYLE_STRIKETHROUGH = 8;

/** 一个高亮片段：位置 + 要写到装饰 `<span>` 上的内联样式。 */
export type ShikiToken = {
  /** 相对于整段代码的起始偏移，0 起。 */
  offset: number;
  /** 片段字符数（与 ProseMirror 的文本位置一一对应）。 */
  length: number;
  /**
   * 内联样式：只含 `--shiki-light` / `--shiki-dark` 两个自定义属性与字体变体，
   * **不含 `color`**——具体取哪一个由 `tiptap.css` 按明暗主题决定，切主题无需重新分词。
   */
  style: string;
};

/** 把 shiki 的 token 样式拼成 `style` 属性字符串。 */
function toStyle(token: ThemedTokenLike): string {
  const parts: string[] = [];
  for (const [property, value] of Object.entries(token.htmlStyle ?? {})) {
    // 只接受自定义属性，避免把 shiki 未来新增的普通声明（如 background-color）带进正文
    if (property.startsWith("--")) {
      parts.push(`${property}:${value}`);
    }
  }
  const fontStyle = token.fontStyle ?? 0;
  if (fontStyle > 0) {
    if (fontStyle & FONT_STYLE_ITALIC) parts.push("font-style:italic");
    if (fontStyle & FONT_STYLE_BOLD) parts.push("font-weight:bold");
    const decorations: string[] = [];
    if (fontStyle & FONT_STYLE_UNDERLINE) decorations.push("underline");
    if (fontStyle & FONT_STYLE_STRIKETHROUGH) decorations.push("line-through");
    if (decorations.length > 0) parts.push(`text-decoration:${decorations.join(" ")}`);
  }
  return parts.join(";");
}

/** 分词结果缓存：同一段代码在每次按键时都会被重新请求，没有缓存会重复跑正则引擎。 */
const TOKEN_CACHE_LIMIT = 64;
const tokenCache = new Map<string, ShikiToken[]>();

function readCache(key: string): ShikiToken[] | undefined {
  const cached = tokenCache.get(key);
  if (cached) {
    // 命中即刷新插入顺序，让淘汰按 LRU 而不是 FIFO
    tokenCache.delete(key);
    tokenCache.set(key, cached);
  }
  return cached;
}

function writeCache(key: string, tokens: ShikiToken[]): void {
  tokenCache.set(key, tokens);
  while (tokenCache.size > TOKEN_CACHE_LIMIT) {
    const oldest = tokenCache.keys().next().value;
    if (oldest === undefined) break;
    tokenCache.delete(oldest);
  }
}

/**
 * **同步**分词。高亮器或该语言的语法还没加载好时返回 `null`，
 * 调用方应照常渲染纯文本，并调用 `prepareHighlight()` 等就绪后重画。
 *
 * 之所以要同步：高亮以 ProseMirror 装饰的形式贴在真正的正文上，
 * 装饰必须在 `EditorState` 更新的同一拍算出来，异步拿不到。
 */
export function tokenize(code: string, language?: string | null): ShikiToken[] | null {
  const current = highlighter;
  if (!current) {
    return null;
  }
  const normalized = normalizeLanguage(language) ?? "text";
  if (!isLanguageReady(current, normalized)) {
    return null;
  }
  const key = `${normalized} ${code}`;
  const cached = readCache(key);
  if (cached) {
    return cached;
  }

  let lines: ThemedTokenLike[][];
  try {
    lines = current.codeToTokens(code, {
      lang: normalized,
      themes: { light: "github-light", dark: "github-dark" },
      defaultColor: false,
    }).tokens;
  } catch (error) {
    // 语法包损坏 / 代码触发引擎异常时降级为纯文本，不能让编辑器整棵树崩掉
    console.error("Shiki 分词失败", error);
    return null;
  }

  const tokens: ShikiToken[] = [];
  for (const line of lines) {
    for (const token of line) {
      const style = toStyle(token);
      // 空样式的片段不值得生成装饰节点（大量空白 token 会拖慢 ProseMirror 的 diff）
      if (style === "" || token.content.length === 0) continue;
      tokens.push({ offset: token.offset, length: token.content.length, style });
    }
  }
  writeCache(key, tokens);
  return tokens;
}

/**
 * 准备高亮器与语法。返回 `true` 表示本次调用之后 `tokenize()` 的结果会变好
 * （之前拿不到高亮，现在可以了），调用方据此触发一次重画。
 */
export async function prepareHighlight(language?: string | null): Promise<boolean> {
  const normalized = normalizeLanguage(language) ?? "text";
  const before = highlighter !== null && isLanguageReady(highlighter, normalized);
  const current = await getHighlighter();
  const loaded = await ensureLanguage(current, normalized);
  // 未知语言按 text 渲染，此时“就绪”取决于高亮器本身有没有加载完
  return !before && (loaded || normalized === "text");
}

/** 仅供测试：清空单例与缓存，避免用例之间互相污染。 */
export function resetHighlighterForTest(): void {
  highlighterPromise = null;
  highlighter = null;
  pendingLanguages.clear();
  tokenCache.clear();
}
