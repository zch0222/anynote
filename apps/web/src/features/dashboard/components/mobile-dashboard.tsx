"use client";

import { MobileScreen } from "@/components/layout/mobile/mobile-screen";
import { Skeleton } from "@/components/ui/skeleton";
import { useMe } from "@/features/auth/use-me";
import { useKnowledgeBasesQuery } from "@/features/notes/use-knowledge-bases";
import { useNotesQuery } from "@/features/notes/use-notes";
import { submissionStatusText } from "@/features/tasks/schemas";
import { useTasksQuery } from "@/features/tasks/use-tasks";
import {
  ChevronRight,
  FileText,
  Library,
  ListTodo,
  MessageSquare,
  PenLine,
  Search,
} from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

/** 工作台只取一屏能看完的量，多了也读不过来，还会把首屏拖慢。 */
const RECENT_NOTE_COUNT = 5;
const PENDING_TASK_COUNT = 3;
const BASE_CARD_COUNT = 4;
/** 骨架占位的稳定 key：用数组下标会被 lint 拦（顺序变化会错位复用 DOM）。 */
const SKELETON_KEYS = ["a", "b", "c"];

const QUICK_ACTIONS = [
  { title: "新建笔记", href: "/m/notes/new", icon: PenLine },
  { title: "AI 对话", href: "/m/ai/chat", icon: MessageSquare },
  { title: "搜索", href: "/m/search", icon: Search },
  { title: "文档", href: "/m/docs", icon: FileText },
] as const;

/**
 * 移动端工作台（决策 2 取备选 → 登录后的落地页）。
 *
 * 桌面 `/dashboard` 只是个占位页，这里**重做**成有内容的入口：
 * 问候 + 快捷操作 + 最近笔记 + 待办 + 知识库。
 *
 * 数据全部复用既有 hooks，不新增任何后端调用；协同文档索引**不进**这页——
 * 它要连 WebSocket 并加载 yjs，落地页为此建连接不划算（文档从 tab 进）。
 */
