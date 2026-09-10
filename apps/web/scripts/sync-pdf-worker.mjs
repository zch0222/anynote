// 把 pdf.js worker 落到 public/，实现自托管（react-pdf 不走 CDN）。
// pdfjs-dist 是 react-pdf 的传递依赖（pnpm 隔离目录），按 Node 解析规则定位。
// 运行：node scripts/sync-pdf-worker.mjs
import { copyFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");

const requireFromWeb = createRequire(join(root, "package.json"));
const reactPdfPkgPath = requireFromWeb.resolve("react-pdf/package.json");
// 以 react-pdf 包内任一模块为起点解析，pnpm 会命中其同级 .pnpm 私有 node_modules
const requireFromReactPdf = createRequire(join(reactPdfPkgPath, "index.js"));
const pdfjsPkgPath = requireFromReactPdf.resolve("pdfjs-dist/package.json");

const version = JSON.parse(readFileSync(pdfjsPkgPath, "utf8")).version;
const workerSrc = join(dirname(pdfjsPkgPath), "build", "pdf.worker.min.mjs");
if (!existsSync(workerSrc)) {
  console.error(`未找到 worker：${workerSrc}`);
  process.exit(1);
}
const workerDest = join(root, "public", "pdf.worker.min.mjs");

mkdirSync(join(root, "public"), { recursive: true });
copyFileSync(workerSrc, workerDest);
console.log(`copied pdfjs-dist@${version} worker -> public/pdf.worker.min.mjs`);
