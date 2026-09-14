/**
 * 用真实浏览器打开真实页面截图，与设计稿逐屏比对还原度。
 *
 * 这是**验收工具**不是门禁：门禁（`pnpm --filter web test:e2e`）断言的是行为契约，
 * 而"像不像设计稿"只能靠人眼对图。所以这个脚本负责把两边的图**并排拼好**，
 * 让人一眼能判，而不是给出一个看似客观的相似度分数——像素相似度对"字体渲染差异"
 * 和"整块位置错位"给的分几乎一样，反而会掩盖真正要看的东西。
 *
 * 用法（需要生产构建 + Docker 全栈已在跑）：
 *   node apps/web/scripts/ui-capture.mjs                    # 全部场景
 *   node apps/web/scripts/ui-capture.mjs --only skeleton    # 只跑名字含 skeleton 的
 *   node apps/web/scripts/ui-capture.mjs --list             # 列出场景
 *
 * 产物：
 *   apps/web/e2e/.ui-capture/<scene>-light.png / -dark.png     真实页面截图
 *   apps/web/e2e/.ui-capture/<scene>-compare-<theme>.png       与设计稿并排的对比图（两态各一张）
 *   apps/web/e2e/.ui-capture/index.html                        一页看完全部场景
 *
 * 为什么落在 e2e/.ui-capture：与 e2e/.auth、e2e/.output 同为"跑出来的东西"，
 * 已在 `.gitignore` 的「端到端测试产物」节按目录忽略——截图每次跑都变，
 * 入库只会制造噪音。设计稿的参考图是另一回事（只有设计稿更新时才变），
 * 它落在 `e2e/reference/` 并且**入库**。
 *
 * 不需要浏览器的判定逻辑（挑哪张参考图、种子正文、对比图命名）拆在
 * `lib/ui-capture.mjs`，那边有单测——这类逻辑错了会产出"看着正常其实对错页"的图，
 * 比脚本直接崩更难发现。
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
// 从 `@playwright/test` 取 chromium 而不是 `playwright-core`：
// 只有前者是 package.json 里声明的依赖，后者由它间接带入、在 pnpm 的
// 严格 node_modules 布局下解析不到（裸 `node` 跑脚本不会走 pnpm 的软链）。
import { chromium } from "@playwright/test";
import { buildNoteBody, comparisonFileName, resolveReference } from "./lib/ui-capture.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const APP_ROOT = join(HERE, "..");
const OUT_DIR = join(APP_ROOT, "e2e", ".ui-capture");
/**
 * 设计稿渲染出的参考图（**入库**，见 `scripts/extract-design-reference.mjs`）。
 * 刻意与跑出来的截图分开放：截图每次跑都变，参考图只有设计稿更新时才变。
 */
const REF_DIR = join(APP_ROOT, "e2e", "reference");

const BASE_URL =
  process.env.UI_CAPTURE_BASE_URL ?? process.env.E2E_BASE_URL ?? "http://localhost:3000";
const STATE_PATH = join(APP_ROOT, "e2e", ".auth", "state.json");

/**
 * 场景表。
 *
 * `ref` 指向设计稿里对应那一页的渲染图，用于并排对比；拿不到就只出真实截图
 * （不假装对比过）。
 *
 * `hang` 是**为了捕捉加载态本身**：真实栈太快，直接 goto 拿到的永远是完成态。
 * 所以在导航前把数据端点挂起——这复现的正是"会话未知 / 数据未到"的真实状态，
 * 而不是伪造一个假的加载页面。
 *
 * ⚠️ **数据端点的模式必须带 `/api/proxy/` 前缀**：前端的私有请求一律先打 BFF
 * （`app/api/proxy/[...path]`）再由它带 Cookie 转发给 Gateway。只写
 * `**​/api/note/bases**` 会一个都匹配不上，而不匹配的 route 是**静默的**——
 * 页面照常加载完，于是 `waitFor` 一直等不到骨架而超时。
 */
