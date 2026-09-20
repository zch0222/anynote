"use client";

import { MobileScreen } from "@/components/layout/mobile/mobile-screen";
import { ListRowsSkeleton } from "@/components/loading/skeletons";
import { QueryError } from "@/components/shared/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { coverAvatarClassName } from "@/features/notes/lib/cover-gradient";
import { useCreateNoteMutation } from "@/features/notes/use-create-note";
import {
  useCreateKnowledgeBaseMutation,
  useKnowledgeBasesQuery,
} from "@/features/notes/use-knowledge-bases";
import { toUserMessage } from "@/lib/api/errors";
import { cn } from "@/lib/utils";
import { Check, Plus } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

/** 标题长度边界，与 `createNoteSchema` 的 min / max 保持一致。 */
const TITLE_MIN = 3;
const TITLE_MAX = 15;

/**
 * `/m/notes/new`：移动端新建笔记（M-07）。
 *
 * 与桌面同一套 hooks 与 schema，版式换成 iOS 设置式的分组列表：
 * 先选库（单选行 + ✓），再写标题，一个全宽主按钮收尾。
 *
 * 三个入口参数：
 * - `?baseId=` 预选知识库（从笔记列表右上「+」进来）
 * - `?title=` 预填标题（搜索页无结果时的「用「{q}」新建笔记」带过来）
 * - 都没有时默认选第一个库
 *
 * 返回兜底：带 `?baseId=` 回该库，否则回知识库列表。
 */
