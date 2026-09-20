"use client";

import { cn } from "@/lib/utils";
import { ChevronLeft } from "lucide-react";
import { useRouter } from "next/navigation";
import type { CSSProperties, ReactNode } from "react";

export type MobileScreenProps = {
  /** 顶栏标题。 */
  title: ReactNode;
  /**
   * 返回键：
   * - `false` / 省略：不显示（tab 根页面）
   * - `true`：调 `router.back()`
   * - 字符串：作为兜底地址，没有站内历史时跳过去（直接打开分享链接的情形）
   */
  back?: boolean | string;
  /**
   * 覆盖返回键的点击行为（缺省按 `back` 的语义走）。
   * 版本页这类"返回是同一路由的另一态"的页面用它：既保留左侧 44×44 的
   * 返回键形态（画板统一），又不套用浏览器历史语义。
   */
  onBack?: () => void;
  /** 顶栏右侧动作区。 */
  actions?: ReactNode;
  /** 顶栏下方的附加区域（筛选条、面包屑等），跟着顶栏一起 sticky。 */
  toolbar?: ReactNode;
  /**
   * 内容区是否"占满可用高度、内部滚动"。
   * 编辑器、对话这类页面传 true；普通列表页保持 false，让整页自然滚动。
   */
  fill?: boolean;
  /**
   * 标题排版。不传时**按 `back` 推导**（见 `resolveTitleVariant`），
   * 绝大多数页面因此不用显式指定。
   *
   * - `"center"`：17/22 SemiBold **居中截断**（详情页，画板 M-03/M-05/M-06/M-08/
   *   M-09/M-11/M-12/M-13 的顶栏都是这个形态）
   * - `"large"`：左侧大标题 34/41 Bold（tab 根页面 M-01 工作台 / M-02 我的），
   *   顶栏随之加高到 88，且不带分隔线（画板 M-01/M-02 的标题直接坐在页面底色上）
   */
  titleVariant?: MobileTitleVariant;
  /**
   * 页面底色语义（2026-09-20 还原度修复 V01）：
   * - `"grouped"`：分组底 `bg-grouped` + 白色卡片（工作台 / 我的 / 搜索 / 设置 /
   *   新建笔记 / 协同文档库 / 历史版本）
   * - `"paper"`：整页纸面 `bg-surface`（知识库内各 Tab、慕课详情、编辑器、协同工作区）
   * 画板两种底色都有，之前外壳统一 `bg-surface` 把分组层次抹平了。
   */
  tone?: MobilePageTone;
  contentClassName?: string;
  children: ReactNode;
};

export type MobileTitleVariant = "center" | "large";

export type MobilePageTone = "grouped" | "paper";

/** 大标题态顶栏高度：34/41 的标题 + 上下留白，画板量得 88。 */
const LARGE_HEADER_H = "5.5rem";

/**
 * 标题排版：**有返回键就是详情页**，标题居中；没有返回键就是 tab 根页面，左侧大标题。
 *
 * 这条推导能把画板上两种形态一次对齐，而不必让十几个调用点各写一遍：
 * - 详情页（M-03 知识库名 / M-05 知识库名 / M-06 课程名 / M-08 协同文档 /
 *   M-09 文档名 / M-11 账号 / M-12 任务详情 / M-13 历史版本 / M-07 新建笔记）
 *   画板原文都是「17/22 SemiBold 居中截断」。
 * - tab 根页面（M-01 工作台「你好，陈可」、M-02 我的「我的」）画板是左侧大标题，
 *   右侧放头像或动作。
 *
 * 之所以按 `back` 而不是让调用方显式传：`back` 是"这一页能不能退出去"的客观事实，
 * 而标题居中与否只是它的视觉投影。让调用方重复声明两者，迟早会出现
 * "有返回键但标题居中、没返回键却也居中"这类自相矛盾的组合。
 */
export function resolveTitleVariant(
  back: boolean | string | undefined,
  override?: MobileTitleVariant,
): MobileTitleVariant {
  if (override) return override;
  return back ? "center" : "large";
}

/**
 * 站内是否已经有可返回的历史。
 *
 * **不能用 `history.length`**：直接 `goto` 一个详情页后 `length` 就是 2
 * （多出来的那条是 `about:blank`），`back()` 会把人退回空白页——
 * 这正是「详情页点返回变成 about:blank」的成因。
 *
 * Next App Router 会在 `history.state.idx` 里维护自己在会话历史中的位置：
 * 首次加载是 `0`，每次客户端导航递增。`idx > 0` 才是"确实从站内走进来的"。
 * 拿不到 `idx` 时保守地认为没有站内历史，退回兜底地址——宁可多一次跳转，
 * 也不要退回空白页。
 */
