import { flattenedDtoQuerySerializer } from "@/lib/api/dto-query";
import { describe, expect, it } from "vitest";

describe("flattenedDtoQuerySerializer", () => {
  it("把 DTO 包装对象展开为平铺 query（Spring ModelAttribute 绑定方式）", () => {
    const result = flattenedDtoQuerySerializer({
      docListDTO: { knowledgeBaseId: 3, page: 1, pageSize: 50 },
    });
    const params = new URLSearchParams(result);
    expect(params.get("knowledgeBaseId")).toBe("3");
    expect(params.get("page")).toBe("1");
    expect(params.get("pageSize")).toBe("50");
    expect(params.get("docListDTO")).toBeNull();
  });

  it("顶层标量保持 key=value", () => {
    const params = new URLSearchParams(flattenedDtoQuerySerializer({ page: 2, pageSize: 20 }));
    expect(params.get("page")).toBe("2");
    expect(params.get("pageSize")).toBe("20");
  });

  it("跳过 null 与 undefined（可选参数不出现）", () => {
    const params = new URLSearchParams(
      flattenedDtoQuerySerializer({
        moocItemListDTO: { moocId: 8, parentId: 0, page: 1, pageSize: 50, moocItemType: undefined },
        docId: null,
      }),
    );
    expect(params.get("moocItemType")).toBeNull();
    expect(params.get("docId")).toBeNull();
    expect(params.get("moocId")).toBe("8");
  });
});
