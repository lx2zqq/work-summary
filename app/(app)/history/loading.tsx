import { Skeleton } from "@/components/ui/skeleton";

export default function HistoryLoading() {
  return (
    <div className="space-y-5" aria-busy="true">
      <span role="status" className="sr-only">
        正在加载历史复盘…
      </span>

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap items-end gap-3">
          <Skeleton className="h-8 w-28" />
          <Skeleton className="h-6 w-44 rounded-full" />
        </div>
        <div className="flex w-full items-center gap-2 sm:w-auto">
          <Skeleton className="h-9 flex-1 rounded-lg sm:w-56 sm:flex-none" />
          <Skeleton className="h-9 w-28 rounded-lg" />
        </div>
      </div>

      <div className="space-y-7">
        {Array.from({ length: 2 }).map((_, month) => (
          <div key={month} className="space-y-3">
            <div className="flex items-center gap-3">
              <Skeleton className="h-4 w-20" />
              <span className="h-px flex-1 bg-line/80" />
              <Skeleton className="h-4 w-8" />
            </div>

            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, index) => (
                <div key={index} className="flex gap-3">
                  <div className="flex w-11 shrink-0 flex-col items-center gap-1.5 pt-3">
                    <Skeleton className="h-6 w-7" />
                    <Skeleton className="h-3 w-6" />
                  </div>
                  <div className="paper-card flex-1 space-y-2.5 p-4">
                    <Skeleton className="h-5 w-12 rounded-full" />
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-4/5" />
                    <div className="flex gap-1.5 pt-1">
                      <Skeleton className="h-5 w-14 rounded-full" />
                      <Skeleton className="h-5 w-12 rounded-full" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
