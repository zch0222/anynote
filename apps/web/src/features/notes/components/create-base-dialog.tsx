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
import { Textarea } from "@/components/ui/textarea";
import { type CreateBaseInput, createBaseSchema } from "@/features/notes/schemas";
import { useCreateKnowledgeBaseMutation } from "@/features/notes/use-knowledge-bases";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

/** 新建知识库：笔记必须挂在知识库下，没有知识库时这里是唯一入口。 */
export function CreateBaseDialog({ onCreated }: { onCreated?: (baseId: number) => void }) {
  const [open, setOpen] = useState(false);
  const create = useCreateKnowledgeBaseMutation();
  const form = useForm<CreateBaseInput>({
    resolver: zodResolver(createBaseSchema),
    defaultValues: { name: "", detail: "" },
  });

  async function onSubmit(values: CreateBaseInput) {
    try {
      const baseId = await create.mutateAsync(values);
      toast.success("知识库已创建");
      setOpen(false);
      form.reset();
      onCreated?.(baseId);
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
        新建知识库
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <DialogHeader>
            <DialogTitle>新建知识库</DialogTitle>
            <DialogDescription>知识库是笔记的归属容器，先建一个再开始写作。</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="base-name">名称</Label>
            <Input id="base-name" autoComplete="off" {...form.register("name")} />
            {form.formState.errors.name ? (
              <p className="text-xs text-destructive">{form.formState.errors.name.message}</p>
            ) : null}
          </div>
          <div className="space-y-2">
            <Label htmlFor="base-detail">简介</Label>
            <Textarea id="base-detail" rows={3} {...form.register("detail")} />
            {form.formState.errors.detail ? (
              <p className="text-xs text-destructive">{form.formState.errors.detail.message}</p>
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
