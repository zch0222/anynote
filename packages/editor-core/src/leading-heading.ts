/**
 * 笔记正文的「首节点必须是 H1」不变式，以及从正文取标题的规则。
 *
 * 笔记标题就是正文的第一个一级标题。打开一篇正文不以 H1 开头的老笔记时，
 * 先用已存标题补成 H1，标题才在编辑器里可见；只在打开时补齐，不单独发起写请求。
 *
 * web（单人模式保存）与协同服务（落库时取标题）共用这里的规则，两侧取到的标题一致。
 */

/** CommonMark 的 ATX 标题：`#` 后面必须跟空格或制表符。`#话题` 不是一级标题。 */
const LEADING_H1 = /^#[ \t]/;

const FALLBACK_TITLE = "未命名笔记";

/**
 * 保证正文以一级标题开头。
 *
 * 已经有顶部 H1 时**原样返回**（连前导空行都不动）——不做无谓的内容改写，
 * 避免打开一篇笔记就产生一次差异。缺失时用已存标题补一个，标题为空再退回
 * 「未命名笔记」。
 */
export function ensureLeadingHeading(markdown: string, title: string | null | undefined): string {
  // 前导空行会让 H1 失去「首节点」身份，所以判据在去掉前导空白之后取
  const body = markdown.replace(/^\s+/, "");
  if (LEADING_H1.test(body)) return markdown;
  const heading = `# ${title?.trim() || FALLBACK_TITLE}`;
  return body ? `${heading}\n\n${body}` : heading;
}

/**
 * 去掉顶部那行 H1，取回正文。
 *
 * 用于字数统计：字数回答的是「这篇多长」，标题不该算进去——尤其标题如今
 * 就躺在正文的第一行，直接量 `content.length` 会把标题和 markdown 换行一起算上。
 * 没有顶部 H1 时原样返回。
 */
export function stripLeadingHeading(markdown: string): string {
  // 顺手吃掉标题后面那一行空行：它属于标题与正文之间的排版，不是正文的开头
  return markdown.replace(/^[ \t]*#[ \t][^\n]*(?:\n|$)/, "").replace(/^\n+/, "");
}

/**
 * 正文字数：去掉顶部 H1 之后的字符数。
 *
 * 抽成具名函数是为了让**桌面与移动两处字数统计走同一条口径**——它们此前各写一遍
 * `stripLeadingHeading(x).length`，改一处漏一处就会两个端显示不同的数字。
 */
export function bodyCharCount(markdown: string): number {
  return stripLeadingHeading(markdown).length;
}

/** 笔记标题的最大长度，对应 `n_note.title varchar(80)` 与后端 `@Size(max = 80)`。 */
export const NOTE_TITLE_MAX_LENGTH = 80;

/**
 * 把标题截断到 {@link NOTE_TITLE_MAX_LENGTH} 个 UTF-16 码元以内。
 *
 * 长度口径与后端 `@Size` 一致；截断点落在代理对中间时连同高位代理一起去掉，
 * 不会产生半个字符。
 */
export function truncateTitle(title: string): string {
  if (title.length <= NOTE_TITLE_MAX_LENGTH) return title;
  let end = NOTE_TITLE_MAX_LENGTH;
  const last = title.charCodeAt(end - 1);
  if (last >= 0xd800 && last <= 0xdbff) end -= 1;
  return title.slice(0, end);
}

/** 取顶部 H1 所需的最小文档结构，ProseMirror 的 `Node` 满足它。 */
export type LeadingHeadingSource = {
  firstChild: {
    type: { name: string };
    attrs: Record<string, unknown>;
    textContent: string;
  } | null;
};

/**
 * 从文档取笔记标题：首个节点是一级标题时返回其纯文本（去掉首尾空白并截断到上限）。
 *
 * 首节点不是一级标题、或标题文字为空时返回 null，调用方据此沿用原标题而不是清空它。
 *
 * @param doc ProseMirror 文档
 * @returns 标题或 null
 */
export function leadingHeadingOf(doc: LeadingHeadingSource): string | null {
  const first = doc.firstChild;
  if (first?.type.name !== "heading" || first.attrs.level !== 1) return null;
  const text = first.textContent.trim();
  return text ? truncateTitle(text) : null;
}
