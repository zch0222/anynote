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
import { dedupeCrops, detectScreenCrops } from "./lib/supplement-crops.mjs";

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
 * 要抽取的画板。
 *
 * **这里只列"哪张画板的第几块屏"**，裁剪框本身在运行时由
 * `lib/supplement-crops.mjs` 从画板像素里量出来（依据见 `detectScreenCrops` 的注释：
 * 窗口边框色恒为 `#d8d8de`，内区因此可以纯靠颜色算出来）。
 *
 * 不写死数字是刻意为之：这份表原先手填过一版，全部错位（写成 1340×615，
 * 实际 1440×900），并排对比图于是"两边字号看起来不一样"，而真实原因只在裁剪。
 * 现在数字只有一处来源（画板本身），不存在"改了画板忘了改表"的可能。
 *
 * `screen` 是画板里第几块屏（0 起）。移动画板把多台手机并排画在同一张图上，
 * 这里一律取第一台。
 */
const BOARDS = [
  // —— 桌面：知识库内 ——
  { file: "D-01-kb-notes.png", name: "d01-kb-notes" },
  { file: "D-02-kb-overview.png", name: "d02-kb-overview" },
  { file: "D-05-kb-mooc.png", name: "d05-kb-mooc" },
  { file: "D-06-kb-mooc-detail.png", name: "d06-kb-mooc-detail" },
  { file: "D-07-kb-tasks.png", name: "d07-kb-tasks" },
  { file: "D-08-kb-docs.png", name: "d08-kb-docs" },
  { file: "D-09-kb-members.png", name: "d09-kb-members" },
  { file: "D-03-note-new.png", name: "d03-note-new" },
  { file: "D-10-collab-library.png", name: "d10-collab-library" },
  { file: "D-12-settings-account.png", name: "d12-settings-account" },
  { file: "D-13-settings-appearance.png", name: "d13-settings-appearance" },
  // —— 移动：390×844 ——
  { file: "M-01-dashboard.png", name: "m01-dashboard" },
  { file: "M-02-me.png", name: "m02-me" },
  { file: "M-03-kb-mooc.png", name: "m03-kb-mooc" },
  { file: "M-04-kb-tasks.png", name: "m04-kb-tasks" },
  { file: "M-05-kb-docs.png", name: "m05-kb-docs" },
  { file: "M-07-note-new.png", name: "m07-note-new" },
  { file: "M-08-doc-library.png", name: "m08-doc-library" },
  { file: "M-10-search.png", name: "m10-search" },
  { file: "M-11-settings.png", name: "m11-settings" },
];

/** 深色版只需换文件名后缀；排板布局与浅色版一致。 */
const DARK_SUFFIX = "-dark";

/**
 * 从画板原始像素里量出**第一块屏**的裁剪框。
 *
 * "第一块"是画板里最靠左上的那块屏（`detectScreenCrops` 已按左上角排序）。
 * 裁剪框与期望尺寸都由 `lib/supplement-crops.mjs` 算出，本脚本不参与判定——
 * 它只负责读盘、调用与写文件。
 */
function cropForBoard({ pixels, width, height, channels }) {
  const crops = dedupeCrops(detectScreenCrops({ pixels, width, height, channels }));
  const first = crops[0];
  if (!first) return null;
  return {
    crop: { left: first.left, top: first.top, width: first.width, height: first.height },
    expect: { width: first.css.width, height: first.css.height },
  };
}

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
        theme === "dark" ? board.file.replace(/\.png$/, `${DARK_SUFFIX}.png`) : board.file;
      if (!available.has(file)) {
        console.warn(`  跳过（设计图里没有）：${file}`);
        skipped += 1;
        continue;
      }

      const { data, info } = await sharp(join(SRC_DIR, file))
        .raw()
        .toBuffer({ resolveWithObject: true });
      /*
       * `detectScreenCrops` 会**就地**抹掉画板上的品红/紫罗兰标注记号
       * （设计者用来标编号的角标与引线，压在屏幕内容上）。
       * 所以下面裁图必须复用这份已清洗的 `data`，不能重新读一次原图——
       * 否则参考图里会留着记号，逐像素测量会把它们当成内容
       * （实测「最近笔记」标题因此被多算 15px）。
       */
      const measured = cropForBoard({
        pixels: data,
        width: info.width,
        height: info.height,
        channels: info.channels,
      });
      if (!measured) {
        // 量不出屏就**失败退出**而不是回退到某个默认框：回退正是当初错位事故的形态
        console.error(`  量不出屏幕内区：${file}（${info.width}x${info.height}）`);
        process.exitCode = 1;
        continue;
      }

      const out = join(OUT_DIR, `${board.name}${theme === "dark" ? "-dark" : ""}.png`);
      const buffer = await sharp(data, {
        raw: { width: info.width, height: info.height, channels: info.channels },
      })
        .extract(measured.crop)
        .resize({ width: measured.expect.width, height: measured.expect.height, fit: "cover" })
        .png({ compressionLevel: 9 })
        .toBuffer();
      writeFileSync(out, buffer);
      ok += 1;
      console.log(
        `  ${file} → reference/supplement/${out.split("/").pop()}  ` +
          `crop=${JSON.stringify(measured.crop)} expect=${measured.expect.width}x${measured.expect.height}`,
      );
    }
  }

  console.log(`\n完成：${ok} 张参考图，跳过 ${skipped} 张。输出目录 ${OUT_DIR}`);
}

await main();
