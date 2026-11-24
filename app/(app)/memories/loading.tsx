import { Skeleton } from "@/components/ui/skeleton";

export default function MemoriesLoading() {
  return (
    <div className="space-y-4" aria-busy="true">
      <span role="status" className="sr-only">
        正在加载长期记忆…
      </span>

      <div>
        <Skeleton className="h-8 w-24" />
        <Skeleton className="mt-2 h-4 w-64" />
      </div>

      <section className="paper-card p-3 sm:p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Skeleton className="h-7 w-7 rounded-lg" />
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-3 w-24" />
          </div>
          <Skeleton className="h-8 w-24" />
        </div>

        <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
          <Skeleton className="h-9 w-full rounded-lg sm:w-52" />
          <Skeleton className="h-9 w-36 rounded-lg" />
          <Skeleton className="h-9 flex-1 rounded-lg" />
        </div>
      </section>

      <div className="space-y-3">
        <Skeleton className="h-4 w-16" />
        {Array.from({ length: 3 }).map((_, index) => (
          <article key={index} className="paper-card p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1 space-y-2">
                <div className="flex items-center gap-2">
                  <Skeleton className="h-5 w-14 rounded-full" />
                  <Skeleton className="h-3 w-20" />
                </div>
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3 w-24" />
              </div>
              <div className="flex shrink-0 gap-1">
                <Skeleton className="h-9 w-9 rounded-lg" />
                <Skeleton className="h-9 w-9 rounded-lg" />
              </div>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
