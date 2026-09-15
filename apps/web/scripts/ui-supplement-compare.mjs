/**
 * UI 补稿（D-xx / M-xx）的**真实浏览器截图 + 与设计画板并排对比**。
 *
 * 与 `ui-capture.mjs` 的分工：
 * - `ui-capture.mjs` 对的是 PDF 原设计稿（p01–p16），场景是加载体系与编辑器；
 * - 这个脚本对的是补稿画板（`docs/ui/ui-supplement/`），场景是本轮新增 / 改版的屏幕。
 *
 * 为什么单独一个脚本而不是往 `ui-capture.mjs` 里加场景：后者的参考图是 PDF 页，
 * 走 `extract-design-reference.mjs`；补稿的参考图是整幅画板（右侧带图例列、
 * 下方带状态缩略），无法直接并排。这里改为**不裁剪参考图**，而是把浏览器截图
 * 按同一宽度贴到画板左侧、画板整体放右边 —— 人眼在画板上找屏幕区比对，
 * 比"脚本猜裁剪框"更可靠（猜错会产出对错页的图，比不裁更糟）。
 *
 * 用法（需要生产构建 + Docker 全栈在跑 + 已跑过一次 `test:e2e` 拿到登录态）：
 *   node apps/web/scripts/ui-supplement-compare.mjs                # 全部场景
 *   node apps/web/scripts/ui-supplement-compare.mjs --only d07    # 名含 d07 的场景
 *   node apps/web/scripts/ui-supplement-compare.mjs --list
 *
 * 产物（已 gitignore）：
 *   apps/web/e2e/.ui-supplement/<scene>-<theme>.png            真实截图
 *   apps/web/e2e/.ui-supplement/<scene>-compare-<theme>.png    并排对比图
 *   apps/web/e2e/.ui-supplement/report.json                    每个场景的可比较指标
 *   apps/web/e2e/.ui-supplement/index.html                     一页看完全部对比
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
// 从 `@playwright/test` 取 chromium：只有它是 package.json 声明的依赖，
// `playwright-core` 在 pnpm 严格布局下裸 `node` 解析不到（同 ui-capture.mjs）。
import { chromium } from "@playwright/test";

const HERE = dirname(fileURLToPath(import.meta.url));
const APP_ROOT = join(HERE, "..");
const REPO_ROOT = join(APP_ROOT, "..", "..");
const BOARDS_DIR = join(REPO_ROOT, "docs", "ui", "ui-supplement");
const OUT_DIR = join(APP_ROOT, "e2e", ".ui-supplement");
const STATE_PATH = join(APP_ROOT, "e2e", ".auth", "state.json");

const BASE_URL =
  process.env.UI_CAPTURE_BASE_URL ?? process.env.E2E_BASE_URL ?? "http://localhost:3000";

/** sharp 的 store 路径（理由见 extract-supplement-reference.mjs）。 */
const STORE = join(REPO_ROOT, "node_modules", ".pnpm");
const SHARP_SPEC = "sharp@0.34.5";

/** 桌面与移动两个视口，与设计画板的屏幕尺寸一致。 */
const VIEWPORTS = {
  desktop: { width: 1440, height: 900 },
  mobile: { width: 390, height: 844 },
};

/**
 * 场景表。
 *
 * `board` 是设计画板文件名去掉主题后缀，`view` 决定视口，`path` 是要打开的地址。
 * `seed` 声明这个场景**需要先有真实数据**（知识库 / 笔记 / 任务），
 * 由 `seedData()` 统一准备——空数据截出来的是空态，判不了版式。
 *
 * `ready` 是「页面真的画完了」的等待选择器：所有列表 / 详情页都要等它，
 * 否则截到的是骨架（这一步不能用固定 sleep 代替，真实栈的响应时间会漂）。
 */
