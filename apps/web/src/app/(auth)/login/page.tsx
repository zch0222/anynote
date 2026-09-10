import { LoginForm } from "@/features/auth/components/login-form";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "登录 · Anynote" };

export default function LoginPage() {
  return (
    <>
      <h1 className="text-2xl font-semibold">登录 Anynote</h1>
      <p className="mb-6 mt-2 text-sm text-muted-foreground">继续记录、整理你的想法。</p>
      <LoginForm />
      <p className="mt-6 text-center text-sm text-muted-foreground">
        还没有账号？{" "}
        <Link className="text-foreground underline underline-offset-4" href="/register">
          创建账号
        </Link>
      </p>
    </>
  );
}
