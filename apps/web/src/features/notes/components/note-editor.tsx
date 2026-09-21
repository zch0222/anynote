"use client";

import { TiptapEditor, type TiptapEditorProps } from "@/components/editor/TiptapEditor";
import type { UploadFn } from "@/components/editor/extensions/anynote-image";
import type { AiContinueFn, CollaborationBinding } from "@/components/editor/presets/types";
import { noteHistoryHref } from "@/components/layout/navigation";
import { EditorSkeleton } from "@/components/loading/skeletons";
import { ConflictDialog } from "@/components/note/conflict-dialog";
import { SaveStatusBadge } from "@/components/note/save-status";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useCollabNote } from "@/features/collab/use-collab-note";
import { CollabPresence } from "@/features/notes/components/collab-presence";
import { bodyCharCount, ensureLeadingHeading } from "@/features/notes/lib/leading-heading";
import { DEFAULT_PAGE_SIZE, toVersion } from "@/features/notes/schemas";
import { useDeleteNoteMutation } from "@/features/notes/use-delete-note";
import { useKnowledgeBasesQuery } from "@/features/notes/use-knowledge-bases";
import { useMoveNoteMutation } from "@/features/notes/use-move-note";
import { useNoteQuery } from "@/features/notes/use-note";
import { useNoteTitle } from "@/features/notes/use-note-title";
import { useNotesQuery } from "@/features/notes/use-notes";
import { COLLAB_AUTOSAVE_DEBOUNCE_MS, useSaveNote } from "@/features/notes/use-save-note";
import { env } from "@/lib/env";
import { formatRelativeTime } from "@/lib/format-time";
import type { Editor } from "@tiptap/core";
import { Clock, MoreHorizontal, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

/**
 * `/notes/[baseId]/[noteId]`：满幅正文 + 顶栏状态条。
 *
 * 编辑器是非受控的：只在笔记切换时喂一次初始内容，之后的每次输入都进自动保存队列。
 * 如果把 query 缓存直接当 `value` 回灌，保存返回的内容会把光标顶回文首。
 *
 * 版式对齐设计稿：顶层是一条**文档状态条**（保存徽标 + 操作），下面依次是元信息行、
 * 正文纸面、末尾字数。元信息行**在正文之上**：正文的第一个节点就是 H1 标题。
 *
 * **没有独立的标题输入行**——笔记标题就是正文的第一个一级标题。原因：标题与正文
 * 分家时，同一句话在一屏里出现两次（输入框一次、正文里再写一次一级标题），
 * 而且分不清哪个才是"真的"。`useNoteTitle` 从文档首节点取标题，所以这里只做一件事：
 * 打开时把已存标题补成顶部 H1（`ensureLeadingHeading`），历史笔记的标题才看得见。
 *
 * 整页**不画卡片**：设计稿里这页的顶栏分隔线与正文底色一直铺到侧栏右侧与
 * 窗口右缘，外面没有灰底衬托、没有圆角、没有投影。曾经这里套了一层
 * `rounded-lg bg-surface shadow-card`，正文于是变成"灰底上浮着的一张白卡片"，
 * 与"编辑器占满剩余所有空间"正好相反。满幅由 `AppShell` 的
 * `isFullBleedRoute` 配合（内容区不加内边距），这里只负责吃掉剩下的高度。
 */
/** 可写笔记所需的最低权限（`NotePermissions.EDIT`）。低于它维持现状静态读（D8）。 */
const EDIT_PERMISSION = 6;

export function NoteEditor({ baseId, noteId }: { baseId: number; noteId: number }) {
  const router = useRouter();
  const note = useNoteQuery(noteId);
  const bases = useKnowledgeBasesQuery();
  const remove = useDeleteNoteMutation();
  const move = useMoveNoteMutation();

  // `title` 不进 JSX：标题在正文里，这里只需要"取标题"与"编辑器就绪"两条能力
  const { setTitle, onEditorReady, getTitleForContent } = useNoteTitle();
  // 只在笔记切换时重置一次编辑器初始值，避免自动保存的回写打断输入
  const [initialContent, setInitialContent] = useState<string | null>(null);
  /**
   * 正文字数（不含顶部 H1）。
   *
   * 单独立一个 state 而不是从 `initialContent` 现算：后者是"打开笔记时的快照"，
   * 拿它算出来的字数在整段编辑过程中不会变。初值在笔记加载时设一次，
   * 之后每次 `docChanged` 由 `handleContentChange` 推进。
   */
  const [charCount, setCharCount] = useState(0);
  const loadedNoteId = useRef<number | null>(null);
  const contentRef = useRef("");
  /** 删除确认框（D-04 ④）：取代 `window.confirm`。 */
  const [deleteOpen, setDeleteOpen] = useState(false);
  /**
   * 是否进入协同模式：总开关打开 **且** 当前用户对该笔记有编辑权（D7 / D8）。
   *
   * 权限来自 `GET /notes/{id}` 的 `notePermissions`（由后端切面填入）。只读用户
   * 不进房间，保持现状 REST 静态读——省掉一条对只读场景收益很低的实时连接。
   */
  const collabEnabled =
    env.NEXT_PUBLIC_COLLAB_NOTES && (note.data?.notePermissions ?? 0) >= EDIT_PERMISSION;

  /**
   * 协同运行时（M13.3）。开关关闭时 `enabled=false`，`useCollabNote` 不连任何房间、
   * 不碰任何共享状态，下面所有协同分支都走进单人链路。
   */
  const [editorInstance, setEditorInstance] = useState<Editor | null>(null);
  const collabLocalChangeRef = useRef<((editor: Editor) => void) | undefined>(undefined);
  const collab = useCollabNote({
    noteId,
    enabled: collabEnabled,
    editor: editorInstance,
    markdown: initialContent,
    onLocalChange: (editor) => collabLocalChangeRef.current?.(editor),
  });

  const save = useSaveNote({
    noteId,
    initialVersion: toVersion(note.data?.updateTime),
    // 协同模式下 A0409 不再弹冲突框：本地 CRDT 状态已包含所有人的编辑，换号重发即可
    conflictPolicy: collab.active ? "overwrite" : "prompt",
    debounceMs: collab.active ? COLLAB_AUTOSAVE_DEBOUNCE_MS : undefined,
    sharedVersion: collab.savedVersion,
    onSaved: collab.publishSavedVersion,
  });
  const { scheduleSave, flush, resolveConflict, status, lastSavedAt, conflict } = save;

  useEffect(() => {
    if (!note.data || loadedNoteId.current === noteId) return;
    loadedNoteId.current = noteId;
    setTitle(note.data.title ?? "");
    // 正文不以 H1 开头就先补一个（标题从前是单独的输入框，老笔记正文里没有 H1）。
    // 只改喂给编辑器的初始值，不单独发写请求：用户第一次编辑会连它一起存回去。
    const content = ensureLeadingHeading(note.data.content ?? "", note.data.title);
    contentRef.current = content;
    setInitialContent(content);
    // 初值跟着同一次设置走，避免首屏先闪一个 0 再跳到真实值
    setCharCount(bodyCharCount(content));
  }, [note.data, noteId, setTitle]);

  /**
   * 协同模式下的「本地改动」回调：交给 `useSaveNote` 排队。
   *
   * 远端广播与冷启动注入都不会走到这里（`use-collab-note` 已按 origin 过滤），
   * 所以一个人打字不会让在场每个人都排一次保存。
   */
  const handleCollabLocalChange = useCallback(
    (editor: Editor) => {
      /*
       * markdown 取 `contentRef.current`，**不在这里读编辑器**：读编辑器要 `getMarkdown`
       * (`@/lib/editor/markdown`，牵出 `tiptap-markdown` / markdown-it)，而该模块在笔记路由里
       * 只能存在于编辑器的异步包——一旦静态引入，整条 markdown 序列化链路会被并进首屏图，
       * 把 `/notes/[baseId]/[noteId]` 顶出 310KB 预算（实测 +143KB）。
       * `contentRef` 由下面 `onChange` 在**每次** docChanged（含远端广播）时更新，
       * 因此本地改动时它总是不早于本次事务的最新正文。
       */
      scheduleSave({ title: getTitleForContent(editor), content: contentRef.current });
    },
    [getTitleForContent, scheduleSave],
  );
  // 交给 `useCollabNote` 的 `onLocalChange` 是稳定的转发引用，避免每次渲染重建 Y.Doc 订阅
  collabLocalChangeRef.current = handleCollabLocalChange;

  const handleContentChange = useCallback<NonNullable<TiptapEditorProps["onChange"]>>(
    (markdown, editor) => {
      contentRef.current = markdown;
      /*
       * 字数在这里更新，**不能**从 `initialContent` 现算：那个值只在打开笔记时设一次，
       * 拿它算出来的数字会一直停在打开那一刻，用户边打字边看就是"统计不动"。
       * 放在 `handleContentChange` 里而不是订阅编辑器状态：这一条回调本来就在每次
       * `docChanged` 时触发，是同一份正文，不需要再建一条订阅。
       */
      setCharCount(bodyCharCount(markdown));
      setEditorInstance(editor);
      /*
       * 协同模式下保存由 `useCollabNote` 的 origin 过滤驱动：`onChange` 对远端广播同样会触发，
       * 在这里再排一次会让一个人打字引来全场各存一遍（§7.3.1）。只更新本地展示状态。
       */
      if (!collabEnabled) {
        scheduleSave({ title: getTitleForContent(editor), content: markdown });
      }
    },
    [scheduleSave, getTitleForContent, collabEnabled],
  );

  /**
   * 协同绑定：`preset="collaborative"` 时正文的唯一真相是 Y.Doc（`value` 不再受控）。
   *
   * 引用须稳定，否则每次渲染都会重建编辑器实例；`doc` / `provider` 未就绪时传 undefined，
   * 编辑器退回 `full` 预设，让「连接中」这类中间态也能正常渲染。
   */
  const collaboration: CollaborationBinding | undefined = useMemo(() => {
    if (!collab.active || !collab.doc || !collab.provider || !collab.user) return undefined;
    return {
      doc: collab.doc,
      provider: collab.provider,
      user: { name: collab.user.name, color: collab.user.color },
    };
  }, [collab.active, collab.doc, collab.provider, collab.user]);

  // 图片走 file 服务的分片直传。实现（SHA-256 + 分片签名）只在真的插图时才下载，
  // 静态 import 会把它压进笔记路由的首屏 JS；引用须稳定，否则每次渲染都会重建编辑器实例
  const uploadFn = useMemo<UploadFn>(
    () => async (file, options) => {
      const { createNoteImageUploader } = await import("@/lib/editor/upload");
      return createNoteImageUploader(noteId, options?.onProgress)(file);
    },
    [noteId],
  );

  // Slash 菜单「AI 续写」：流式增量写回编辑器里的 aiBlock 节点（引用须稳定，否则编辑器会重建）
  const handleAiContinue = useCallback<AiContinueFn>(
    async ({ contextTail, signal, onDelta, onError }) => {
      try {
        // AI 续写同图片上传：SSE 消费层带 @microsoft/fetch-event-source，
        // 只在真的用 slash「AI 续写」时才需要，静态引入会压进编辑器首屏。
        const { continueWriting } = await import("@/lib/ai/sse");
        await continueWriting({ contextTail, signal, onDelta });
      } catch (error) {
        onError?.(error);
      }
    },
    [],
  );

  async function handleDelete() {
    try {
      await remove.mutateAsync(noteId);
      setDeleteOpen(false);
      toast.success("笔记已删除");
      // 回知识库的笔记**列表**。不能写 `/notes/<baseId>/notes`：那条地址会落到
      // `[baseId]/[noteId]` 上、把字面量 "notes" 当成 noteId，然后 notFound()。
      router.push(`/notes/${baseId}`);
    } catch (error) {
      // 失败时**不关确认框**：关掉的话错误一飘就没了，用户看不到原因
      toast.error(error instanceof Error ? error.message : "删除失败，请稍后重试");
    }
  }

  /**
   * 打开历史版本页（D-16 图例 1）。
   *
   * 跳转前先 `flush()`：历史页读到的是**服务端**的快照，而这一秒还在 debounce 里
   * 的改动尚未落盘。不 flush 的话，用户点进历史看到的"当前版本"是上一版，
   * 默认选中的"上一个版本"更是错位一格——他会以为自己的改动丢了。
   */
  const handleOpenHistory = useCallback(async () => {
    await flush();
    router.push(noteHistoryHref(baseId, noteId));
  }, [baseId, flush, noteId, router]);

  const handleMove = useCallback(
    async (input: { noteId: number; knowledgeBaseId: number }) => {
      try {
        // 移动前先把未保存的正文落盘，否则跳转后这段改动就丢了
        await flush();
        await move.mutateAsync(input);
        toast.success("笔记已移动");
        router.push(`/notes/${input.knowledgeBaseId}/${input.noteId}`);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "移动失败，请稍后重试");
      }
    },
    [flush, move, router],
  );

  if (note.isError) {
    return (
      <p role="alert" className="rounded-lg bg-danger/5 p-6 text-footnote text-danger">
        笔记加载失败：{note.error.message}
      </p>
    );
  }

  return (
    <div className="flex min-h-0 w-full flex-1">
      {/*
        目录（知识库 → 笔记两层）在**侧栏**里（设计稿的位置，见 AppSidebar），
        这里不再另起一列：同一份目录在一屏里出现两次，读者要先分辨"哪个才是真的"。
      */}
      <section
        data-testid="note-panel"
        className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-surface"
      >
        {/* 顶栏分隔线铺满整列宽度（设计稿 x 296→1439.5 的 1px 线），所以内边距加在
            内容上、不加在 <header> 上；否则线会跟着内边距缩进去。 */}
        <header className="flex shrink-0 items-center gap-3 border-b border-separator px-6 py-3 sm:px-8">
          <SaveStatusBadge
            status={status}
            lastSavedAt={lastSavedAt}
            collabConnected={collaboration !== undefined && collab.connected}
          />
          {collaboration ? <CollabPresence peers={collab.peers} /> : null}
          <span className="min-w-0 flex-1" />
          <DropdownMenu>
            <DropdownMenuTrigger
              render={<Button variant="ghost" size="icon-sm" />}
              aria-label="笔记操作"
              data-testid="note-actions"
            >
              <MoreHorizontal className="size-4" aria-hidden="true" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuGroup>
                {/*
                  「历史版本」是菜单**第一项**（D-16 图例 1，已拍板）。
                  它在「移动到知识库」那组之前、单独成组：历史是"看"，
                  下面那组是"改归属 / 删"，两者不是一类操作，
                  混在一组里会让"删除"紧挨着最常用的入口，误点代价太高。
                */}
                <DropdownMenuItem onClick={() => void handleOpenHistory()}>
                  <Clock className="size-4" aria-hidden="true" />
                  历史版本
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuLabel>移动到知识库</DropdownMenuLabel>
                {(bases.data ?? [])
                  .filter((base) => base.id !== baseId)
                  .map((base) => (
                    <DropdownMenuItem
                      key={base.id}
                      onClick={() => void handleMove({ noteId, knowledgeBaseId: base.id })}
                    >
                      {base.knowledgeBaseName?.trim() || "未命名知识库"}
                    </DropdownMenuItem>
                  ))}
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive" onClick={() => setDeleteOpen(true)}>
                  <Trash2 className="size-4" aria-hidden="true" />
                  删除笔记
                </DropdownMenuItem>
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </header>

        {/*
          正文的滚动容器。标题与元信息行属于**文章的一部分**（跟着正文一起滚），
          所以"占满视口"的职责从编辑器本身移到了这一层：面板吃满剩余高度，内容在这里滚。
        */}
        <div data-testid="note-scroll" className="min-h-0 flex-1 overflow-y-auto">
          {note.isPending || initialContent === null ? (
            <div className="mx-auto w-full max-w-[calc(62.5rem+9rem)] px-6 py-10 sm:px-8 lg:px-18">
              <EditorSkeleton />
            </div>
          ) : (
            /*
             * 限宽分两层：外层带内边距、内层是正文列本身。
             *
             * 设计稿实测（1440×900）：内容区 x 296→1439.5，正文列 x 368→1367.5——
             * 列宽正好 1000px、左右各 72px，且**居中**（两侧中心都是 867.75）。
             * 判据取元信息行底下那条分隔线：它铺满整列（1px 高、1000px 宽），
             * 量到的是列宽本身，而不是某一行文字恰好断在哪里。
             *
             * 内边距加在外层而不是列里：宽屏下 max-width 生效、窄屏下内边距生效，
             * 两种情形都不会贴边，列内也保持"标题/分隔线/正文左缘同一条线"。
             */
            <div className="mx-auto w-full max-w-[calc(62.5rem+9rem)] px-6 sm:px-8 lg:px-18">
              <article data-testid="note-document" className="flex w-full flex-col pb-16 pt-10">
                {/*
                  元信息行在正文之上：正文的**第一个节点就是 H1 标题**，
                  所以这一行插不进"标题与正文之间"了。
                */}
                <NoteMeta
                  baseId={baseId}
                  baseName={note.data?.knowledgeBaseName}
                  updateTime={note.data?.updateTime}
                />
                {/*
                  断线降级（§7.4）：协同连不上时提示并回退单人模式——数据仍在，
                  切 `full` 预设继续编辑，保存走单人链路（A0409 与冲突对话框重新生效）。
                */}
                {collabEnabled && collab.degraded ? (
                  <div
                    role="alert"
                    data-testid="collab-degraded"
                    className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border border-warning/30 bg-warning/5 px-4 py-3 text-footnote text-warning"
                  >
                    <p className="min-w-0 flex-1">
                      协同服务连不上，已切换为单人编辑。你的改动仍会保存。
                    </p>
                    <Button variant="outline" size="sm" onClick={collab.reconnect}>
                      重新连接
                    </Button>
                  </div>
                ) : null}
                <TiptapEditor
                  key={noteId}
                  preset={collaboration ? "collaborative" : "full"}
                  value={initialContent ?? ""}
                  {...(collaboration ? { collaboration } : {})}
                  onChange={handleContentChange}
                  onReady={onEditorReady}
                  aiContinue={handleAiContinue}
                  uploadFn={uploadFn}
                  // 设计稿的桌面编辑器没有常驻工具条（移动端才有，见 note-editor-mobile）
                  toolbar="none"
                  // 正文列自己就是对齐基准，编辑器不再叠一层内边距
                  flush
                  className="mt-6"
                />
                <NoteFooter contentLength={charCount} />
              </article>
            </div>
          )}
        </div>
      </section>

      <ConflictDialog conflict={conflict} onResolve={(choice) => void resolveConflict(choice)} />

      {/*
        删除确认（D-04 ④）。取代原来的 `window.confirm`：原生确认框在深色下是
        系统灰、无法用语义 Token 上色、还会阻塞主线程。文案沿用图例：
        标题给出对象，说明给出后果，按钮是明确动词「删除」而不是「确定」。
      */}
      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="删除这篇笔记？"
        description="删除后无法恢复。"
        confirmLabel="删除"
        pendingLabel="删除中…"
        tone="danger"
        pending={remove.isPending}
        onConfirm={() => void handleDelete()}
      />
    </div>
  );
}

