import { cn } from "@/lib/utils";
import { describe, expect, it } from "vitest";

describe("cn", () => {
  it("拼接多个类名", () => {
    expect(cn("px-2", "py-1")).toBe("px-2 py-1");
  });

  it("后写的 Tailwind 类覆盖同组的前一个", () => {
    expect(cn("px-2", "px-4")).toBe("px-4");
    expect(cn("text-sm text-red-500", "text-lg")).toBe("text-red-500 text-lg");
  });

  it("忽略 false / null / undefined", () => {
    expect(cn("px-2", false, null, undefined, "py-1")).toBe("px-2 py-1");
  });

  it("支持数组与条件对象（clsx 语法）", () => {
    expect(cn(["px-2", "py-1"], { "bg-red-500": true, "bg-blue-500": false })).toBe(
      "px-2 py-1 bg-red-500",
    );
  });

  it("无入参时返回空串", () => {
    expect(cn()).toBe("");
  });
});
