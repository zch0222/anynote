"use client";

import { diffLines } from "@/lib/notes/diff";
import { cn } from "@/lib/utils";
import { useMemo } from "react";

export type HistoryDiffViewProps = {
  /** 更早那一版（左侧）。最早的版本传空串，整篇视为新增。 */
  previousContent: string;
  /** 当前要看的这一版（右侧）。 */
  currentContent: string;
  className?: string;
};

/**
 * 「本次改动」的行级差异（D-16 图例 7）。
 *
 * 用 `lib/notes/diff.ts` 现成的 `diffLines`（LCS）按行比较，本期**只做整行高亮**，
 * 行内词级差异不做——方案 §1.4 第 4 条已拍板，理由是两个版本之间真正变的
 * 往往只是一句话里的几个字，词级高亮需要先分词（中文没有空格），
 * 成本远高于收益。
 *
 * 两条配色之外还有**形状**：
 * - 新增：success 18% 底 + 下划线
 * - 删除：danger 12% 底 + 删除线
 *
 * 下划线与删除线不是装饰。只靠红绿区分的话，红绿色盲用户（约 8% 的男性）
 * 看到的是同一行灰底，而这一页恰恰是"改了哪几句"的全部信息来源。
 *
 * 容器宽度交给父级：桌面 D-16 与移动 M-13 共用本组件，两边的正文列宽不同，
 * 在这里写死 max-width 会让移动端无谓地缩进。
 */
export function HistoryDiffView({
  previousContent,
  currentContent,
  className,
}: HistoryDiffViewProps) {
  // 长文的 LCS 是 O(n·m)，取决于行数。每次重渲染都算一遍会明显卡顿，
  // 所以按两个入参缓存——它们只在切换版本时才变。
  const lines = useMemo(
    () => diffLines(previousContent, currentContent),
    [previousContent, currentContent],
  );

  const { added, removed } = useMemo(() => {
    let addedCount = 0;
    let removedCount = 0;
    for (const line of lines) {
      if (line.op === "added") addedCount += 1;
      else if (line.op === "removed") removedCount += 1;
    }
    return { added: addedCount, removed: removedCount };
  }, [lines]);

  // 两个版本逐字相同：后端在正文无差异时不会生成新版本，但"最早版本"与
  // "空基线"比较时仍会走到这里，给一句话总比一片空白强
  const unchanged = added === 0 && removed === 0;

  return (
    <div data-testid="history-diff-view" className={cn("space-y-3", className)}>
      <p className="text-footnote text-label-secondary" data-testid="history-diff-summary">
        {unchanged
          ? "这一版与上一版没有正文差异。"
          : `相比上一个版本，新增 ${added} 行，删除 ${removed} 行。`}
      </p>

      <ol
        data-testid="history-diff-lines"
        className="overflow-hidden rounded-md border border-separator bg-surface font-mono text-footnote leading-6"
      >
        {lines.map((line, index) => (
          <li
            // 差异行没有稳定身份（同一段文字在两次 diff 里可能对到不同行），
            // 用下标是可接受的：整份列表随入参整体重建，不做局部重排
            // biome-ignore lint/suspicious/noArrayIndexKey: 差异行无稳定身份，见上
            key={index}
            data-op={line.op}
            className={cn(
              "flex min-h-6 items-start gap-3 whitespace-pre-wrap break-words px-3",
              line.op === "added" && "bg-success/18 underline decoration-success",
              line.op === "removed" && "bg-danger/12 line-through",
              line.op === "equal" && "text-label-secondary",
            )}
          >
            <span aria-hidden="true" className="w-3 shrink-0 select-none text-label-tertiary">
              {line.op === "added" ? "+" : line.op === "removed" ? "−" : " "}
            </span>
            <span className="min-w-0 flex-1">{line.text || "\u00A0"}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
