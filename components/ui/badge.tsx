import * as React from "react";
import { cn } from "@/lib/utils";

type Tone = "orange" | "stone" | "green" | "red" | "amber" | "blue";

const tones: Record<Tone, string> = {
  orange: "bg-brand-soft text-brand-deep ring-brand/40",
  stone: "bg-cream-deep text-ink-soft ring-line",
  green: "bg-mint-soft text-[#4f7d63] ring-mint",
  red: "bg-[#fde8e8] text-[#b35454] ring-[#e4b1b1]",
  amber: "bg-butter-soft text-[#8a6a2f] ring-butter",
  blue: "bg-sky-soft text-[#4e7f99] ring-sky",
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
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-bold ring-1 ring-inset",
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
