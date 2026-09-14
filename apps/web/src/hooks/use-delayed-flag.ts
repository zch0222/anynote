"use client";

import { useEffect, useState } from "react";

/**
 * 延迟开关：挂载后经过 `delayMs` 才把返回值翻成 `true`。
 *
 * 加载体系里有两处需要它（设计稿 P16）：
 * - **首帧之后才出现**：路由切换如果 50ms 就完成，立刻闪一下启动页比不闪更糟；
 * - **超过 1.2s 仍未就绪才切骨架**：快速请求下不该先给一整屏骨架占位。
 *
 * `delayMs <= 0` 时同步返回 `true`——调用方不必为"不要延迟"再写一个分支。
 */
export function useDelayedFlag(delayMs: number): boolean {
  const [elapsed, setElapsed] = useState(delayMs <= 0);

  useEffect(() => {
    if (delayMs <= 0) {
      setElapsed(true);
      return;
    }
    setElapsed(false);
    const timer = setTimeout(() => setElapsed(true), delayMs);
    return () => clearTimeout(timer);
  }, [delayMs]);

  return elapsed;
}
