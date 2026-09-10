import { Skeleton } from "@/components/ui/skeleton";

export function WorkspacePlaceholder({
  title,
  description,
}: { title: string; description: string }) {
  return (
    <section className="mx-auto w-full max-w-6xl space-y-8">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      <div className="rounded-xl border bg-card p-5 sm:p-8">
        <div className="mb-8 flex items-center justify-between gap-4">
          <p className="text-sm text-muted-foreground">功能准备中，敬请期待</p>
          <Skeleton className="h-8 w-20" />
        </div>
        <div aria-hidden="true" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((item) => (
            <div key={item} className="space-y-4 rounded-lg border p-5">
              <Skeleton className="size-9 rounded-lg" />
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-4/5" />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
