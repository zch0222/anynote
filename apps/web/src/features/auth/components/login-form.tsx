"use client";

import { PasswordInput } from "@/components/shared/password-input";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { isSafeNextPath, safeNextPath } from "@/lib/auth/redirect";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { type LoginInput, loginSchema } from "../schemas";
import { useLoginMutation } from "../use-auth-mutation";

/**
 * `?next=` 指向 CLI 授权页时为真（D-14 图例 21）。
 *
 * 用户是被 `anynote auth login` 带过来的，看到的是一个"突然要登录"的页面；
 * 不解释一句，他多半会以为点错了链接而关掉。
 *
 * 先过 `isSafeNextPath` 再判断前缀——顺序不能反：`next` 是用户可控输入，
 * 直接对原始值做前缀匹配等于让 `//evil.example/cli/authorize` 这种值
 * 也能拿到提示条，虽然它最终会被 `safeNextPath` 拦成 `/dashboard`，
 * 但界面说了谎。
 */
export function isCliAuthorizeNext(next: string | null | undefined): boolean {
  return isSafeNextPath(next) && next.startsWith("/cli/authorize");
}

export function LoginForm() {
  const router = useRouter();
  // CLI 授权页会把完整参数带进 ?next=，登录后要回到那里继续授权。
  // 该值用户可控，因此必须过滤成站内路径（见 lib/auth/redirect.ts）。
  const rawNext = useSearchParams().get("next");
  const next = safeNextPath(rawNext);
  const fromCli = isCliAuthorizeNext(rawNext);
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
        {fromCli ? (
          <p
            data-testid="cli-authorize-hint"
            className="rounded-md bg-accent-soft px-3 py-2 text-footnote text-accent"
          >
            登录后将回到「授权 CLI 登录」继续
          </p>
        ) : null}
        <Field data-invalid={!!errors.username}>
          <FieldLabel htmlFor="username">用户名</FieldLabel>
          <Input
            id="username"
            className="h-10 rounded-md"
            autoComplete="username"
            // D-14 图例 5：打开页面即聚焦，少一次点击
            autoFocus
            aria-invalid={!!errors.username}
            aria-describedby={errors.username ? "username-error" : undefined}
            {...register("username")}
          />
          <FieldError id="username-error" errors={[errors.username]} />
        </Field>
        <Field data-invalid={!!errors.password}>
          <FieldLabel htmlFor="password">密码</FieldLabel>
          <PasswordInput
            id="password"
            className="h-10 rounded-md"
            autoComplete="current-password"
            aria-invalid={!!errors.password}
            aria-describedby={errors.password ? "password-error" : undefined}
            {...register("password")}
          />
          <FieldError id="password-error" errors={[errors.password]} />
        </Field>
        <Button type="submit" size="lg" disabled={isSubmitting} className="w-full">
          {isSubmitting ? "登录中…" : "登录"}
        </Button>
      </FieldGroup>
    </form>
  );
}
