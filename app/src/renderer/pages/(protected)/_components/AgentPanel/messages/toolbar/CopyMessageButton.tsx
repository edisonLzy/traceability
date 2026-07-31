import { cn } from "@renderer/lib/utils";
import { Check, Copy } from "lucide-react";
import { useCallback, useState } from "react";

interface CopyMessageButtonProps {
  text: string;
}

export function CopyMessageButton({ text }: CopyMessageButtonProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    navigator.clipboard
      .writeText(text)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      })
      .catch(() => {
        // silently fail
      });
  }, [text]);

  return (
    <button
      type="button"
      onClick={handleCopy}
      className={cn(
        "inline-flex h-6 items-center gap-1 rounded-[6px] border border-transparent px-1.5 text-[10px] font-[610] text-subtle transition-colors hover:border-hairline hover:bg-white/[0.055] hover:text-ink focus-visible:border-primary/55",
        copied && "text-signal-green",
      )}
    >
      {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
      {copied ? "已复制" : "复制"}
    </button>
  );
}
