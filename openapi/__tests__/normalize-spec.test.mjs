import { describe, expect, it } from "vitest";
import { normalizeSpec, sortKeysDeep } from "../normalize-spec.mjs";

/** 构造一份最小可用 spec */
function makeSpec(overrides = {}) {
  return {
    openapi: "3.0.1",
    info: { title: "auth", version: "1.0" },
    servers: [{ url: "http://172.19.0.11:8083" }],
    paths: { "/login": { post: {} } },
    ...overrides,
  };
}

describe("normalizeSpec — 剥离 servers（漂移噪声）", () => {
  it("删除 servers 字段，其余内容原样保留", () => {
    const result = normalizeSpec(JSON.stringify(makeSpec()), "auth");

    expect(result.ok).toBe(true);
    const doc = JSON.parse(result.json);
    expect(doc.servers).toBeUndefined();
    expect(doc.paths).toEqual({ "/login": { post: {} } });
    expect(doc.info.title).toBe("auth");
  });

  it("同一份 spec 换了容器 IP 后，归一化结果逐字节相同（这正是门禁失效的根因）", () => {
    const a = normalizeSpec(
      JSON.stringify(makeSpec({ servers: [{ url: "http://172.19.0.11:8083" }] })),
      "auth",
    );
    const b = normalizeSpec(
      JSON.stringify(makeSpec({ servers: [{ url: "http://172.19.0.16:8083" }] })),
      "auth",
    );

    expect(a.ok && b.ok).toBe(true);
    expect(a.json).toBe(b.json);
  });

  it("原本就没有 servers 字段时不报错", () => {
    const { servers: _servers, ...spec } = makeSpec();

    expect(normalizeSpec(JSON.stringify(spec), "auth").ok).toBe(true);
  });
});

describe("normalizeSpec — 拦截 HTTP 200 的非 spec 响应", () => {
  it("ResData 错误体被识别，错误信息带上 code 与 msg", () => {
    const raw = JSON.stringify({ code: "B0001", msg: "服务异常", data: null });
    const result = normalizeSpec(raw, "notify");

    expect(result.ok).toBe(false);
    expect(result.error).toContain("ResData");
    expect(result.error).toContain("B0001");
    expect(result.error).toContain("服务异常");
    expect(result.error).toContain("notify");
  });

  it("缺少 openapi 字段的普通对象被拒绝", () => {
    const result = normalizeSpec(JSON.stringify({ paths: { "/x": {} } }), "note");

    expect(result.ok).toBe(false);
    expect(result.error).toContain("openapi");
  });

  it("paths 为空对象被拒绝（服务未完成注册的典型症状）", () => {
    const result = normalizeSpec(JSON.stringify(makeSpec({ paths: {} })), "ai");

    expect(result.ok).toBe(false);
    expect(result.error).toContain("paths");
  });

  it("paths 缺失被拒绝", () => {
    const { paths: _paths, ...spec } = makeSpec();

    expect(normalizeSpec(JSON.stringify(spec), "ai").ok).toBe(false);
  });

  it.each([
    ["空字符串", ""],
    ["纯空白", "   \n  "],
  ])("%s 被拒绝", (_label, raw) => {
    expect(normalizeSpec(raw, "file").ok).toBe(false);
  });

  it("非法 JSON 被拒绝且不抛异常", () => {
    const result = normalizeSpec("{不是 JSON", "file");

    expect(result.ok).toBe(false);
    expect(result.error).toContain("JSON");
  });

  it.each([
    ["数组", "[]"],
    ["字符串字面量", '"hello"'],
    ["null", "null"],
  ])("顶层是%s时被拒绝", (_label, raw) => {
    expect(normalizeSpec(raw, "system").ok).toBe(false);
  });
});

describe("normalizeSpec — 输出确定性", () => {
  it("key 顺序不同的两份等价 spec 产出相同 JSON", () => {
    const a = JSON.stringify({
      openapi: "3.0.1",
      paths: { "/b": {}, "/a": {} },
      info: { version: "1", title: "t" },
    });
    const b = JSON.stringify({
      info: { title: "t", version: "1" },
      paths: { "/a": {}, "/b": {} },
      openapi: "3.0.1",
    });

    expect(normalizeSpec(a, "x").json).toBe(normalizeSpec(b, "x").json);
  });

  it("输出是单行紧凑 JSON（baseline 既有格式）", () => {
    const result = normalizeSpec(JSON.stringify(makeSpec()), "auth");

    expect(result.json).not.toContain("\n");
    expect(result.json.startsWith("{")).toBe(true);
  });

  it("返回的 pathCount 与实际路径数一致", () => {
    const spec = makeSpec({ paths: { "/a": {}, "/b": {}, "/c": {} } });

    expect(normalizeSpec(JSON.stringify(spec), "auth").pathCount).toBe(3);
  });
});

describe("sortKeysDeep", () => {
  it("递归排序嵌套对象的 key", () => {
    const sorted = sortKeysDeep({ b: { d: 1, c: 2 }, a: 3 });

    expect(Object.keys(sorted)).toEqual(["a", "b"]);
    expect(Object.keys(sorted.b)).toEqual(["c", "d"]);
  });

  it("保持数组顺序不变（required 等数组的顺序是语义的一部分）", () => {
    const sorted = sortKeysDeep({ required: ["zebra", "alpha"] });

    expect(sorted.required).toEqual(["zebra", "alpha"]);
  });

  it("排序数组内的对象元素的 key，但不重排元素本身", () => {
    const sorted = sortKeysDeep([
      { b: 1, a: 2 },
      { d: 3, c: 4 },
    ]);

    expect(Object.keys(sorted[0])).toEqual(["a", "b"]);
    expect(Object.keys(sorted[1])).toEqual(["c", "d"]);
  });

  it("原样返回 null 与标量", () => {
    expect(sortKeysDeep(null)).toBeNull();
    expect(sortKeysDeep(42)).toBe(42);
    expect(sortKeysDeep("s")).toBe("s");
  });
});