const SCENES = [
  {
    name: "brand-boot",
    title: "05 品牌启动 · 全屏初始化",
    ref: "p16-brand-boot.png",
    path: "/notes",
    // 会话未确认 = 设计稿说的「全屏初始化」。这个端点是 BFF 自己的路由，不经 proxy
    hang: ["**/api/auth/me"],
    waitFor: '[data-slot="brand-boot"]',
    settle: 300,
  },
  {
    name: "skeleton-gallery",
    title: "01 骨架屏 · 知识库列表首屏",
    ref: "p13-skeleton.png",
    path: "/notes",
    // 把知识库列表挂住，停在骨架态
    hang: ["**/api/proxy/note/bases**"],
    waitFor: '[data-slot="skeleton-card-grid"]',
    settle: 600,
  },
  {
    name: "skeleton-note-list",
    title: "01 骨架屏 · 笔记列表（行 + 缩略图）",
    path: "/notes",
    hangNotes: true,
    waitFor: '[data-slot="skeleton-list"]',
    settle: 600,
  },
  {
    name: "spinner-progress",
    title: "02 转圈 + 03 进度 · 上传链路",
    ref: "p14-spinner-progress.png",
    path: "/ai/pdf",
    waitFor: '[data-testid="pdf-upload-zone"]',
  },
  {
    name: "ai-thinking",
    title: "04 AI 流式 · 思考中（首 token 未到达）",
    ref: "p15-streaming.png",
    path: "/ai/chat",
    hang: ["**/api/proxy/aiNio/**"],
    waitFor: '[data-testid="assistant-thinking"]',
    settle: 400,
    act: async (page) => {
      const composer = page.getByPlaceholder(/输入消息/);
      await composer.waitFor({ timeout: 30_000 });
      await composer.fill("用一句话介绍 Anynote");
      await page.getByRole("button", { name: "发送" }).click();
    },
  },
  /*
   * 编辑器两屏（设计稿 p04 浅 / p06 深、p09 浅 / p11 深）。
   *
   * 这两屏的要点是**没有独立标题行**：标题就是正文的首节点 H1，元信息行在它之上。
   * 所以场景必须**先真的有一篇带内容的笔记**——空笔记截出来只有一行 H1，
   * 看不出元信息行与正文的层级，也判不了"标题是不是正文的一部分"。
   * `seed` 负责把正文写成与设计稿同构的一份（H1 + 段落 + H2 + 列表 + 引用）：
   * 不这么做，截图里的正文是 E2E 用例随手写的句子，跟设计稿无从对照。
   */
  {
    name: "editor-note",
    title: "04 桌面编辑器 · 标题即正文 H1",
    ref: { light: "p04-editor-light.png", dark: "p06-editor-dark.png" },
    seed: "editor",
    waitFor: '[data-testid="note-document"]',
    settle: 600,
  },
  {
    name: "editor-note-mobile",
    title: "09 移动编辑器 · 标题即正文 H1",
    ref: { light: "p09-editor-mobile-light.png", dark: "p11-editor-mobile-dark.png" },
    seed: "editor-mobile",
    viewport: { width: 390, height: 844 },
    isMobile: true,
    waitFor: '[data-testid="mobile-note-meta"]',
    settle: 600,
  },
  {
    name: "route-progress",
    title: "05 品牌启动 · 顶栏路由进度条",
    ref: "p16-brand-boot.png",
    path: "/notes",
    waitFor: '[data-testid="kb-gallery"]',
    act: async (page) => {
      // 把目标路由的 RSC 请求拖慢，让进度条有可见的停留时间
      await page.route("**/ai/chat**", async (route) => {
        await new Promise((resolve) => setTimeout(resolve, 3000));
        await route.continue();
      });
      await page.evaluate(() => {
        document
          .querySelector('a[href="/ai/chat"]')
          ?.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 }));
      });
      await page.waitForSelector('[data-slot="route-progress"]', { timeout: 5000 });
      // 进度条 3s 渐进制到 90%，等它走到中段再截
      await page.waitForTimeout(1200);
    },
  },
];

/** 主题切换：与 e2e/support/theme.ts 同款（等菜单完全收起再开下一次）。 */
async function setTheme(page, label) {
  const menu = page.getByRole("menu");
  await page.getByRole("button", { name: "切换主题" }).click();
  await menu.waitFor({ state: "visible" });
  await menu.getByRole("menuitemradio", { name: label }).click();
  await menu.waitFor({ state: "hidden" });
}

