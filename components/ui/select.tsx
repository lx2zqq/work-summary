import * as React from "react";
import { cn } from "@/lib/utils";

export function Select({
  className,
  ...props
}: React.ComponentProps<"select">) {
  return (
    <select
      className={cn(
        "h-11 w-full appearance-none rounded-2xl border-2 border-line bg-paper px-3.5 text-sm text-ink shadow-[0_2px_0_#f0e4d6] outline-none transition focus:border-brand-deep focus:ring-4 focus:ring-brand/20 disabled:cursor-not-allowed disabled:bg-cream-deep",
        className,
      )}
      {...props}
    />
  );
}
