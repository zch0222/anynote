import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createFilePersistence, memoryOnlyPersistence, roomFileName } from "../persistence.ts";

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "anynote-collab-"));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("roomFileName", () => {
  it("把房间名映射成不含路径分隔符的文件名", () => {
    expect(roomFileName("note:1")).toBe("note-1.ydoc");
    expect(roomFileName("note:42")).toBe("note-42.ydoc");
  });

  it("非法房间名直接抛错，绝不落盘到目录外", () => {
    for (const room of [
      "note:../../etc/passwd",
      "note:1/../2",
      "note:0",
      "note:01",
      "",
      "index",
      "doc:abcdefgh",
      "note:a/b",
    ]) {
      expect(() => roomFileName(room)).toThrow(/非法房间名/);
    }
  });
});

describe("createFilePersistence", () => {
  it("写入后能原样读回", async () => {
    const store = createFilePersistence(dir);
    const state = new Uint8Array([1, 2, 3, 250]);
    await store.write("note:1", state);
    await expect(store.read("note:1")).resolves.toEqual(state);
  });

  it("房间还没有文件时返回 null 而不是抛错", async () => {
    await expect(createFilePersistence(dir).read("note:1")).resolves.toBeNull();
  });

  it("目录不存在时自动创建", async () => {
    const nested = join(dir, "a", "b");
    const store = createFilePersistence(nested);
    await store.write("note:1", new Uint8Array([9]));
    await expect(store.read("note:1")).resolves.toEqual(new Uint8Array([9]));
  });

  it("重复写入覆盖旧状态且不留临时文件", async () => {
    const store = createFilePersistence(dir);
    await store.write("note:1", new Uint8Array([1]));
    await store.write("note:1", new Uint8Array([2, 2]));
    await expect(store.read("note:1")).resolves.toEqual(new Uint8Array([2, 2]));
    expect(await readdir(dir)).toEqual(["note-1.ydoc"]);
  });

  it("读到已存在但内容为空的文件时返回空数组（调用方按「无状态」处理）", async () => {
    const store = createFilePersistence(dir);
    await store.write("note:1", new Uint8Array([1]));
    await writeFile(join(dir, "note-1.ydoc"), new Uint8Array());
    await expect(store.read("note:1")).resolves.toEqual(new Uint8Array());
  });

  it("非法房间名在读写两侧都抛错", async () => {
    const store = createFilePersistence(dir);
    await expect(store.read("note:../x")).rejects.toThrow(/非法房间名/);
    await expect(store.write("note:../x", new Uint8Array([1]))).rejects.toThrow(/非法房间名/);
  });

  it("落盘内容与传入字节一致（不做任何编码转换）", async () => {
    const store = createFilePersistence(dir);
    const state = new Uint8Array([0, 128, 255]);
    await store.write("note:1", state);
    expect(new Uint8Array(await readFile(join(dir, "note-1.ydoc")))).toEqual(state);
  });
});

describe("memoryOnlyPersistence", () => {
  it("读永远为空、写永远是空操作", async () => {
    await expect(memoryOnlyPersistence.read("note:1")).resolves.toBeNull();
    await expect(
      memoryOnlyPersistence.write("note:1", new Uint8Array([1])),
    ).resolves.toBeUndefined();
    await expect(memoryOnlyPersistence.read("note:1")).resolves.toBeNull();
  });
});
