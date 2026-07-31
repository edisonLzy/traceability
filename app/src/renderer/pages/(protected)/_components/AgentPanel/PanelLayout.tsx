import { cn } from "@renderer/lib/utils";
import { Sparkles } from "lucide-react";
import type { ReactNode } from "react";

interface PanelLayoutProps {
  children: ReactNode;
}

export function PanelLayout({ children }: PanelLayoutProps) {
  return (
    <aside
      aria-label="Traceability Agent"
      className="relative flex h-full min-w-0 flex-col bg-[rgba(16,17,21,0.86)] backdrop-blur-2xl"
    >
      {children}
    </aside>
  );
}

interface PanelHeaderProps {
  title: string;
  actions?: ReactNode;
  isRunning?: boolean;
  subtitle?: string;
}

export function PanelHeader({ title, actions, isRunning = false, subtitle }: PanelHeaderProps) {
  return (
    <header className="relative flex min-h-12 items-center gap-2 border-b border-hairline px-2.5">
      <span className="grid size-7 shrink-0 place-items-center rounded-[8px] border border-primary/20 bg-primary/10 text-primary-hover">
        <Sparkles size={15} />
      </span>
      <div className="min-w-0 flex-1 px-1">
        <h1 className="truncate text-[12px] font-[650] text-ink">{title}</h1>
        {subtitle ? (
          <p className="mt-0.5 flex items-center gap-1.5 text-[10px] text-tertiary">
            <span
              className={
                isRunning
                  ? "size-1.5 rounded-full bg-primary animate-pulse"
                  : "size-1.5 rounded-full bg-tertiary"
              }
            />
            {subtitle}
          </p>
        ) : null}
      </div>
      {actions}
    </header>
  );
}

interface PanelBodyProps {
  children: ReactNode;
  className?: string;
}

export function PanelBody({ children, className }: PanelBodyProps) {
  return <section className={cn("min-h-0 flex-1", className)}>{children}</section>;
}

interface PanelFooterProps {
  children: ReactNode;
}

export function PanelFooter({ children }: PanelFooterProps) {
  return (
    <section className="shrink-0 border-t border-hairline bg-[rgba(14,15,18,0.94)] px-3 pt-2 pb-2.5">
      {children}
    </section>
  );
}
