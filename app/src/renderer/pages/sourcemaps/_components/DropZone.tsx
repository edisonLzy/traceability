import { cn } from "@renderer/lib/utils";
import { FileCode2, Upload } from "lucide-react";
import { useCallback, useRef, useState } from "react";

interface DropZoneProps {
  onFiles: (files: File[]) => void;
  disabled?: boolean;
  hint?: string;
}

/**
 * Drop or click to select `.map` files. Restricts by extension via the file
 * input's `accept` attribute; the drop handler filters by name too so users
 * who drag arbitrary files get an obvious "no-op" instead of an upload error.
 */
export function DropZone({ onFiles, disabled = false, hint }: DropZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const emit = useCallback(
    (list: FileList | File[] | null) => {
      if (!list) return;
      const files = Array.from(list).filter((file) => file.name.endsWith(".map"));
      if (files.length > 0) onFiles(files);
    },
    [onFiles],
  );

  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-hairline bg-white/[0.02] px-6 py-10 text-center transition-colors",
        dragging && "border-primary/60 bg-primary/5",
        disabled && "cursor-not-allowed opacity-60",
      )}
      onDragOver={(event) => {
        if (disabled) return;
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(event) => {
        event.preventDefault();
        setDragging(false);
        if (disabled) return;
        emit(event.dataTransfer.files);
      }}
    >
      <input
        ref={inputRef}
        type="file"
        multiple
        accept=".map,application/json"
        hidden
        onChange={(event) => emit(event.currentTarget.files)}
      />
      <FileCode2 size={28} className="text-tertiary" />
      <div className="text-[13px] font-[600] text-ink">Drop .js.map files here</div>
      <div className="max-w-md text-[11px] leading-[1.6] text-tertiary">
        {hint ??
          "Drag one or more source maps in, or click to pick from disk. Files without a top-level `debug_id` are skipped."}
      </div>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={disabled}
        className="mt-1 inline-flex items-center gap-1.5 rounded-lg border border-hairline bg-white/[0.04] px-3 py-1.5 text-[12px] text-muted hover:border-hairline-strong hover:bg-white/[0.08] hover:text-ink disabled:cursor-not-allowed disabled:opacity-60"
      >
        <Upload size={13} /> Choose files
      </button>
    </div>
  );
}