export function hasInAppHistory(state: unknown): boolean {
  if (!state || typeof state !== "object") return false;
  const idx = (state as { idx?: unknown }).idx;
  return typeof idx === "number" && idx > 0;
}

/**
 * 每个移动端页面的统一外框：顶栏 + 内容区。
 *
 * 标题与返回键由页面自己给，而不是由 shell 从路由猜——详情页的标题是数据
 * （笔记名 / 会话名），只有页面自己知道。tab bar 不在这里，它属于 MobileShell。
 *
 * 页面底色与底部 tab bar 的让位也在这里：外壳只给兜底底色，真正"这一屏是分组底
 * 还是纸面"由页面声明（`tone`），顶栏才能与它同色、sticky 时不露馅。
 */
export function MobileScreen({
  title,
  back,
  onBack,
  actions,
  toolbar,
  fill = false,
  titleVariant,
  tone = "grouped",
  contentClassName,
  children,
}: MobileScreenProps) {
  const router = useRouter();
  const variant = resolveTitleVariant(back, titleVariant);
  /*
   * 居中态需要**左右等宽**，否则标题会偏向窄的那一侧：
   * 返回键是 `size-11`（44 命中区），右侧动作区可能一个都没有，也可能有 1–2 个按钮。
   * 所以两种形态各配一个 `size-11` 的占位（`aria-hidden`），把标题挤在正中。
   * 大标题态不需要平衡——它本来就靠左。
   */
  const hasBack = Boolean(back);

  const goBack = () => {
    if (onBack) {
      onBack();
      return;
    }
    if (typeof back === "string" && !hasInAppHistory(window.history.state)) {
      // 直接打开的（分享链接 / 新标签页 / E2E 的 goto）：没有站内上一页，
      // back() 会退出站点，改用兜底地址
      router.push(back);
      return;
    }
    router.back();
  };

  return (
    <div
      data-testid="mobile-screen"
      data-tone={tone}
      className={cn(
        "flex min-h-[var(--mobile-viewport-h)] flex-col pb-[var(--mobile-tabbar-h)]",
        tone === "paper" ? "bg-surface" : "bg-grouped",
      )}
      style={
        variant === "large" ? ({ "--mobile-header-h": LARGE_HEADER_H } as CSSProperties) : undefined
      }
    >
      <header
        data-variant={variant}
        className={cn(
          "mobile-title-bar sticky top-0 z-20 flex items-center gap-2",
          // 两种底色的顶栏都**不带分隔线**：画板 M-01/M-03/M-08/M-13 的标题都直接
          // 坐在页面底色上，sticky 滚动时靠同色底挡住内容即可。
          tone === "paper" ? "bg-surface" : "bg-grouped",
        )}
      >
        {hasBack ? (
          <button
            type="button"
            onClick={goBack}
            aria-label="返回"
            data-testid="mobile-back"
            className="-ml-2 flex size-11 shrink-0 items-center justify-center rounded-lg text-accent outline-none hover:bg-fill-hover focus-visible:ring-2 focus-visible:ring-ring"
          >
            {/* 画板 M-03 图例 1：44×44 命中区、Chevron 26 accent */}
            <ChevronLeft className="size-[1.625rem]" aria-hidden="true" />
          </button>
        ) : variant === "center" ? (
          <span className="size-11 shrink-0" aria-hidden="true" />
        ) : null}
        <h1
          data-title-variant={variant}
          className={cn(
            "min-w-0 truncate",
            variant === "center"
              ? // 画板原文「17/22 SemiBold 居中截断」：17px 在 Tailwind 里没有档位
                "flex-1 text-center text-[1.0625rem] leading-[1.375rem] font-semibold"
              : // 画板 M-01 图例 1 / M-02：34/41 Bold 大标题
                "flex-1 text-display font-bold",
          )}
        >
          {title}
        </h1>
        {actions ? (
          <div className="flex shrink-0 items-center gap-1">{actions}</div>
        ) : variant === "center" ? (
          // 右侧没有动作也要占位，否则标题不是屏幕正中（见上）
          <span className="size-11 shrink-0" aria-hidden="true" />
        ) : null}
      </header>
      {toolbar ? (
        <div className="sticky top-[var(--mobile-header-h)] z-10 border-b bg-inherit px-3 py-2">
          {toolbar}
        </div>
      ) : null}
      <main
        id="mobile-content"
        tabIndex={-1}
        data-fill={fill ? "true" : undefined}
        data-testid="mobile-content"
        className={cn("mobile-content flex flex-1 flex-col outline-none", contentClassName)}
      >
        {children}
      </main>
    </div>
  );
}
