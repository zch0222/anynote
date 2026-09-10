// 统计 .next 产物的 chunk 体积（原始 / gzip），并标出编辑器 / Shiki / KaTeX 相关 chunk。
// 用法：node scripts/bundle-report.mjs
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const staticDir = join(root, ".next", "static");

/** 判定 chunk 归属用的标志字符串。 */
const MARKERS = {
  编辑器: ["anynote-slash-menu", "anynote-code-block", "anynote-toolbar"],
  KaTeX: ["katex-display", "KaTeX_Main"],
  Shiki: ["ShikiError", "createHighlighterCore", "shiki"],
  ProseMirror: ["prosemirror", "ProseMirror", "Schema("],
  markdown: ["markdown-it", "MarkdownSerializerState", "markdownit"],
};

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...walk(full));
    } else {
      out.push(full);
    }
  }
  return out;
}

const kb = (bytes) => `${(bytes / 1024).toFixed(1)} KB`;

const files = walk(staticDir).filter((file) => file.endsWith(".js"));
const rows = files.map((file) => {
  const buffer = readFileSync(file);
  const text = buffer.toString("utf8");
  const hits = Object.entries(MARKERS)
    .filter(([, markers]) => markers.some((marker) => text.includes(marker)))
    .map(([name]) => name);
  return {
    file: relative(staticDir, file).replace(/\\/g, "/"),
    raw: statSync(file).size,
    gzip: gzipSync(buffer, { level: 9 }).length,
    hits,
  };
});

rows.sort((a, b) => b.gzip - a.gzip);

console.log("=== 全部 chunk（按 gzip 降序，前 14） ===");
for (const row of rows.slice(0, 14)) {
  console.log(
    `${kb(row.gzip).padStart(10)}  gzip  ${kb(row.raw).padStart(10)}  raw  [${row.hits.join(",")}]`.padEnd(
      100,
    ) + row.file,
  );
}

const editorRows = rows.filter((row) => row.hits.includes("编辑器"));
const editorTotal = editorRows.reduce((sum, row) => sum + row.gzip, 0);
console.log("\n=== 编辑器相关 chunk ===");
for (const row of editorRows) {
  console.log(`${kb(row.gzip).padStart(10)}  gzip  [${row.hits.join(",")}]  ${row.file}`);
}
console.log(`编辑器合计（gzip）：${kb(editorTotal)}`);
console.log(`预算 250 KB → ${editorTotal <= 250 * 1024 ? "PASS" : "FAIL"}`);
