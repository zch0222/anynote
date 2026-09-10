/** KaTeX 按需加载：只有文档里真的出现公式时才下载 katex 包（约 145 KB gzip），
 *  避免把编辑器主 chunk 撑爆。 */
export type KatexInstance = {
  render(
    tex: string,
    element: HTMLElement,
    options?: {
      displayMode?: boolean;
      throwOnError?: boolean;
      output?: "html" | "mathml" | "htmlAndMathml";
    },
  ): void;
};

let katexPromise: Promise<KatexInstance> | null = null;

export function loadKatex(): Promise<KatexInstance> {
  katexPromise ??= import("katex").then((module) => {
    const candidate = (module as unknown as { default?: unknown }).default ?? module;
    return candidate as KatexInstance;
  });
  return katexPromise;
}
