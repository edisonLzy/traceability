import { cn } from "@renderer/lib/utils";
import { X } from "lucide-react";
import type { ComponentPropsWithoutRef, ReactNode } from "react";

interface IconNodeProps extends ComponentPropsWithoutRef<"span"> {
  icon: ReactNode;
  children: ReactNode;
  className?: string;
  onRemove?: () => void;
}

export function IconNode({ icon, children, className, onRemove, ...props }: IconNodeProps) {
  return (
    <span
      className={cn(
        "inline-flex h-5 max-w-full items-center gap-1 rounded-[5px] border border-primary/30 bg-primary/[0.09] px-1.5 py-0 align-middle text-[10px] leading-none font-[620] text-primary-soft",
        className,
      )}
      {...props}
    >
      <span className="shrink-0 [&_svg]:size-3">{icon}</span>
      <span className="truncate">{children}</span>
      {onRemove ? (
        <button
          aria-label="Remove skill"
          className="grid size-3 shrink-0 place-items-center rounded text-primary-soft/75 transition-colors hover:bg-overlay-strong hover:text-primary-soft"
          onMouseDown={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onRemove();
          }}
          type="button"
        >
          <X className="size-2.5" />
        </button>
      ) : null}
    </span>
  );
}
