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
import { formatDueLine, formatRelativeTime } from "@/lib/format-time";
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

/**
 * 工作台只取一屏能看完的量，多了也读不过来，还会把首屏拖慢。
 */
const RECENT_NOTE_COUNT = 4;
const PENDING_TASK_COUNT = 3;
const BASE_CARD_COUNT = 4;

/**
 * 快捷操作（M-01 图例 4–6）：**一行三格**，图标在上、文字在下。
 *
 * 早期是 2×2 四格、图标在左，还多出一格「搜索」——但搜索在画板里是**上方独立的
 * 全宽伪输入框**（图例 3），不是快捷格子。把搜索挤进格子里会让它和其它三个
 * "新建 / 打开"类动作混在一起，且占掉一格后三个高频入口变成两行。
 */
const QUICK_ACTIONS = [
  { title: "新建笔记", href: "/m/notes/new", icon: PenLine, tone: "accent" },
  { title: "AI 对话", href: "/m/ai/chat", icon: MessageSquare, tone: "accent" },
  { title: "协同文档", href: "/m/docs", icon: FileText, tone: "accent" },
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

  /*
   * 待办 = 未提交（0）与已退回（3）。
   *
   * 不能写成 `status !== 1`：那样的"待办"里会混进 2（无需提交，即本库管理员
   * 自己）与任何后端将来新增的状态。§1.4 第 2 条刚把 2 的语义从"已退回"
   * 掰回"无需提交"，工作台是同一套枚举的第二个出口，必须按白名单过滤。
   */
  const pendingTasks = (tasks.data?.rows ?? [])
    .filter((task) => task.submissionStatus === 0 || task.submissionStatus === 3)
    .slice(0, PENDING_TASK_COUNT);

  const name = me.data?.nickname || me.data?.username || "朋友";

  return (
    <MobileScreen
      /*
       * 问候语用**占位昵称**而不是"朋友"：`me` 是异步的，先用兜底文案再换成真昵称，
       * 会让标题栏文字重新排版（实测 CLS 0.024）。骨架态用不换行空格保宽，
       * 视觉上仍是一句完整的问候。
       */
      title={me.isPending ? "你好，\u00a0" : `你好，${name}`}
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
        {/*
          M-01 图例 3：**全宽搜索伪输入框**（358×36、圆角 10、底 #E9E9EE），
          点击去 /m/search。用一个 Link 做成"看起来像输入框"的样子而不是真 <input>：
          真输入框会拉起键盘、用户以为要在这里打字，而实际搜索页有自己的一整页
          交互（历史、分组、逐字过滤高亮）。
        */}
        <Link
          href="/m/search"
          data-testid="dashboard-search"
          className="flex h-9 items-center gap-2 rounded-md bg-fill-hover px-3 text-footnote text-label-secondary outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Search className="size-4 shrink-0" aria-hidden="true" />
          搜索知识库、笔记、慕课
        </Link>

        <nav aria-label="快捷操作" className="grid grid-cols-3 gap-3">
          {QUICK_ACTIONS.map((action) => (
            <Link
              key={action.href}
              href={action.href}
              className="flex min-h-[76px] flex-col items-center justify-center gap-2 rounded-lg bg-surface px-2 text-footnote font-medium text-label shadow-card outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <action.icon className="size-5 shrink-0 text-accent" aria-hidden="true" />
              {action.title}
            </Link>
          ))}
        </nav>

        <DashboardSection
          /*
           * 标题在知识库到齐后才拼上库名（「最近笔记」→「「X」最近笔记」），
           * 那一下标题从一行变两行、把整段往下推（实测 CLS 0.024）。
           * 加载中就先按"带库名"的形态占位，文字换了但行数不变。
           */
          title={baseId ? `「${baseName}」最近笔记` : "最近笔记"}
          moreHref={baseId ? `/m/notes/${baseId}` : undefined}
          moreLabel="全部"
          // 理由同「待办」：内容 0–4 条，高度由数据决定，固定最小高度吸收骨架差
          minHeightClass="min-h-[17.5rem]"
        >
          {bases.isPending || (baseId > 0 && notes.isPending) ? (
            /*
             * 骨架行数必须等于**内容真会有的行数**（这里是 `RECENT_NOTE_COUNT`）。
             * `ListRowsSkeleton` 的默认值是 6，比实际多两行——加载完成时整块
             * 往上收 190px，直接变成可观测的布局位移（Lighthouse CLS 0.15）。
             * M-01 画板早已标注本页 Lighthouse 未达标，这是其中一个主因。
             */
            <ListRowsSkeleton count={RECENT_NOTE_COUNT} />
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
            /*
              M-01 图例 8：**一整张卡 + 内部 1px 分隔线**，而不是一叠分离的小卡。
              分离卡片会把每行的上下留白叠起来（间距 + 卡片内边距），
              4 行就多吃掉近 40px；整卡也让"这是一个列表"这件事一眼可见。
            */
            <ul className="overflow-hidden rounded-lg bg-surface shadow-card" data-testid="dashboard-notes">
              {notes.data?.rows.map((note) => (
                <li key={note.id} className="border-b border-separator last:border-b-0">
                  <Link
                    href={`/m/notes/${baseId}/${note.id}`}
                    className="flex min-h-14 items-center gap-3 px-3 text-footnote text-label outline-none focus-visible:ring-2 focus-visible:ring-ring"
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

        {/* 任务只属于知识库（2026-09-15 拍板）：跨库的 /m/tasks 已重定向，这里直指当前库 */}
        <DashboardSection
          title="待办"
          moreHref={baseId ? `/m/notes/${baseId}/tasks` : undefined}
          moreLabel="全部"
          /*
           * 这一段的内容高度**随数据变**（0 条 → 一行空态 64px；1–3 条 → 每条约 62px），
           * 所以骨架给几行都会在加载完成时对上或错开。给它一个固定的最小高度，
           * 让"从骨架到内容"这一步只在自己的框里发生，不把下面的内容顶走。
           */
          minHeightClass="min-h-[13.75rem]"
        >
          {/*
            `bases.isPending` 也要算进来：知识库还没回来时 `baseId` 是 0，
            待办查询处于 disabled、`isPending` 为 false，于是这里会渲染**空态**，
            等知识库到齐再换成骨架/列表——那一下整块从 78px 长到 252px，
            把下面所有内容顶下去。
          */}
          {bases.isPending || (baseId > 0 && tasks.isPending) ? (
            // 待办最多 `PENDING_TASK_COUNT` 条，骨架就照这个数给
            <ListRowsSkeleton count={PENDING_TASK_COUNT} />
          ) : tasks.isError ? (
            <ErrorLine message={tasks.error.message} />
          ) : pendingTasks.length === 0 ? (
            <p className="rounded-lg border border-dashed border-separator p-4 text-footnote text-label-secondary">
              {baseId ? "没有待提交的任务。" : "任务挂在知识库下，先创建一个知识库。"}
            </p>
          ) : (
            // 整卡 + 分隔线，理由同「最近笔记」
            <ul className="overflow-hidden rounded-lg bg-surface shadow-card" data-testid="dashboard-tasks">
              {pendingTasks.map((task) => (
                <li key={task.id} className="border-b border-separator last:border-b-0">
                  {/*
                    M-01 图例 12：整行可点，去当前库的任务 Tab。
                    M-01 图例 13：**第二行是「截止 09-18 周四」**——待办只看得到任务名
                    与状态的话，用户无法判断"这件事急不急"。`endTime` 列表端点已经返回，
                    不用后端补字段。
                  */}
                  <Link
                    href={`/m/notes/${baseId}/tasks`}
                    data-testid={`dashboard-task-${task.id}`}
                    className="flex min-h-14 items-center gap-3 px-3 text-footnote text-label outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <ListTodo className="size-4 shrink-0 text-warning" aria-hidden="true" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate">{task.taskName?.trim() || "未命名任务"}</span>
                      {formatDueLine(task.endTime) ? (
                        <span className="tabular block truncate text-xs text-label-tertiary">
                          {formatDueLine(task.endTime)}
                        </span>
                      ) : null}
                    </span>
                    <span className="shrink-0 text-xs text-label-tertiary">
                      {submissionStatusText(task.submissionStatus)}
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

        <DashboardSection
          title="我的知识库"
          moreHref="/m/notes"
          moreLabel="全部"
          minHeightClass="min-h-[12rem]"
        >
          {bases.isPending ? (
            // 骨架行数照内容上限给（`BASE_CARD_COUNT`），给少了加载完成时会往下长
            <ListRowsSkeleton count={BASE_CARD_COUNT} />
          ) : (bases.data?.length ?? 0) === 0 ? (
            <p className="rounded-lg border border-dashed border-separator p-4 text-footnote text-label-secondary">
              还没有知识库。
            </p>
          ) : (
            <ul className="overflow-hidden rounded-lg bg-surface shadow-card">
              {bases.data?.slice(0, BASE_CARD_COUNT).map((base) => (
                <li key={base.id} className="border-b border-separator last:border-b-0">
                  <Link
                    href={`/m/notes/${base.id}`}
                    className="flex min-h-14 items-center gap-3 px-3 text-footnote text-label outline-none focus-visible:ring-2 focus-visible:ring-ring"
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

        {/*
          这个入口的显隐条件是「有没有知识库」，而它在知识库加载完成前一直不渲染：
          出现的那一刻把整页内容往下推 48px（实测 CLS 0.06）。
          占位而不是延迟渲染——用等高的空链接撑住，位置就不动。
          `invisible` 保留布局但不可见/不可点，读屏也不会念到。
        */}
        <Link
          href="/m/notes"
          aria-hidden={bases.data?.length ? undefined : true}
          tabIndex={bases.data?.length ? undefined : -1}
          className={`flex min-h-12 items-center justify-center gap-2 rounded-lg border border-dashed border-separator text-footnote text-label-secondary outline-none focus-visible:ring-2 focus-visible:ring-ring ${
            bases.data?.length ? "" : "invisible"
          }`}
        >
          <Library className="size-4" aria-hidden="true" />
          查看全部知识库
        </Link>
      </div>
    </MobileScreen>
  );
}

function DashboardSection({
  title,
  moreHref,
  moreLabel,
  minHeightClass,
  children,
}: {
  title: string;
  moreHref?: string | undefined;
  moreLabel: string;
  /**
   * 给内容区一个固定最小高度，吸收"骨架 → 内容"的高度差。
   *
   * 为什么需要它：这几个区块的内容高度**由数据决定**（0 条是空态、3 条是三行），
   * 骨架无论给几行都会与实际差一截，加载完成时把下面的内容顶走——这正是
   * M-01 画板标注的 Lighthouse 未达标的主因（CLS）。固定最小高度让高度变化
   * 只发生在区块内部，不影响后续内容的纵向位置。
   */
  minHeightClass?: string | undefined;
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
      <div className={minHeightClass}>{children}</div>
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
