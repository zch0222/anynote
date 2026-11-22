import { useKnowledgeBaseQuery } from "@/features/notes/use-knowledge-bases";
import { resourceHref } from "@/lib/ai/resource-target";
import { Library } from "lucide-react";
import type { TabDefinition } from "../../types";
import { isResourceUnavailable } from "../shared";

/**
 * 知识库标签定义。
 *
 * @author 称霸幼儿园
 */
export const kbTabDefinition: TabDefinition = {
  kind: "kb",
  family: "resource",
  resourceType: "kb",
  mobile: true,
  icon: Library,
  typeLabel: "知识库",
  useTitle: (record, hint) => {
    const id = record.family === "resource" && record.ref.type === "kb" ? record.ref.id : 0;
    const query = useKnowledgeBaseQuery(id);
    return {
      title: query.data?.knowledgeBaseName?.trim() || hint?.title || null,
      unavailable: isResourceUnavailable(query.error),
    };
  },
  href: (record, locator, variant) =>
    record.family === "resource" ? resourceHref({ ref: record.ref, locator }, variant) : null,
  body: () => import("./body").then((mod) => ({ default: mod.KbTabBody })),
};
