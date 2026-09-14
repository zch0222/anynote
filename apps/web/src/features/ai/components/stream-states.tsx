"use client";

import { Sparkles } from "lucide-react";
import { memo } from "react";

/**
 * AI 流式三态（设计稿 P15「04 AI 流式 Streaming」）。
 *
 * AI 对话与笔记内 AI 续写**共用这一套**。三个状态按时间严格推进：
 *
 * | 态 | 触发条件 | 表现 |
 * |---|---|---|
 * | 思考中 | 首 token 未到达（`content` 为空） | 三点依次放大，1.2s 循环 |
 * | 逐字输出 | 收到增量 | 纯文本 + 闪烁光标 |
 * | 完成 | 流结束 | 换成只读 Markdown 渲染 |
 *
 * **必须在首 token 之前就有可见动效**——这是设计稿里最重要的一条：
 * 首 token 前的等待时长不可控（模型冷启动、RAG 检索），期间界面静止，
 * 用户会以为卡住了并去点重试，于是打出第二份请求。
 *
 * 另外两条工程取舍：
 * - 流式中**刻意不挂 Markdown 编辑器**（见 `MessageItem`）：半截 Markdown 逐 chunk
 *   重建 ProseMirror 文档既抖动又贵；纯文本 + 光标到完成后再整体替换。
 * - 完成态与「思考中」/光标**同时消失**：用"一次内容置换"来标记"流结束了"，
 *   而不是让光标渐隐——渐隐会被读成"还在加载"。
 */

/**
 * 「思考中」指示器：三点依次放大到 1.2 倍、透明度 0.2 → 1，错峰 0.15s。
 *
 * 错峰用内联 `animationDelay` 而不是三个类名：延迟是**序号 × 0.15s** 的线性关系，
 * 写成类名就要维护三份几乎相同的 CSS，而它们只有这一个数值不同。
 */
export const ThinkingDots = memo(function ThinkingDots({ className }: { className?: string }) {
  return (
    <span data-slot="thinking-dots" aria-hidden="true" className={className}>
      {[0, 1, 2].map((index) => (
        <span
          key={index}
          data-dot={index}
          className="inline-block size-1.5 rounded-full bg-label-tertiary animate-think-dot"
          style={{ animationDelay: `${index * 0.15}s` }}
        />
      ))}
    </span>
  );
});

/**
 * 流式光标。
 *
 * `step-end` 闪烁（不是淡入淡出）：光标应当"跳"，淡入淡出会被读成呼吸灯、
 * 也就是另一种"加载中"。`aria-hidden` —— 光标是视觉提示，不是需要播报的内容。
 */
export const StreamCaret = memo(function StreamCaret({ className }: { className?: string }) {
  return (
    <span
      data-slot="stream-caret"
      aria-hidden="true"
      className={
        className ?? "ml-0.5 inline-block h-4 w-0.5 animate-caret-blink bg-accent align-text-bottom"
      }
    />
  );
});

/**
 * AI 头像位（设计稿里三种状态共用的左侧方块）。
 *
 * 思考中时它带一圈 `accent-soft` 底，与三点一起构成"这里在动"；
 * 完成后恢复静态。
 */
export function AiAvatar({ thinking = false }: { thinking?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={
        thinking
          ? "mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent"
          : "mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent"
      }
    >
      <Sparkles className="size-4" />
    </span>
  );
}
