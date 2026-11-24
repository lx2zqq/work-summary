import { Skeleton } from "@/components/ui/skeleton";

function PanelHeading({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <Skeleton className="h-8 w-8 rounded-lg" />
      <Skeleton className={compact ? "h-4 w-16" : "h-4 w-20"} />
    </div>
  );
}

export default function SettingsLoading() {
  return (
    <div className="mx-auto max-w-5xl space-y-4" aria-busy="true">
      <span role="status" className="sr-only">
        正在加载设置…
      </span>

      <Skeleton className="h-8 w-16" />

      <div className="grid gap-4 lg:grid-cols-[3fr_2fr] lg:items-start">
        <div className="space-y-4">
          <section className="paper-card p-4 sm:p-5">
            <PanelHeading />
            <div className="mt-4 divide-y divide-line/60">
              {Array.from({ length: 3 }).map((_, index) => (
                <div
                  key={index}
                  className="flex items-start justify-between gap-4 py-3.5"
                >
                  <div className="space-y-2">
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-3 w-56" />
                  </div>
                  <Skeleton className="h-6 w-10 rounded-full" />
                </div>
              ))}
            </div>
            <div className="mt-4 flex items-center justify-between gap-3 border-t border-line/60 pt-4">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-9 w-32 rounded-lg" />
            </div>
          </section>

          <section className="paper-card p-4 sm:p-5">
            <PanelHeading compact />
            <Skeleton className="mt-2 h-3 w-56" />
            <Skeleton className="mt-3 h-24 w-full rounded-lg" />
            <div className="mt-3 flex justify-end">
              <Skeleton className="h-8 w-24" />
            </div>
          </section>

          <section className="paper-card p-4 sm:p-5">
            <PanelHeading />
            <div className="mt-4 flex items-center justify-between gap-3 rounded-xl bg-cream-deep/60 px-3.5 py-3">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-5 w-16 rounded-full" />
            </div>
            <div className="mt-3 flex items-center justify-between gap-3 rounded-xl bg-cream-deep/60 px-3.5 py-3">
              <Skeleton className="h-4 w-16" />
              <Skeleton className="h-8 w-20" />
            </div>
          </section>
        </div>

        <div className="paper-card p-4 sm:p-5">
          <PanelHeading />
          <div className="mt-4 space-y-3 rounded-xl bg-cream/60 p-4 ring-1 ring-line/70">
            {Array.from({ length: 8 }).map((_, index) => (
              <Skeleton
                key={index}
                className={index === 0 ? "h-4 w-1/2" : "h-4 w-full"}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
