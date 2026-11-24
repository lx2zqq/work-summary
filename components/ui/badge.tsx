import * as React from "react";
import { cn } from "@/lib/utils";

type Tone = "orange" | "stone" | "green" | "red" | "amber" | "blue";

const tones: Record<Tone, string> = {
  orange: "bg-brand-soft text-brand-deep ring-brand/20",
  stone: "bg-cream-deep text-ink-soft ring-line",
  green: "bg-mint-soft text-success ring-mint/70",
  red: "bg-danger-soft text-danger ring-danger-line",
  amber: "bg-butter-soft text-warning ring-butter/60",
  blue: "bg-sky-soft text-info ring-sky/60",
};

export function Badge({
  tone = "stone",
  className,
  children,
}: {
  tone?: Tone;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset",
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