const SCENES = [
  {
    name: "d01-kb-notes",
    title: "D-01 知识库详情 · 笔记 Tab",
    board: "D-01-kb-notes",
    view: "desktop",
    path: "/notes/{baseId}",
    seed: "base",
    ready: '[data-testid="note-list"]',
  },
  {
    name: "d02-kb-overview",
    title: "D-02 知识库详情 · 概览 Tab",
    board: "D-02-kb-overview",
    view: "desktop",
    path: "/notes/{baseId}/overview",
    seed: "base",
    ready: '[data-testid="kb-overview"], h1',
  },
  {
    name: "d03-note-new",
    title: "D-03 新建笔记 · 选择知识库",
    board: "D-03-note-new",
    view: "desktop",
    path: "/notes/new",
    seed: "base",
    ready: '[data-testid="create-note-page"], h1',
  },
  {
    name: "d05-kb-mooc",
    title: "D-05 知识库详情 · 慕课 Tab",
    board: "D-05-kb-mooc",
    view: "desktop",
    path: "/notes/{baseId}/mooc",
    seed: "base",
    ready: "h1",
  },
  {
    name: "d07-kb-tasks",
    title: "D-07 知识库详情 · 任务 Tab",
    board: "D-07-kb-tasks",
    view: "desktop",
    path: "/notes/{baseId}/tasks",
    seed: "base",
    ready: "h1",
  },
  {
    name: "d08-kb-docs",
    title: "D-08 知识库详情 · 资料 Tab",
    board: "D-08-kb-docs",
    view: "desktop",
    path: "/notes/{baseId}/docs",
    seed: "base",
    ready: "h1",
  },
  {
    name: "d09-kb-members",
    title: "D-09 知识库详情 · 成员 Tab",
    board: "D-09-kb-members",
    view: "desktop",
    path: "/notes/{baseId}/members",
    seed: "base",
    ready: "h1",
  },
  {
    name: "d10-collab-library",
    title: "D-10 协同文档库",
    board: "D-10-collab-library",
    view: "desktop",
    path: "/docs",
    ready: "h1",
  },
  {
    name: "d12-settings-account",
    title: "D-12 设置 · 账号",
    board: "D-12-settings-account",
    view: "desktop",
    path: "/settings/profile",
    ready: "h1",
  },
  {
    name: "d13-settings-appearance",
    title: "D-13 设置 · 外观",
    board: "D-13-settings-appearance",
    view: "desktop",
    path: "/settings/appearance",
    ready: "h1",
  },
  {
    name: "m01-dashboard",
    title: "M-01 工作台",
    board: "M-01-dashboard",
    view: "mobile",
    path: "/m/dashboard",
    seed: "base",
    ready: '[data-testid="mobile-dashboard"], h1',
  },
  {
    name: "m02-me",
    title: "M-02 我的",
    board: "M-02-me",
    view: "mobile",
    path: "/m/me",
    ready: '[data-testid="mobile-me"], h1',
  },
  {
    name: "m04-kb-tasks",
    title: "M-04 知识库详情 · 任务 Tab",
    board: "M-04-kb-tasks",
    view: "mobile",
    path: "/m/notes/{baseId}/tasks",
    seed: "base",
    ready: "h1",
  },
  {
    name: "m05-kb-docs",
    title: "M-05 知识库详情 · 资料 Tab",
    board: "M-05-kb-docs",
    view: "mobile",
    path: "/m/notes/{baseId}/docs",
    seed: "base",
    ready: "h1",
  },
  {
    name: "m07-note-new",
    title: "M-07 新建笔记",
    board: "M-07-note-new",
    view: "mobile",
    path: "/m/notes/new",
    seed: "base",
    ready: "h1",
  },
  {
    name: "m08-doc-library",
    title: "M-08 协同文档库",
    board: "M-08-doc-library",
    view: "mobile",
    path: "/m/docs",
    ready: "h1",
  },
  {
    name: "m10-search",
    title: "M-10 搜索",
    board: "M-10-search",
    view: "mobile",
    path: "/m/search",
    ready: "h1",
  },
  {
    name: "m11-settings",
    title: "M-11 设置分节 · 账号",
    board: "M-11-settings",
    view: "mobile",
    path: "/m/settings/profile",
    ready: "h1",
  },
];

/** 主题切换：与 `e2e/support/theme.ts` 同款（等菜单完全收起再开下一次）。 */
async function setTheme(page, label) {
  const menu = page.getByRole("menu");
  const trigger = page.getByRole("button", { name: "切换主题" });
  await trigger.waitFor({ timeout: 20_000 });
  await trigger.click();
  await menu.waitFor({ timeout: 10_000 });
  await menu.getByRole("menuitemradio", { name: label }).click();
  await menu.waitFor({ state: "hidden", timeout: 10_000 });
  await page.waitForTimeout(150);
}

