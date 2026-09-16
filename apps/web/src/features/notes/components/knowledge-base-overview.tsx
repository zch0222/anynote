"use client";

import { ThemeSwitcher } from "@/components/layout/theme-switcher";
import { ListRowsSkeleton } from "@/components/loading/skeletons";
import { NotFoundState } from "@/components/shared/states";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useMoocsQuery } from "@/features/mooc/use-moocs";
import { coverClassName } from "@/features/notes/lib/cover-gradient";
import {
  OVERVIEW_TILES,
  TILE_BLOCK_CLASS,
  tileCountText,
} from "@/features/notes/lib/overview-sections";
import {
  DEFAULT_PAGE_SIZE,
  DOC_INDEXED,
  type DocListItem,
  type KnowledgeBaseMember,
  type NoteListItem,
  memberDisplayName,
} from "@/features/notes/schemas";
import { useKnowledgeBaseDocsQuery } from "@/features/notes/use-docs";
import {
  useKnowledgeBaseMembersQuery,
  useKnowledgeBaseQuery,
} from "@/features/notes/use-knowledge-bases";
import { useNotesQuery } from "@/features/notes/use-notes";
import { useTasksQuery } from "@/features/tasks/use-tasks";
import { formatRelativeTime } from "@/lib/format-time";
import { cn } from "@/lib/utils";
import { useUIStore } from "@/stores/ui-store";
import { FileText, Plus, Search } from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import type { ReactNode } from "react";
import { permissionLabel } from "./knowledge-base-members";

/*
 * 「新建笔记」对话框按需加载，理由与 `knowledge-base-detail.tsx` 一致：
 * 它顶层引着 react-hook-form，而这条文件是四个路由的共同入口。
 */
const CreateNoteDialog = dynamic(
  () => import("./create-note-dialog").then((mod) => mod.CreateNoteDialog),
  { ssr: false },
);

/** 「最近笔记」预览条数（D-02 图例 18：「最近 5 篇」）。 */
export const OVERVIEW_NOTE_PREVIEW = 5;
/** 「资料」预览条数（图例 19：「只取前 3 份」）。 */
export const OVERVIEW_DOC_PREVIEW = 3;
/** 「成员」预览条数（图例 23：「只取前 3 位」）。 */
export const OVERVIEW_MEMBER_PREVIEW = 3;

/** 次按钮（空态动作用）：与页头主按钮同形，只降一档。 */
const SECONDARY_ACTION_CLASS =
  "inline-flex min-h-8 items-center rounded-full border border-separator px-3.5 text-footnote font-medium text-label outline-none transition-colors hover:bg-fill-hover focus-visible:ring-2 focus-visible:ring-ring";

/** 区块标题 +「全部 X」链接（D-02 图例 16 / 19 / 23）。 */
function PreviewHeading({
  id,
  title,
  href,
  linkText,
}: {
  id: string;
  title: string;
  href: string;
  linkText: string;
}) {
  return (
    <header className="flex items-center justify-between gap-2">
      <h2 id={id} className="text-headline text-label">
        {title}
      </h2>
      <Link
        href={href}
        className="rounded-sm text-footnote text-accent outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
      >
        {linkText}
      </Link>
    </header>
  );
}

/** 预览卡的空态：标题与说明合成一行（Q-02 给概览块的口径）。 */
function PreviewEmpty({ text, action }: { text: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-separator px-4 py-6 text-center">
      <p className="text-footnote text-label-secondary">{text}</p>
      {action}
    </div>
  );
}

