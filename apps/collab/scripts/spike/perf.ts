/**
 * M14.0 技术验证：200KB Markdown 的构建、序列化、差异更新耗时与常驻内存。
 *
 * 不进产物也不进单测；在 apps/collab 目录下用与产物相同的打包配置运行：
 * `npx tsup scripts/spike/perf.ts --config tsup.config.ts --out-dir scripts/spike/.out && node scripts/spike/.out/perf.js`
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import * as Y from "yjs";
import { createConverter } from "../../src/converter.ts";

// 从 apps/collab 目录运行
const FIXTURE_DIR = join(process.cwd(), "..", "..", "packages", "editor-core", "fixtures");
const corpus = readdirSync(FIXTURE_DIR)
  .filter((file) => file.endsWith(".md"))
  .map((file) => readFileSync(join(FIXTURE_DIR, file), "utf8"))
  .join("\n\n");

const TARGET_BYTES = Number(process.env.SPIKE_KB ?? 200) * 1024;
let markdown = "# 性能验证\n\n";
while (Buffer.byteLength(markdown) < TARGET_BYTES) markdown += `${corpus}\n\n`;

function time<T>(label: string, run: () => T): T {
  const started = performance.now();
  const result = run();
  console.log(`${label}: ${(performance.now() - started).toFixed(1)} ms`);
  return result;
}

const rssBefore = process.memoryUsage().rss;
const converter = time("创建转换器（含 jsdom）", () => createConverter());
console.log(`正文大小：${(Buffer.byteLength(markdown) / 1024).toFixed(0)} KB`);

const state = time("Markdown → Y 状态", () => converter.buildState(markdown));
console.log(`Y 状态大小：${(state.length / 1024).toFixed(0)} KB`);
const doc = new Y.Doc();
Y.applyUpdate(doc, state);
const serialized = time("Y.Doc → Markdown", () => converter.serialize(doc));
time("Y.Doc → Markdown（第二次）", () => converter.serialize(doc));
time("差异更新（尾部追加一段）", () =>
  converter.applyMarkdown(doc, `${serialized.markdown}\n\n追加的一段`),
);
console.log(
  `常驻内存增量：${((process.memoryUsage().rss - rssBefore) / 1024 / 1024).toFixed(0)} MB`,
);
converter.destroy();
