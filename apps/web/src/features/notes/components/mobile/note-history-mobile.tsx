"use client";

import { MobileActionSheet } from "@/components/layout/mobile/mobile-action-sheet";
import { MobileScreen } from "@/components/layout/mobile/mobile-screen";
import { ListRowsSkeleton } from "@/components/loading/skeletons";
import { Spinner } from "@/components/loading/spinner";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/segmented";
import { HistoryDiffView } from "@/features/notes/components/history-diff-view";
import { formatHistoryTime, groupByDay } from "@/features/notes/lib/history-groups";
import { ensureLeadingHeading } from "@/features/notes/lib/leading-heading";
import { type NoteHistoryItem, historyUpdaterName } from "@/features/notes/schemas";
import {
  useNoteHistoryInfinite,
  useNoteHistoryQuery,
  useRestoreNoteVersionMutation,
} from "@/features/notes/use-note-history";
import { toUserMessage } from "@/lib/api/errors";
import { ChevronRight, Clock, History as HistoryIcon } from "lucide-react";
import dynamic from "next/dynamic";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

/**
 * 只读正文走 `dynamic(..., { ssr: false })`：TipTap 整包（含 Shiki、KaTeX 桥接）
 * 是重依赖，静态引入会把它压进这一页的首屏 JS，而 `/m/*` 的预算是 250KB。
 * 加载态给编辑器骨架——它与即将出现的"标题 + 参差段落"同形，加载完不会整块跳。
 */
const TiptapEditor = dynamic(
  () => import("@/components/editor/TiptapEditor").then((mod) => mod.TiptapEditor),
  { ssr: false, loading: () => <ListRowsSkeleton count={3} /> },
);

const MODE_OPTIONS = [
  { value: "content", label: "正文" },
  { value: "diff", label: "本次改动" },
] as const;

type Mode = (typeof MODE_OPTIONS)[number]["value"];

/**
 * 版本行的显示名。
 *
 * 包一层而不是直接传 `NoteHistoryItem`：`historyUpdaterName` 的入参类型是
 * 精确可选属性（`updaterNickname?: string | null`），而 zod 推出来的行类型是
 * `string | null | undefined`，直接传在 `exactOptionalPropertyTypes` 下不成立。
 * 这里就地归一成 `null`，也顺手把"空字符串算没填"的口径集中在一处。
 */
function updaterName(item: NoteHistoryItem): string {
  return historyUpdaterName({
    updaterNickname: item.updaterNickname ?? null,
    updaterUsername: item.updaterUsername ?? null,
  });
}

/**
 * `/m/notes/[baseId]/[noteId]/history`：笔记历史版本（M-13）。
 *
 * 桌面 D-16 是左右两栏，手机上拆成**两级、同一路由**：
 * 列表（`?v` 缺省）→ 版本页（`?v={operationId}`）。
 *
 * 为什么用查询串而不是两条路由：
 * 1. 版本页是列表的"下一层"，`router.push` 进、返回键回列表——查询串天然满足；
 * 2. 版本内容不是可分享的稳定资源，独立成路由会把"哪个笔记的哪个版本"拆成
 *    两份上下文，返回时还要重新解析一次。
 *
 * 数据层完全复用 12.4.3（`useNoteHistoryInfinite` / `useNoteHistoryQuery` /
 * `useRestoreNoteVersionMutation`）与 `lib/history-groups.ts`，本文件只有版式。
 *
 * 权限：与桌面一致，本库 `permissions > 2`（只读 / 无权限）时不出「恢复此版本」。
 * 后端 `PATCH /notes/{noteId}` 本来就会拒，但"点了才报无权限"正是 Q-02 要避免的形态。
 */
