"use client";

import { CardGridSkeleton } from "@/components/loading/skeletons";
import { QueryError } from "@/components/shared/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { coverAvatarClassName } from "@/features/notes/lib/cover-gradient";
import {
  type CreateNoteInput,
  type KnowledgeBase,
  createNoteSchema,
} from "@/features/notes/schemas";
import { useCreateNoteMutation } from "@/features/notes/use-create-note";
import { useKnowledgeBasesQuery } from "@/features/notes/use-knowledge-bases";
import { toUserMessage } from "@/lib/api/errors";
import { formatRelativeTime } from "@/lib/format-time";
import { cn } from "@/lib/utils";
import { zodResolver } from "@hookform/resolvers/zod";
import { Check, Library, Plus } from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
/*
 * 「新建知识库」对话框按需加载（与移动端同款处理）：它顶层引着 react-hook-form
 * 与整棵表单原子，而 `CreateBaseDialog` 在画廊与新建笔记页都只是"点开才需要"的
 * 一个入口。静态引入会把这条依赖树压进 `/notes` 的首屏——实测这一步就是
 * 桌面首屏超出 300KB 预算的主因之一。`ssr: false`：对话框只在点击后才渲染。
 */
const CreateBaseDialog = dynamic(
  () => import("./create-base-dialog").then((mod) => mod.CreateBaseDialog),
  { ssr: false },
);

/** 与 `createNoteSchema` 的上限一致（后端 `NoteCreateDTO` 是 `@Size(max = 15)`）。 */
const TITLE_MAX = 15;

/**
 * `/notes/new`：命令面板与侧栏的「创建笔记」落到这里。
 *
 * 版式对齐设计稿：归属知识库是一排**可选的卡片**（渐变缩略图 + 名字 + 选中勾），
 * 而不是下拉框——选库是这一步唯一的决策，值得占视觉重心。
 *
 * 后端要求笔记必须归属一个知识库，所以还没有任何知识库时引导先建库，
 * 避免提交后才被后端打回。**有库的时候也要留这个入口**（D-03 图例 17）：
 * 用户是在"要给这篇笔记挑个家"的语境里才意识到缺一个库的，
 * 把他赶回画廊页再回来，等于把刚想好的标题丢掉。
 */
export function CreateNotePage({ initialBaseId }: { initialBaseId?: number | undefined } = {}) {
  const router = useRouter();
  const bases = useKnowledgeBasesQuery();
  const create = useCreateNoteMutation();
  const [selectedBaseId, setSelectedBaseId] = useState<number | null>(initialBaseId ?? null);
  const form = useForm<CreateNoteInput>({
    resolver: zodResolver(createNoteSchema),
    defaultValues: { title: "" },
  });

  const baseList = bases.data ?? [];
  // 传了 baseId 就用它；否则默认第一个库（用户多半只有一个）
  const effectiveBaseId = selectedBaseId ?? baseList[0]?.id ?? null;

  // 计数徽标按**已输入字符数**（trim 之前）报，与用户眼里看到的一致；
  // 超上限时转 danger，让"打不下了"在提交之前就可见（图例 19）
  const titleLength = form.watch("title")?.length ?? 0;
  const overLimit = titleLength > TITLE_MAX;

  /**
   * 取消的去向（图例 23）：带 `?baseId=` 进来时回那个库，否则回知识库列表。
   *
   * 从知识库内点「+」过来的人，取消时想去的是**刚才那个库**，
   * 回到跨库的 `/notes` 等于让他重新找一遍。
   */
  const cancelHref =
    typeof initialBaseId === "number" && initialBaseId > 0 ? `/notes/${initialBaseId}` : "/notes";

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
      router.push(`/notes/${effectiveBaseId}/${noteId}`);
    } catch (error) {
      toast.error(toUserMessage(error));
    }
  }

  return (
    <section className="mx-auto w-full max-w-3xl space-y-6" data-testid="create-note-page">
      <header className="space-y-1">
        <h1 className="text-title text-label">新建笔记</h1>
        <p className="text-footnote text-label-secondary">
          选择归属的知识库，起个标题就可以开始写了。
        </p>
      </header>

      {bases.isPending ? (
        // 卡片高 16 跟着 `BaseOption` 的 min-h-16 走，骨架与真卡片同高才不跳
        <CardGridSkeleton count={4} cardClassName="h-16" />
      ) : bases.isError ? (
        <QueryError
          object="知识库"
          message={toUserMessage(bases.error)}
          onRetry={() => void bases.refetch()}
          retrying={bases.isRefetching}
        />
      ) : baseList.length === 0 ? (
        <div className="rounded-lg border border-dashed border-separator p-10 text-center">
          <Library className="mx-auto size-8 text-label-tertiary" aria-hidden="true" />
          <p className="mt-3 text-headline text-label">还没有知识库</p>
          <p className="mt-1 text-footnote text-label-secondary">
            笔记必须归属一个知识库，先创建一个。
          </p>
          <div className="mt-4 flex items-center justify-center gap-3">
            <CreateBaseDialog
              onCreated={(baseId) => setSelectedBaseId(baseId)}
              redirectOnCreated={false}
            />
            <Button variant="ghost" render={<Link href="/notes" />}>
              返回知识库
            </Button>
          </div>
        </div>
      ) : (
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
          <fieldset className="space-y-2">
            {/*
              D-03 图例 18：「笔记必须归属一个知识库」提示在区块标题**右侧**。
              这句不是废话——新建笔记页最容易的误解就是"能不能先写、之后再归类"，
              而 `createNoteSchema` 里 `knowledgeBaseId` 是必填。放在标题行而不是
              报错时才出现，用户不必先撞一次墙。
            */}
            <div className="flex items-baseline justify-between gap-2">
              <legend className="text-footnote font-medium text-label">归属知识库</legend>
              <span className="text-xs text-label-tertiary">笔记必须归属一个知识库</span>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {baseList.map((base) => (
                <BaseOption
                  key={base.id}
                  base={base}
                  selected={base.id === effectiveBaseId}
                  onSelect={() => setSelectedBaseId(base.id)}
                />
              ))}
              {/*
                虚线卡片排在选项**末尾**、与选项同尺寸（图例 17）。
                放在末尾而不是开头：它是个出口，不该抢走"选一个已有的库"这个主路径；
                同尺寸则保证网格的第二列不会因为这张卡矮一截而参差。
              */}
              <NewBaseOption onCreated={(baseId) => setSelectedBaseId(baseId)} />
            </div>
          </fieldset>

          <div className="space-y-2">
            <Label htmlFor="note-title">标题</Label>
            {/*
              D-03 图例：计数 `8 / 15` 在输入框**内右侧**（图例原文如此）。
              原来放在 label 行右外侧——放大镜一样的位置关系，用户要多看一眼
              才知道那个数字属于下面这个框。
              图标/文字用 `pointer-events-none` 免得挡住点击。
            */}
            <div className="relative">
              <Input
                id="note-title"
                // 40 高（图例 19）：比 Input 默认的 h-8 高一档，标题是这一步唯一的输入
                className="h-10 rounded-md pr-16"
                // 浏览器的历史建议会在标题这种短字段上盖住整块列表，且拼错一次就长期留着
                autoComplete="off"
                placeholder="3-15 个字符"
                aria-invalid={overLimit || undefined}
                {...form.register("title")}
              />
              <span
                data-testid="title-counter"
                aria-live="polite"
                className={cn(
                  "pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-xs tabular-nums",
                  overLimit ? "text-danger" : "text-label-tertiary",
                )}
              >
                {titleLength} / {TITLE_MAX}
              </span>
            </div>
            {/*
              D-03：标题下方一行提示，说明这个标题会变成正文 H1。
              没有它时用户会在正文里再写一遍标题，保存后编辑器顶部出现两个一样的标题
              （编辑器用的是 `ensureLeadingHeading`，会把标题作为正文第一个标题）。
            */}
            <p className="text-xs text-label-tertiary">
              标题会作为正文的第一个标题（H1），之后可以在编辑器里直接改。
            </p>
            {form.formState.errors.title ? (
              <p className="text-xs text-danger">{form.formState.errors.title.message}</p>
            ) : null}
          </div>

          <div className="flex items-center gap-3">
            <Button type="submit" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting ? "创建中…" : "创建笔记"}
            </Button>
            {/* 「取消」是幽灵按钮（图例 23）：它是出口而不是并列的决策 */}
            <Button type="button" variant="ghost" render={<Link href={cancelHref} />}>
              取消
            </Button>
          </div>
        </form>
      )}
    </section>
  );
}

