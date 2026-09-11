// M8.3 Lighthouse 门禁：Performance ≥ 90、Accessibility ≥ 95。
//
// 用法（需要先起生产前端；要审计登录后的页面还需先跑过一次 E2E 以生成会话）：
//   node scripts/lighthouse.mjs                        # 审计默认路由
//   node scripts/lighthouse.mjs --url http://localhost:3000/notes
//   node scripts/lighthouse.mjs --budget               # 不达标以非零退出码失败
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as chromeLauncher from "chrome-launcher";
import lighthouse from "lighthouse";
// 官方桌面预设：桌面视口 + desktopDense4G 网络 + 不做 CPU 降速。
// 只设 formFactor 是不够的——节流参数仍会沿用移动端默认值（150ms RTT、4 倍 CPU 降速），
// 那样量出来的是「桌面页面跑在移动网络上」，与 M8.3 的桌面门槛对不上。
import desktopConfig from "lighthouse/core/config/desktop-config.js";
import {
  DEFAULT_ROUTES,
  DEFAULT_THRESHOLDS,
  cookieHeaderFromState,
  evaluateScores,
  formatScore,
  parseArgs,
} from "./lib/lighthouse.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const origin = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const { urls, enforce } = parseArgs(process.argv.slice(2));
const targets = urls.length > 0 ? urls : DEFAULT_ROUTES.map((route) => `${origin}${route}`);

function readCookieHeader() {
  try {
    const state = JSON.parse(readFileSync(join(root, "e2e", ".auth", "state.json"), "utf8"));
    return cookieHeaderFromState(state, origin);
  } catch {
    // 没跑过 E2E 就没有会话文件；此时只有公开页能拿到有意义的分数
    return null;
  }
}

const cookieHeader = readCookieHeader();
if (!cookieHeader) {
  console.warn("[lighthouse] 未找到 e2e/.auth/state.json，需要登录的路由会被重定向到登录页");
}

const chrome = await chromeLauncher.launch({
  chromeFlags: ["--headless=new", "--no-sandbox", "--disable-gpu"],
});

const results = [];
try {
  for (const url of targets) {
    const runnerResult = await lighthouse(
      url,
      {
        port: chrome.port,
        output: "json",
        logLevel: "error",
        onlyCategories: Object.keys(DEFAULT_THRESHOLDS),
        ...(cookieHeader ? { extraHeaders: { Cookie: cookieHeader } } : {}),
      },
      desktopConfig,
    );

    const categories = runnerResult?.lhr?.categories ?? {};
    results.push({
      url,
      finalUrl: runnerResult?.lhr?.finalDisplayedUrl ?? url,
      scores: Object.fromEntries(
        Object.entries(categories).map(([key, value]) => [key, value.score ?? 0]),
      ),
    });
  }
} finally {
  await chrome.kill();
}

const verdict = evaluateScores(results, DEFAULT_THRESHOLDS);

console.log("=== Lighthouse（M8.3 门槛：Performance ≥ 90 / Accessibility ≥ 95） ===");
for (const result of results) {
  const redirected = result.finalUrl !== result.url ? `  → ${result.finalUrl}` : "";
  console.log(`\n${result.url}${redirected}`);
  for (const check of verdict.checks.filter((item) => item.url === result.url)) {
    console.log(
      `  ${check.pass ? "PASS" : "FAIL"}  ${check.category.padEnd(14)}` +
        `${formatScore(check.score)} / 门槛 ${formatScore(check.threshold)}`,
    );
  }
}

if (enforce && !verdict.pass) {
  console.error("\nLighthouse 未达门槛。");
  process.exit(1);
}
