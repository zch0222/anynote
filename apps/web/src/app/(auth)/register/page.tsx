import { RegisterForm } from "@/features/auth/components/register-form";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "注册 · Anynote" };

export default function RegisterPage() {
  return (
    <>
      <h1 className="text-title text-label">创建账号</h1>
      <p className="mb-6 mt-1 text-footnote text-label-secondary">开始建立你的知识空间。</p>
      <RegisterForm />
      <p className="mt-6 text-center text-footnote text-label-secondary">
        已有账号？ {/* D-14 图例 9：链接用 accent 色，不再是与正文同色的下划线链接 */}
        <Link className="font-medium text-accent underline-offset-4 hover:underline" href="/login">
          登录
        </Link>
      </p>
    </>
  );
}
