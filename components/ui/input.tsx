import * as React from "react";
import { cn } from "@/lib/utils";

export function Input({ className, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      className={cn(
        "h-11 w-full rounded-2xl border-2 border-line bg-paper px-3.5 text-sm text-ink shadow-[0_2px_0_#f0e4d6] outline-none transition placeholder:text-ink-soft/60 focus:border-brand-deep focus:ring-4 focus:ring-brand/20 disabled:cursor-not-allowed disabled:bg-cream-deep",
        className,
      )}
      {...props}
    />
  );
}

export function Textarea({
  className,
  ...props
}: React.ComponentProps<"textarea">) {
  return (
    <textarea
      className={cn(
        "w-full rounded-2xl border-2 border-line bg-paper px-3.5 py-3 text-sm leading-relaxed text-ink shadow-[0_2px_0_#f0e4d6] outline-none transition placeholder:text-ink-soft/60 focus:border-brand-deep focus:ring-4 focus:ring-brand/20 disabled:cursor-not-allowed disabled:bg-cream-deep",
        className,
      )}
      {...props}
    />
  );
}

export function Label({
  className,
  ...props
}: React.ComponentProps<"label">) {
  return (
    <label
      className={cn("text-sm font-bold text-ink", className)}
      {...props}
    />
  );
}
