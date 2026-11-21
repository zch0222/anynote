"use client";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useId } from "react";
import type { RunScope } from "../schemas";
import { useChatKnowledgeBasesQuery } from "../use-chat-scope";

/**
 * 聊天检索范围选择。
 *
 * @author 称霸幼儿园
 */
export function ChatScopeSelect({
  scope,
  disabled,
  onChange,
}: {
  scope: RunScope;
  disabled: boolean;
  onChange: (scope: RunScope) => void;
}) {
  const bases = useChatKnowledgeBasesQuery();
  const id = useId();
  const selected = scope.knowledgeBaseIds[0];
  const options = [
    { value: "all", label: "全部知识库" },
    ...(selected && !bases.data?.some((base) => base.id === selected)
      ? [{ value: String(selected), label: String(selected) }]
      : []),
    ...(bases.data?.map((base) => ({
      value: String(base.id),
      label: base.knowledgeBaseName || "未命名知识库",
    })) ?? []),
  ];
  return (
    <div className="min-w-0 space-y-1">
      <div className="flex min-w-0 items-center gap-2 text-xs">
        <label htmlFor={id} className="shrink-0 text-label-secondary">
          检索范围
        </label>
        <Select
          items={options}
          value={selected ? String(selected) : "all"}
          disabled={disabled || bases.isPending}
          onValueChange={(next) =>
            onChange({
              knowledgeBaseIds: next && next !== "all" ? [Number(next)] : [],
              refs: [],
            })
          }
        >
          <SelectTrigger
            id={id}
            aria-label="检索范围"
            className="h-8 min-w-0 max-w-56 flex-1 rounded-md border-0 bg-transparent px-1.5 text-xs text-label shadow-none hover:bg-fill-hover focus-visible:ring-2 focus-visible:ring-ring dark:bg-transparent dark:hover:bg-fill-hover"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent align="start">
            {options.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {bases.isPending ? <p className="text-xs text-label-secondary">加载中…</p> : null}
      {bases.isSuccess && bases.data.length === 0 ? (
        <p className="text-xs text-label-secondary">暂无可选知识库</p>
      ) : null}
      {bases.isError ? (
        <div className="flex items-center gap-2 text-xs text-danger" role="alert">
          <span>知识库加载失败，请重试</span>
          <Button variant="ghost" size="sm" onClick={() => void bases.refetch()}>
            重试
          </Button>
        </div>
      ) : null}
    </div>
  );
}
