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
  contentClassName?: string;
  children: ReactNode;
};

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
  contentClassName,
  children,
}: MobileScreenProps) {
  const router = useRouter();

  const goBack = () => {
    // history.length <= 1 说明是直接打开的（分享链接 / 新标签页），back() 会退出站点
    if (typeof back === "string" && window.history.length <= 1) {
      router.push(back);
      return;
    }
    router.back();
  };

  return (
    <>
      <header className="mobile-title-bar sticky top-0 z-20 flex items-center gap-2 border-b bg-background">
        {back ? (
          <button
            type="button"
            onClick={goBack}
            aria-label="返回"
            data-testid="mobile-back"
            className="-ml-2 flex size-10 shrink-0 items-center justify-center rounded-lg text-muted-foreground outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
          >
            <ChevronLeft className="size-5" aria-hidden="true" />
          </button>
        ) : null}
        <h1 className="min-w-0 flex-1 truncate text-base font-semibold">{title}</h1>
        {actions ? <div className="flex shrink-0 items-center gap-1">{actions}</div> : null}
      </header>
      {toolbar ? (
        <div className="sticky top-[var(--mobile-header-h)] z-10 border-b bg-background px-3 py-2">
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
