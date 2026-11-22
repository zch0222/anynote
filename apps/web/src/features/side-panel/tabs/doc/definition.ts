import { useDocQuery } from "@/features/ai/use-docs";
import { resourceHref } from "@/lib/ai/resource-target";
import { FileText } from "lucide-react";
import type { TabDefinition } from "../../types";
import { isResourceUnavailable } from "../shared";

/**
 * 资料（PDF）标签定义。
 *
 * @author 称霸幼儿园
 */
export const docTabDefinition: TabDefinition = {
  kind: "doc",
  family: "resource",
  resourceType: "doc",
  mobile: true,
  icon: FileText,
  typeLabel: "资料",
  useTitle: (record, hint) => {
    const id = record.family === "resource" && record.ref.type === "doc" ? record.ref.id : 0;
    const query = useDocQuery(id);
    return {
      title: query.data?.docName?.trim() || hint?.title || null,
      unavailable: isResourceUnavailable(query.error),
    };
  },
  href: (record, locator, variant) =>
    record.family === "resource" ? resourceHref({ ref: record.ref, locator }, variant) : null,
  body: () => import("./body").then((mod) => ({ default: mod.DocTabBody })),
};
