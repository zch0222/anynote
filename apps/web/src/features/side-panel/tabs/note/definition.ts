import { noteHistoryHref } from "@/components/layout/navigation";
import { useNoteQuery } from "@/features/notes/use-note";
import { resourceHref } from "@/lib/ai/resource-target";
import { mobileNoteHistoryHref } from "@/lib/mobile/hrefs";
import { FileText } from "lucide-react";
import type { TabDefinition } from "../../types";
import { isResourceUnavailable } from "../shared";

/**
 * 笔记标签定义。
 *
 * @author 称霸幼儿园
 */
export const noteTabDefinition: TabDefinition = {
  kind: "note",
  family: "resource",
  resourceType: "note",
  mobile: true,
  icon: FileText,
  typeLabel: "笔记",
  useTitle: (record, hint) => {
    const id = record.family === "resource" && record.ref.type === "note" ? record.ref.id : 0;
    const query = useNoteQuery(id);
    return {
      title: query.data?.title?.trim() || hint?.title || null,
      unavailable: isResourceUnavailable(query.error),
    };
  },
  href: (record, locator, variant) =>
    record.family === "resource" ? resourceHref({ ref: record.ref, locator }, variant) : null,
  moreMenu: (record, _locator, variant) => {
    if (record.family !== "resource" || record.ref.type !== "note") return [];
    const href =
      variant === "mobile"
        ? mobileNoteHistoryHref(record.ref.kbId, record.ref.id)
        : noteHistoryHref(record.ref.kbId, record.ref.id);
    return [{ label: "历史版本", href, newWindow: true }];
  },
  body: () => import("./body").then((mod) => ({ default: mod.NoteTabBody })),
};
