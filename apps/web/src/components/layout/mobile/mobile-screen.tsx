"use client";

import { cn } from "@/lib/utils";
import { ChevronLeft } from "lucide-react";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";

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
   * - `"large"`：左侧大标题（tab 根页面 M-01 工作台 / M-02 我的）
   */
  titleVariant?: MobileTitleVariant;
  contentClassName?: string;
  children: ReactNode;
};

export type MobileTitleVariant = "center" | "large";

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
 */
export function MobileScreen({
  title,
  back,
  actions,
  toolbar,
  fill = false,
  titleVariant,
  contentClassName,
  children,
}: MobileScreenProps) {
  const router = useRouter();
  const variant = resolveTitleVariant(back, titleVariant);
  /*
   * 居中态需要**左右等宽**，否则标题会偏向窄的那一侧：
   * 返回键是 `size-10`（40），右侧动作区可能一个都没有，也可能有 1–2 个按钮。
   * 所以两种形态各配一个 `size-10` 的占位（`aria-hidden`），把标题挤在正中。
   * 大标题态不需要平衡——它本来就靠左。
   */
  const hasBack = Boolean(back);

  const goBack = () => {
    if (typeof back === "string" && !hasInAppHistory(window.history.state)) {
      // 直接打开的（分享链接 / 新标签页 / E2E 的 goto）：没有站内上一页，
      // back() 会退出站点，改用兜底地址
      router.push(back);
      return;
    }
    router.back();
  };

  return (
    <>
      <header className="mobile-title-bar sticky top-0 z-20 flex items-center gap-2 border-b bg-surface">
        {hasBack ? (
          <button
            type="button"
            onClick={goBack}
            aria-label="返回"
            data-testid="mobile-back"
            className="-ml-2 flex size-10 shrink-0 items-center justify-center rounded-lg text-label-secondary outline-none hover:bg-fill-hover focus-visible:ring-2 focus-visible:ring-ring"
          >
            <ChevronLeft className="size-5" aria-hidden="true" />
          </button>
        ) : variant === "center" ? (
          <span className="size-10 shrink-0" aria-hidden="true" />
        ) : null}
        <h1
          data-title-variant={variant}
          className={cn(
            "min-w-0 truncate",
            variant === "center"
              ? // 画板原文「17/22 SemiBold 居中截断」：17px 在 Tailwind 里没有档位
                "flex-1 text-center text-[1.0625rem] leading-[1.375rem] font-semibold"
              : "flex-1 text-title font-semibold",
          )}
        >
          {title}
        </h1>
        {actions ? (
          <div className="flex shrink-0 items-center gap-1">{actions}</div>
        ) : variant === "center" ? (
          // 右侧没有动作也要占位，否则标题不是屏幕正中（见上）
          <span className="size-10 shrink-0" aria-hidden="true" />
        ) : null}
      </header>
      {toolbar ? (
        <div className="sticky top-[var(--mobile-header-h)] z-10 border-b bg-surface px-3 py-2">
          {toolbar}
        </div>
      ) : null}
      <main
        id="mobile-content"
        tabIndex={-1}
        data-fill={fill ? "true" : undefined}
        data-testid="mobile-content"
        className={cn("mobile-content flex flex-col outline-none", contentClassName)}
      >
        {children}
      </main>
    </>
  );
}
