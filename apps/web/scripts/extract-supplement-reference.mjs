/**
 * 从「UI 补稿设计图」的整块画板里裁出**屏幕区域**，作为 UI 还原度对比的参考图。
 *
 * 为什么需要裁：`docs/ui/ui-supplement/*.png` 是 2 倍分辨率的**整幅画板**——
 * 除了屏幕本身，右侧还有几十条图例、下方还有状态缩略图。直接拿它和浏览器截图
 * 并排，两边宽度差三倍，人眼对不出任何东西。
 *
 * 所以这里按画板尺寸约定裁出左上角的屏幕区（画板布局由设计画布固定：
 * 屏幕在左上角，右边是图例列）。裁剪参数集中在下表，一处可调。
 *
 * 用法（设计图更新时才需要重跑）：
 *   node apps/web/scripts/extract-supplement-reference.mjs
 *
 * 产物入库在 `apps/web/e2e/reference/supplement/`——与 `e2e/reference/` 下
 * 从 PDF 导出的原设计稿参考图分开：那是 p01–p16，这是补稿的 D-xx / M-xx。
 */
import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const APP_ROOT = join(HERE, "..");
const REPO_ROOT = join(APP_ROOT, "..", "..");
const SRC_DIR = join(REPO_ROOT, "docs", "ui", "ui-supplement");
const OUT_DIR = join(APP_ROOT, "e2e", "reference", "supplement");

/**
 * `sharp` **刻意不写进 package.json**：理由与 `extract-design-reference.mjs` 一致——
 * 这是设计图更新时的一次性工具，不是构建或测试链路的一环，加进依赖会让每次
 * `pnpm install` 都为它付成本。它已由 react-pdf 的工具链带进 pnpm store，按
 * 绝对路径 import 即可（`apps/web` 的 node_modules 里没有它的软链）。
 */
const STORE = join(REPO_ROOT, "node_modules", ".pnpm");
const SHARP_SPEC = "sharp@0.34.5";

/**
 * 画板裁剪表。
 *
 * `crop` 是**导出图（2 倍）**的像素值：`left/top/width/height`。
 * 数值是逐块量出来的（屏幕左缘 = 画板 padding，屏幕右缘 = 图例列起始）。
 * `expect` 是屏幕的 CSS 尺寸，输出会按它缩放——**必须与浏览器视口一致**，
 * 否则并排对比的字体大小对不上，看起来像"字号还原错了"。
 *
 * 只列本轮真的要对比的画板：桌面 1440×900 内容区、移动 390×844。
 */
