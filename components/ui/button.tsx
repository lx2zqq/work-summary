import * as React from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

type Variant = "primary" | "secondary" | "outline" | "ghost" | "danger";
type Size = "sm" | "md" | "lg" | "icon";

const base =
  "inline-flex items-center justify-center gap-2 rounded-full border-2 font-bold transition-all duration-150 outline-none focus-visible:ring-4 focus-visible:ring-sky/60 focus-visible:ring-offset-2 focus-visible:ring-offset-cream disabled:pointer-events-none disabled:opacity-50";

const variants: Record<Variant, string> = {
  primary:
    "border-cocoa bg-brand text-cocoa shadow-[0_3px_0_#5b463c] hover:-translate-y-0.5 hover:bg-[#f7b7c8] hover:shadow-[0_4px_0_#5b463c] active:translate-y-0.5 active:shadow-none",
  secondary:
    "border-line bg-paper text-ink shadow-[0_3px_0_#eadccd] hover:-translate-y-0.5 hover:bg-cream active:translate-y-0.5 active:shadow-none",
  outline:
    "border-brand/50 bg-brand-soft/60 text-brand-deep hover:bg-brand-soft",
  ghost:
    "border-transparent text-ink-soft hover:bg-brand-soft/60 hover:text-ink",
  danger:
    "border-[#e4b1b1] bg-[#fde8e8] text-[#b35454] shadow-[0_3px_0_#e4b1b1] hover:-translate-y-0.5 hover:bg-[#fbdcdc] active:translate-y-0.5 active:shadow-none",
};

const sizes: Record<Size, string> = {
  sm: "h-9 px-3.5 text-xs",
  md: "h-11 px-5 text-sm",
  lg: "h-12 px-6 text-[15px]",
  icon: "h-10 w-10 p-0",
};

export type ButtonProps = React.ComponentProps<"button"> & {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
};

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
      className={cn(base, variants[variant], sizes[size], className)}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
      {children}
    </button>
  );
}
