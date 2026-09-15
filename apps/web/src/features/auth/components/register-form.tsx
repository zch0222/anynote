"use client";

import { PasswordInput } from "@/components/shared/password-input";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import { type RegisterInput, registerSchema } from "../schemas";
import { useRegisterMutation } from "../use-auth-mutation";

/** 注册页的性别选项（D-14 图例 14）。接口要求必填，所以**不提供「未设置」**。 */
const REGISTER_SEX_OPTIONS = [
  { value: 0, label: "男" },
  { value: 1, label: "女" },
] as const;

export function RegisterForm() {
  const router = useRouter();
  const mutation = useRegisterMutation();
  const {
    register,
    handleSubmit,
    control,
    formState: { errors, isSubmitting },
  } = useForm<RegisterInput>({
    resolver: zodResolver(registerSchema),
    /**
     * 不给性别默认值：默认选中「男」等于替用户做了这个决定，而它是必填字段。
     * 缺省时 RHF 给 `undefined`，`SelectValue` 因此停在占位文案上——
     * 提交时由 `registerSchema` 的 `sex` 那条拦下。
     */
    defaultValues: { username: "", password: "", nickname: "", email: "" },
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
            className="h-10 rounded-md"
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
          <PasswordInput
            id="password"
            className="h-10 rounded-md"
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
          <Input
            id="nickname"
            className="h-10 rounded-md"
            autoComplete="nickname"
            {...register("nickname")}
          />
        </Field>
        <Field data-invalid={!!errors.email}>
          <FieldLabel htmlFor="email">邮箱（选填）</FieldLabel>
          <Input
            id="email"
            type="email"
            className="h-10 rounded-md"
            autoComplete="email"
            aria-invalid={!!errors.email}
            aria-describedby={errors.email ? "email-error" : undefined}
            {...register("email")}
          />
          <FieldError id="email-error" errors={[errors.email]} />
        </Field>
        {/*
          性别用 Select 而不是原生 <select>：原生控件 36 高 / 圆角 6，和旁边的
          40 高 / 圆角 10 输入框对不齐，而在深色下也没法用语义 Token 上色。
          Controller 是必须的——`register` 只能绑原生表单元素，base-ui 的
          Select 把值放在受控的 `value` 上。
        */}
        <Field data-invalid={!!errors.sex}>
          <FieldLabel htmlFor="sex">性别</FieldLabel>
          <Controller
            control={control}
            name="sex"
            render={({ field }) => (
              <Select
                items={REGISTER_SEX_OPTIONS}
                value={field.value ?? null}
                onValueChange={(value) => field.onChange(Number(value))}
              >
                <SelectTrigger
                  id="sex"
                  className="h-10 w-full rounded-md"
                  aria-invalid={!!errors.sex}
                  aria-describedby={errors.sex ? "sex-error" : undefined}
                  data-testid="register-sex"
                  onBlur={field.onBlur}
                >
                  <SelectValue placeholder="请选择性别">
                    {/*
                      必须先挡 null：`Number(null)` 是 0，直接转数字会把"未选"当成「男」，
                      于是表单还没填就显示已选。占位文案也因此得自己给——
                      children 一旦是函数，`placeholder` 就不再被使用。
                    */}
                    {(value: number | null) =>
                      value === null
                        ? "请选择性别"
                        : (REGISTER_SEX_OPTIONS.find((option) => option.value === value)?.label ??
                          "请选择性别")
                    }
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {REGISTER_SEX_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
          <FieldError id="sex-error" errors={[errors.sex]} />
        </Field>
        <Button type="submit" size="lg" disabled={isSubmitting} className="w-full">
          {isSubmitting ? "注册中…" : "注册并登录"}
        </Button>
      </FieldGroup>
    </form>
  );
}
