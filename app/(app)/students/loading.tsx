import { Skeleton } from "@/components/ui/skeleton";

export default function StudentsLoading() {
  return (
    <div className="space-y-4" aria-busy="true">
      <span role="status" className="sr-only">
        正在加载学生名单…
      </span>

      <div>
        <Skeleton className="h-8 w-24" />
        <Skeleton className="mt-2 h-4 w-64" />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <Skeleton className="h-4 w-20" />
        <div className="flex w-full items-center gap-2 sm:w-auto">
          <Skeleton className="h-9 flex-1 rounded-lg sm:w-48 sm:flex-none" />
          <Skeleton className="h-9 w-28 rounded-lg" />
          <Skeleton className="h-8 w-24" />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {Array.from({ length: 6 }).map((_, index) => (
          <article key={index} className="paper-card p-4">
            <div className="flex items-start gap-3">
              <Skeleton className="h-10 w-10 shrink-0 rounded-lg" />
              <div className="min-w-0 flex-1 space-y-2">
                <div className="flex items-center gap-2">
                  <Skeleton className="h-4 w-16" />
                  <Skeleton className="h-5 w-12 rounded-full" />
                </div>
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-3 w-40" />
              </div>
              <div className="flex shrink-0 gap-0.5">
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
