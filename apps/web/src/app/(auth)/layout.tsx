import { AnynoteLogo } from "@/components/layout/brand-logo";
import type { ReactNode } from "react";

// QueryClient/Toaster 已上移到根布局的 Providers；这里只剩认证页自己的版式。
/**
 * 认证页外壳（D-14 图例 1 · D-15）。
 *
 * 全站唯一不在侧栏外壳里的页面：整屏分组底色上一张居中卡片。
 * 桌面与手机同一路由、同一版式，所以宽度用 `w-full max-w-[400px]`——
 * 小屏下自动收窄到可用宽度，不需要断点。
 *
 * 卡片顶部换成**品牌标记**（`AnynoteLogo` + 「Anynote」），不再是「ANYNOTE」
 * 文字小标签：启动页刚画完的书，落到登录页又变回一行字母，品牌就断在这里了。
 *
 * 卡片同时保留 `data-slot="card"`：登录/注册是"一张卡片"这件事对
 * 视觉走查脚本与 E2E 都一样（`ui-supplement.spec.ts` 按它量宽 400 与圆角 20）。
 */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-grouped px-4 py-12">
      <section
        data-slot="card"
        className="w-full max-w-[400px] rounded-[20px] border border-separator bg-surface p-7 shadow-card"
      >
        <div className="mb-6 flex items-center gap-2">
          {/* 字标已经写了「Anynote」，Logo 对读屏就是装饰性的，不传 label */}
          <AnynoteLogo size={32} />
          <span className="text-headline font-semibold tracking-tight text-label">Anynote</span>
        </div>
        {children}
      </section>
    </main>
  );
}