export function MobileNoteHistory({ baseId, noteId }: { baseId: number; noteId: number }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const parsedVersion = Number(searchParams.get("v"));
  const operationId =
    Number.isSafeInteger(parsedVersion) && parsedVersion > 0 ? parsedVersion : null;

  const history = useNoteHistoryInfinite(noteId);
  /**
   * 列表数据由父级持有、两个视图共用。
   *
   * 版本页要用它推"上一版是谁"（「本次改动」的比较基线，与桌面同一套取法），
   * 而版本页自己那条 `useNoteHistoryQuery` 只有当前版本的内容。
   * 两个视图挂同一个 query，从版本页返回列表时也不会重新请求。
   */
  const rows = useMemo(
    () => history.data?.pages.flatMap((page) => page.rows) ?? [],
    [history.data],
  );
  const listPath = `/m/notes/${baseId}/${noteId}/history`;

  return (
    <>
      {/*
        两级共用同一棵 `MobileScreen` 之外的外框：用条件渲染而不是两条路由，
        但**沉浸式**（`IMMERSIVE_PATTERNS` 已含本路径），所以两级都没有 tab bar。
      */}
      {operationId === null ? (
        <MobileScreen title="历史版本" back={`/m/notes/${baseId}/${noteId}`}>
          <HistoryList
            history={history}
            rows={rows}
            onOpenVersion={(id) => {
              router.push(`${listPath}?v=${id}`);
            }}
          />
        </MobileScreen>
      ) : (
        <VersionDetail
          baseId={baseId}
          noteId={noteId}
          operationId={operationId}
          rows={rows}
          onBack={() => {
            // 用 push 而不是 back()：深链直接打开版本页时没有可回的列表
            router.push(listPath);
          }}
        />
      )}
    </>
  );
}

