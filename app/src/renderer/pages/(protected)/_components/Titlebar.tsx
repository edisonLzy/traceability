import { Fingerprint } from "lucide-react";

export function Titlebar() {
  return (
    <header className="app-drag-region fixed inset-x-0 top-0 z-30 flex h-[30px] items-center border-b border-hairline bg-[rgba(12,13,16,0.72)] px-3 backdrop-blur-xl">
      <div className="app-no-drag flex items-center gap-1.5 pl-[calc(var(--window-controls-left)+0.75rem)]">
        <Fingerprint size={15} className="text-primary-hover" />
        <span className="text-[12px] font-[560] tracking-[0.01em] text-tertiary">Traceability</span>
      </div>
    </header>
  );
}
