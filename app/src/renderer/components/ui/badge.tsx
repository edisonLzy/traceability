import { cn } from "@renderer/lib/utils";
import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";

const dotVariants = cva("size-1.5 rounded-full", {
  variants: {
    variant: {
      neutral: "bg-subtle",
      open: "bg-danger",
      fixing: "bg-primary-hover",
      fixed: "bg-success",
    },
  },
  defaultVariants: { variant: "neutral" },
});

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof dotVariants> {}

export function Badge({ className, variant, children, ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border border-hairline bg-surface-2 px-2 py-0.5 text-[11px] text-muted shadow-glass-sm backdrop-blur-xl",
        className,
      )}
      {...props}
    >
      <span className={dotVariants({ variant })} />
      {children}
    </span>
  );
}

export { dotVariants };
