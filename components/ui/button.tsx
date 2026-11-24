import * as React from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

type Variant = "primary" | "secondary" | "outline" | "ghost" | "danger";
type Size = "sm" | "md" | "lg" | "icon";

const base =
  "inline-flex items-center justify-center gap-1.5 rounded-lg border font-medium transition-colors duration-150 outline-none focus-visible:ring-2 focus-visible:ring-brand/30 focus-visible:ring-offset-2 focus-visible:ring-offset-cream disabled:pointer-events-none disabled:opacity-50";

const variants: Record<Variant, string> = {
  primary:
    "border-transparent bg-ink-strong text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.12),0_1px_2px_rgba(35,31,29,0.18)] hover:bg-ink-hover active:bg-ink-hover",
  secondary:
    "border-line bg-paper text-ink hover:bg-cream-deep active:bg-cream-deep",
  outline:
    "border-brand/30 bg-transparent text-brand-deep hover:bg-brand-soft",
  ghost:
    "border-transparent bg-transparent text-ink-soft hover:bg-cream-deep hover:text-ink",
  danger:
    "border-danger-line bg-danger-soft text-danger hover:bg-danger-hover",
};

const sizes: Record<Size, string> = {
  sm: "h-8 px-3 text-xs",
  md: "h-10 px-4 text-sm",
  lg: "h-11 px-5 text-sm",
  icon: "h-9 w-9 p-0",
};

export type ButtonProps = React.ComponentProps<"button"> & {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
};

/** 让 Link 复用按钮样式，避免列表里手写第二套按钮 */
export function buttonClass({
  variant = "primary",
  size = "md",
  className,
}: {
  variant?: Variant;
  size?: Size;
  className?: string;
} = {}) {
  return cn(base, variants[variant], sizes[size], className);
}

export function Button({
  className,
  variant = "primary",
  size = "md",
  loading = false,
  disabled,
  type = "button",
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={buttonClass({ variant, size, className })}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
      {children}
    </button>
  );
}
