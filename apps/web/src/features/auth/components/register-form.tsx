"use client";

import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { type RegisterInput, registerSchema } from "../schemas";
import { useRegisterMutation } from "../use-auth-mutation";

export function RegisterForm() {
  const router = useRouter();
  const mutation = useRegisterMutation();
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RegisterInput>({
    resolver: zodResolver(registerSchema),
    defaultValues: { username: "", password: "", nickname: "", email: "", sex: 0 },
  });
  const submit = handleSubmit(async (input) => {
    try {
      await mutation.mutateAsync(input);
      router.push("/dashboard");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "注册失败，请稍后重试");
    } finally {
      mutation.reset();
    }
  });

  return (
    <form onSubmit={submit} noValidate aria-label="注册">
      <FieldGroup>
        <Field data-invalid={!!errors.username}>
          <FieldLabel htmlFor="username">用户名</FieldLabel>
          <Input
            id="username"
            autoComplete="username"
            aria-invalid={!!errors.username}
            aria-describedby="username-help username-error"
            {...register("username")}
          />
          <FieldDescription id="username-help">6–15 位字母或数字</FieldDescription>
          <FieldError id="username-error" errors={[errors.username]} />
        </Field>
        <Field data-invalid={!!errors.password}>
          <FieldLabel htmlFor="password">密码</FieldLabel>
          <Input
            id="password"
            type="password"
            autoComplete="new-password"
            aria-invalid={!!errors.password}
            aria-describedby="password-help password-error"
            {...register("password")}
          />
          <FieldDescription id="password-help">8–15 位，包含大小写字母和数字</FieldDescription>
          <FieldError id="password-error" errors={[errors.password]} />
        </Field>
        <Field>
          <FieldLabel htmlFor="nickname">昵称</FieldLabel>
          <Input id="nickname" autoComplete="nickname" {...register("nickname")} />
        </Field>
        <Field data-invalid={!!errors.email}>
          <FieldLabel htmlFor="email">邮箱（选填）</FieldLabel>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            aria-invalid={!!errors.email}
            aria-describedby={errors.email ? "email-error" : undefined}
            {...register("email")}
          />
          <FieldError id="email-error" errors={[errors.email]} />
        </Field>
        <Field>
          <FieldLabel htmlFor="sex">性别</FieldLabel>
          <select
            id="sex"
            className="h-9 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-ring"
            {...register("sex", { valueAsNumber: true })}
          >
            <option value={0}>男</option>
            <option value={1}>女</option>
          </select>
        </Field>
        <Button type="submit" disabled={isSubmitting} className="w-full">
          {isSubmitting ? "注册中…" : "注册并登录"}
        </Button>
      </FieldGroup>
    </form>
  );
}
