import { Spinner } from "@/components/loading/spinner";
import { Badge } from "@/components/ui/badge";
import { docIndexLabel, isDocIndexPending } from "../doc-index-status";

/**
 * 资料索引状态徽标。
 *
 * @author 称霸幼儿园
 */
export function DocIndexBadge({ status }: { status: number | null | undefined }) {
  return (
    <Badge variant={status === 0 ? "success" : status === 2 ? "destructive" : "secondary"}>
      {isDocIndexPending(status) ? <Spinner size="badge" /> : null}
      {docIndexLabel(status)}
    </Badge>
  );
}
