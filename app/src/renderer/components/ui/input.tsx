import { cn } from "@renderer/lib/utils";
import * as React from "react";

export function Input({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "glass-control h-9 w-full rounded-[10px] px-3 text-sm text-ink outline-none transition-[border-color,box-shadow,background-color] placeholder:text-tertiary focus:border-primary/55 focus:bg-surface-2 focus:shadow-[0_0_0_3px_var(--glow)] disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}
