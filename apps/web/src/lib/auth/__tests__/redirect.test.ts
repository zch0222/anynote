import { describe, expect, it } from "vitest";
import { isSafeNextPath, safeNextPath } from "../redirect";

describe("isSafeNextPath", () => {
  it.each(["/dashboard", "/cli/authorize?port=1&state=a", "/notes/3/7", "/settings/profile"])(
    "接受站内路径 %s",
    (value) => {
      expect(isSafeNextPath(value)).toBe(true);
    },
  );

  it.each([
    "https://evil.example",
    "http://evil.example/login",
    "//evil.example/login",
    "/\\evil.example",
    "javascript:alert(1)",
    "data:text/html,x",
    "dashboard",
    "",
    undefined,
    null,
  ])("拒绝非站内值 %s", (value) => {
    expect(isSafeNextPath(value)).toBe(false);
  });

  it("拒绝含控制字符的值（可用某些解析器绕过）", () => {
    expect(isSafeNextPath("/dash\nboard")).toBe(false);
    expect(isSafeNextPath("/dash\u0000board")).toBe(false);
  });
});

describe("safeNextPath", () => {
  it("合法时原样返回", () => {
    expect(safeNextPath("/notes/1")).toBe("/notes/1");
  });

  it.each([undefined, null, "", "//evil.example", "https://evil.example"])(
    "非法时回落到 dashboard：%s",
    (value) => {
      expect(safeNextPath(value)).toBe("/dashboard");
    },
  );

  it("可自定义回落目标", () => {
    expect(safeNextPath("//evil.example", "/login")).toBe("/login");
  });

  it("不做二次解码，%2F%2Fevil 不会被放行成协议相对地址", () => {
    // useSearchParams 已经解过一次码，这里再解会把 //evil 还原出来
    expect(safeNextPath("%2F%2Fevil.example")).toBe("/dashboard");
    // 即使真的传进来编码过的站内路径，也只当作普通站内路径
    expect(safeNextPath("/cli/authorize%3Fport%3D1")).toBe("/cli/authorize%3Fport%3D1");
  });
});
