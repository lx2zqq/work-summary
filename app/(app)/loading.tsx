import { Skeleton } from "@/components/ui/skeleton";

export default function WorkspaceLoading() {
  return (
    <div className="space-y-4" aria-busy="true">
      <span role="status" className="sr-only">
        正在加载今日复盘…
      </span>

      <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
        <div className="paper-card flex min-h-[360px] flex-col p-4 lg:min-h-[640px]">
          <div className="flex items-center justify-between gap-3 border-b border-line/70 pb-3">
            <Skeleton className="h-6 w-40" />
            <Skeleton className="h-8 w-14" />
          </div>

          <div className="mt-3 flex flex-wrap gap-1.5">
            {Array.from({ length: 6 }).map((_, index) => (
              <Skeleton key={index} className="h-6 w-16 rounded-full" />
            ))}
          </div>

          <div className="mt-6 space-y-4">
            {Array.from({ length: 7 }).map((_, index) => (
              <Skeleton
                key={index}
                className={index === 6 ? "h-4 w-2/3" : "h-4 w-full"}
              />
            ))}
          </div>

          <div className="mt-auto flex items-center justify-between gap-2 pt-8">
            <Skeleton className="h-8 w-24" />
            <div className="flex gap-2">
              <Skeleton className="h-9 w-24" />
              <Skeleton className="h-10 w-24" />
            </div>
          </div>
        </div>

        <div className="paper-card flex min-h-[360px] flex-col p-4 lg:min-h-[640px]">
          <div className="flex items-center justify-between gap-3 border-b border-line/70 pb-3">
            <div className="flex items-center gap-2.5">
              <Skeleton className="h-8 w-8 rounded-lg" />
              <Skeleton className="h-4 w-20" />
            </div>
            <Skeleton className="h-5 w-14 rounded-full" />
          </div>

          <div className="paper-sheet mt-3 flex-1 space-y-4 p-4 sm:p-5">
            {Array.from({ length: 9 }).map((_, index) => (
              <Skeleton
                key={index}
                className={index % 3 === 0 ? "h-4 w-1/3" : "h-4 w-full"}
              />
            ))}
          </div>

          <div className="mt-3 flex items-center justify-between gap-2 border-t border-line/60 pt-3">
            <Skeleton className="h-8 w-40" />
            <Skeleton className="h-8 w-20" />
          </div>
        </div>
      </div>
    </div>
  );
}
