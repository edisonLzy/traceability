import { cn } from "@renderer/lib/utils";
import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";

const buttonVariants = cva(
  "glass-control inline-flex items-center justify-center gap-2 rounded-[10px] px-3 text-sm font-medium text-muted transition-[color,background-color,border-color,box-shadow] duration-150 [transition-timing-function:var(--ease-out)] hover:border-hairline-strong hover:bg-surface-2 hover:text-ink active:bg-overlay-strong disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default: "",
        primary:
          "!border-primary/70 !bg-primary !text-primary-foreground shadow-glow hover:!border-primary-hover hover:!bg-primary-hover",
        danger: "text-danger hover:text-danger",
        ghost:
          "border-transparent bg-transparent shadow-none hover:bg-overlay-strong hover:text-ink",
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
