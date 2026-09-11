import {
  COLLAB_TOKEN_AUDIENCE,
  COLLAB_TOKEN_ISSUER,
  COLLAB_TOKEN_TTL_SECONDS,
  COLLAB_USER_COLORS,
  collabUserColor,
  collabUserName,
} from "@/lib/collab/identity";
import { describe, expect, it } from "vitest";

describe("协同令牌常量", () => {
  it("签发方与受众与协同服务约定一致", () => {
    // 这两个值同时写在 apps/collab/src/auth.ts；改任一侧都会让所有握手 401
    expect(COLLAB_TOKEN_ISSUER).toBe("anynote-web");
    expect(COLLAB_TOKEN_AUDIENCE).toBe("anynote-collab");
  });

  it("有效期短到令牌泄露也没多大价值，同时长于一次续期周期", () => {
    expect(COLLAB_TOKEN_TTL_SECONDS).toBeLessThanOrEqual(600);
    expect(COLLAB_TOKEN_TTL_SECONDS).toBeGreaterThan(60);
  });
});

describe("collabUserColor", () => {
  it("同一用户永远得到同一个颜色", () => {
    expect(collabUserColor("7")).toBe(collabUserColor("7"));
    expect(collabUserColor(7)).toBe(collabUserColor("7"));
  });

  it("颜色一定来自调色板", () => {
    for (const id of ["1", "42", "abc", "", "9007199254740991"]) {
      expect(COLLAB_USER_COLORS).toContain(
        collabUserColor(id) as (typeof COLLAB_USER_COLORS)[number],
      );
    }
  });

  it("连续用户 id 会铺开到多个颜色，而不是全撞一个", () => {
    const used = new Set(Array.from({ length: 32 }, (_, index) => collabUserColor(index + 1)));
    expect(used.size).toBeGreaterThan(1);
  });
});

describe("collabUserName", () => {
  it("优先昵称，其次用户名，最后回落到用户 id", () => {
    expect(collabUserName({ nickname: "小明", username: "ming", id: 7 })).toBe("小明");
    expect(collabUserName({ nickname: "  ", username: "ming", id: 7 })).toBe("ming");
    expect(collabUserName({ nickname: null, username: null, id: 7 })).toBe("用户 7");
    expect(collabUserName({})).toBe("用户 ?");
  });
});
