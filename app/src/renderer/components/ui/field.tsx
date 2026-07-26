import { Input } from "@renderer/components/ui/input";
import * as React from "react";

export function Field({
  label,
  className,
  ...props
}: { label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className="mb-4">
      <label className="mb-1.5 block text-xs text-muted">{label}</label>
      <Input className={className} {...props} />
    </div>
  );
}
