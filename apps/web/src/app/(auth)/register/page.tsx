import { RegisterForm } from "@/features/auth/components/register-form";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "注册 · Anynote" };

export default function RegisterPage() {
  return (
    <>
      <h1 className="text-2xl font-semibold">创建账号</h1>
      <p className="mb-6 mt-2 text-sm text-muted-foreground">开始建立你的知识空间。</p>
      <RegisterForm />
      <p className="mt-6 text-center text-sm text-muted-foreground">
        已有账号？{" "}
        <Link className="text-foreground underline underline-offset-4" href="/login">
          前往登录
        </Link>
      </p>
    </>
  );
}