/**
 * 知识库「概览」Tab（`/notes/[baseId]/overview`，D-02）。
 *
 * 「这个库是什么、里面有什么」的一眼判断，四段自上而下：
 *   1. 头图卡片 —— 身份（名称 / 类型徽标 / 简介 / 元信息）+ 本屏唯一主按钮
 *   2. 内容概况 —— 5 格计数，与侧栏二级导航一一对应，点哪格去哪个 Tab
 *   3. 最近笔记 —— 左列，最多 5 篇
 *   4. 资料 / 成员 —— 右列上下两块，各最多 3 条
 *
 * 不做统计图表：后端没有聚合端点，前端拼出来的图会和真实列表越走越偏。
 * 5 格计数复用**侧栏那份列表查询**的 `total`（笔记 / 慕课 / 任务三棵树同 key），
 * 资料与成员随下方预览一并拿到，所以进这一页相对侧栏只多两次请求。
 */
export function KnowledgeBaseOverview({ baseId }: { baseId: number }) {
  const base = useKnowledgeBaseQuery(baseId);
  const notes = useNotesQuery({ knowledgeBaseId: baseId, page: 1, pageSize: DEFAULT_PAGE_SIZE });
  const moocs = useMoocsQuery(baseId);
  const tasks = useTasksQuery(baseId, 1);
  const docs = useKnowledgeBaseDocsQuery(baseId);
  const members = useKnowledgeBaseMembersQuery(baseId);

  /*
   * 新建入口只给「可编辑」及以上（permissions 1 管理 / 2 编辑，数值越小权限越大）。
   * 权限未知时同样隐藏：宁可让按钮在数据到位后出现，也不要让只读成员先看到、
   * 点进去才被后端拒绝——D-02 图例 9 要的正是"避免点了才报无权限"。
   */
  const canCreate = typeof base.data?.permissions === "number" && base.data.permissions <= 2;

  const totals: Record<string, number | undefined> = {
    notes: notes.data?.total,
    mooc: moocs.data?.total,
    tasks: tasks.data?.total,
    docs: docs.data?.total,
    members: members.data?.total,
  };

  const noteRows = (notes.data?.rows ?? []).slice(0, OVERVIEW_NOTE_PREVIEW);
  const docRows = (docs.data?.rows ?? []).slice(0, OVERVIEW_DOC_PREVIEW);
  const memberRows = (members.data?.rows ?? []).slice(0, OVERVIEW_MEMBER_PREVIEW);

  /*
   * 库不存在 / 无权限（D-02 图例最后一组：「接口 404 / 403 → 不存在 / 无权限」）。
   *
   * 必须在最外层短路：后端对不存在的库返回 `{code:"A0301"}`（HTTP 200，靠 code 区分），
   * 于是详情查询进入 `isError`，而**其余五棵查询照样"成功"返回空列表**。
   * 修复前页面因此渲染出一屏完全正常的假数据——头图写「未命名知识库」、
   * 5 格计数写 0、简介写「这个知识库还没有填写简介。」，用户看不出自己打开的库根本不存在。
   * 真实浏览器实测（/notes/999999/overview）确认过这个现象。
   *
   * 5 个同级 Tab（笔记 / 慕课 / 资料 / 成员）在同样输入下都不会这样，
   * 所以这里对齐它们的行为，用统一的 `NotFoundState`（文案已在 12.0.3 定稿）。
   */
  if (base.isError) {
    return (
      /*
       * 外面这层 `div` 只是承载 `data-testid="kb-overview"`：路由级用例与 E2E
       * 用这个 testid 判断"概览页已经渲染"，不存在态也必须是同一个锚点，
       * 否则"点概览 Tab → 页面没反应"会被误报成路由坏了。
       * 不给 `NotFoundState` 加 `data-testid` 参数是因为它是共用组件，
       * 为一个调用方的测试需求去改它的 props 面不值得。
       */
      <div data-testid="kb-overview">
        <NotFoundState object="知识库" backHref="/notes" backLabel="回到知识库" className="pt-10" />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[1000px]" data-testid="kb-overview">
      <HeroCard baseId={baseId} canCreate={canCreate} />

      <section aria-labelledby="kb-overview-stats" className="mt-5">
        <h2 id="kb-overview-stats" className="sr-only">
          内容概况
        </h2>
        {/*
          5 格与侧栏二级导航一一对应（图例原话），从 `OVERVIEW_TILES` 派生。
          断点：窄屏 2 列、sm 3 列、lg 起 5 列——1440 视口下正好一行 5 格。
          卡片间距 12（画板实测相邻卡片间隙 12–13）。
        */}
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {OVERVIEW_TILES.map((tile) => {
            const count = tileCountText(totals[tile.key]);
            return (
              <li key={tile.key}>
                <Link
                  href={tile.href(baseId)}
                  data-testid={`kb-stat-${tile.key}`}
                  className="flex h-full flex-col rounded-md bg-surface p-3.5 shadow-card outline-none transition-shadow hover:shadow-popover focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span
                    aria-hidden="true"
                    className={cn("size-7 shrink-0 rounded-[7px]", TILE_BLOCK_CLASS[tile.key])}
                  />
                  <span className="mt-3 flex items-baseline gap-2">
                    {count === null ? (
                      // 数据未到时给骨架而不是 0：先显示一圈「0 篇笔记」等于告诉用户"这个库是空的"
                      <Skeleton className="h-8 w-10" />
                    ) : (
                      <span className="tabular text-[1.75rem] leading-[1.875rem] font-semibold text-label">
                        {count}
                      </span>
                    )}
                    <span className="text-footnote text-label-secondary">{tile.label}</span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </section>

      {/*
        左列「最近笔记」600 宽、右列「资料 / 成员」380 宽，列间距 20
        （画板实测：左卡 x 368..967、右卡 x 988..1367）。
      */}
      <div className="mt-6 grid gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
        <section aria-labelledby="kb-overview-notes" className="space-y-2.5">
          <PreviewHeading
            id="kb-overview-notes"
            title="最近笔记"
            href={`/notes/${baseId}`}
            linkText="全部笔记"
          />
          {notes.isError ? (
            <PreviewEmpty text="找不到这个知识库" />
          ) : notes.isPending ? (
            <ListRowsSkeleton count={OVERVIEW_NOTE_PREVIEW} />
          ) : noteRows.length === 0 ? (
            <PreviewEmpty
              text="这个知识库还没有笔记"
              action={
                canCreate ? (
                  <CreateNoteDialog
                    knowledgeBaseId={baseId}
                    triggerTestId="kb-overview-empty-create"
                    trigger="新建笔记"
                    triggerClassName={SECONDARY_ACTION_CLASS}
                  />
                ) : null
              }
            />
          ) : (
            <ul
              className="overflow-hidden rounded-lg bg-surface shadow-card"
              data-testid="kb-preview-notes"
            >
              {noteRows.map((note) => (
                <NoteRow key={note.id} baseId={baseId} note={note} />
              ))}
            </ul>
          )}
        </section>

        <div className="space-y-4">
          <section aria-labelledby="kb-overview-docs" className="space-y-2.5">
            <PreviewHeading
              id="kb-overview-docs"
              title="资料"
              href={`/notes/${baseId}/docs`}
              linkText="全部资料"
            />
            {docs.isError ? (
              // Q-02 给概览资料块的口径：这里只是预览块，坏掉时说明「这个库不在」
              // 就够了，不放重试——完整的重试在「资料」Tab。
              <PreviewEmpty text="找不到这个知识库" />
            ) : docs.isPending ? (
              <ListRowsSkeleton count={OVERVIEW_DOC_PREVIEW} />
            ) : docRows.length === 0 ? (
              <PreviewEmpty
                text="还没有资料。上传 PDF 后可以在「PDF 问答」里围绕它提问。"
                action={
                  <Link
                    href={`/ai/pdf?baseId=${baseId}`}
                    data-testid="kb-overview-docs-upload"
                    className={SECONDARY_ACTION_CLASS}
                  >
                    去上传
                  </Link>
                }
              />
            ) : (
              <ul
                className="overflow-hidden rounded-lg bg-surface shadow-card"
                data-testid="kb-preview-docs"
              >
                {docRows.map((doc) => (
                  <DocRow key={doc.id} doc={doc} />
                ))}
              </ul>
            )}
          </section>

          <section aria-labelledby="kb-overview-members" className="space-y-2.5">
            <PreviewHeading
              id="kb-overview-members"
              title="成员"
              href={`/notes/${baseId}/members`}
              linkText="全部成员"
            />
            {members.isError ? (
              <PreviewEmpty text="找不到这个知识库" />
            ) : members.isPending ? (
              <ListRowsSkeleton count={OVERVIEW_MEMBER_PREVIEW} />
            ) : memberRows.length === 0 ? (
              <PreviewEmpty text="这个知识库还没有其他成员。" />
            ) : (
              <ul
                className="overflow-hidden rounded-lg bg-surface shadow-card"
                data-testid="kb-preview-members"
              >
                {memberRows.map((member) => (
                  <MemberRow key={member.userId} member={member} />
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

/**
 * 头图卡片（D-02 图例 2–9）。
 *
 * 与画廊卡片同构：封面在上（圆角、卡片内留白、渐变按 id 取模 5 组），
 * 下面是名称 / 类型徽标 / 简介 / 元信息，右侧是本屏唯一主按钮。
 */
function HeroCard({ baseId, canCreate }: { baseId: number; canCreate: boolean }) {
  const base = useKnowledgeBaseQuery(baseId);
  const detail = base.data?.detail?.trim();
  const typeLabel = base.data?.type === 1 ? "组织知识库" : "普通知识库";

  return (
    <section className="rounded-lg bg-surface p-3 shadow-card" data-testid="kb-hero">
      <div aria-hidden="true" className={cn(coverClassName(baseId), "h-24 w-full rounded-md")} />
      <div className="flex items-end justify-between gap-4 px-2 pt-4 pb-1.5">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            {base.isPending ? (
              <Skeleton className="h-10 w-56" />
            ) : (
              <h1 className="truncate text-display text-label">
                {base.data?.knowledgeBaseName?.trim() || "未命名知识库"}
              </h1>
            )}
            {base.data ? (
              <Badge variant={base.data.type === 1 ? "organization" : "secondary"}>
                {typeLabel}
              </Badge>
            ) : null}
          </div>
          <p
            className={cn(
              "mt-1.5 line-clamp-2 max-w-[640px] text-body",
              detail ? "text-label-secondary" : "text-label-tertiary",
            )}
          >
            {detail || "这个知识库还没有填写简介。"}
          </p>
          {base.data?.updateTime ? (
            <p className="mt-1.5 text-footnote text-label-tertiary">
              更新于 {formatRelativeTime(base.data.updateTime)} · 我的权限：
              {permissionLabel(base.data.permissions)}
            </p>
          ) : null}
        </div>
        {/*
          动作行（图例 7 / 8 / 9）：搜索、主题、新建笔记**都在这张卡片里**。
          这一页不渲染顶栏（见 `isKnowledgeBaseOverviewRoute`），三个动作没有别处可放。
          顺序对应图例编号：先图标按钮两个，最右是主按钮。
        */}
        <div className="flex shrink-0 items-center gap-1">
          <SearchAction />
          <ThemeSwitcher />
          {canCreate ? (
            <CreateNoteDialog
              knowledgeBaseId={baseId}
              triggerTestId="kb-overview-note-create"
              trigger={
                <>
                  <Plus className="size-4" aria-hidden="true" />
                  新建笔记
                </>
              }
              triggerClassName="ml-1 inline-flex min-h-[34px] shrink-0 items-center gap-1.5 rounded-full bg-accent px-4 text-footnote font-medium text-white outline-none transition-colors hover:bg-accent/85 focus-visible:ring-2 focus-visible:ring-ring"
            />
          ) : null}
        </div>
      </div>
    </section>
  );
}

/**
 * 搜索入口（图例 7）：打开命令面板（D-04）。
 *
 * 与 `app-header.tsx` 里的 `SearchButton` 同职责，但形态不同：这里是 34 高的
 * 图标按钮（画板实测与主题按钮同尺寸），而顶栏那个是带「搜索」文字的次按钮。
 * 不抽公共组件是因为两者连断点行为都不一样（顶栏版 `hidden sm:inline-flex`）。
 */
function SearchAction() {
  const setOpen = useUIStore((state) => state.setCommandPaletteOpen);
  return (
    <button
      type="button"
      data-testid="kb-overview-search"
      aria-label="打开命令面板"
      aria-keyshortcuts="Meta+K Control+K"
      onClick={() => setOpen(true)}
      className="grid size-[34px] shrink-0 place-items-center rounded-full text-label-secondary outline-none transition-colors hover:bg-fill-hover focus-visible:ring-2 focus-visible:ring-ring"
    >
      <Search className="size-[18px]" aria-hidden="true" />
    </button>
  );
}
/** 笔记预览行（图例 18：52 高，标题 15 + 相对时间 13 tertiary）。 */
function NoteRow({ baseId, note }: { baseId: number; note: NoteListItem }) {
  return (
    <li className="h-13 border-b border-separator last:border-b-0">
      <Link
        href={`/notes/${baseId}/${note.id}`}
        data-testid={`kb-preview-note-${note.id}`}
        className="flex h-full items-center gap-3 px-4 outline-none transition-colors hover:bg-fill-hover focus-visible:bg-fill-hover focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
      >
        <span className="min-w-0 flex-1 truncate text-body text-label">
          {note.title?.trim() || "未命名笔记"}
        </span>
        <span className="shrink-0 text-footnote text-label-tertiary">
          {formatRelativeTime(note.latestOperationTime ?? note.updateTime)}
        </span>
      </Link>
    </li>
  );
}

/**
 * 资料预览行（图例 19：56 高）。
 *
 * **行本身不可点**（图例原文）：桌面端还没有文档详情路由，
 * 给一个点了没反应的链接比不给更糟。
 */
function DocRow({ doc }: { doc: DocListItem }) {
  const creator = doc.creatorNickname?.trim() || doc.creatorUsername?.trim() || "未知作者";
  const time = formatRelativeTime(doc.createTime);
  const indexed = doc.indexStatus === DOC_INDEXED;
  return (
    <li
      className="flex h-14 items-center gap-3 border-b border-separator px-4 last:border-b-0"
      data-testid={`kb-preview-doc-${doc.id}`}
    >
      <FileText className="size-4 shrink-0 text-label-secondary" aria-hidden="true" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-footnote text-label">
          {doc.docName?.trim() || "未命名文档"}
        </span>
        <span className="block truncate text-xs text-label-tertiary">
          {creator}
          {time ? ` · ${time}` : ""}
        </span>
      </span>
      <Badge variant={indexed ? "success" : "secondary"}>{indexed ? "已索引" : "未索引"}</Badge>
    </li>
  );
}

/** 成员预览行（图例 25：头像 28 accent/tint + 首字，昵称 13，账号 12）。 */
function MemberRow({ member }: { member: KnowledgeBaseMember }) {
  const name = memberDisplayName(member);
  const permissions = member.permissions ?? 0;
  return (
    <li
      className="flex h-13 items-center gap-3 border-b border-separator px-4 last:border-b-0"
      data-testid={`kb-preview-member-${member.userId}`}
    >
      <span
        aria-hidden="true"
        className="grid size-7 shrink-0 place-items-center rounded-full bg-accent-soft text-xs font-medium text-accent"
      >
        {name.slice(0, 1)}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-footnote text-label">{name}</span>
        {member.username ? (
          <span className="block truncate text-xs text-label-tertiary">{member.username}</span>
        ) : null}
      </span>
      <Badge variant={permissions <= 2 ? "organization" : "secondary"}>
        {permissionLabel(member.permissions)}
      </Badge>
    </li>
  );
}
