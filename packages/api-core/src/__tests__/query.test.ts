import { describe, expect, it } from "vitest";
import { flattenedDtoQuerySerializer } from "../query";

describe("flattenedDtoQuerySerializer", () => {
  it("把 springdoc 的包装对象展平成平铺 query", () => {
    expect(
      flattenedDtoQuerySerializer({ noteSearchDTO: { keyword: "笔记", page: 1, pageSize: 20 } }),
    ).toBe("keyword=%E7%AC%94%E8%AE%B0&page=1&pageSize=20");
  });

  it("顶层标量保持原样", () => {
    expect(flattenedDtoQuerySerializer({ page: 1, pageSize: 20, permissions: 4 })).toBe(
      "page=1&pageSize=20&permissions=4",
    );
  });

  it("忽略包装对象内的 null / undefined", () => {
    expect(flattenedDtoQuerySerializer({ docListDTO: { page: 1, knowledgeBaseId: null } })).toBe(
      "page=1",
    );
  });

  it("忽略顶层的 null / undefined", () => {
    expect(flattenedDtoQuerySerializer({ page: 1, status: null, title: undefined })).toBe("page=1");
  });

  it("空 query 返回空串", () => {
    expect(flattenedDtoQuerySerializer({})).toBe("");
  });
});
