import { cn } from "@renderer/lib/utils";
import * as React from "react";

export function Textarea({
  className,
  ...props
}: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(
        "glass-control w-full resize-y rounded-[10px] p-2 text-xs leading-relaxed text-ink outline-none transition-[background-color,border-color,box-shadow] placeholder:text-tertiary focus:border-primary/55 focus:bg-surface-2 focus:shadow-[0_0_0_3px_var(--glow)] disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}
