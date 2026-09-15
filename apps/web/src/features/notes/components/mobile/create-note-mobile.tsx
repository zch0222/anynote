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
import { type CreateNoteInput, createNoteSchema } from "@/features/notes/schemas";
import { useCreateNoteMutation } from "@/features/notes/use-create-note";
import {
  useCreateKnowledgeBaseMutation,
  useKnowledgeBasesQuery,
} from "@/features/notes/use-knowledge-bases";
import { toUserMessage } from "@/lib/api/errors";
import { cn } from "@/lib/utils";
import { zodResolver } from "@hookform/resolvers/zod";
import { Check, Plus } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

/** 标题上限（`createNoteSchema` 的 max）。计数器与校验共用同一个数。 */
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

  const form = useForm<CreateNoteInput>({
    resolver: zodResolver(createNoteSchema),
    defaultValues: { title: presetTitle.slice(0, TITLE_MAX) },
  });

  const title = form.watch("title") ?? "";
  const baseList = bases.data ?? [];
  const effectiveBaseId = selectedBaseId ?? baseList[0]?.id ?? null;
  const backHref = effectiveBaseId ? `/m/notes/${effectiveBaseId}` : "/m/notes";

  async function onSubmit(values: CreateNoteInput) {
    if (effectiveBaseId === null) {
      toast.error("请先选择一个知识库");
      return;
    }
    try {
      const noteId = await create.mutateAsync({
        knowledgeBaseId: effectiveBaseId,
        title: values.title,
      });
      toast.success("笔记已创建");
      router.push(`/m/notes/${effectiveBaseId}/${noteId}`);
    } catch (error) {
      toast.error(toUserMessage(error));
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
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
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
                          "flex min-h-14 w-full items-center gap-3 px-4 text-left text-footnote outline-none transition-colors",
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
                    className="flex min-h-14 w-full items-center gap-3 px-4 text-left text-footnote font-medium text-accent outline-none transition-colors focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
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
              <Input
                id="note-title"
                autoComplete="off"
                placeholder="3-15 个字符"
                maxLength={TITLE_MAX}
                className="h-12 rounded-md text-base"
                data-testid="create-note-title"
                {...form.register("title")}
              />
              <div className="flex items-start justify-between gap-2">
                {form.formState.errors.title ? (
                  <p className="text-xs text-danger">{form.formState.errors.title.message}</p>
                ) : (
                  <span />
                )}
                <span className="tabular shrink-0 text-xs text-label-tertiary">
                  {title.trim().length} / {TITLE_MAX}
                </span>
              </div>
            </div>

            <Button
              type="submit"
              className="min-h-11 w-full"
              disabled={form.formState.isSubmitting || effectiveBaseId === null}
            >
              {form.formState.isSubmitting ? "创建中…" : "创建笔记"}
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
              className="min-h-11 w-full"
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
