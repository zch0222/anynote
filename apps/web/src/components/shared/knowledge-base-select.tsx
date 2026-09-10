"use client";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { KnowledgeBase } from "@/features/notes/schemas";
import { Check, ChevronDown } from "lucide-react";

/** 知识库选择器：课程 / 任务等都挂在知识库下，mooc、tasks 共用。 */
export function KnowledgeBaseSelect({
  bases,
  value,
  onChange,
  ariaLabel = "选择知识库",
}: {
  bases: KnowledgeBase[];
  value: number | null;
  onChange: (baseId: number) => void;
  ariaLabel?: string;
}) {
  const current = bases.find((base) => base.id === value);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button variant="outline" className="max-w-56 justify-between" />}
      >
        <span className="truncate">{current?.knowledgeBaseName ?? "选择知识库"}</span>
        <ChevronDown className="size-4 shrink-0 opacity-50" aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="max-h-64 w-56 overflow-y-auto">
        {bases.length === 0 ? (
          <p className="px-2 py-3 text-sm text-muted-foreground">暂无知识库</p>
        ) : (
          bases.map((base) => (
            <DropdownMenuItem
              key={base.id}
              onSelect={() => {
                onChange(base.id);
              }}
            >
              <span className="min-w-0 flex-1 truncate">
                {base.knowledgeBaseName ?? "未命名知识库"}
              </span>
              {base.id === value ? <Check className="size-4" aria-hidden="true" /> : null}
            </DropdownMenuItem>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