export function MobileCreateNote() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const bases = useKnowledgeBasesQuery();
  const create = useCreateNoteMutation();
  const createBase = useCreateKnowledgeBaseMutation();

  const presetBaseId = Number(searchParams.get("baseId"));
  const presetTitle = searchParams.get("title") ?? "";
  const [selectedBaseId, setSelectedBaseId] = useState<number | null>(
    Number.isSafeInteger(presetBaseId) && presetBaseId > 0 ? presetBaseId : null,
  );
  const [creatingBase, setCreatingBase] = useState(false);
  const [newBaseName, setNewBaseName] = useState("");
  const [newBaseDetail, setNewBaseDetail] = useState("");

  /*
   * 标题用受控 state 而不是 react-hook-form：这里是**单字段**表单，
   * 而 react-hook-form + @hookform/resolvers 整包约 13 KB gzip —— `/m/*` 的
   * 预算是 250KB，为一个输入框付这个代价不划算。校验用 schema 的同一个上限
   * （`TITLE_MAX`），错误文案按 schema 的口径给出，行为与桌面版一致。
   */
  const [title, setTitle] = useState(() => presetTitle.slice(0, TITLE_MAX));
  const [submitting, setSubmitting] = useState(false);
  /** 只有提交过一次之后才提示，避免刚进页面就报错。 */
  const [titleTouched, setTitleTouched] = useState(false);
  const titleError = titleTouched && title.trim().length < TITLE_MIN ? "标题至少 3 个字符" : null;
  const baseList = bases.data ?? [];
  const effectiveBaseId = selectedBaseId ?? baseList[0]?.id ?? null;
  const backHref = effectiveBaseId ? `/m/notes/${effectiveBaseId}` : "/m/notes";

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (effectiveBaseId === null) {
      toast.error("请先选择一个知识库");
      return;
    }
    const trimmed = title.trim();
    if (trimmed.length < TITLE_MIN) {
      setTitleTouched(true);
      return;
    }
    setSubmitting(true);
    try {
      const noteId = await create.mutateAsync({
        knowledgeBaseId: effectiveBaseId,
        title: trimmed,
      });
      toast.success("笔记已创建");
      router.push(`/m/notes/${effectiveBaseId}/${noteId}`);
    } catch (error) {
      toast.error(toUserMessage(error));
    } finally {
      setSubmitting(false);
    }
  }

  /** 新建知识库：成功后就地选中它，用户不必回到列表里再点一次。 */
  async function handleCreateBase() {
    const name = newBaseName.trim();
    if (!name) {
      toast.error("请输入知识库名称");
      return;
    }
    try {
      const baseId = await createBase.mutateAsync({ name, detail: newBaseDetail.trim() });
      setSelectedBaseId(baseId);
      setCreatingBase(false);
      setNewBaseName("");
      setNewBaseDetail("");
      toast.success("知识库已创建");
    } catch (error) {
      toast.error(toUserMessage(error));
    }
  }

  return (
    <MobileScreen title="新建笔记" back={backHref}>
      <div className="space-y-5 p-4" data-testid="mobile-create-note">
        {bases.isPending ? (
          <ListRowsSkeleton count={2} />
        ) : bases.isError ? (
          <QueryError
            object="知识库"
            message={toUserMessage(bases.error)}
            onRetry={() => void bases.refetch()}
            retrying={bases.isFetching}
          />
        ) : (
          <form onSubmit={onSubmit} className="space-y-5">
            <fieldset className="space-y-2">
              <legend className="mb-2 text-footnote font-medium text-label-secondary">
                归属知识库
              </legend>
              {/*
                没有知识库时也要给出说明（M-07 的空态），但**列表仍然渲染**——
                「新建知识库」那一行本身就是这个空态的动作，把它藏起来用户就没有出路了。
              */}
              {baseList.length === 0 ? (
                <p className="pb-1 text-footnote text-label-secondary">
                  还没有知识库。笔记必须归属一个知识库，先创建一个。
                </p>
              ) : null}
              <ul
                className="divide-y divide-separator overflow-hidden rounded-lg bg-surface"
                data-testid="create-note-bases"
              >
                {baseList.map((base) => {
                  const selected = base.id === effectiveBaseId;
                  return (
                    <li key={base.id}>
                      <button
                        type="button"
                        aria-pressed={selected}
                        onClick={() => setSelectedBaseId(base.id)}
                        data-testid={`create-note-base-${base.id}`}
                        className={cn(
                          "flex min-h-14 w-full items-center gap-3 px-4 text-left text-base outline-none transition-colors",
                          "focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                          selected ? "font-medium text-accent" : "text-label",
                        )}
                      >
                        {/* 图例 6：按 id 取渐变方块，几个库一眼分得出来 */}
                        <span
                          className={coverAvatarClassName(base.id, "size-7 rounded-[7px]")}
                          aria-hidden="true"
                        />
                        <span className="min-w-0 flex-1 truncate">
                          {base.knowledgeBaseName?.trim() || "未命名知识库"}
                        </span>
                        {selected ? (
                          <Check className="size-4 shrink-0 text-accent" aria-hidden="true" />
                        ) : null}
                      </button>
                    </li>
                  );
                })}
                {/* 图例 7：列表末尾的「新建知识库」行，打开底部面板形态的新建表单 */}
                <li>
                  <button
                    type="button"
                    onClick={() => setCreatingBase(true)}
                    data-testid="create-note-new-base"
                    className="flex min-h-14 w-full items-center gap-3 px-4 text-left text-base font-medium text-accent outline-none transition-colors focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                  >
                    <span className="grid size-7 shrink-0 place-items-center rounded-[7px] bg-accent-soft">
                      <Plus className="size-4" aria-hidden="true" />
                    </span>
                    新建知识库
                  </button>
                </li>
              </ul>
            </fieldset>

            <div className="space-y-2">
              <label
                htmlFor="note-title"
                className="text-footnote font-medium text-label-secondary"
              >
                标题
              </label>
              {/*
                h-12（48）+ rounded-md（10）+ text-base（16）：16 号字以下 iOS Safari
                会在聚焦时自动放大整页，用户得手动缩回去。
              */}
              {/*
                V11（2026-09-19 核对）：计数放进输入框**内**右侧（画板 M-07 图例 9 的
                「8 / 15」就在框里），框下是 H1 说明行；出错时说明行换成错误文案、
                计数转 danger。
              */}
              <div className="relative">
                <Input
                  id="note-title"
                  autoComplete="off"
                  placeholder="3-15 个字符"
                  maxLength={TITLE_MAX}
                  className="h-12 rounded-[10px] pr-16 text-base"
                  data-testid="create-note-title"
                  value={title}
                  aria-invalid={titleError ? true : undefined}
                  onChange={(event) => {
                    setTitle(event.target.value);
                    setTitleTouched(true);
                  }}
                />
                <span
                  className={cn(
                    "tabular pointer-events-none absolute top-1/2 right-4 -translate-y-1/2 text-xs",
                    titleError ? "text-danger" : "text-label-tertiary",
                  )}
                  data-testid="create-note-title-count"
                >
                  {title.trim().length} / {TITLE_MAX}
                </span>
              </div>
              {titleError ? (
                <p role="alert" className="text-xs text-danger">
                  {titleError}
                </p>
              ) : (
                <p className="text-xs text-label-tertiary">标题会作为正文的第一个标题（H1）。</p>
              )}
            </div>

            <Button
              type="submit"
              /* 画板 M-07：44 高、圆角 12 的业务主按钮（不是登录页的胶囊） */
              className="min-h-11 w-full rounded-[12px]"
              disabled={submitting || effectiveBaseId === null}
            >
              {submitting ? "创建中…" : "创建笔记"}
            </Button>
          </form>
        )}
      </div>

      {/*
        新建知识库走底部弹层而不是居中对话框：手机上对话框会被软键盘顶掉一半，
        而这里的两个输入框恰好都要调键盘。
      */}
      <Sheet
        open={creatingBase}
        onOpenChange={(next) => {
          setCreatingBase(next);
          if (!next) {
            setNewBaseName("");
            setNewBaseDetail("");
          }
        }}
      >
        <SheetContent
          side="bottom"
          className="rounded-t-2xl pb-[env(safe-area-inset-bottom,0px)]"
          data-testid="create-note-base-sheet"
        >
          <SheetHeader>
            <SheetTitle>新建知识库</SheetTitle>
            <SheetDescription>笔记必须归属一个知识库，创建后会自动选中它。</SheetDescription>
          </SheetHeader>
          <div className="space-y-3 px-4 pb-4">
            <div className="space-y-1.5">
              <label htmlFor="new-base-name" className="text-footnote font-medium text-label">
                名称
              </label>
              <Input
                id="new-base-name"
                autoComplete="off"
                maxLength={30}
                className="h-11 rounded-md"
                value={newBaseName}
                onChange={(event) => setNewBaseName(event.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="new-base-detail" className="text-footnote font-medium text-label">
                简介（选填）
              </label>
              <Input
                id="new-base-detail"
                autoComplete="off"
                maxLength={200}
                className="h-11 rounded-md"
                value={newBaseDetail}
                onChange={(event) => setNewBaseDetail(event.target.value)}
              />
            </div>
            <Button
              className="min-h-11 w-full rounded-[12px]"
              disabled={createBase.isPending}
              onClick={() => void handleCreateBase()}
              data-testid="create-note-base-submit"
            >
              {createBase.isPending ? "创建中…" : "创建"}
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </MobileScreen>
  );
}