/** 用 BFF 直接建好场景需要的数据，返回真实 id。 */
async function seedData(page) {
  return page.evaluate(async () => {
    const baseName = `UI 补稿对比 ${Date.now().toString(36)}`;
    const post = async (path, body) => {
      const res = await fetch(`/api/proxy/note/${path}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => null);
      if (!json || json.code !== "00000") throw new Error(`${path}: ${json?.msg ?? res.status}`);
      return json.data;
    };
    const baseId = await post("bases", {
      name: baseName,
      detail: "UI 补稿对比造数",
      type: 0,
    });
    // 三篇笔记：列表要看出"图标 + 标题 + 相对时间"的行形态，一篇看不出密度
    for (const title of ["设计原则速查", "组件命名约定", "评审检查清单"]) {
      await post("notes", { title, knowledgeBaseId: baseId, content: `# ${title}\n\n正文占位。` });
    }
    return { baseId: Number(baseId) };
  });
}

function boardFiles(board) {
  if (!existsSync(BOARDS_DIR)) return [];
  const all = readdirSync(BOARDS_DIR);
  return {
    light: all.includes(`${board}.png`) ? join(BOARDS_DIR, `${board}.png`) : null,
    dark: all.includes(`${board}-dark.png`) ? join(BOARDS_DIR, `${board}-dark.png`) : null,
  };
}

async function main() {
  const args = process.argv.slice(2);
  const only = args.includes("--only") ? args[args.indexOf("--only") + 1] : null;

  if (args.includes("--list")) {
    for (const scene of SCENES) console.log(`${scene.name.padEnd(24)} ${scene.title}`);
    return;
  }

  const sharpEntry = join(STORE, SHARP_SPEC, "node_modules", "sharp", "lib", "index.js");
  const sharp = (await import(`file:///${sharpEntry.replace(/\\/g, "/")}`)).default;

  if (!existsSync(STATE_PATH)) {
    console.error(
      `缺少登录态：${STATE_PATH}\n请先跑一次 \`pnpm --filter web test:e2e\`（global-setup 会建立临时账号）。`,
    );
    process.exit(1);
  }

  mkdirSync(OUT_DIR, { recursive: true });
  const scenes = only ? SCENES.filter((s) => s.name.includes(only)) : SCENES;
  const themes = [
    { key: "light", label: "浅色" },
    { key: "dark", label: "深色" },
  ];

  const browser = await chromium.launch();
  const report = [];

  for (const scene of scenes) {
    const context = await browser.newContext({
      storageState: STATE_PATH,
      viewport: VIEWPORTS[scene.view],
      deviceScaleFactor: 2,
      isMobile: scene.view === "mobile",
      hasTouch: scene.view === "mobile",
      locale: "zh-CN",
    });
    const page = await context.newPage();

    // 造数（只造一次，两个主题共用）
    let ids = { baseId: 1 };
    if (scene.seed) {
      await page.goto(`${BASE_URL}/notes`, { waitUntil: "domcontentloaded" });
      ids = await seedData(page);
    }

    const boards = boardFiles(scene.board);
    const row = { name: scene.name, title: scene.title, view: scene.view, shots: [] };

    for (const theme of themes) {
      await page.goto(`${BASE_URL}/notes`, { waitUntil: "domcontentloaded" });
      await setTheme(page, theme.label);

      const href = scene.path.replace("{baseId}", String(ids.baseId));
      await page.goto(`${BASE_URL}${href}`, { waitUntil: "domcontentloaded" });
      await page.waitForSelector(scene.ready, { timeout: 30_000 });
      // 列表 / 详情的客户端取数要落地，等一次网络空闲
      await page.waitForLoadState("networkidle").catch(() => {});
      await page.waitForTimeout(500);

      const shotPath = join(OUT_DIR, `${scene.name}-${theme.key}.png`);
      await page.screenshot({ path: shotPath, fullPage: false });

      // 页面级横向溢出：375/390 宽下最容易出问题，顺手采集
      const overflow = await page.evaluate(() => {
        const root = document.documentElement;
        const widest = Array.from(document.querySelectorAll("*"))
          .filter((el) => el.getBoundingClientRect().right > root.clientWidth + 1)
          .slice(0, 3)
          .map((el) => `${el.tagName.toLowerCase()}.${String(el.className).slice(0, 80)}`);
        return { scrollWidth: root.scrollWidth, clientWidth: root.clientWidth, widest };
      });

      const board = boards[theme.key];
      let comparePath = null;
      if (board) {
        comparePath = join(OUT_DIR, `${scene.name}-compare-${theme.key}.png`);
        await writeComparison(sharp, shotPath, board, comparePath);
      }

      row.shots.push({
        theme: theme.key,
        screenshot: shotPath.split("/").pop(),
        compare: comparePath ? comparePath.split("/").pop() : null,
        board: board ? board.split("/").pop() : null,
        overflow,
      });
    }

    await context.close();
    report.push(row);
    console.log(`  ✓ ${scene.name}  ${row.shots.map((s) => s.theme).join(" / ")}`);
  }

  await browser.close();

  writeFileSync(join(OUT_DIR, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
  writeFileSync(join(OUT_DIR, "index.html"), buildIndex(report));
  console.log(`\n产物：${OUT_DIR}`);
  console.log(`看板：file://${join(OUT_DIR, "index.html")}`);
}

/**
 * 并排对比图：左 = 真实截图，右 = 设计画板（**整幅，不裁剪**）。
 *
 * 两侧按同一**高度**缩放而不是同一宽度：画板比截图宽得多（含图例列），
 * 等宽会让截图缩得看不清文字。等高之后两边的屏幕区域高度一致，
 * 垂直方向（间距、行高、区块顺序）可以直接对；水平方向人眼在画板上找屏幕左缘即可。
 */
async function writeComparison(sharp, shotPath, boardPath, outPath) {
  const shot = sharp(shotPath);
  const board = sharp(boardPath);
  const shotMeta = await shot.metadata();
  const boardMeta = await board.metadata();

  const targetHeight = Math.max(shotMeta.height, 900);
  const shotScaled = await shot
    .resize({ height: targetHeight, fit: "contain", background: "#f5f5f7" })
    .toBuffer();
  const boardScaled = await board.resize({ height: targetHeight, fit: "contain" }).toBuffer();

  const shotBuf = await sharp(shotScaled).metadata();
  const boardBuf = await sharp(boardScaled).metadata();
  const gap = 24;

  await sharp({
    create: {
      width: shotBuf.width + gap + boardBuf.width,
      height: targetHeight,
      channels: 3,
      background: "#ffffff",
    },
  })
    .composite([
      { input: shotScaled, left: 0, top: 0 },
      { input: boardScaled, left: shotBuf.width + gap, top: 0 },
    ])
    .png({ compressionLevel: 9 })
    .toFile(outPath);
}

function buildIndex(report) {
  const rows = report
    .map((scene) => {
      const cells = scene.shots
        .map((shot) => {
          const img = shot.compare ?? shot.screenshot;
          const extra = shot.compare ? "" : "<p class='warn'>设计图里没有这个主题的画板</p>";
          const of =
            shot.overflow.scrollWidth > shot.overflow.clientWidth + 1
              ? `<p class="bad">横向溢出 ${shot.overflow.scrollWidth} > ${shot.overflow.clientWidth}<br>${shot.overflow.widest.join("<br>")}</p>`
              : `<p class="ok">无横向溢出</p>`;
          return `<figure><figcaption>${shot.theme}</figcaption><a href="./${img}"><img src="./${img}" /></a>${extra}${of}</figure>`;
        })
        .join("");
      return `<section><h2>${scene.title}<small>${scene.name} · ${scene.view}</small></h2><div class="grid">${cells}</div></section>`;
    })
    .join("\n");

  return `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8" />
<title>UI 补稿还原度对比</title>
<style>
  body { margin: 0; padding: 24px; background: #f5f5f7; font: 14px/1.5 system-ui, sans-serif; color: #1d1d1f; }
  h1 { font-size: 22px; margin: 0 0 4px; }
  .lead { color: #6e6e73; margin: 0 0 24px; }
  section { background: #fff; border-radius: 14px; padding: 16px; margin-bottom: 20px; box-shadow: 0 1px 2px rgb(0 0 0 / .04), 0 4px 16px rgb(0 0 0 / .06); }
  h2 { font-size: 16px; margin: 0 0 12px; }
  h2 small { color: #a1a1a6; font-weight: 400; margin-left: 8px; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
  @media (max-width: 900px) { .grid { grid-template-columns: 1fr; } }
  figure { margin: 0; }
  figcaption { font-weight: 600; margin-bottom: 6px; }
  img { width: 100%; border: 1px solid #e5e5ea; border-radius: 8px; display: block; }
  .ok { color: #34c759; } .bad { color: #ff3b30; } .warn { color: #ff9500; }
  p { margin: 6px 0 0; font-size: 12px; }
</style></head>
<body>
<h1>UI 补稿还原度对比</h1>
<p class="lead">左：真实浏览器截图（生产构建 + 真实后端栈）；右：设计画板整幅（<code>docs/ui/ui-supplement/</code>）。两侧等高，垂直方向可直接对。</p>
${rows}
</body></html>
`;
}

await main();
