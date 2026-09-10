import { describe, expect, it } from "vitest";
import { authQueryKeys } from "./auth/query-keys";

// query key 是缓存失效的契约：任何调整都会让既有缓存与失效逻辑失配，必须显式变更。
describe("query key 稳定性", () => {
  it("auth 域 key 与既定层级一致", () => {
    expect(authQueryKeys.all).toEqual(["auth"]);
    expect(authQueryKeys.me).toEqual(["auth", "me"]);
    // 域 key 必须是 detail key 的前缀，保证按域整体失效可用
    expect(authQueryKeys.me.slice(0, authQueryKeys.all.length)).toEqual(authQueryKeys.all);
  });
});
