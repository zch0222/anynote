"use client";

import { MobileScreen } from "@/components/layout/mobile/mobile-screen";
import { ListRowsSkeleton } from "@/components/loading/skeletons";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useMe } from "@/features/auth/use-me";
import { coverAvatarClassName } from "@/features/notes/lib/cover-gradient";
import { useKnowledgeBasesQuery } from "@/features/notes/use-knowledge-bases";
import { useNotesQuery } from "@/features/notes/use-notes";
import { submissionStatusText } from "@/features/tasks/schemas";
import { useTasksQuery } from "@/features/tasks/use-tasks";
import { formatRelativeTime } from "@/lib/format-time";
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
const RECENT_NOTE_COUNT = 4;
const PENDING_TASK_COUNT = 3;
const BASE_CARD_COUNT = 4;

const QUICK_ACTIONS = [
  { title: "新建笔记", href: "/m/notes/new", icon: PenLine },
  { title: "AI 对话", href: "/m/ai/chat", icon: MessageSquare },
  { title: "搜索", href: "/m/search", icon: Search },
  { title: "协同文档", href: "/m/docs", icon: FileText },
] as const;

/**
 * 移动端工作台（设计稿的「工作台」tab）。
 *
 * 桌面 `/dashboard` 已经收敛成到知识库画廊的重定向，所以"接下来做什么"这件事
 * 由移动端这一页承担：最近笔记 / 待办 / 我的知识库三段都是**带上下文**的
 * （明确写出是哪个库），避免用户以为在看全局。
 *
 * 协同文档索引不进这页——它要连 WebSocket 并加载 yjs，落地页为此建连接不划算。
 */
