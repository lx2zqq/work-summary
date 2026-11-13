"use client";

import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import * as React from "react";
import { cn } from "@/lib/utils";

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

type DialogContentProps = React.ComponentProps<
  typeof DialogPrimitive.Content
> & {
  title: string;
  description?: string;
};

export function DialogContent({
  className,
  children,
  title,
  description,
  ...props
}: DialogContentProps) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-cocoa/20 backdrop-blur-[3px]" />
      <DialogPrimitive.Content
        className={cn(
          "paper-card fixed left-1/2 top-1/2 z-50 max-h-[88dvh] w-[calc(100%-1.5rem)] max-w-xl -translate-x-1/2 -translate-y-1/2 overflow-y-auto p-5 outline-none sm:p-6",
          className,
        )}
        {...props}
      >
        <DialogPrimitive.Title className="pr-8 text-lg font-extrabold tracking-tight text-ink">
          {title}
        </DialogPrimitive.Title>
        {description ? (
          <DialogPrimitive.Description className="mt-1 text-sm leading-relaxed text-ink-soft">
            {description}
          </DialogPrimitive.Description>
        ) : null}
        {children}
        <DialogPrimitive.Close className="absolute right-3.5 top-3.5 rounded-full p-1.5 text-ink-soft transition hover:bg-brand-soft hover:text-ink">
          <X className="h-4 w-4" />
          <span className="sr-only">关闭</span>
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}
