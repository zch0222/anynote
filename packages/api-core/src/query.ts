import type { QuerySerializer } from "openapi-fetch";

/**
 * springdoc 会把 Controller 上的 ModelAttribute POJO 参数呈现成「包装对象」
 * （query: { docListDTO: {...} }），但 Spring 实际按平铺参数绑定——
 * 实测 bracket（docListDTO[page]）与 dot（docListDTO.page）语法后端都不绑定。
 * 此 serializer 把包装对象展开为平铺 query，顶层标量保持原样。
 */
export const flattenedDtoQuerySerializer: QuerySerializer<unknown> = (query) => {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== null && typeof value === "object") {
      for (const [innerKey, innerValue] of Object.entries(value as Record<string, unknown>)) {
        if (innerValue !== undefined && innerValue !== null) {
          search.set(innerKey, String(innerValue));
        }
      }
    } else if (value !== undefined && value !== null) {
      search.set(key, String(value));
    }
  }
  return search.toString();
};
