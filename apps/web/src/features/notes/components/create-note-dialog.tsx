"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { type CreateNoteInput, createNoteSchema } from "@/features/notes/schemas";
import { useCreateNoteMutation } from "@/features/notes/use-create-note";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

/** 在指定知识库下新建笔记，创建成功后直接进入编辑页。 */
export function CreateNoteDialog({ knowledgeBaseId }: { knowledgeBaseId: number }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const create = useCreateNoteMutation();
  const form = useForm<CreateNoteInput>({
    resolver: zodResolver(createNoteSchema),
    defaultValues: { title: "" },
  });

  async function onSubmit(values: CreateNoteInput) {
    try {
      const noteId = await create.mutateAsync({ knowledgeBaseId, title: values.title });
      toast.success("笔记已创建");
      setOpen(false);
      form.reset();
      router.push(`/notes/${knowledgeBaseId}/${noteId}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "创建失败，请稍后重试");
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) form.reset();
      }}
    >
      <DialogTrigger render={<Button />}>
        <Plus className="size-4" aria-hidden="true" />
        新建笔记
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <DialogHeader>
            <DialogTitle>新建笔记</DialogTitle>
            <DialogDescription>先取个标题，正文可以随后再写。</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="note-title">标题</Label>
            <Input id="note-title" autoComplete="off" {...form.register("title")} />
            {form.formState.errors.title ? (
              <p className="text-xs text-destructive">{form.formState.errors.title.message}</p>
            ) : null}
          </div>
          <DialogFooter>
            <Button type="submit" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting ? "创建中…" : "创建"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
