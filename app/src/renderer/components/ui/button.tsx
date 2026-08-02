import { cn } from "@renderer/lib/utils";
import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded-lg border border-hairline bg-surface-1 px-3 text-sm font-medium text-muted transition-colors hover:bg-surface-2 hover:text-ink disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default: "",
        primary:
          "border-primary bg-primary text-primary-foreground hover:border-primary-hover hover:bg-primary-hover",
        danger: "text-danger hover:text-danger",
        ghost: "border-transparent bg-transparent hover:bg-surface-1 hover:text-ink",
      },
      size: {
        default: "h-8.5 px-3",
        sm: "h-7.5 px-2.5 text-xs",
        icon: "size-8.5 p-0",
        "icon-sm": "size-7 p-0",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {}

export function Button({ className, variant, size, ...props }: ButtonProps) {
  return <button className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}

export { buttonVariants };
