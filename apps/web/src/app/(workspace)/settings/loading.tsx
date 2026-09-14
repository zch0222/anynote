import { Skeleton } from "@/components/ui/skeleton";

/**
 * 设置页的加载态：表单面板。
 *
 * 设置页的内容是"字段标签 + 输入框"的重复结构，所以给几组同构的
 * 标签/控件占位，比给一整块方砖更接近加载完成后的样子。
 */
export default function SettingsLoading() {
  return (
    <section className="mx-auto w-full max-w-3xl space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-9 w-32" />
        <Skeleton className="h-4 w-64" />
      </div>
      <div className="space-y-5 rounded-xl bg-surface p-6 shadow-card">
        {[0, 1, 2].map((item) => (
          <div key={item} className="space-y-2">
            <Skeleton className="h-3.5 w-20" />
            <Skeleton className="h-10 w-full rounded-md" />
          </div>
        ))}
        <Skeleton className="h-9 w-28 rounded-full" />
      </div>
    </section>
  );
}
