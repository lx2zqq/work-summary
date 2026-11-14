import type { ReactNode } from "react";
import { DoodleStar } from "@/components/mascots";

export function PageHeading({
  title,
  description,
  mascot,
}: {
  title: string;
  description?: string;
  mascot: ReactNode;
}) {
  return (
    <div className="flex items-start gap-3">
      <div className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-full border-2 border-line/70 bg-paper shadow-[0_3px_0_#eadccd]">
        {mascot}
        <DoodleStar className="absolute -right-1 -top-1 h-3 w-3 text-butter" />
      </div>
      <div>
        <h1 className="text-xl font-extrabold tracking-tight text-ink">
          {title}
        </h1>
        {description ? (
          <p className="mt-1 text-sm leading-relaxed text-ink-soft">
            {description}
          </p>
        ) : null}
      </div>
    </div>
  );
}