const BOARDS = [
  // —— 桌面：知识库内 ——
  { file: "D-01-kb-notes.png", name: "d01-kb-notes", crop: { left: 140, top: 300, width: 2680, height: 1230 }, expect: { width: 1340, height: 615 } },
  { file: "D-02-kb-overview.png", name: "d02-kb-overview", crop: { left: 140, top: 300, width: 2680, height: 1230 }, expect: { width: 1340, height: 615 } },
  { file: "D-05-kb-mooc.png", name: "d05-kb-mooc", crop: { left: 140, top: 300, width: 2680, height: 1230 }, expect: { width: 1340, height: 615 } },
  { file: "D-06-kb-mooc-detail.png", name: "d06-kb-mooc-detail", crop: { left: 140, top: 300, width: 2680, height: 1230 }, expect: { width: 1340, height: 615 } },
  { file: "D-07-kb-tasks.png", name: "d07-kb-tasks", crop: { left: 140, top: 300, width: 2680, height: 1230 }, expect: { width: 1340, height: 615 } },
  { file: "D-08-kb-docs.png", name: "d08-kb-docs", crop: { left: 140, top: 300, width: 2680, height: 1230 }, expect: { width: 1340, height: 615 } },
  { file: "D-09-kb-members.png", name: "d09-kb-members", crop: { left: 140, top: 300, width: 2680, height: 1230 }, expect: { width: 1340, height: 615 } },
  { file: "D-03-note-new.png", name: "d03-note-new", crop: { left: 140, top: 300, width: 2680, height: 1230 }, expect: { width: 1340, height: 615 } },
  { file: "D-10-collab-library.png", name: "d10-collab-library", crop: { left: 140, top: 300, width: 2680, height: 1230 }, expect: { width: 1340, height: 615 } },
  { file: "D-12-settings-account.png", name: "d12-settings-account", crop: { left: 140, top: 300, width: 2680, height: 1230 }, expect: { width: 1340, height: 615 } },
  { file: "D-13-settings-appearance.png", name: "d13-settings-appearance", crop: { left: 140, top: 300, width: 2680, height: 1230 }, expect: { width: 1340, height: 615 } },
  // —— 移动：390×844 ——
  { file: "M-01-dashboard.png", name: "m01-dashboard", crop: { left: 130, top: 260, width: 1400, height: 2000 }, expect: { width: 390, height: 557 } },
  { file: "M-02-me.png", name: "m02-me", crop: { left: 130, top: 260, width: 1400, height: 2000 }, expect: { width: 390, height: 557 } },
  { file: "M-03-kb-mooc.png", name: "m03-kb-mooc", crop: { left: 130, top: 260, width: 1400, height: 2000 }, expect: { width: 390, height: 557 } },
  { file: "M-04-kb-tasks.png", name: "m04-kb-tasks", crop: { left: 130, top: 260, width: 1400, height: 2000 }, expect: { width: 390, height: 557 } },
  { file: "M-05-kb-docs.png", name: "m05-kb-docs", crop: { left: 130, top: 260, width: 1400, height: 2000 }, expect: { width: 390, height: 557 } },
  { file: "M-07-note-new.png", name: "m07-note-new", crop: { left: 130, top: 260, width: 1400, height: 2000 }, expect: { width: 390, height: 557 } },
  { file: "M-08-doc-library.png", name: "m08-doc-library", crop: { left: 130, top: 260, width: 1400, height: 2000 }, expect: { width: 390, height: 557 } },
  { file: "M-10-search.png", name: "m10-search", crop: { left: 130, top: 260, width: 1400, height: 2000 }, expect: { width: 390, height: 557 } },
  { file: "M-11-settings.png", name: "m11-settings", crop: { left: 130, top: 260, width: 1400, height: 2000 }, expect: { width: 390, height: 557 } },
];

/** 深色版只需换文件名后缀；排板布局与浅色版一致。 */
const DARK_SUFFIX = "-dark";

async function main() {
  const sharpEntry = join(STORE, SHARP_SPEC, "node_modules", "sharp", "lib", "index.js");
  if (!existsSync(sharpEntry)) {
    console.error(
      `缺少依赖：${sharpEntry}\n请先 \`pnpm install\`，并确认 pnpm store 里的版本号与脚本常量一致。`,
    );
    process.exit(1);
  }
  const sharp = (await import(`file:///${sharpEntry.replace(/\\/g, "/")}`)).default;

  if (!existsSync(SRC_DIR)) {
    console.error(`找不到设计图目录：${SRC_DIR}`);
    process.exit(1);
  }
  mkdirSync(OUT_DIR, { recursive: true });

  const available = new Set(readdirSync(SRC_DIR));
  let ok = 0;
  let skipped = 0;

  for (const board of BOARDS) {
    for (const theme of ["light", "dark"]) {
      const file =
        theme === "dark"
          ? board.file.replace(/\.png$/, `${DARK_SUFFIX}.png`)
          : board.file;
      if (!available.has(file)) {
        console.warn(`  跳过（设计图里没有）：${file}`);
        skipped += 1;
        continue;
      }

      const out = join(OUT_DIR, `${board.name}${theme === "dark" ? "-dark" : ""}.png`);
      const image = sharp(join(SRC_DIR, file)).extract(board.crop).resize({
        width: board.expect.width,
        height: board.expect.height,
        fit: "cover",
      });
      const buffer = await image.png({ compressionLevel: 9 }).toBuffer();
      writeFileSync(out, buffer);
      ok += 1;
      console.log(`  ${file} → reference/supplement/${out.split("/").pop()}`);
    }
  }

  console.log(`\n完成：${ok} 张参考图，跳过 ${skipped} 张。输出目录 ${OUT_DIR}`);
}

await main();
