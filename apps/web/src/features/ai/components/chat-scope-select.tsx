"use client";

import { Button } from "@/components/ui/button";
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
  return (
    <div className="space-y-2 border-b px-4 py-2">
      <div className="flex items-center gap-3 text-sm">
        <label htmlFor={id} className="shrink-0 text-label-secondary">
          检索范围
        </label>
        <select
          id={id}
          aria-label="检索范围"
          value={selected ?? "all"}
          disabled={disabled || bases.isPending}
          className="min-h-10 min-w-0 flex-1 rounded-lg border bg-surface px-2 text-label outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onChange={(event) =>
            onChange({
              knowledgeBaseIds: event.target.value === "all" ? [] : [Number(event.target.value)],
              refs: [],
            })
          }
        >
          <option value="all">全部知识库</option>
          {selected && !bases.data?.some((base) => base.id === selected) ? (
            <option value={selected}>{selected}</option>
          ) : null}
          {bases.data?.map((base) => (
            <option key={base.id} value={base.id}>
              {base.knowledgeBaseName || "未命名知识库"}
            </option>
          ))}
        </select>
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