export function MobileDashboard() {
  const me = useMe();
  const bases = useKnowledgeBasesQuery();

  // 笔记与任务都挂在知识库下，工作台取"第一个知识库"作为默认上下文，
  // 并在标题里写清是哪个库，避免用户以为这是全局最近笔记。
  const firstBase = bases.data?.[0];
  const baseId = firstBase?.id ?? 0;
  const baseName = firstBase?.knowledgeBaseName ?? "知识库";

  const notes = useNotesQuery({ knowledgeBaseId: baseId, page: 1, pageSize: RECENT_NOTE_COUNT });
  const tasks = useTasksQuery(baseId);

  const pendingTasks = (tasks.data?.rows ?? [])
    .filter((task) => task.submissionStatus !== 1)
    .slice(0, PENDING_TASK_COUNT);

  const greeting = `你好，${me.data?.nickname || me.data?.username || "朋友"}`;

  return (
    <MobileScreen title="工作台">
      <div className="space-y-6 p-4" data-testid="mobile-dashboard">
        <section className="space-y-1">
          <h2 className="text-xl font-semibold tracking-tight">{greeting}</h2>
          <p className="text-sm text-muted-foreground">从这里开始，记录与整理你的想法。</p>
        </section>

        <nav aria-label="快捷操作" className="grid grid-cols-2 gap-3">
          {QUICK_ACTIONS.map((action) => (
            <Link
              key={action.href}
              href={action.href}
              className="flex min-h-16 items-center gap-3 rounded-xl border bg-card px-4 text-sm font-medium outline-none transition-colors hover:border-primary/40 focus-visible:ring-2 focus-visible:ring-ring"
            >
              <action.icon className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
              {action.title}
            </Link>
          ))}
        </nav>

        <DashboardSection
          title={bases.data?.length ? `「${baseName}」最近笔记` : "最近笔记"}
          moreHref={baseId ? `/m/notes/${baseId}` : undefined}
          moreLabel="全部笔记"
        >
          {bases.isPending || (baseId > 0 && notes.isPending) ? (
            <ListSkeleton />
          ) : bases.isError ? (
            <ErrorLine message={bases.error.message} />
          ) : !baseId ? (
            <EmptyLine
              text="还没有知识库"
              hint="先建一个知识库，笔记会归到它下面。"
              actionHref="/m/notes"
              actionText="去创建"
            />
          ) : notes.isError ? (
            <ErrorLine message={notes.error.message} />
          ) : (notes.data?.rows.length ?? 0) === 0 ? (
            <EmptyLine
              text="这个知识库还没有笔记"
              hint="新建一篇，开始记录。"
              actionHref="/m/notes/new"
              actionText="新建笔记"
            />
          ) : (
            <ul className="divide-y rounded-xl border bg-card">
              {notes.data?.rows.map((note) => (
                <li key={note.id}>
                  <Link
                    href={`/m/notes/${baseId}/${note.id}`}
                    className="flex min-h-12 items-center gap-3 px-4 text-sm outline-none focus-visible:bg-accent"
                  >
                    <FileText
                      className="size-4 shrink-0 text-muted-foreground"
                      aria-hidden="true"
                    />
                    <span className="min-w-0 flex-1 truncate">{note.title ?? "未命名笔记"}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {note.updateTime?.slice(5, 10) ?? ""}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </DashboardSection>

        <DashboardSection
          title="待办"
          moreHref={baseId ? "/m/tasks" : undefined}
          moreLabel="全部任务"
        >
          {baseId > 0 && tasks.isPending ? (
            <ListSkeleton rows={2} />
          ) : tasks.isError ? (
            <ErrorLine message={tasks.error.message} />
          ) : pendingTasks.length === 0 ? (
            <p className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
              {baseId ? "没有待提交的任务。" : "任务挂在知识库下，先创建一个知识库。"}
            </p>
          ) : (
            <ul className="divide-y rounded-xl border bg-card" data-testid="dashboard-tasks">
              {pendingTasks.map((task) => (
                <li key={task.id} className="flex min-h-12 items-center gap-3 px-4 py-2 text-sm">
                  <ListTodo className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                  <span className="min-w-0 flex-1 truncate">{task.taskName ?? "未命名任务"}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {submissionStatusText(task.submissionStatus)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </DashboardSection>

        <DashboardSection title="我的知识库" moreHref="/m/notes" moreLabel="全部">
          {bases.isPending ? (
            <ListSkeleton rows={2} />
          ) : (bases.data?.length ?? 0) === 0 ? (
            <p className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
              还没有知识库。
            </p>
          ) : (
            <ul className="grid grid-cols-2 gap-3">
              {bases.data?.slice(0, BASE_CARD_COUNT).map((base) => (
                <li key={base.id}>
                  <Link
                    href={`/m/notes/${base.id}`}
                    className="flex min-h-16 flex-col justify-center gap-1 rounded-xl border bg-card px-4 py-3 outline-none transition-colors hover:border-primary/40 focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <Library className="size-4 text-muted-foreground" aria-hidden="true" />
                    <span className="truncate text-sm font-medium">
                      {base.knowledgeBaseName ?? "未命名知识库"}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </DashboardSection>
      </div>
    </MobileScreen>
  );
}

function DashboardSection({
  title,
  moreHref,
  moreLabel,
  children,
}: {
  title: string;
  moreHref?: string | undefined;
  moreLabel: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-medium text-muted-foreground">{title}</h3>
        {moreHref ? (
          <Link
            href={moreHref}
            className="flex min-h-8 items-center text-xs text-muted-foreground outline-none focus-visible:underline"
          >
            {moreLabel}
            <ChevronRight className="size-3" aria-hidden="true" />
          </Link>
        ) : null}
      </div>
      {children}
    </section>
  );
}

function ListSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-2" aria-busy="true">
      {SKELETON_KEYS.slice(0, rows).map((key) => (
        <Skeleton key={key} className="h-12 rounded-xl" />
      ))}
    </div>
  );
}

function ErrorLine({ message }: { message: string }) {
  return (
    <p className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
      加载失败：{message}
    </p>
  );
}

function EmptyLine({
  text,
  hint,
  actionHref,
  actionText,
}: {
  text: string;
  hint: string;
  actionHref: string;
  actionText: string;
}) {
  return (
    <div className="space-y-2 rounded-xl border border-dashed p-4 text-sm">
      <p className="font-medium">{text}</p>
      <p className="text-muted-foreground">{hint}</p>
      <Link
        href={actionHref}
        className="inline-flex min-h-10 items-center text-sm text-primary outline-none focus-visible:underline"
      >
        {actionText}
      </Link>
    </div>
  );
}
