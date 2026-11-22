"use client";

import { Button, buttonVariants } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ExternalLink, MoreHorizontal } from "lucide-react";
import type { ReactNode } from "react";

/**
 * 每类正文顶部统一的标签头：标题、元信息、状态、新窗口与更多菜单。
 *
 * @author 称霸幼儿园
 */

export type TabHeaderProps = {
  title: string;
  meta: string;
  status?: ReactNode;
  href: string | null;
  /** 笔记需要先保存再打开，传入时渲染为按钮而不是原生链接。 */
  onNewWindow?: (() => void) | undefined;
  onOpenFullPage?: (() => void) | undefined;
  onOpenHistory?: (() => void) | undefined;
};

export function TabHeader({
  title,
  meta,
  status,
  href,
  onNewWindow,
  onOpenFullPage,
  onOpenHistory,
}: TabHeaderProps) {
  return (
    <header className="flex shrink-0 items-center gap-2 border-b border-separator px-3 py-2">
      <div className="min-w-0 flex-1">
        <h2 className="truncate text-sm font-medium text-label" title={title}>
          {title}
        </h2>
        {meta ? <p className="truncate text-xs text-label-tertiary">{meta}</p> : null}
      </div>
      {status}
      {onNewWindow ? (
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="在新窗口打开"
          title="在新窗口打开"
          onClick={onNewWindow}
        >
          <ExternalLink className="size-4" aria-hidden="true" />
        </Button>
      ) : href ? (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="在新窗口打开"
          title="在新窗口打开"
          className={buttonVariants({ variant: "ghost", size: "icon-sm" })}
        >
          <ExternalLink className="size-4" aria-hidden="true" />
        </a>
      ) : null}
      {onOpenFullPage || onOpenHistory ? (
        <DropdownMenu>
          <DropdownMenuTrigger
            render={<Button variant="ghost" size="icon-sm" aria-label="更多" title="更多" />}
          >
            <MoreHorizontal className="size-4" aria-hidden="true" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuGroup>
              {onOpenFullPage ? (
                <DropdownMenuItem onClick={onOpenFullPage}>打开完整页面</DropdownMenuItem>
              ) : null}
              {onOpenHistory ? (
                <DropdownMenuItem onClick={onOpenHistory}>历史版本</DropdownMenuItem>
              ) : null}
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
    </header>
  );
}
