// Lighthouse 门禁：桌面 Performance ≥ 90 / 移动 ≥ 85，Accessibility 两边都 ≥ 95。
//
// 用法（需要先起生产前端；要审计登录后的页面还需先跑过一次 E2E 以生成会话）：
//   node scripts/lighthouse.mjs                        # 审计默认路由（桌面口径）
//   node scripts/lighthouse.mjs --mobile               # 移动 form factor + /m/* 路由
//   node scripts/lighthouse.mjs --url http://localhost:3000/notes
//   node scripts/lighthouse.mjs --budget               # 不达标以非零退出码失败
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as chromeLauncher from "chrome-launcher";
import lighthouse from "lighthouse";
// 官方桌面预设：桌面视口 + desktopDense4G 网络 + 不做 CPU 降速。
// 只设 formFactor 是不够的——节流参数仍会沿用移动端默认值（150ms RTT、4 倍 CPU 降速），
// 那样量出来的是「桌面页面跑在移动网络上」，与 M8.3 的桌面门槛对不上。
import desktopConfig from "lighthouse/core/config/desktop-config.js";
import {
  cookieHeaderFromState,
  evaluateScores,
  formatScore,
  parseArgs,
  selectProfile,
} from "./lib/lighthouse.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const origin = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const { urls, enforce, mobile } = parseArgs(process.argv.slice(2));
const profile = selectProfile(mobile);
const targets = urls.length > 0 ? urls : profile.routes.map((route) => `${origin}${route}`);

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

/**
 * 挑一个**能被 WSL 访问到 devtools 端口**的 Chrome。
 *
 * 不能只靠 `chromeLauncher.launch()` 的默认探测：在 WSL 里它会优先找到
 * `/mnt/c/Program Files/Google/Chrome/Application/chrome.exe`（Windows 侧那份），
 * 而 Windows 进程的 `--remote-debugging-port` 监听在 Windows 的 loopback 上，
 * WSL 侧连 `127.0.0.1:<port>` 必然 `ECONNREFUSED`——报错长得像脚本坏了，
 * 实际是选错了浏览器。
 *
 * 优先级：显式 `CHROME_PATH` → Linux 侧 `google-chrome` → 系统 chromium。
 * 都没有时退回默认探测（让 chrome-launcher 自己报错，错误信息更贴近它的预期）。
 */
function resolveChromePath() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  const candidates = [
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
  ];
  return candidates.find((p) => existsSync(p));
}

const chromePath = resolveChromePath();
const chrome = await chromeLauncher.launch({
  ...(chromePath ? { chromePath } : {}),
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
        onlyCategories: Object.keys(profile.thresholds),
        ...(cookieHeader ? { extraHeaders: { Cookie: cookieHeader } } : {}),
      },
      // 移动口径下不传 config：Lighthouse 默认就是移动 form factor + 对应节流
      profile.useDesktopConfig ? desktopConfig : undefined,
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

const verdict = evaluateScores(results, profile.thresholds);

console.log(
  `=== Lighthouse（${profile.name} 口径，门槛：Performance ≥ ${formatScore(profile.thresholds.performance).trim()} / Accessibility ≥ ${formatScore(profile.thresholds.accessibility).trim()}） ===`,
);
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