function HistoryList({
  history,
  rows,
  onOpenVersion,
}: {
  history: ReturnType<typeof useNoteHistoryInfinite>;
  rows: NoteHistoryItem[];
  onOpenVersion: (id: number) => void;
}) {
  const groups = useMemo(() => groupByDay(rows), [rows]);
  const { hasNextPage, isFetchingNextPage, fetchNextPage, refetch, isRefetching } = history;

  /**
   * 滚到底自动加载下一页（每页 15 条，由 `HISTORY_PAGE_SIZE` 决定）。
   *
   * 用 `IntersectionObserver` 盯一个哨兵元素，而不是监听 scroll 事件：
   * 滚动回调每帧都跑、还要自己算"离底还有多远"，而 observer 只在进入视口时响一次。
   * jsdom 里没有 IntersectionObserver，缺了它只是"只能看第一页"，不影响渲染。
   */
  const sentinel = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const node = sentinel.current;
    if (!node || typeof IntersectionObserver === "undefined" || !hasNextPage) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting) && !isFetchingNextPage) {
          void fetchNextPage();
        }
      },
      { rootMargin: "200px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  return (
    <div className="space-y-4 p-4" data-testid="mobile-note-history">
      {history.isPending ? (
        <ListRowsSkeleton count={4} />
      ) : history.isError ? (
        <div role="alert" className="rounded-md bg-danger/6 p-4 text-footnote text-danger">
          历史版本加载失败：{toUserMessage(history.error)}
          <Button
            variant="outline"
            size="sm"
            className="mt-2"
            disabled={isRefetching}
            onClick={() => void refetch()}
          >
            重试
          </Button>
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-md border border-dashed border-separator p-6 text-center">
          <HistoryIcon className="mx-auto size-7 text-label-tertiary" aria-hidden="true" />
          <p className="mt-3 text-[0.9375rem] font-semibold text-label">这篇笔记还没有历史版本</p>
          <p className="mt-1 text-footnote text-label-secondary">
            之后每次保存都会在这里留下一个版本。
          </p>
        </div>
      ) : (
        groups.map((group) => (
          <section key={group.label} className="space-y-2">
            <h2 className="text-footnote font-semibold text-label-secondary">{group.label}</h2>
            <ul
              className="overflow-hidden rounded-lg bg-surface shadow-card"
              data-testid="history-list"
            >
              {group.items.map((item) => {
                /* 每篇第一条 = 当前版本：它就是"现在的样子"，没有可恢复的意义 */
                const isCurrent = rows[0]?.operationLogId === item.operationLogId;
                const name = updaterName(item);
                const time = formatHistoryTime(item.operationTime);
                return (
                  <li
                    key={item.operationLogId}
                    className="border-b border-separator last:border-b-0"
                  >
                    {isCurrent ? (
                      <div
                        data-testid={`history-current-${item.operationLogId}`}
                        aria-disabled="true"
                        className="flex min-h-[60px] items-center gap-3 px-4 py-2.5"
                      >
                        <VersionAvatar initial={name} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-headline text-label">{name}</span>
                          <span className="tabular block text-footnote text-label-tertiary">
                            {time}
                          </span>
                        </span>
                        <span className="shrink-0 rounded-full bg-accent-soft px-2 py-0.5 text-xs font-medium text-accent">
                          当前版本
                        </span>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => onOpenVersion(item.operationLogId)}
                        data-testid={`history-version-${item.operationLogId}`}
                        className="flex min-h-[60px] w-full items-center gap-3 px-4 py-2.5 text-left outline-none transition-colors hover:bg-fill-hover focus-visible:bg-fill-hover"
                      >
                        <VersionAvatar initial={name} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-headline text-label">{name}</span>
                          <span className="tabular block text-footnote text-label-tertiary">
                            {time}
                          </span>
                        </span>
                        {/* V20：可进入的版本行行尾要有 ›，与「当前版本」徽标区分 */}
                        <ChevronRight
                          className="size-4 shrink-0 text-label-tertiary"
                          aria-hidden="true"
                        />
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        ))
      )}

      {/* 哨兵：滚到这里就取下一页。到底时给结束文案，免得用户怀疑"是不是没加载出来" */}
      <div ref={sentinel} className="h-1" aria-hidden="true" />
      {rows.length > 0 ? (
        <p className="flex items-center justify-center gap-1.5 text-center text-xs text-label-tertiary">
          {hasNextPage ? (
            <>
              {isFetchingNextPage ? <Spinner size="inline" /> : null}
              滚动加载更早的版本
            </>
          ) : (
            "没有更早的版本了"
          )}
        </p>
      ) : null}
    </div>
  );
}

/**
 * 头像底色按人名取系统色板（画板 M-13：陈可紫 / 林一橙 / 王思远青）。
 * 原先所有人都是灰底，列表里"谁存的"完全读不出来；用名字哈希而不是 id，
 * 同一个人在列表与版本页颜色一致。
 */
const AVATAR_TONES = [
  "bg-[#5e5ce6]",
  "bg-[#ff9f0a]",
  "bg-[#30d158]",
  "bg-[#5ac8fa]",
  "bg-[#bf5af2]",
  "bg-[#ff375f]",
] as const;

function avatarTone(name: string): string {
  let hash = 0;
  for (const char of name) hash = (hash * 31 + (char.codePointAt(0) ?? 0)) % 997;
  return AVATAR_TONES[hash % AVATAR_TONES.length] ?? "bg-[#5e5ce6]";
}

function VersionAvatar({ initial }: { initial: string }) {
  return (
    <span
      aria-hidden="true"
      className={`grid size-8 shrink-0 place-items-center rounded-full ${avatarTone(initial)} text-xs font-medium text-white`}
    >
      {initial.slice(0, 1)}
    </span>
  );
}

/**
 * 版本页（`?v=`）。
 *
 * 顶栏标题是**版本时间**（图例 7）——时间就是版本的名字，用户不需要再看笔记名。
 * 返回键放在动作区而不是用 `MobileScreen` 的 `back`：这里回的是同一路由的列表态，
 * 不是浏览器上一页，`back` 的"站内历史 vs 兜底"语义对不上。
 */
function VersionDetail({
  baseId,
  noteId,
  operationId,
  rows,
  onBack,
}: {
  baseId: number;
  noteId: number;
  operationId: number;
  rows: NoteHistoryItem[];
  onBack: () => void;
}) {
  const router = useRouter();
  const detail = useNoteHistoryQuery(operationId);
  const restore = useRestoreNoteVersionMutation();
  const [mode, setMode] = useState<Mode>("content");
  const [confirming, setConfirming] = useState(false);

  /** 选中项在列表里的位置，决定「上一版」是谁、以及是不是当前版本。 */
  const index = rows.findIndex((row) => row.operationLogId === operationId);
  const previous = index >= 0 ? rows[index + 1] : undefined;
  const isCurrent = index === 0;

  // 「本次改动」要两份内容，更早那一版按需取（与桌面 `NoteHistoryPage` 同一取法）
  const needsDiff = mode === "diff";
  const previousDetail = useNoteHistoryQuery(needsDiff ? (previous?.operationLogId ?? null) : null);

  const current = index >= 0 ? rows[index] : undefined;
  const title = formatHistoryTime(current?.operationTime ?? detail.data?.historyTime) || "历史版本";

  const handleRestore = useCallback(async () => {
    if (!detail.data) return;
    setConfirming(false);
    try {
      const result = await restore.mutateAsync({
        noteId,
        title: detail.data.title ?? "",
        content: detail.data.content ?? "",
      });
      if (result.status === "conflict") {
        // 留在本页：mutation 已失效列表，刷新后用户能看清版本确实变了再决定
        toast.error("笔记刚被其他会话更新，请刷新后再恢复");
        return;
      }
      toast.success(`已恢复到 ${title} 的版本`);
      // replace：恢复成功后"看历史"这一步已经没有回退的意义，
      // 返回键应当回到进历史之前的那一页（通常是知识库列表）
      router.replace(`/m/notes/${baseId}/${noteId}`);
    } catch (error) {
      toast.error(toUserMessage(error));
    }
  }, [baseId, detail.data, noteId, restore, router, title]);

  return (
    /*
      V04（2026-09-19 核对）：返回键回到**左侧**统一的 44×44 形态，顶栏标题居中——
      原先返回键挂在右侧动作区，与全站其它详情页方向相反。
    */
    <MobileScreen title={title} back onBack={onBack}>
      <div className="space-y-4 p-4" data-testid="mobile-note-history-version">
        <Segmented
          label="阅读方式"
          shape="pill"
          options={MODE_OPTIONS}
          value={mode}
          onChange={setMode}
          className="w-full [&>button]:flex-1"
        />

        {/* M-13 图例 9：保存人与时间提示条 */}
        <p
          data-testid="history-viewing"
          className="flex min-h-9 items-center gap-1.5 rounded-md bg-fill-hover px-3 py-1.5 text-footnote text-label-secondary"
        >
          <Clock className="size-3.5 shrink-0" aria-hidden="true" />
          {current
            ? `${updaterName(current)} 于 ${formatHistoryTime(current.operationTime)} 保存`
            : `${title} 保存`}
        </p>

        <VersionBody
          mode={mode}
          detail={detail}
          previousDetail={previousDetail}
          hasPrevious={previous !== undefined}
        />

        {/*
          「恢复此版本」（图例 11）放在滚动区末尾而不是 fixed 贴底：
          长文页面里的 fixed 底栏会盖住最后一段，用户得先把内容滚上去才读得到，
          而"读完再决定要不要恢复"正是这一页的自然顺序。
        */}
        {/*
          V04：「恢复此版本」**贴底固定**（画板 M-13 图例 11：44 高全宽贴底）。
          原先随内容流走，长正文时按钮在首屏之外、滚到末尾才见得到；
          sticky bottom 让它在整个滚动过程里都够得着，正文区自己留出让位。
        */}
        <div className="sticky bottom-0 -mx-4 mt-auto border-t border-separator bg-grouped px-4 pb-4 pt-3">
          <Button
            className="min-h-11 w-full rounded-[12px]"
            disabled={!detail.data || restore.isPending || isCurrent || index < 0}
            onClick={() => setConfirming(true)}
            data-testid="history-restore"
          >
            恢复此版本
          </Button>
        </div>
      </div>

      {confirming ? (
        <MobileActionSheet
          open
          onOpenChange={(next) => {
            if (!next) setConfirming(false);
          }}
          title={`恢复到${title}的版本？`}
          description="当前内容会先作为一个新版本保留。"
          actions={[
            {
              label: "恢复",
              // 动作表自带二次确认：第一次点只把标签换成这句，第二次才真的写回
              confirm: "再点一次确认恢复",
              onSelect: () => void handleRestore(),
            },
          ]}
        />
      ) : null}
    </MobileScreen>
  );
}

/**
 * 版本正文区（与桌面 `VersionBody` 同一套分支）。
 *
 * 加载态只换正文：切换版本时反复闪一屏骨架会让人以为整页在重载。
 */
function VersionBody({
  mode,
  detail,
  previousDetail,
  hasPrevious,
}: {
  mode: Mode;
  detail: ReturnType<typeof useNoteHistoryQuery>;
  previousDetail: ReturnType<typeof useNoteHistoryQuery>;
  hasPrevious: boolean;
}) {
  if (mode === "diff") {
    const currentContent = detail.data?.content ?? "";
    // 最早的版本没有上一版：整篇视为新增，符合"这次保存把全文写进来了"的事实
    const previousContent = hasPrevious ? (previousDetail.data?.content ?? "") : "";
    // 两份内容都齐了才渲染差异，否则会先闪一屏"全部新增"再纠正回来
    if (detail.isPending || (hasPrevious && previousDetail.isPending)) {
      return <ListRowsSkeleton count={3} />;
    }
    if (detail.isError) {
      return (
        <div role="alert" className="rounded-md bg-danger/6 p-4 text-footnote text-danger">
          这个版本加载失败：{toUserMessage(detail.error)}
          <Button
            variant="outline"
            size="sm"
            className="mt-2"
            disabled={detail.isFetching}
            onClick={() => void detail.refetch()}
          >
            重试
          </Button>
        </div>
      );
    }
    if (hasPrevious && previousDetail.isError) {
      return (
        <div role="alert" className="rounded-md bg-danger/6 p-4 text-footnote text-danger">
          上一个版本加载失败：{toUserMessage(previousDetail.error)}
          <Button
            variant="outline"
            size="sm"
            className="mt-2"
            disabled={previousDetail.isFetching}
            onClick={() => void previousDetail.refetch()}
          >
            重试
          </Button>
        </div>
      );
    }
    return <HistoryDiffView previousContent={previousContent} currentContent={currentContent} />;
  }

  if (detail.isPending) {
    return <ListRowsSkeleton count={3} />;
  }
  if (detail.isError) {
    return (
      <div role="alert" className="rounded-md bg-danger/6 p-4 text-footnote text-danger">
        这个版本加载失败：{toUserMessage(detail.error)}
        <Button
          variant="outline"
          size="sm"
          className="mt-2"
          disabled={detail.isFetching}
          onClick={() => void detail.refetch()}
        >
          重试
        </Button>
      </div>
    );
  }
  return (
    /*
      V20：标题只出现一次。`ensureLeadingHeading` 会把标题作为正文首节点 H1 渲染，
      外面再套一个 h2 就会像核对报告里那样「1addd 连续出现两次」。
    */
    <article
      className="rounded-md bg-surface p-4 shadow-card"
      data-testid="history-version-content"
    >
      <TiptapEditor
        preset="readonly"
        value={ensureLeadingHeading(detail.data?.content ?? "", detail.data?.title)}
      />
    </article>
  );
}
