"use client";

import { NotFoundState } from "@/components/shared/states";
import { moocDetailHref, mobileMoocDetailHref } from "@/components/layout/navigation";
import { useMoocQuery } from "@/features/mooc/use-moocs";
import { CardGridSkeleton } from "@/components/loading/skeletons";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export type LegacyMoocRedirectProps = {
  moocId: number;
  /** 桌面与移动的落点不同（移动端多一层 `/m`）。 */
  variant?: "desktop" | "mobile";
};

/**
 * 旧地址 `/mooc/:id`（与 `/m/mooc/:id`）→ 知识库内的慕课详情（F-01 / F-02）。
 *
 * 为什么用客户端组件而不是 `redirect()`：新地址的第一段是**知识库 id**，
 * 它只存在于课程数据里，服务端拿不到——`GET /moocs/{id}` 是浏览器经 BFF 调的。
 *
 * 三态都要照顾到：
 * - 加载中给骨架，不能白屏（这一跳通常只有几百毫秒，白屏反而更刺眼）
 * - 成功后 `router.replace` 而不是 `push`：旧地址不该留在浏览器历史里，
 *   否则用户在详情页按返回会回到旧地址、又被弹回来，形成"返回键失灵"
 * - 查不到（课程已删 / 无权限）显示不存在态，不能一直转圈
 */
export function LegacyMoocRedirect({ moocId, variant = "desktop" }: LegacyMoocRedirectProps) {
  const router = useRouter();
  const mooc = useMoocQuery(moocId);
  const baseId = mooc.data?.knowledgeBaseId;

  useEffect(() => {
    if (!baseId) return;
    const href =
      variant === "mobile" ? mobileMoocDetailHref(baseId, moocId) : moocDetailHref(baseId, moocId);
    router.replace(href);
  }, [baseId, moocId, router, variant]);

  if (mooc.isError) {
    return (
      <NotFoundState
        object="课程"
        backHref={variant === "mobile" ? "/m/notes" : "/notes"}
        backLabel={variant === "mobile" ? "回到知识库" : "回到知识库列表"}
      />
    );
  }

  // 数据到手但缺 knowledgeBaseId：后端契约异常，同样按找不到处理，避免无限等待
  if (mooc.data && !baseId) {
    return (
      <NotFoundState
        object="课程"
        backHref={variant === "mobile" ? "/m/notes" : "/notes"}
        backLabel={variant === "mobile" ? "回到知识库" : "回到知识库列表"}
      />
    );
  }

  return (
    <section className="mx-auto w-full max-w-6xl space-y-4" aria-busy="true">
      <CardGridSkeleton count={3} cardClassName="h-40" />
    </section>
  );
}
