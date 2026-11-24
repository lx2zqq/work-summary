import { cn } from "@/lib/utils";

/** 暖纸色骨架块，减弱动效时停止呼吸 */
export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn(
        "animate-pulse rounded-md bg-cream-deep motion-reduce:animate-none",
        className,
      )}
    />
  );
}
