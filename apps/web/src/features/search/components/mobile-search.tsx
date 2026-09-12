"use client";

import { MobileScreen } from "@/components/layout/mobile/mobile-screen";
import { Input } from "@/components/ui/input";
import { buildMobileSearchItems, filterMobileSearchItems } from "@/lib/mobile/search";
import { Search } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

/**
 * `/m/search`：⌘K 命令面板的移动端替代（方案 D6）。
 *
 * 全屏页而不是对话框：手机上弹层被软键盘挤到只剩两三行，选不动。
 * 候选集与匹配都在 `lib/mobile/search.ts` 的纯函数里，组件只负责渲染。
 */
export function MobileSearchPage() {
  const [query, setQuery] = useState("");
  const items = useMemo(() => buildMobileSearchItems(), []);
  const results = useMemo(() => filterMobileSearchItems(items, query), [items, query]);

  return (
    <MobileScreen title="搜索" back="/m/dashboard">
      <div className="space-y-4 p-4" data-testid="mobile-search">
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            aria-label="搜索页面或操作"
            placeholder="搜索页面或操作…"
            className="min-h-11 pl-9"
          />
        </div>

        {results.length === 0 ? (
          <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
            没有找到匹配的页面
          </p>
        ) : (
          <ul className="divide-y overflow-hidden rounded-xl border bg-card">
            {results.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className="flex min-h-12 items-center gap-3 px-4 text-sm outline-none focus-visible:bg-accent"
                >
                  <span className="min-w-0 flex-1 truncate">{item.title}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">{item.href}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}

        <p className="text-xs text-muted-foreground">
          这里搜的是页面与入口。笔记正文检索后端还没有对应端点，桌面版同样没有。
        </p>
      </div>
    </MobileScreen>
  );
}
