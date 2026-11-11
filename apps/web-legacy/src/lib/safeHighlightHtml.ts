/**
 * Elasticsearch 高亮片段的渲染边界转义。
 *
 * 后端只让 ES 用默认的 `<em>` 包高亮词（`NoteServiceImpl` 的 highlight 配置没有自定义
 * pre/post 标签），所以这里只需要放回 `<em>`/`<mark>`，其余一律当纯文本。
 *
 * 顺序必须是**先整体转义、再还原高亮标签**：反过来会把用户输入里的
 * `&lt;em&gt;`（或直接写的 `<em>`）当成标签执行——这正是 `dangerouslySetInnerHTML`
 * 的常见翻车点。
 *
 * 2026-11-11 起因：网关 XSS 过滤改为按字段放行 Markdown 正文（UI 走查 E-01，
 * 不再对 `content` / `title` 做实体转义），所以「正文里可能带尖括号」这件事
 * 必须在渲染边界自己兜住，这个搜索下拉框是 legacy 前端唯一用 innerHTML 渲染
 * 正文/标题的地方。
 */
export function safeHighlightHtml(html: string | null | undefined): string {
  if (!html) {
    return "";
  }
  const escaped = html
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

  return escaped
    .replace(/&lt;em&gt;/g, "<em>")
    .replace(/&lt;\/em&gt;/g, "</em>")
    .replace(/&lt;mark&gt;/g, "<mark>")
    .replace(/&lt;\/mark&gt;/g, "</mark>");
}
