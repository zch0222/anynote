#!/usr/bin/env node
/**
 * CSS Token 引用审计的可执行外壳（判定逻辑与单测在 `lib/css-tokens.mjs`）。
 *
 * 为什么需要这个门禁：`src/styles/tiptap.css` 用了整套 shadcn v3 时代的变量名，
 * 而设计系统里根本没有这些名字。CSS 对未定义的 `var()` **不报错、不回退**，
 * 只让整条声明失效——代码块因此在浅色/深色下都变成没有底色边框的裸文字，
 * 而构建、typecheck、单测、E2E 全绿。
 *
 * 用法：node scripts/check-css-tokens.mjs
 * 退出码：0 = 全部 Token 有定义；1 = 存在未定义的引用
 */
import * as fs from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { auditAppTokens, formatReport } from "./lib/css-tokens.mjs";

const APP_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

const result = auditAppTokens(APP_ROOT, fs);
console.log(formatReport(result));
console.log(`\n扫描 ${result.filesScanned} 个文件。`);
process.exit(result.undefinedTokens.length === 0 ? 0 : 1);
