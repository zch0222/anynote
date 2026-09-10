export type DiffOp = "equal" | "added" | "removed";

export type DiffLine = {
  op: DiffOp;
  text: string;
};

/**
 * 行级文本差异（LCS）。
 *
 * M6 的冲突提示只需要「哪些行不一样」，不做词级高亮；
 * `added` 是右侧（服务端）独有，`removed` 是左侧（本地）独有。
 */
export function diffLines(left: string, right: string): DiffLine[] {
  const a = splitLines(left);
  const b = splitLines(right);

  // lcs[i][j] = a[i..] 与 b[j..] 的最长公共子序列长度
  const lcs: number[][] = Array.from({ length: a.length + 1 }, () =>
    new Array<number>(b.length + 1).fill(0),
  );
  for (let i = a.length - 1; i >= 0; i -= 1) {
    const row = lcs[i];
    const rowBelow = lcs[i + 1];
    if (!row || !rowBelow) continue;
    for (let j = b.length - 1; j >= 0; j -= 1) {
      row[j] =
        a[i] === b[j] ? (rowBelow[j + 1] ?? 0) + 1 : Math.max(rowBelow[j] ?? 0, row[j + 1] ?? 0);
    }
  }

  const result: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    const left = a[i] ?? "";
    const right = b[j] ?? "";
    if (left === right) {
      result.push({ op: "equal", text: left });
      i += 1;
      j += 1;
    } else if ((lcs[i + 1]?.[j] ?? 0) >= (lcs[i]?.[j + 1] ?? 0)) {
      result.push({ op: "removed", text: left });
      i += 1;
    } else {
      result.push({ op: "added", text: right });
      j += 1;
    }
  }
  while (i < a.length) {
    result.push({ op: "removed", text: a[i] ?? "" });
    i += 1;
  }
  while (j < b.length) {
    result.push({ op: "added", text: b[j] ?? "" });
    j += 1;
  }
  return result;
}

/** 差异摘要，用于在弹窗标题上给一句话结论。 */
export function summarizeDiff(lines: DiffLine[]): { added: number; removed: number } {
  return lines.reduce(
    (acc, line) => {
      if (line.op === "added") acc.added += 1;
      if (line.op === "removed") acc.removed += 1;
      return acc;
    },
    { added: 0, removed: 0 },
  );
}

function splitLines(text: string): string[] {
  if (text === "") return [];
  return text.replace(/\r\n/g, "\n").split("\n");
}
