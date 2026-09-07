#!/usr/bin/env node
/**
 * generate.sh 的薄封装：读取临时文件 → 归一化 → 仅在成功时写入 baseline。
 *
 * 用法：node normalize-cli.mjs <service> <输入文件> <输出文件>
 * 失败时返回非零且**不触碰输出文件**，从而保住原 baseline。
 */
import { readFileSync, writeFileSync } from "node:fs";
import { normalizeSpec } from "./normalize-spec.mjs";

const [service, inputPath, outputPath] = process.argv.slice(2);

if (!service || !inputPath || !outputPath) {
  console.error("用法: node normalize-cli.mjs <service> <input> <output>");
  process.exit(2);
}

const result = normalizeSpec(readFileSync(inputPath, "utf8"), service);

if (!result.ok) {
  console.error(`     [ERROR] ${result.error}`);
  process.exit(1);
}

writeFileSync(outputPath, result.json);
console.log(`     ${result.pathCount} paths`);
