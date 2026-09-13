"use client";

import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { safeNextPath } from "@/lib/auth/redirect";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { type LoginInput, loginSchema } from "../schemas";
import { useLoginMutation } from "../use-auth-mutation";

export function LoginForm() {
  const router = useRouter();
  // CLI 授权页会把完整参数带进 ?next=，登录后要回到那里继续授权。
  // 该值用户可控，因此必须过滤成站内路径（见 lib/auth/redirect.ts）。
  const next = safeNextPath(useSearchParams().get("next"));
  const mutation = useLoginMutation();
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { username: "", password: "" },
  });

  const submit = handleSubmit(async (input) => {
    try {
      await mutation.mutateAsync(input);
      router.push(next);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "登录失败，请稍后重试");
    } finally {
      mutation.reset();
    }
  });

  return (
    <form onSubmit={submit} noValidate aria-label="登录">
      <FieldGroup>
        <Field data-invalid={!!errors.username}>
          <FieldLabel htmlFor="username">用户名</FieldLabel>
          <Input
            id="username"
            autoComplete="username"
            aria-invalid={!!errors.username}
            aria-describedby={errors.username ? "username-error" : undefined}
            {...register("username")}
          />
          <FieldError id="username-error" errors={[errors.username]} />
        </Field>
        <Field data-invalid={!!errors.password}>
          <FieldLabel htmlFor="password">密码</FieldLabel>
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            aria-invalid={!!errors.password}
            aria-describedby={errors.password ? "password-error" : undefined}
            {...register("password")}
          />
          <FieldError id="password-error" errors={[errors.password]} />
        </Field>
        <Button type="submit" disabled={isSubmitting} className="w-full">
          {isSubmitting ? "登录中…" : "登录"}
        </Button>
      </FieldGroup>
    </form>
  );
}
