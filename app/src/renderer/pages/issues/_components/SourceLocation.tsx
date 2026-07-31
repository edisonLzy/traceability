import { Badge } from "@renderer/components/ui/badge";
import { cn } from "@renderer/lib/utils";

export interface SourceLocationData {
  file: string;
  line: number;
  column: number;
  function?: string;
  context?: {
    lines: string[];
    startLine: number;
    errorLine: number;
  };
  generated?: {
    file: string;
    line: number;
    column: number;
  };
}

export function SourceLocation({ location }: { location: SourceLocationData }) {
  return (
    <div className="border-b border-hairline bg-surface-2">
      <div className="flex items-start justify-between gap-3 px-4.5 py-3.5">
        <div>
          <div className="text-[11px] uppercase tracking-[0.06em] text-tertiary">
            Source map resolved location
          </div>
          <div className="mt-1 break-all font-mono text-xs text-[#bfc7ff]">
            {location.file}:{location.line}:{location.column}
          </div>
        </div>
        {location.function && <Badge variant="fixed">{location.function}</Badge>}
      </div>
      {location.context && (
        <pre
          className={cn(
            "m-0 overflow-auto bg-[#090a0b] px-5 py-4.5 font-mono text-xs leading-7 text-[#c7cbd3]",
            "max-h-50 border-y border-hairline",
          )}
        >
          {location.context.lines.map((line, index) => {
            const lineNumber = location.context!.startLine + index;
            return (
              <span
                className={cn(
                  "block",
                  lineNumber === location.context!.errorLine &&
                    "-mx-5 bg-primary/15 px-5 text-white",
                )}
                key={lineNumber}
              >
                <span className="inline-block w-7.5 select-none text-[#474b52]">{lineNumber}</span>
                {line}
              </span>
            );
          })}
        </pre>
      )}
      {location.generated && (
        <div className="px-4.5 py-2 font-mono text-[11px] text-tertiary">
          Generated: {location.generated.file}:{location.generated.line}:{location.generated.column}
        </div>
      )}
    </div>
  );
}