/**
 * 与设计稿同构的种子正文。判定逻辑在 `lib/ui-capture.mjs`，那边有单测盯着。
 *
 * 标题必须与 `NOTE_TITLE` 一致——它同时是笔记的 `title` 字段，
 * 打开时 `ensureLeadingHeading` 见到首节点已是 H1 就原样返回，不会再补一行。
 */
const NOTE_TITLE = "交互一致性检查清单";

const DEFAULT_BASE_COVER =
  "https://anynote.obs.cn-east-3.myhuaweicloud.com/images/knowledge_base_cover.png";

/**
 * 用**真实 BFF 端点**造一篇带正文的笔记，返回它的编辑页地址。
 *
 * 走页面里的 `fetch` 而不是另起 request context：BFF 的写请求要过 `checkOrigin`
 * （拿请求 Origin 与 `NEXT_PUBLIC_APP_URL` 逐字比对），而且鉴权靠 httpOnly Cookie——
 * 在页面上下文里发请求，这两件事都由浏览器自然满足。
 *
 * 设计稿里的正文是**服务端已有的内容**，所以这里也必须真的落库：
 * 编辑器一旦拿到初始值就不再接受回灌（回灌会把光标顶回文首），
 * 靠 `page.evaluate` 直接改 DOM 是改不出这个版式的。
 */
