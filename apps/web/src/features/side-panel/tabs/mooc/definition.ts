import { useMoocQuery } from "@/features/mooc/use-moocs";
import { resourceHref } from "@/lib/ai/resource-target";
import { BookOpen } from "lucide-react";
import type { TabDefinition } from "../../types";
import { isResourceUnavailable } from "../shared";

/**
 * 慕课标签定义。
 *
 * @author 称霸幼儿园
 */
export const moocTabDefinition: TabDefinition = {
  kind: "mooc",
  family: "resource",
  resourceType: "mooc",
  mobile: true,
  icon: BookOpen,
  typeLabel: "慕课",
  useTitle: (record, hint) => {
    const id = record.family === "resource" && record.ref.type === "mooc" ? record.ref.id : 0;
    const query = useMoocQuery(id);
    return {
      title: query.data?.title?.trim() || hint?.title || null,
      unavailable: isResourceUnavailable(query.error),
    };
  },
  href: (record, locator, variant) =>
    record.family === "resource" ? resourceHref({ ref: record.ref, locator }, variant) : null,
  body: () => import("./body").then((mod) => ({ default: mod.MoocTabBody })),
};
