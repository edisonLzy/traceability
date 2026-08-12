import { cn } from "@renderer/lib/utils";
import * as React from "react";

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("glass-panel overflow-hidden rounded-[16px]", className)} {...props} />;
}

export function CardHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("flex min-h-12.5 items-center border-b border-hairline px-4", className)}
      {...props}
    />
  );
}

export function CardTitle({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("font-medium", className)} {...props} />;
}

export function CardMeta({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("ml-auto text-xs text-tertiary", className)} {...props} />;
}

export function CardContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("", className)} {...props} />;
}

interface PanelProps extends Omit<React.HTMLAttributes<HTMLDivElement>, "title"> {
  title?: React.ReactNode;
  meta?: React.ReactNode;
  headExtra?: React.ReactNode;
}

/** Convenience wrapper around Card for the common title + meta + body pattern. */
export function Panel({ title, meta, headExtra, children, className, ...props }: PanelProps) {
  return (
    <Card className={cn(className)} {...props}>
      {(title || headExtra || meta !== undefined) && (
        <CardHeader>
          {title && <CardTitle>{title}</CardTitle>}
          {headExtra}
          {meta !== undefined && <CardMeta>{meta}</CardMeta>}
        </CardHeader>
      )}
      {children}
    </Card>
  );
}
