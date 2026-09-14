/**
 * 把设计稿 PDF 里与本批相关的页渲染成 PNG，作为 UI 还原度对比的参考图。
 *
 * 为什么要落文件而不是每次现转：对比图是**验收证据**，评审时应当能直接打开看，
 * 而不是先跑一个转换脚本。参考图体量很小（每页 100-300KB），入库的成本
 * 远低于"每个人都要自己转一遍"。
 *
 * 产物**入库**（`apps/web/e2e/reference/`，与跑出来的截图分开放在
 * 已 gitignore 的 `.ui-capture/`）。因此这一步只在设计稿更新时需要重跑：
 *
 *   node apps/web/scripts/extract-design-reference.mjs
 *
 * 依赖 `pdfjs-dist` 与 `@napi-rs/canvas`——两者都已在 pnpm store 里
 * （分别由 react-pdf 与某个工具链带入）。刻意**不写进 package.json**：
 * 这是设计稿更新时的一次性工具，不是构建或测试链路的一环，加进依赖
 * 会让每次 `pnpm install` 都为它付成本。
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const APP_ROOT = join(HERE, "..");
const REPO_ROOT = join(APP_ROOT, "..", "..");
const PDF = join(REPO_ROOT, "docs", "ui", "Anynote 新前端 UI 重设计.pdf");
/** 入库的参考图目录。截图落在 gitignore 的 e2e/.ui-capture/，两者刻意分开。 */
const OUT_DIR = join(APP_ROOT, "e2e", "reference");

/**
 * 需要导出的页与文件名。
 *
 * 页号按 PDF 实际页码（1 起）。只导本批「加载体系」相关的 5 页——
 * 全导会让参考图目录变成设计稿的第二份拷贝，反而看不出哪些是对比基准。
 */
const PAGES = [
  { page: 12, name: "p12-loading-system.png", note: "加载体系总览（5 套组件 × 2 主题）" },
  { page: 13, name: "p13-skeleton.png", note: "01 骨架屏：基础形状 / 实战 / 扫光关键帧" },
  { page: 14, name: "p14-spinner-progress.png", note: "02 转圈 + 03 进度" },
  { page: 15, name: "p15-streaming.png", note: "04 AI 流式三态" },
  { page: 16, name: "p16-brand-boot.png", note: "05 品牌启动 + 路由进度条 + 骨架兜底" },
];

/** pnpm store 里的包路径（版本号变了要跟着改，所以放在这里集中一处）。 */
const STORE = join(REPO_ROOT, "node_modules", ".pnpm");
const CANVAS_SPEC = "@napi-rs+canvas@1.0.9";
const PDFJS_SPEC = "pdfjs-dist@6.3.289";

function storePath(spec, rest) {
  return join(STORE, spec, "node_modules", ...rest);
}

async function main() {
  if (!existsSync(PDF)) {
    console.error(`找不到设计稿：${PDF}`);
    process.exit(1);
  }

  const canvasEntry = storePath(CANVAS_SPEC, ["@napi-rs", "canvas", "index.js"]);
  const pdfEntry = storePath(PDFJS_SPEC, ["pdfjs-dist", "legacy", "build", "pdf.mjs"]);
  for (const entry of [canvasEntry, pdfEntry]) {
    if (!existsSync(entry)) {
      console.error(
        `缺少依赖：${entry}\n请先 \`pnpm install\`，并确认 pnpm store 里的版本号与脚本常量一致。`,
      );
      process.exit(1);
    }
  }

  const { createCanvas } = await import(`file:///${canvasEntry.replace(/\\/g, "/")}`);
  const pdfjs = await import(`file:///${pdfEntry.replace(/\\/g, "/")}`);
  const doc = await pdfjs.getDocument({ url: PDF, verbosity: 0 }).promise;

  mkdirSync(OUT_DIR, { recursive: true });
  console.log(`设计稿共 ${doc.numPages} 页，导出 ${PAGES.length} 页参考图 → ${OUT_DIR}\n`);

  for (const { page: pageNo, name, note } of PAGES) {
    if (pageNo > doc.numPages) {
      console.error(`  第 ${pageNo} 页不存在，跳过 ${name}`);
      continue;
    }
    const page = await doc.getPage(pageNo);
    // scale 2：文字与 1px 描边在并排对比时仍可辨，同时不至于让单页超过 1MB
    const viewport = page.getViewport({ scale: 2 });
    const canvas = createCanvas(viewport.width, viewport.height);
    const ctx = canvas.getContext("2d");
    // 显式铺白：PDF 背景透明，不铺的话对比图上是黑底
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, viewport, canvas }).promise;
    writeFileSync(join(OUT_DIR, name), canvas.toBuffer("image/png"));
    console.log(`  ✓ ${name}  ${viewport.width}×${viewport.height}  ${note}`);
  }

  console.log("\n完成。UI 对比看板由 `node apps/web/scripts/ui-capture.mjs` 生成。");
}

await main();
