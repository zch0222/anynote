/**
 * 笔记正文的「首节点必须是 H1」不变式。
 *
 * 编辑器里**没有独立的标题输入行**：笔记标题就是正文的第一个一级标题，
 * 由 `useNoteTitle` 从文档首个节点取。所以打开一篇正文不以 H1 开头的笔记时，
 * 必须先把已存的标题补成 H1——否则标题在编辑器里根本不可见，而库里绝大多数
 * 历史笔记正是「有 title、正文里没有 H1」的形态（标题从前是单独的输入框）。
 *
 * 只在**打开时**补齐、不单独发起写请求：编辑器装载这批内容后，用户第一次编辑
 * 就会连同这个 H1 一起进自动保存队列；落库后再次打开即为幂等，不会重复追加。
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
