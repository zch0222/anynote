import { useMoocItemQuery } from "@/features/mooc/use-moocs";
import { resourceHref } from "@/lib/ai/resource-target";
import { Film } from "lucide-react";
import type { TabDefinition } from "../../types";
import { isResourceUnavailable } from "../shared";

/**
 * 慕课条目标签定义。
 *
 * @author 称霸幼儿园
 */
export const moocItemTabDefinition: TabDefinition = {
  kind: "mooc_item",
  family: "resource",
  resourceType: "mooc_item",
  mobile: true,
  icon: Film,
  typeLabel: "慕课条目",
  useTitle: (record, hint) => {
    const ref = record.family === "resource" && record.ref.type === "mooc_item" ? record.ref : null;
    const query = useMoocItemQuery(ref?.moocId ?? 0, ref?.id ?? 0);
    return {
      title: query.data?.title?.trim() || hint?.title || null,
      unavailable: isResourceUnavailable(query.error),
    };
  },
  href: (record, locator, variant) =>
    record.family === "resource" ? resourceHref({ ref: record.ref, locator }, variant) : null,
  body: () => import("./body").then((mod) => ({ default: mod.MoocItemTabBody })),
};