export function MobileDashboard() {
  const me = useMe();
  const bases = useKnowledgeBasesQuery();

  // 笔记与任务都挂在知识库下，工作台取"第一个知识库"作为默认上下文
  const firstBase = bases.data?.[0];
  const baseId = firstBase?.id ?? 0;
  const baseName = firstBase?.knowledgeBaseName?.trim() || "知识库";

  const notes = useNotesQuery({ knowledgeBaseId: baseId, page: 1, pageSize: RECENT_NOTE_COUNT });
  const tasks = useTasksQuery(baseId);

  const pendingTasks = (tasks.data?.rows ?? [])
    .filter((task) => task.submissionStatus !== 1)
    .slice(0, PENDING_TASK_COUNT);

  const name = me.data?.nickname || me.data?.username || "朋友";

  return (
    <MobileScreen
      title={`你好，${name}`}
      actions={
        <Link
          href="/m/settings/profile"
          aria-label="个人设置"
          className="grid size-10 place-items-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Avatar className="size-8">
            <AvatarImage src={me.data?.avatar || undefined} alt="" />
            <AvatarFallback>{name.slice(0, 1)}</AvatarFallback>
          </Avatar>
        </Link>
      }
    >
      <div className="space-y-6 p-4" data-testid="mobile-dashboard">
        <nav aria-label="快捷操作" className="grid grid-cols-2 gap-3">
          {QUICK_ACTIONS.map((action) => (
            <Link
              key={action.href}
              href={action.href}
              className="flex min-h-14 items-center gap-2.5 rounded-lg bg-surface px-3 text-footnote font-medium text-label shadow-card outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <action.icon className="size-4 shrink-0 text-accent" aria-hidden="true" />
              {action.title}
            </Link>
          ))}
        </nav>

        <DashboardSection
          title={bases.data?.length ? `「${baseName}」最近笔记` : "最近笔记"}
          moreHref={baseId ? `/m/notes/${baseId}` : undefined}
          moreLabel="全部"
        >
          {bases.isPending || (baseId > 0 && notes.isPending) ? (
            <ListRowsSkeleton />
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
            <ul className="space-y-2" data-testid="dashboard-notes">
              {notes.data?.rows.map((note) => (
                <li key={note.id}>
                  <Link
                    href={`/m/notes/${baseId}/${note.id}`}
                    className="flex min-h-14 items-center gap-3 rounded-lg bg-surface px-3 text-footnote text-label shadow-card outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <FileText className="size-4 shrink-0 text-label-secondary" aria-hidden="true" />
                    <span className="min-w-0 flex-1 truncate">
                      {note.title?.trim() || "未命名笔记"}
                    </span>
                    <span className="shrink-0 text-xs text-label-tertiary">
                      {formatRelativeTime(note.latestOperationTime ?? note.updateTime)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </DashboardSection>

        <DashboardSection title="待办" moreHref={baseId ? "/m/tasks" : undefined} moreLabel="全部">
          {baseId > 0 && tasks.isPending ? (
            <ListRowsSkeleton count={2} />
          ) : tasks.isError ? (
            <ErrorLine message={tasks.error.message} />
          ) : pendingTasks.length === 0 ? (
            <p className="rounded-lg border border-dashed border-separator p-4 text-footnote text-label-secondary">
              {baseId ? "没有待提交的任务。" : "任务挂在知识库下，先创建一个知识库。"}
            </p>
          ) : (
            <ul className="space-y-2" data-testid="dashboard-tasks">
              {pendingTasks.map((task) => (
                <li
                  key={task.id}
                  className="flex min-h-14 items-center gap-3 rounded-lg bg-surface px-3 text-footnote text-label shadow-card"
                >
                  <ListTodo className="size-4 shrink-0 text-warning" aria-hidden="true" />
                  <span className="min-w-0 flex-1 truncate">
                    {task.taskName?.trim() || "未命名任务"}
                  </span>
                  <span className="shrink-0 text-xs text-label-tertiary">
                    {submissionStatusText(task.submissionStatus)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </DashboardSection>

        <DashboardSection title="我的知识库" moreHref="/m/notes" moreLabel="全部">
          {bases.isPending ? (
            <ListRowsSkeleton count={2} />
          ) : (bases.data?.length ?? 0) === 0 ? (
            <p className="rounded-lg border border-dashed border-separator p-4 text-footnote text-label-secondary">
              还没有知识库。
            </p>
          ) : (
            <ul className="space-y-2">
              {bases.data?.slice(0, BASE_CARD_COUNT).map((base) => (
                <li key={base.id}>
                  <Link
                    href={`/m/notes/${base.id}`}
                    className="flex min-h-14 items-center gap-3 rounded-lg bg-surface px-3 text-footnote text-label shadow-card outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <span
                      className={coverAvatarClassName(base.id, "size-8 rounded-md")}
                      aria-hidden="true"
                    />
                    <span className="min-w-0 flex-1 truncate">
                      {base.knowledgeBaseName?.trim() || "未命名知识库"}
                    </span>
                    <ChevronRight
                      className="size-4 shrink-0 text-label-tertiary"
                      aria-hidden="true"
                    />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </DashboardSection>

        {bases.data?.length ? (
          <Link
            href="/m/notes"
            className="flex min-h-12 items-center justify-center gap-2 rounded-lg border border-dashed border-separator text-footnote text-label-secondary outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Library className="size-4" aria-hidden="true" />
            查看全部知识库
          </Link>
        ) : null}
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
        <h2 className="text-footnote font-medium text-label">{title}</h2>
        {moreHref ? (
          <Link
            href={moreHref}
            className="flex min-h-8 items-center text-xs text-label-secondary outline-none focus-visible:underline"
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

function ErrorLine({ message }: { message: string }) {
  return (
    <p role="alert" className="rounded-lg bg-danger/5 p-4 text-footnote text-danger">
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
    <div className="space-y-1.5 rounded-lg border border-dashed border-separator p-4 text-footnote">
      <p className="font-medium text-label">{text}</p>
      <p className="text-label-secondary">{hint}</p>
      <Link
        href={actionHref}
        className="inline-flex min-h-10 items-center text-accent outline-none focus-visible:underline"
      >
        {actionText}
      </Link>
    </div>
  );
}
