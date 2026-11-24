"use client";

import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

type Props = {
  checking: boolean;
  loading: boolean;
  onCheck: () => void;
  onRetry: () => void;
};

/** 刷新或重新进入页面时，提示上一次生成还没收尾 */
export function RecoveryBanner({
  checking,
  loading,
  onCheck,
  onRetry,
}: Props) {
  return (
    <section className="paper-card p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-butter-soft text-warning">
          <RefreshCw className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-ink">
            上次生成还没完成
          </h2>
          <p className="mt-0.5 text-xs leading-relaxed text-ink-soft">
            刷新或关页会中断生成，可以检查结果或继续生成。
          </p>
        </div>
      </div>
      <div className="mt-3 flex justify-end gap-2">
        <Button
          variant="secondary"
          size="sm"
          loading={checking}
          onClick={onCheck}
        >
          检查结果
        </Button>
        <Button size="sm" disabled={loading} onClick={onRetry}>
          继续生成
        </Button>
      </div>
    </section>
  );
}
