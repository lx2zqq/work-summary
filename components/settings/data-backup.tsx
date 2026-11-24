import { Database } from "lucide-react";
import { buttonClass } from "@/components/ui/button";

export function DataBackup({ demoMode = false }: { demoMode?: boolean }) {
  if (demoMode) return null;

  return (
    <section className="paper-card p-4 sm:p-5">
      <div className="flex items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-mint-soft text-success">
          <Database className="h-4 w-4" />
        </div>
        <h2 className="text-sm font-semibold text-ink">数据备份</h2>
      </div>

      <p className="mt-2 text-xs leading-relaxed text-ink-soft">
        一次性导出全部历史复盘和长期记忆。JSON 适合长期存档，Markdown 适合直接阅读。
      </p>

      <div className="mt-3 flex flex-wrap gap-2">
        <a
          href="/api/export?format=json"
          download
          className={buttonClass({ variant: "secondary", size: "sm" })}
        >
          导出 JSON
        </a>
        <a
          href="/api/export?format=md"
          download
          className={buttonClass({ variant: "secondary", size: "sm" })}
        >
          导出 Markdown
        </a>
      </div>
    </section>
  );
}
