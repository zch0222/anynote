// 把 KaTeX 字体与样式落到 public/ 与 src/styles/，实现自托管（不走 CDN）。
// 运行：node scripts/sync-katex.mjs
import { copyFileSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const katexDist = join(root, "node_modules", "katex", "dist");
const fontsSrc = join(katexDist, "fonts");
const fontsDest = join(root, "public", "fonts", "katex");
const cssDest = join(root, "src", "styles", "katex.css");

mkdirSync(fontsDest, { recursive: true });

const woff2 = readdirSync(fontsSrc).filter((f) => f.endsWith(".woff2"));
for (const file of woff2) {
  copyFileSync(join(fontsSrc, file), join(fontsDest, file));
}

const css = readFileSync(join(katexDist, "katex.min.css"), "utf8")
  // 只保留 woff2，去掉 woff / ttf 兜底，减小体积
  .replace(
    /,url\(fonts\/[^)]+\.woff\) format\("woff"\),url\(fonts\/[^)]+\.ttf\) format\("truetype"\)/g,
    "",
  )
  .replace(/url\(fonts\//g, "url(/fonts/katex/");

const header = `/* 由 scripts/sync-katex.mjs 从 katex@${JSON.parse(readFileSync(join(root, "node_modules", "katex", "package.json"), "utf8")).version} 生成，请勿手改。 */\n`;
mkdirSync(dirname(cssDest), { recursive: true });
writeFileSync(cssDest, header + css, "utf8");

console.log(`copied ${woff2.length} woff2 fonts -> public/fonts/katex`);
console.log(`wrote ${cssDest}`);
