// 统计 .next 产物的 chunk 体积（原始 / gzip），标出各子系统归属，并按 M8.3 性能预算判定。
//
// 用法：
//   node scripts/bundle-report.mjs            # 只报告
//   node scripts/bundle-report.mjs --budget   # 超预算时以非零退出码失败（CI 用）
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import {
  DEFAULT_BUDGETS,
  MARKERS,
  classifyChunk,
  evaluateBudgets,
  formatKb,
  sumEditorChunks,
  summarizeRoutes,
} from "./lib/bundle.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const nextDir = join(root, ".next");
const staticDir = join(nextDir, "static");
const enforceBudget = process.argv.includes("--budget");

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

const files = walk(staticDir).filter((file) => file.endsWith(".js"));
/** manifest 里的路径以 .next 为根（如 `static/chunks/xxx.js`），这里按同样口径建索引。 */
const gzipByManifestPath = {};
const rows = files.map((file) => {
  const buffer = readFileSync(file);
  const gzip = gzipSync(buffer, { level: 9 }).length;
  const manifestPath = relative(nextDir, file).replace(/\\/g, "/");
  gzipByManifestPath[manifestPath] = gzip;
  return {
    file: relative(staticDir, file).replace(/\\/g, "/"),
    raw: statSync(file).size,
    gzip,
    hits: classifyChunk(buffer.toString("utf8"), MARKERS),
  };
});

rows.sort((a, b) => b.gzip - a.gzip);

console.log("=== 全部 chunk（按 gzip 降序，前 14） ===");
for (const row of rows.slice(0, 14)) {
  const head = `${formatKb(row.gzip).padStart(10)}  gzip  ${formatKb(row.raw).padStart(10)}  raw  [${row.hits.join(",")}]`;
  console.log(head.padEnd(100) + row.file);
}

const editorRows = rows.filter((row) => row.hits.includes("编辑器"));
const editorTotal = sumEditorChunks(rows);
console.log("\n=== 编辑器相关 chunk ===");
for (const row of editorRows) {
  console.log(`${formatKb(row.gzip).padStart(10)}  gzip  [${row.hits.join(",")}]  ${row.file}`);
}
console.log(`编辑器合计（gzip）：${formatKb(editorTotal)}`);

const manifest = JSON.parse(readFileSync(join(nextDir, "app-build-manifest.json"), "utf8"));
const routes = summarizeRoutes(manifest, gzipByManifestPath);
console.log("\n=== 各路由首屏 JS（gzip，前 10 重） ===");
for (const route of routes.slice(0, 10)) {
  console.log(`${formatKb(route.gzip).padStart(10)}  ${route.route}`);
}

const heaviest = routes[0];
const result = evaluateBudgets(
  {
    initialJs: heaviest?.gzip ?? 0,
    heaviestRoute: heaviest?.route ?? "",
    editorChunk: editorTotal,
  },
  DEFAULT_BUDGETS,
);

console.log("\n=== 性能预算（M8.3） ===");
for (const check of result.checks) {
  const detail = check.detail ? `（${check.detail}）` : "";
  console.log(
    `${check.pass ? "PASS" : "FAIL"}  ${check.name}${detail}：` +
      `${formatKb(check.actual)} / 预算 ${formatKb(check.budget)}`,
  );
}

if (enforceBudget && !result.pass) {
  console.error("\n产物体积超出预算，构建失败。");
  process.exit(1);
}
