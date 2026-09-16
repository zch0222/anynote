/**
 * UI 还原度审计：逐屏截图 + 与设计画板**按同一几何裁剪**后并排。
 *
 * 与既有两个脚本的关系：
 * - `ui-capture.mjs` 对 PDF 原稿 p01–p16；
 * - `ui-supplement-compare.mjs` 对补稿画板，但它把**整幅画板**贴在右边（含图例列），
 *   且**主题切换函数定义了却从未调用**——所有 `-dark` 截图实际是浅色。
 *   本脚本修掉这两点：参考图先用 `lib/supplement-crops.mjs` 裁出屏幕内区
 *   （1440×900 / 390×844），再与同尺寸的真实截图并排。
 *
 * 用法（需生产构建 + Docker 全栈 + 已跑过 global-setup 拿到登录态）：
 *   node apps/web/scripts/ui-audit-capture.mjs
 *   node apps/web/scripts/ui-audit-capture.mjs --only d05
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";
import { dedupeCrops, detectScreenCrops } from "./lib/supplement-crops.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const APP_ROOT = join(HERE, "..");
const REPO_ROOT = join(APP_ROOT, "..", "..");
const BOARDS_DIR = join(REPO_ROOT, "docs", "ui", "ui-supplement");
const OUT_DIR = join(APP_ROOT, "e2e", ".ui-audit");
const STATE_PATH = join(APP_ROOT, "e2e", ".auth", "state.json");
const STORE = join(REPO_ROOT, "node_modules", ".pnpm");
const SHARP_SPEC = "sharp@0.34.5";

const BASE_URL =
  process.env.UI_CAPTURE_BASE_URL ?? process.env.E2E_BASE_URL ?? "http://localhost:3000";

const VIEWPORTS = {
  desktop: { width: 1440, height: 900 },
  mobile: { width: 390, height: 844 },
};

/**
 * 场景表：`board` 是画板名，`view` 定视口，`path` 是地址（`{baseId}` 等占位由 seed 填）。
 * `ready` 是「页面画完了」的等待选择器——等不到就说明这一屏根本没渲染出来。
 */