/**
 * 末尾的「新建知识库」虚线卡片（图例 17）。
 *
 * 创建成功后**留在本页并自动选中新库**（`redirectOnCreated={false}`）：
 * 用户是从"创建笔记"这条路走进来的，把他带去新库的画廊页，
 * 相当于把"新建笔记"这件事半路丢掉。
 */
function NewBaseOption({ onCreated }: { onCreated: (baseId: number) => void }) {
  return (
    <CreateBaseDialog
      onCreated={onCreated}
      redirectOnCreated={false}
      triggerTestId="create-note-new-base"
      trigger={
        <>
          <Plus className="size-4" aria-hidden="true" />
          新建知识库
        </>
      }
      triggerClassName={cn(
        "flex min-h-16 items-center justify-center gap-2 rounded-lg border border-dashed border-separator px-3 py-2.5",
        "text-footnote font-medium text-accent outline-none transition-colors",
        "hover:bg-accent-soft focus-visible:ring-2 focus-visible:ring-ring",
      )}
    />
  );
}

function BaseOption({
  base,
  selected,
  onSelect,
}: {
  base: KnowledgeBase;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      data-testid={`base-option-${base.id}`}
      className={cn(
        "flex min-h-16 items-center gap-3 rounded-lg px-3 py-2.5 text-left outline-none transition-colors",
        "focus-visible:ring-2 focus-visible:ring-ring",
        selected
          ? "bg-accent-soft ring-1 ring-accent"
          : "bg-surface shadow-card hover:bg-fill-hover",
      )}
    >
      <span className={coverAvatarClassName(base.id, "size-8 rounded-md")} aria-hidden="true" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-footnote text-label">
          {base.knowledgeBaseName?.trim() || "未命名知识库"}
        </span>
        {/*
          D-03：卡片副标题 `普通知识库 · 2 小时前更新`。
          只有一个库名时用户没法在几个同名/近名的库之间做选择——类型与"多久没动过"
          正是区分它们的两条信息，且都已随列表返回，不需要额外请求。
        */}
        <span className="block truncate text-xs text-label-tertiary">
          {base.type === 1 ? "组织知识库" : "普通知识库"}
          {base.updateTime ? ` · ${formatRelativeTime(base.updateTime)}更新` : ""}
        </span>
      </span>
      <Check
        className={cn("size-4 shrink-0", selected ? "text-accent" : "text-transparent")}
        aria-hidden="true"
      />
    </button>
  );
}
