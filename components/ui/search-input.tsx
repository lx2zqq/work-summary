"use client";

import { Search, X } from "lucide-react";
import * as React from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type Props = Omit<
  React.ComponentProps<"input">,
  "value" | "onChange" | "className"
> & {
  value: string;
  onValueChange: (value: string) => void;
  className?: string;
};

/** 带搜索图标和一键清空的输入框，列表页统一复用 */
export function SearchInput({
  value,
  onValueChange,
  className,
  ...props
}: Props) {
  return (
    <div className={cn("relative", className)}>
      <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-soft/60" />
      <Input
        type="search"
        value={value}
        onChange={(event) => onValueChange(event.target.value)}
        className="h-9 pl-8 pr-8 text-xs [&::-webkit-search-cancel-button]:hidden"
        {...props}
      />
      {value ? (
        <button
          type="button"
          aria-label="清空搜索"
          title="清空搜索"
          onClick={() => onValueChange("")}
          className="absolute right-1 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-ink-soft/70 transition-colors hover:bg-cream-deep hover:text-ink"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      ) : null}
    </div>
  );
}
