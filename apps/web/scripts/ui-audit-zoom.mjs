/**
 * 把「参考图（画板裁出的屏幕区）」与「实现截图」的**同一横带**上下拼在一起并放大，
 * 用于逐区域细看。两侧先对齐到同一尺寸，所以同一 y 坐标在两图上指的是同一位置。
 *
 * 用法：
 *   node scripts/ui-audit-zoom.mjs d01-kb-notes light 0 140
 *   node scripts/ui-audit-zoom.mjs d01-kb-notes light 140 260 2
 *
 * 参数：<scene> <theme> <y0> <y1> [zoom=2]
 * 产物：apps/web/e2e/.ui-audit/zoom-<scene>-<theme>-<y0>-<y1>.png（上=参考，下=实现）
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const APP_ROOT = join(HERE, "..");
const REPO_ROOT = join(APP_ROOT, "..", "..");
const BOARDS_DIR = join(REPO_ROOT, "docs", "ui", "ui-supplement");
const OUT_DIR = join(APP_ROOT, "e2e", ".ui-audit");
const STORE = join(REPO_ROOT, "node_modules", ".pnpm");
const SHARP = join(STORE, "sharp@0.34.5", "node_modules", "sharp", "lib", "index.js");

const [scene, theme = "light", y0Arg = "0", y1Arg = "140", zoomArg = "2"] = process.argv.slice(2);
if (!scene) {
  console.error("用法：node scripts/ui-audit-zoom.mjs <scene> <theme> <y0> <y1> [zoom]");
  process.exit(1);
}
const y0 = Number(y0Arg);
const y1 = Number(y1Arg);
const zoom = Number(zoomArg);

const sharp = (await import(`file:///${SHARP.replace(/\\/g, "/")}`)).default;

// 参考图：优先用补齐的补充参考图，没有就从画板现裁
async function referenceBuffer(name, theme) {
  const pre = join(
    APP_ROOT,
    "e2e",
    "reference",
    "supplement",
    `${name}${theme === "dark" ? "-dark" : ""}.png`,
  );
  if (existsSync(pre)) return readFileSync(pre);

  const board = join(BOARDS_DIR, `${boardName(name)}${theme === "dark" ? "-dark" : ""}.png`);
  if (!existsSync(board)) throw new Error(`找不到画板：${board}`);
  const { dedupeCrops, detectScreenCrops } = await import("./lib/supplement-crops.mjs");
  const { data, info } = await sharp(board).raw().toBuffer({ resolveWithObject: true });
  const crops = dedupeCrops(
    detectScreenCrops({
      pixels: data,
      width: info.width,
      height: info.height,
      channels: info.channels,
    }),
  );
  const c = crops[0];
  if (!c) throw new Error(`量不出屏幕内区：${board}`);
  return sharp(data, { raw: { width: info.width, height: info.height, channels: info.channels } })
    .extract({ left: c.left, top: c.top, width: c.width, height: c.height })
    .resize({ width: c.css.width, height: c.css.height, fit: "cover" })
    .png()
    .toBuffer();
}

/** scene 名 → 画板基名（scene 名与画板名同构，仅大小写不同）。 */
function boardName(scene) {
  const map = {
    "d01-kb-notes": "D-01-kb-notes",
    "d02-kb-overview": "D-02-kb-overview",
    "d03-note-new": "D-03-note-new",
    "d05-kb-mooc": "D-05-kb-mooc",
    "d06-kb-mooc-detail": "D-06-kb-mooc-detail",
    "d07-kb-tasks": "D-07-kb-tasks",
    "d08-kb-docs": "D-08-kb-docs",
    "d09-kb-members": "D-09-kb-members",
    "d10-collab-library": "D-10-collab-library",
    "d11-collab-workspace": "D-11-collab-workspace",
    "d12-settings-account": "D-12-settings-account",
    "d13-settings-appearance": "D-13-settings-appearance",
    "d14-auth-login": "D-14-auth-login",
    "d15-auth-cli": "D-15-auth-cli",
    "d16-note-history": "D-16-note-history",
    "d17-task-detail": "D-17-task-detail",
    "d18-task-form": "D-18-task-form",
    "m01-dashboard": "M-01-dashboard",
    "m02-me": "M-02-me",
    "m03-kb-mooc": "M-03-kb-mooc",
    "m04-kb-tasks": "M-04-kb-tasks",
    "m05-kb-docs": "M-05-kb-docs",
    "m06-mooc-detail": "M-06-mooc-detail",
    "m07-note-new": "M-07-note-new",
    "m08-doc-library": "M-08-doc-library",
    "m09-doc-workspace": "M-09-doc-workspace",
    "m10-search": "M-10-search",
    "m11-settings": "M-11-settings",
    "m12-task-detail": "M-12-task-detail",
    "m13-note-history": "M-13-note-history",
  };
  return map[scene] ?? scene;
}

const ref = await referenceBuffer(boardName(scene), theme);
const refMeta = await sharp(ref).metadata();
const W = refMeta.width;
const H = refMeta.height;

const shotPath = join(OUT_DIR, `${scene}-${theme}.png`);
if (!existsSync(shotPath)) throw new Error(`找不到截图：${shotPath}`);
const shot = await sharp(shotPath).resize({ width: W, height: H, fit: "cover" }).toBuffer();

const band = { left: 0, top: y0, width: W, height: Math.min(y1, H) - y0 };
const refBand = await sharp(ref)
  .extract(band)
  .resize({ width: W * zoom })
  .toBuffer();
const shotBand = await sharp(shot)
  .extract(band)
  .resize({ width: W * zoom })
  .toBuffer();
const meta = await sharp(refBand).metadata();
const gap = 8;

const out = join(OUT_DIR, `zoom-${scene}-${theme}-${y0}-${y1}.png`);
await sharp({
  create: { width: meta.width, height: meta.height * 2 + gap, channels: 3, background: "#ff3b30" },
})
  .composite([
    { input: refBand, left: 0, top: 0 },
    { input: shotBand, left: 0, top: meta.height + gap },
  ])
  .png({ compressionLevel: 9 })
  .toFile(out);

console.log(`参考（上）/ 实现（下）：${out}`);
console.log(`band y=${y0}..${y1}  zoom=${zoom}  图宽=${meta.width}`);