/**
 * 元信息行：更新时间 · 所属知识库。落在正文**之上**（标题就在正文里）。
 *
 * 设计稿这里是「作者 · 更新 · 阅读次数」，其中作者与阅读次数后端都没有返回
 * （`GET /notes/{id}` 只有 id/title/content/knowledgeBaseId/updateTime），
 * 所以只渲染拿得到的两项。整行用 `·` 拼接而不是固定网格，缺项时不会留下空白列。
 *
 * 字数**不在这一行**：设计稿把它放在正文末尾（见 `NoteFooter`），
 * 两处都放会让同一份信息在一屏里出现两次。
 */
function NoteMeta({
  baseId,
  baseName,
  updateTime,
}: {
  baseId: number;
  baseName?: string | null | undefined;
  updateTime?: string | null | undefined;
}) {
  const relative = formatRelativeTime(updateTime);
  return (
    <div
      data-testid="note-meta"
      className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-separator pb-3 text-footnote text-label-secondary"
    >
      {relative ? <span>{relative}更新</span> : null}
      <Dot />
      <Link
        href={`/notes/${baseId}`}
        className="outline-none transition-colors hover:text-accent focus-visible:ring-2 focus-visible:ring-ring"
      >
        {baseName?.trim() || "知识库"}
      </Link>
    </div>
  );
}

/**
 * 文章尾部的字数。
 *
 * 设计稿把字数放在正文末尾而不是标题下面：读完一整篇之后，读者关心的
 * "这篇多长"应该在收尾处出现，而不是留在顶部要滚回去看。
 */
function NoteFooter({ contentLength }: { contentLength: number }) {
  return (
    <p className="mt-8 text-footnote text-label-tertiary">
      <span className="tabular" data-testid="note-char-count">
        {contentLength.toLocaleString("zh-CN")} 字
      </span>
    </p>
  );
}

function Dot() {
  return (
    <span aria-hidden="true" className="text-label-tertiary">
      ·
    </span>
  );
}