async function seedEditorNote(page, seed) {
  const isMobile = seed === "editor-mobile";
  const path = isMobile ? "/m/notes" : "/notes";
  await page.goto(`${BASE_URL}${path}`, { waitUntil: "domcontentloaded" });

  const created = await page.evaluate(
    async ({ title, body, cover, mobile }) => {
      const post = async (url, payload) => {
        const response = await fetch(`/api/proxy/note/${url}`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
        });
        const parsed = await response.json().catch(() => null);
        if (parsed?.code !== "00000") {
          throw new Error(`${url} 失败：${response.status} ${JSON.stringify(parsed)}`);
        }
        return parsed.data;
      };

      const bases = await fetch("/api/proxy/note/bases?page=1&pageSize=20&permissions=4").then(
        (response) => response.json(),
      );
      const existing = bases?.data?.rows?.[0];
      const baseId =
        existing?.id ??
        (await post("bases", { name: "UI 还原对比", detail: "截图脚本建立", cover, type: 0 }));

      const noteId = await post("notes", { knowledgeBaseId: baseId, title });
      // 正文单独 PATCH：创建端点只收标题，正文走编辑接口
      await fetch(`/api/proxy/note/notes/${noteId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ content: body }),
      });

      return mobile ? `/m/notes/${baseId}/${noteId}` : `/notes/${baseId}/${noteId}`;
    },
    {
      title: NOTE_TITLE,
      body: buildNoteBody(NOTE_TITLE),
      cover: DEFAULT_BASE_COVER,
      mobile: isMobile,
    },
  );

  await page.goto(`${BASE_URL}${created}`, { waitUntil: "domcontentloaded" });
  return created;
}

/**
 * 场景是否配了参考图，且参考图确实在。
 *
 * 要同时判 `name` 是否存在：不是每个场景都有对应的设计稿页
 * （比如"笔记列表骨架"要拼在 P13 那张拼版里，单独拿出来对不齐），
 * 只出真实截图、不假装对比过。
 */
function hasReference(name) {
  return typeof name === "string" && name !== "" && existsSync(join(REF_DIR, name));
}

/**
 * 场景在某主题下真正可用的参考图（挑图逻辑在 lib，有单测）。
 * 文件不在 `reference/` 里时同样返回 null——配了却缺文件不该被当成"对比过了"。
 */
function usableReference(scene, theme) {
  const name = resolveReference(scene, theme);
  return hasReference(name) ? name : null;
}

async function captureScene(browser, scene, theme) {
  const context = await browser.newContext({
    viewport: scene.viewport ?? { width: 1440, height: 900 },
    deviceScaleFactor: 2,
    locale: "zh-CN",
    ...(scene.isMobile ? { isMobile: true, hasTouch: true } : {}),
    ignoreHTTPSErrors: BASE_URL.startsWith("https:"),
    ...(existsSync(STATE_PATH) ? { storageState: STATE_PATH } : {}),
  });
  const page = await context.newPage();

  // 挂起指定的端点：这是复现"加载中"的真实手段，不是伪造页面
  for (const pattern of scene.hang ?? []) {
    await page.route(pattern, async () => {
      await new Promise(() => {});
    });
  }
  if (scene.hangNotes) {
    /*
     * 笔记列表：挂住列表请求，但要**先放行进库那一步**——进库之前
     * URL 还没带 `/notes/<id>`，无条件挂住会让 `openKnowledgeBase` 也走不完。
     */
    await page.route("**/api/proxy/note/notes**", async (route) => {
      if (/\/notes\/\d+/.test(page.url())) {
        await new Promise(() => {});
      }
      await route.continue();
    });
  }

  /*
   * 先把主题偏好**写进 localStorage 再导航**，而不是"导航 → 置偏好 → 刷新"。
   *
   * 后者对需要多步交互的场景（进库才看得到笔记骨架）会把已经走过的交互
   * 全部作废——刷新后回到画廊页，而脚本以为还在库里，卡在找不到卡片上。
   * 置偏好的前提是站点源已经加载过一次，所以先探一次再设。
   */
  await page.goto(`${BASE_URL}/login`, { waitUntil: "domcontentloaded" });
  await page.evaluate(
    (value) => localStorage.setItem("theme", value),
    theme === "dark" ? "dark" : "light",
  );

  await page.goto(`${BASE_URL}${scene.path ?? "/login"}`, { waitUntil: "domcontentloaded" });

  /*
   * 造数据必须在**置好主题之后**：`seedEditorNote` 自己会 `goto` 到笔记页，
   * 放在前面会把主题偏好那一步覆盖掉（导航走的是客户端路由，偏好虽在
   * localStorage 里，但编辑器首帧已定型，截出来仍是上一个主题）。
   */
  if (scene.seed) await seedEditorNote(page, scene.seed);

  if (scene.hangNotes) {
    // 骨架要看的是"进了库、笔记列表还没回来"，所以先导航进第一个库
    const card = page.locator('[data-testid^="kb-card-"]').first();
    await card.waitFor({ timeout: 30_000 });
    await card.click();
  }

  if (scene.act) await scene.act(page);
  if (scene.waitFor) await page.waitForSelector(scene.waitFor, { timeout: 30_000 });
  // 让动画走到一个稳定的相位，避免两次截图差在半途（只为可复现，不为美观）
  if (scene.settle) await page.waitForTimeout(scene.settle);

  const file = join(OUT_DIR, `${scene.name}-${theme}.png`);
  await page.screenshot({ path: file, animations: "disabled" });
  await context.close();
  return file;
}

/**
 * 把设计稿参考图与真实截图并排拼成一张对比图。
 *
 * 用一张 HTML + 浏览器截图来拼，而不是引入图像库：
 * 仓库里没有 sharp / canvas 依赖，为一次验收引入原生依赖不划算，
 * 而浏览器本来就在手边。
 */
async function buildComparison(browser, scene, theme, shotPath) {
  const referenceName = usableReference(scene, theme);
  if (!referenceName) return null;

  const reference = readFileSync(join(REF_DIR, referenceName)).toString("base64");
  const shot = readFileSync(shotPath).toString("base64");
  const html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><style>
    * { box-sizing: border-box; margin: 0; }
    body { display: flex; gap: 16px; padding: 16px; background: #1d1d1f; font: 13px/1.4 system-ui; }
    figure { flex: 1; display: flex; flex-direction: column; gap: 8px; min-width: 0; }
    figcaption { color: #f5f5f7; font-weight: 600; }
    img { width: 100%; height: auto; border-radius: 8px; background: #fff; }
  </style></head><body>
    <figure><figcaption>设计稿 · ${scene.title}</figcaption><img src="data:image/png;base64,${reference}"></figure>
    <figure><figcaption>实现 · ${theme === "dark" ? "深色" : "浅色"}</figcaption><img src="data:image/png;base64,${shot}"></figure>
  </body></html>`;

  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  await page.setContent(html, { waitUntil: "load" });
  const file = join(OUT_DIR, comparisonFileName(scene.name, theme));
  await page.screenshot({ path: file, fullPage: true });
  await page.close();
  return file;
}

function buildIndex(rows) {
  const cards = rows
    .map(
      (row) => `<section>
      <h2>${row.title}</h2>
      <div class="shots">
        ${["light", "dark"]
          .map(
            (theme) =>
              `<figure><figcaption>实现 · ${theme === "dark" ? "深色" : "浅色"}</figcaption>
               <img src="${row.name}-${theme}.png"></figure>`,
          )
          .join("")}
        ${
          row.compares.length > 0
            ? row.compares
                .map(
                  (compare) =>
                    `<figure class="wide"><figcaption>与设计稿并排 · ${
                      compare.theme === "dark" ? "深色" : "浅色"
                    }</figcaption><img src="${basename(compare.file)}"></figure>`,
                )
                .join("")
            : ""
        }
      </div>
    </section>`,
    )
    .join("\n");

  writeFileSync(
    join(OUT_DIR, "index.html"),
    `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">
    <title>新前端 · UI 还原度对比</title><style>
      body { margin: 0; padding: 24px; background: #f2f2f7; font: 14px/1.5 system-ui; }
      h1 { font-size: 22px; } h2 { font-size: 16px; margin: 32px 0 8px; }
      .shots { display: flex; gap: 12px; flex-wrap: wrap; }
      figure { margin: 0; flex: 1; min-width: 320px; }
      figure.wide { flex-basis: 100%; }
      img { width: 100%; border: 1px solid #e5e5ea; border-radius: 8px; background: #fff; }
      figcaption { color: #6e6e73; margin-bottom: 4px; }
    </style></head><body>
    <h1>新前端 · UI 还原度对比</h1>
    <p>左为真实浏览器在生产构建上的截图，右为设计稿对应页。设计稿渲染图放在
    <code>e2e/reference/</code>（由 docs/ui 的 PDF 转出）。</p>
    ${cards}
    </body></html>`,
    "utf8",
  );
  return join(OUT_DIR, "index.html");
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes("--list")) {
    for (const scene of SCENES) console.log(`${scene.name.padEnd(24)} ${scene.title}`);
    return;
  }
  const onlyIndex = args.indexOf("--only");
  const only = onlyIndex >= 0 ? args[onlyIndex + 1] : null;
  const scenes = only ? SCENES.filter((scene) => scene.name.includes(only)) : SCENES;
  if (scenes.length === 0) {
    console.error(`没有匹配 "${only}" 的场景。用 --list 看可选值。`);
    process.exit(1);
  }

  mkdirSync(OUT_DIR, { recursive: true });
  const browser = await chromium.launch({ channel: "chrome" });
  const rows = [];

  for (const scene of scenes) {
    process.stdout.write(`\n▶ ${scene.name} — ${scene.title}\n`);
    const row = { name: scene.name, title: scene.title, compares: [] };
    for (const theme of ["light", "dark"]) {
      const shot = await captureScene(browser, scene, theme);
      console.log(`  截图 ${theme}: ${shot}`);
      // 两个主题各拼一张：深浅在设计稿里是两页，混用会把主题差异读成还原度差距
      const compare = await buildComparison(browser, scene, theme, shot);
      if (compare) {
        row.compares.push({ theme, file: compare });
        console.log(`  对比图 ${theme}: ${compare}`);
      } else {
        const ref = scene.ref;
        const missing = typeof ref === "string" ? ref : (ref?.[theme] ?? "未指定");
        console.log(`  对比图 ${theme}: 跳过（参考图 ${missing} 不在 reference/）`);
      }
    }
    rows.push(row);
  }

  await browser.close();
  const index = buildIndex(rows);
  console.log(`\n全部截图完成。对比看板：${index}`);
}

await main();
