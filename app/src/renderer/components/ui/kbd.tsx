import { cn } from "@renderer/lib/utils";
import * as React from "react";

export function Kbd({ className, ...props }: React.HTMLAttributes<HTMLElement>) {
  return (
    <kbd
      className={cn(
        "rounded-[6px] border border-hairline bg-surface-1 px-1.5 py-px font-mono text-[11px] text-tertiary shadow-glass-sm",
        className,
      )}
      {...props}
    />
  );
}
