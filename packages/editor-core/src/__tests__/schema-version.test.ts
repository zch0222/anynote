import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { getSchema } from "@tiptap/core";
import { describe, expect, it } from "vitest";
import { coreExtensions } from "../core-extensions";
import { describeSchema } from "../schema-digest";
import { EDITOR_SCHEMA_VERSION } from "../version";

/**
 * schema 版本锁：`schema-lock.json` 记录每个 `EDITOR_SCHEMA_VERSION` 对应的 schema 摘要。
 *
 * schema 一变摘要就变，而新摘要必须登记在一个比现有版本都大的新版本号下，
 * 并且 `EDITOR_SCHEMA_VERSION` 要等于它——改了 schema 却忘了递增版本号时这里会失败。
 */
type SchemaLock = { versions: Record<string, string> };

const LOCK_PATH = join(__dirname, "..", "..", "schema-lock.json");

function currentDigest(): string {
  const description = describeSchema(getSchema(coreExtensions()));
  return createHash("sha256").update(description).digest("hex");
}

describe("EDITOR_SCHEMA_VERSION 与 schema 摘要", () => {
  const lock = JSON.parse(readFileSync(LOCK_PATH, "utf8")) as SchemaLock;
  const entries = Object.entries(lock.versions).map(([version, digest]) => ({
    version: Number(version),
    digest,
  }));

  it("当前 schema 的摘要已登记，且登记在 EDITOR_SCHEMA_VERSION 名下", () => {
    const digest = currentDigest();
    const entry = entries.find((item) => item.digest === digest);
    expect(
      entry,
      `schema 已变化（摘要 ${digest}）：请递增 EDITOR_SCHEMA_VERSION，并在 schema-lock.json 登记新版本`,
    ).toBeDefined();
    expect(entry?.version).toBe(EDITOR_SCHEMA_VERSION);
  });

  it("EDITOR_SCHEMA_VERSION 是锁文件里最大的版本号", () => {
    expect(Math.max(...entries.map((item) => item.version))).toBe(EDITOR_SCHEMA_VERSION);
  });

  it("每个摘要只对应一个版本号", () => {
    const digests = entries.map((item) => item.digest);
    expect(new Set(digests).size).toBe(digests.length);
  });

  it("schema 描述不受扩展实例化次数影响", () => {
    expect(currentDigest()).toBe(currentDigest());
  });
});
