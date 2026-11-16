export const DOC_INDEXED = 0;

/**
 * 资料索引状态的显示与轮询规则。
 *
 * @author 称霸幼儿园
 */
const LABELS: Record<number, string> = {
  0: "已索引",
  1: "索引构建中",
  2: "索引失败",
  3: "未索引",
  4: "无法提取文本",
};

/** 返回后端索引状态对应的已确认文案。 */
export function docIndexLabel(status: number | null | undefined): string {
  return status == null ? "状态未知" : (LABELS[status] ?? "状态未知");
}

/** 仅索引中的资料需要持续轮询。 */
export function isDocIndexPending(status: number | null | undefined): boolean {
  return status === 1;
}
