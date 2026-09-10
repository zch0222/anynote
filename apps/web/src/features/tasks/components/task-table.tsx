"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { type MemberTask, isTaskOpen, submissionStatusText } from "@/features/tasks/schemas";
import {
  type ColumnDef,
  type ColumnFiltersState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { useMemo, useState } from "react";
import { SubmitTaskDialog } from "./submit-task-dialog";

export type TaskTableProps = {
  tasks: MemberTask[];
  loading: boolean;
};

const statusVariant: Record<string, "secondary" | "outline" | "destructive"> = {
  已提交: "secondary",
  未提交: "outline",
  已退回: "destructive",
};

/** 任务列表（@tanstack/react-table + shadcn Table）：筛选、状态列、提交操作。 */
export function TaskTable({ tasks, loading }: TaskTableProps) {
  const [submitting, setSubmitting] = useState<MemberTask | null>(null);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);

  const columns = useMemo<ColumnDef<MemberTask>[]>(
    () => [
      {
        accessorKey: "taskName",
        header: "任务名称",
        cell: ({ row }) => (
          <span className="font-medium" title={row.original.taskName ?? ""}>
            {row.original.taskName ?? "未命名任务"}
          </span>
        ),
      },
      {
        accessorKey: "taskDescribe",
        header: "描述",
        cell: ({ row }) => (
          <span
            className="line-clamp-2 max-w-72 text-sm text-muted-foreground"
            title={row.original.taskDescribe ?? ""}
          >
            {row.original.taskDescribe?.trim() || "—"}
          </span>
        ),
      },
      {
        id: "window",
        header: "时间窗口",
        cell: ({ row }) => (
          <span className="text-sm whitespace-nowrap">
            {(row.original.startTime ?? "").slice(0, 10) || "?"} ~{" "}
            {(row.original.endTime ?? "").slice(0, 10) || "?"}
          </span>
        ),
      },
      {
        accessorKey: "submissionStatus",
        header: "我的状态",
        cell: ({ row }) => {
          const text = submissionStatusText(row.original.submissionStatus);
          return (
            <Badge variant={statusVariant[text] ?? "outline"} data-testid="task-status">
              {text}
            </Badge>
          );
        },
      },
      {
        accessorKey: "submitTime",
        header: "提交时间",
        cell: ({ row }) => (
          <span className="text-sm whitespace-nowrap">
            {row.original.submitTime ? row.original.submitTime.slice(0, 16).replace("T", " ") : "—"}
          </span>
        ),
      },
      {
        id: "actions",
        header: "",
        cell: ({ row }) =>
          isTaskOpen(row.original.endTime) && row.original.submissionStatus !== 1 ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setSubmitting(row.original);
              }}
              data-testid={`task-submit-${row.original.id}`}
            >
              提交
            </Button>
          ) : null,
      },
    ],
    [],
  );

  const table = useReactTable({
    data: tasks,
    columns,
    state: { columnFilters },
    onColumnFiltersChange: setColumnFilters,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  });

  if (loading) {
    return (
      <div className="space-y-2">
        {[0, 1, 2, 3].map((row) => (
          <div key={row} className="h-12 animate-pulse rounded-lg bg-muted" />
        ))}
      </div>
    );
  }

  return (
    <>
      <div className="rounded-xl border" data-testid="task-table">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id}>
                    {header.isPlaceholder
                      ? null
                      : flexRender(header.column.columnDef.header, header.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="h-24 text-center text-muted-foreground"
                >
                  这个知识库下还没有任务
                </TableCell>
              </TableRow>
            ) : (
              table.getRowModel().rows.map((row) => (
                <TableRow key={row.id} data-testid={`task-row-${row.original.id}`}>
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
      {submitting ? (
        <SubmitTaskDialog
          task={submitting}
          onOpenChange={(open) => {
            if (!open) {
              setSubmitting(null);
            }
          }}
        />
      ) : null}
    </>
  );
}