const SCENES = [
  {
    name: "d01-kb-notes",
    title: "D-01 知识库详情 · 笔记 Tab",
    board: "D-01-kb-notes",
    view: "desktop",
    path: "/notes/{baseId}",
    seed: true,
    ready: '[data-testid="note-list"]',
  },
  {
    name: "d02-kb-overview",
    title: "D-02 知识库详情 · 概览 Tab",
    board: "D-02-kb-overview",
    view: "desktop",
    path: "/notes/{baseId}/overview",
    seed: true,
    ready: '[data-testid="kb-overview"], h1',
  },
  {
    name: "d03-note-new",
    title: "D-03 新建笔记 · 选择知识库",
    board: "D-03-note-new",
    view: "desktop",
    path: "/notes/new",
    seed: true,
    ready: '[data-testid="create-note-page"], h1',
  },
  {
    name: "d05-kb-mooc",
    title: "D-05 知识库详情 · 慕课 Tab",
    board: "D-05-kb-mooc",
    view: "desktop",
    path: "/notes/{baseId}/mooc",
    seed: true,
    ready: "h1",
  },
  {
    name: "d06-kb-mooc-detail",
    title: "D-06 慕课详情 · 目录与播放",
    board: "D-06-kb-mooc-detail",
    view: "desktop",
    path: "/notes/{baseId}/mooc/{moocId}",
    seed: true,
    ready: "h1",
  },
  {
    name: "d07-kb-tasks",
    title: "D-07 知识库详情 · 任务 Tab",
    board: "D-07-kb-tasks",
    view: "desktop",
    path: "/notes/{baseId}/tasks",
    seed: true,
    ready: "h1",
    hooks: "table",
  },
  {
    name: "d08-kb-docs",
    title: "D-08 知识库详情 · 资料 Tab",
    board: "D-08-kb-docs",
    view: "desktop",
    path: "/notes/{baseId}/docs",
    seed: true,
    ready: "h1",
  },
  {
    name: "d09-kb-members",
    title: "D-09 知识库详情 · 成员 Tab",
    board: "D-09-kb-members",
    view: "desktop",
    path: "/notes/{baseId}/members",
    seed: true,
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
    name: "d11-collab-workspace",
    title: "D-11 协同文档工作区",
    board: "D-11-collab-workspace",
    view: "desktop",
    path: "/docs",
    ready: "h1",
    act: "create-doc",
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
    name: "d14-auth-login",
    title: "D-14 登录",
    board: "D-14-auth-login",
    view: "desktop",
    path: "/login",
    anonymous: true,
    ready: '[data-slot="card"]',
  },
  {
    name: "d15-auth-cli",
    title: "D-15 CLI 授权",
    board: "D-15-auth-cli",
    view: "desktop",
    path: "/cli/authorize?port=53817&state=audit&challenge=audit",
    ready: "h1",
  },
  {
    name: "d16-note-history",
    title: "D-16 笔记历史版本",
    board: "D-16-note-history",
    view: "desktop",
    path: "/notes/{baseId}/{noteId}/history",
    seed: true,
    ready: '[data-testid="note-history-page"]',
  },
  {
    name: "d17-task-detail",
    title: "D-17 任务详情",
    board: "D-17-task-detail",
    view: "desktop",
    path: "/notes/{baseId}/tasks/{taskId}",
    seed: true,
    ready: "h1",
  },
  {
    name: "d18-task-form",
    title: "D-18 任务新建",
    board: "D-18-task-form",
    view: "desktop",
    path: "/notes/{baseId}/tasks/new",
    seed: true,
    ready: "h1",
  },
  {
    name: "m01-dashboard",
    title: "M-01 工作台",
    board: "M-01-dashboard",
    view: "mobile",
    path: "/m/dashboard",
    seed: true,
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
    name: "m03-kb-mooc",
    title: "M-03 知识库详情 · 慕课 Tab",
    board: "M-03-kb-mooc",
    view: "mobile",
    path: "/m/notes/{baseId}/mooc",
    seed: true,
    ready: "h1",
  },
  {
    name: "m04-kb-tasks",
    title: "M-04 知识库详情 · 任务 Tab",
    board: "M-04-kb-tasks",
    view: "mobile",
    path: "/m/notes/{baseId}/tasks",
    seed: true,
    ready: "h1",
  },
  {
    name: "m05-kb-docs",
    title: "M-05 知识库详情 · 资料 Tab",
    board: "M-05-kb-docs",
    view: "mobile",
    path: "/m/notes/{baseId}/docs",
    seed: true,
    ready: "h1",
  },
  {
    name: "m06-mooc-detail",
    title: "M-06 慕课详情 · 目录与内容",
    board: "M-06-mooc-detail",
    view: "mobile",
    path: "/m/notes/{baseId}/mooc/{moocId}",
    seed: true,
    ready: "h1",
  },
  {
    name: "m07-note-new",
    title: "M-07 新建笔记",
    board: "M-07-note-new",
    view: "mobile",
    path: "/m/notes/new",
    seed: true,
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
    name: "m09-doc-workspace",
    title: "M-09 协同文档",
    board: "M-09-doc-workspace",
    view: "mobile",
    path: "/m/docs",
    ready: "h1",
    act: "create-doc",
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
  {
    name: "m12-task-detail",
    title: "M-12 任务详情",
    board: "M-12-task-detail",
    view: "mobile",
    path: "/m/notes/{baseId}/tasks/{taskId}",
    seed: true,
    ready: "h1",
  },
  {
    name: "m13-note-history",
    title: "M-13 笔记历史版本",
    board: "M-13-note-history",
    view: "mobile",
    path: "/m/notes/{baseId}/{noteId}/history",
    seed: true,
    ready: "h1",
  },
];

/** 造数：1 个库 + 3 篇笔记 + 1 门课 + 1 个任务，返回真实 id。 */
async function seedData(page) {
  return page.evaluate(async () => {
    const baseName = `审计库 ${Date.now().toString(36).slice(-5)}`;
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
    const cover = "https://anynote.obs.cn-east-3.myhuaweicloud.com/images/knowledge_base_cover.png";
    const created = await post("bases", {
      name: baseName,
      detail: "UI 审计造数",
      cover,
      type: 0,
    });
    const baseId = Number(created?.id ?? created);

    const noteIds = [];
    for (const title of ["设计原则速查", "组件命名约定", "评审检查清单"]) {
      const id = await post("notes", {
        title,
        knowledgeBaseId: baseId,
        content: `# ${title}\n\n正文占位。`,
      });
      noteIds.push(Number(id?.id ?? id));
    }
    // 历史版本要真的有版本：改一次正文就会生成一条
    await fetch(`/api/proxy/note/notes/${noteIds[0]}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ content: "# 设计原则速查\n\n改过一次，用于生成历史版本。" }),
    });

    const moocRaw = await post("moocs", {
      title: "审计课程",
      knowledgeBaseId: baseId,
      cover,
      dataScope: 1,
      moocDescription: "用于 UI 还原度审计的课程。",
    });
    const moocId = Number(moocRaw?.id ?? moocRaw);

    /*
     * 给课程建章节 + 子条目：D-06 / M-06 比对的是「目录 + 内容」版式，
     * 空课程截出来只有一句空态，看不出目录树与内容区的形态。
     * `moocItemType`：0 = 章节（容器）/ 1 = 视频 / 2 = 文档（见 features/mooc/schemas.ts:53）。
     */
    const ch1 = await post("moocs/items", {
      moocId,
      item: { title: "第 1 章 · 设计系统基础", moocItemType: 0, parentId: 0 },
    });
    const chapterId = Number(ch1?.id ?? ch1);
    await post("moocs/items", {
      moocId,
      item: { title: "第 2 章 · 设计 Token", moocItemType: 0, parentId: 0 },
    });
    if (Number.isFinite(chapterId) && chapterId > 0) {
      await post("moocs/items", {
        moocId,
        item: {
          title: "1.3 课前阅读：Atomic Design",
          moocItemType: 2,
          parentId: chapterId,
          itemText: "# Atomic Design\n\n课前阅读正文，用于核对内容区版式。",
        },
      });
    }

    const now = Date.now();
    const taskRaw = await post("admin/noteTasks", {
      taskName: "审计任务",
      knowledgeBaseId: baseId,
      startTime: new Date(now - 86_400_000).toISOString(),
      endTime: new Date(now + 6 * 86_400_000).toISOString(),
      taskDescribe: "用于 UI 还原度审计的任务。",
    });
    const taskId = Number(taskRaw?.id ?? taskRaw);

    return { baseId, noteId: noteIds[0], moocId, taskId };
  });
}

/** 量出画板里第 0 块屏的裁剪框（同一套判定，与 extract-supplement-reference 一致）。 */
async function cropBoard(sharp, file) {
  const full = join(BOARDS_DIR, file);
  if (!existsSync(full)) return null;
  const { data, info } = await sharp(full).raw().toBuffer({ resolveWithObject: true });
  const crops = dedupeCrops(
    detectScreenCrops({
      pixels: data,
      width: info.width,
      height: info.height,
      channels: info.channels,
    }),
  );
  const first = crops[0];
  if (!first) return null;
  // 复用已清洗标注记号的 data
  return sharp(data, { raw: { width: info.width, height: info.height, channels: info.channels } })
    .extract({ left: first.left, top: first.top, width: first.width, height: first.height })
    .resize({ width: first.css.width, height: first.css.height, fit: "cover" })
    .png()
    .toBuffer();
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes("--list")) {
    for (const s of SCENES) console.log(`${s.name.padEnd(24)} ${s.title}`);
    return;
  }
  const only = args.includes("--only") ? args[args.indexOf("--only") + 1] : null;
  const scenes = only ? SCENES.filter((s) => s.name.includes(only)) : SCENES;

  if (!existsSync(STATE_PATH)) {
    console.error(`缺少登录态：${STATE_PATH}`);
    process.exit(1);
  }

  const sharp = (
    await import(
      `file:///${join(STORE, SHARP_SPEC, "node_modules", "sharp", "lib", "index.js").replace(/\\/g, "/")}`
    )
  ).default;

  mkdirSync(OUT_DIR, { recursive: true });
  const browser = await chromium.launch();
  const report = [];

  for (const scene of scenes) {
    const context = await browser.newContext({
      storageState: scene.anonymous ? { cookies: [], origins: [] } : STATE_PATH,
      viewport: VIEWPORTS[scene.view],
      deviceScaleFactor: 2,
      isMobile: scene.view === "mobile",
      hasTouch: scene.view === "mobile",
      locale: "zh-CN",
    });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e.message).slice(0, 200)));
    page.on("console", (m) => {
      if (m.type() === "error") errors.push(m.text().slice(0, 200));
    });

    // 造数一次，两个主题共用
    let ids = { baseId: 1 };
    if (scene.seed) {
      await page.goto(`${BASE_URL}/notes`, { waitUntil: "domcontentloaded" });
      ids = await seedData(page);
    }

    const href = (scene.path ?? "/login")
      .replace("{baseId}", String(ids.baseId))
      .replace("{noteId}", String(ids.noteId ?? 1))
      .replace("{moocId}", String(ids.moocId ?? 1))
      .replace("{taskId}", String(ids.taskId ?? 1));

    const row = { name: scene.name, title: scene.title, view: scene.view, href, shots: [] };

    for (const theme of ["light", "dark"]) {
      /*
       * 主题：登录页没有顶栏菜单，用 `prefers-color-scheme` 驱动；
       * 其余页面把偏好写进 localStorage（next-themes 的 key 就是 `theme`）。
       * 必须先访问一次站点源才能写 localStorage。
       */
      if (scene.anonymous) {
        await page.emulateMedia({ colorScheme: theme });
        await page.goto(`${BASE_URL}${href}`, { waitUntil: "domcontentloaded" });
        await page.evaluate(() => {
          localStorage.removeItem("theme");
          document.documentElement.classList.toggle("dark", false);
        });
      } else {
        await page.goto(`${BASE_URL}/login`, { waitUntil: "domcontentloaded" });
        await page.evaluate((v) => localStorage.setItem("theme", v), theme);
      }

      await page.goto(`${BASE_URL}${href}`, { waitUntil: "domcontentloaded" });

      if (scene.act === "create-doc") {
        const listHref = scene.view === "mobile" ? "/m/docs" : "/docs";
        await page.goto(`${BASE_URL}${listHref}`, { waitUntil: "domcontentloaded" });
        await page.getByRole("button", { name: "新建文档" }).first().click();
        const dialog = page.getByRole("dialog");
        await dialog.waitFor({ timeout: 20_000 });
        await dialog
          .locator("#collab-doc-title")
          .fill(`审计文档 ${Date.now().toString(36).slice(-5)}`);
        await dialog.getByRole("button", { name: "创建" }).click();
        await page.waitForURL(/\/docs\/.+/, { timeout: 30_000 });
        await page.waitForLoadState("networkidle").catch(() => {});
        await page.waitForTimeout(1500);
      }

      let readyOk = true;
      try {
        if (scene.ready) await page.waitForSelector(scene.ready, { timeout: 30_000 });
      } catch {
        readyOk = false;
      }
      await page.waitForLoadState("networkidle").catch(() => {});
      await page.waitForTimeout(500);

      const shotPath = join(OUT_DIR, `${scene.name}-${theme}.png`);
      await page.screenshot({ path: shotPath });

      // 主题是否真的生效
      const html = await page.evaluate(() => ({
        cls: document.documentElement.className,
        bodyBg: getComputedStyle(document.body).backgroundColor,
        ls: localStorage.getItem("theme"),
      }));

      const boardFile = theme === "dark" ? `${scene.board}-dark.png` : `${scene.board}.png`;
      const refBuf = await cropBoard(sharp, boardFile);
      let comparePath = null;
      if (refBuf) {
        comparePath = join(OUT_DIR, `${scene.name}-compare-${theme}.png`);
        await writeSideBySide(sharp, shotPath, refBuf, comparePath);
      }

      row.shots.push({
        theme,
        ready: readyOk,
        darkClass: /\bdark\b/.test(html.cls),
        bodyBg: html.bodyBg,
        localStorageTheme: html.ls,
        board: existsSync(join(BOARDS_DIR, boardFile)) ? boardFile : null,
        screenshot: shotPath.split(/[\\/]/).pop(),
        compare: comparePath ? comparePath.split(/[\\/]/).pop() : null,
        errors: [...new Set(errors)].slice(0, 5),
      });
      errors.length = 0;
    }

    await context.close();
    report.push(row);
    const ok = row.shots.every((s) => s.ready) ? "✓" : "✗";
    console.log(
      `${ok} ${scene.name.padEnd(24)} ${row.shots.map((s) => `${s.theme}${s.darkClass ? "(dark)" : "(light)"}`).join(" ")}`,
    );
  }

  await browser.close();
  writeFileSync(join(OUT_DIR, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
  console.log(`\n产物：${OUT_DIR}`);
}

/**
 * 左参考（画板裁出的屏幕区）| 右实现，**同一像素尺寸**并排，可直接逐像素比。
 *
 * 两侧必须显式对齐到同一宽度再拼：参考图是 CSS 像素（1440×900），
 * 截图是 `deviceScaleFactor: 2` 的设备像素（2880×1800）。直接拼会一边大一边小，
 * 人眼看到的"字号差异"全是缩放造成的假象——这正是要避免的假结论。
 */
async function writeSideBySide(sharp, shotPath, refBuf, outPath) {
  const refMeta = await sharp(refBuf).metadata();
  const w = refMeta.width;
  const h = refMeta.height;
  const shotScaled = await sharp(shotPath).resize({ width: w, height: h, fit: "cover" }).toBuffer();
  const gap = 20;
  await sharp({
    create: { width: w * 2 + gap, height: h, channels: 3, background: "#1d1d1f" },
  })
    .composite([
      { input: refBuf, left: 0, top: 0 },
      { input: shotScaled, left: w + gap, top: 0 },
    ])
    .png({ compressionLevel: 9 })
    .toFile(outPath);
}

await main();
