import { AuthProvider } from "@/features/auth/auth-provider";
import type { ReactNode } from "react";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <main className="flex min-h-screen items-center justify-center bg-muted/30 px-4 py-12">
        <section className="w-full max-w-sm rounded-xl border bg-card p-6 shadow-sm">
          <p className="mb-6 text-sm font-semibold tracking-wide text-muted-foreground">ANYNOTE</p>
          {children}
        </section>
      </main>
    </AuthProvider>
  );
}
