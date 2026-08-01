import type { ReactNode } from "react";

interface MessageToolbarProps {
  align?: "start" | "end";
  children: ReactNode;
}

export function MessageToolbar({ align = "start", children }: MessageToolbarProps) {
  return (
    <div
      className="flex items-center gap-2"
      style={{ justifyContent: align === "end" ? "flex-end" : "flex-start" }}
    >
      {children}
    </div>
  );
}
