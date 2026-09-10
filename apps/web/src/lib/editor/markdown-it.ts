import { escapeHtmlAttribute } from "@/lib/editor/markdown";

/**
 * tiptap-markdown 通过 markdown-it 把 Markdown 解析成 HTML，再交给 ProseMirror 的 parseHTML。
 * 因此自定义语法（`$公式$`、`[[双链]]`、`==高亮==`…）需要在 markdown-it 上注册规则。
 *
 * 这里用**结构化类型**描述用到的那一小部分 markdown-it API，避免把 markdown-it 提升成直接依赖。
 */

export type MdToken = {
  type: string;
  tag: string;
  nesting: number;
  content: string;
  children: MdToken[] | null;
  attrs: Array<[string, string]> | null;
  meta: unknown;
  map: [number, number] | null;
  attrSet(name: string, value: string): void;
  attrGet(name: string): string | null;
};

export type MdInlineState = {
  src: string;
  pos: number;
  posMax: number;
  pending: string;
  env: unknown;
  tokens: MdToken[];
  md: MarkdownItLike;
  push(type: string, tag: string, nesting: number): MdToken;
};

export type MdBlockState = {
  src: string;
  line: number;
  bMarks: number[];
  eMarks: number[];
  tShift: number[];
  push(type: string, tag: string, nesting: number): MdToken;
};

export type MdCoreState = { tokens: MdToken[]; src: string; env: unknown };

export type MarkdownItLike = {
  core: {
    ruler: {
      after(existing: string, name: string, rule: (state: MdCoreState) => void): void;
    };
  };
  block: {
    ruler: {
      before(
        existing: string,
        name: string,
        rule: (state: MdBlockState, startLine: number, endLine: number, silent: boolean) => boolean,
      ): void;
    };
  };
  inline: {
    ruler: {
      before(
        existing: string,
        name: string,
        rule: (state: MdInlineState, silent: boolean) => boolean,
      ): void;
    };
    parse(src: string, md: MarkdownItLike, env: unknown, out: MdToken[]): void;
  };
  renderer: {
    rules: Record<string, (tokens: MdToken[], idx: number) => string>;
  };
};

/** 内联规则统一的插入位置：放在 `backticks` 之后、`emphasis` / `link` 之前。 */
const INLINE_ANCHOR = "strikethrough";

/**
 * markdown-it 的 `ruler.before/after` 不是幂等的，而 `tiptap-markdown` 每次 parse 都会重跑
 * `parse.setup`，重复注册会产生重复规则。这里按 (md 实例, 插件名) 去重，保证每个实例只注册一次。
 */
const registeredPlugins = new WeakMap<object, Set<string>>();

export function registerMdPlugin(md: MarkdownItLike, key: string, register: () => void): void {
  let keys = registeredPlugins.get(md as object);
  if (!keys) {
    keys = new Set<string>();
    registeredPlugins.set(md as object, keys);
  }
  if (keys.has(key)) {
    return;
  }
  keys.add(key);
  register();
}

function matchAt(state: MdInlineState, pattern: RegExp): RegExpExecArray | null {
  const rest = state.src.slice(state.pos, state.posMax);
  const match = pattern.exec(rest);
  return match && match.index === 0 ? match : null;
}

/**
 * 注册「原子型内联节点」（整段匹配即一个不可编辑节点，如 `[[双链]]`、`$公式$`）。
 * `render` 负责把匹配到的 token 渲染成目标 HTML。
 */
export function addInlineAtom(
  md: MarkdownItLike,
  name: string,
  pattern: RegExp,
  render: (token: MdToken) => string,
): void {
  registerMdPlugin(md, name, () => {
    md.inline.ruler.before(INLINE_ANCHOR, name, (state, silent) => {
      const match = matchAt(state, pattern);
      if (!match) {
        return false;
      }
      if (!silent) {
        const token = state.push(name, "", 0);
        token.content = match[0];
        token.meta = { match, text: match[1] ?? "" };
      }
      state.pos += match[0].length;
      return true;
    });
    md.renderer.rules[name] = (tokens, idx) => {
      const token = tokens[idx];
      return token ? render(token) : "";
    };
  });
}

/**
 * 注册「包裹型内联标记」（`==高亮==`、`++下划线++`）：递归解析内部内容，
 * 产出 `open` / 内部 token / `close` 三段，让 `<mark>` / `<u>` 内部的斜体、加粗等照常生效。
 */
export function addInlineWrapper(
  md: MarkdownItLike,
  name: string,
  pattern: RegExp,
  tag: string,
): void {
  registerMdPlugin(md, name, () => {
    md.inline.ruler.before(INLINE_ANCHOR, name, (state, silent) => {
      const match = matchAt(state, pattern);
      if (!match) {
        return false;
      }
      const inner = match[1] ?? "";
      if (!inner.trim()) {
        return false;
      }
      if (!silent) {
        state.push(`${name}_open`, tag, 1);
        const nested: MdToken[] = [];
        state.md.inline.parse(inner, state.md, state.env, nested);
        state.tokens.push(...nested);
        state.push(`${name}_close`, tag, -1);
      }
      state.pos += match[0].length;
      return true;
    });
  });
}

/** 转义 HTML 属性值，供 renderer 直接拼字符串使用。 */
export { escapeHtmlAttribute };
