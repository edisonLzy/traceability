import { Button } from "@renderer/components/ui/button";
import { authenticatedFetch, resolveRendererServerUrl } from "@renderer/lib/trpc";
import type { AppRouterOutputs } from "@renderer/lib/trpc-types";
import { Download, FileArchive, LoaderCircle, RefreshCw } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { formatBytes } from "./minidump-utils";

type Minidump = AppRouterOutputs["minidumps"]["listForIssue"][number];

export function MinidumpAttachments({
  minidumps,
  loading,
  failed,
  onRetry,
}: {
  minidumps: Minidump[];
  loading: boolean;
  failed: boolean;
  onRetry: () => void;
}) {
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const download = async (minidump: Minidump) => {
    setDownloadingId(minidump.id);
    try {
      const response = await authenticatedFetch(
        `${resolveRendererServerUrl()}/api/minidumps/${minidump.id}/download`,
      );
      if (!response.ok) throw new Error(`Download failed (HTTP ${response.status})`);
      const objectUrl = URL.createObjectURL(await response.blob());
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = minidump.fileName;
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Minidump download failed");
    } finally {
      setDownloadingId(null);
    }
  };

  return (
    <section className="overflow-hidden rounded-2xl border border-hairline bg-overlay">
      <div className="flex items-center justify-between border-b border-hairline px-4 py-3">
        <div className="text-[12px] font-[630] text-muted">
          Minidump attachments · {minidumps.length}
        </div>
        <span className="text-[10px] text-tertiary">Native process memory</span>
      </div>

      {loading ? (
        <div className="flex items-center justify-center gap-2 px-5 py-10 text-[12px] text-tertiary">
          <LoaderCircle className="animate-spin" size={14} /> Loading minidumps…
        </div>
      ) : failed ? (
        <div className="flex items-center justify-between gap-3 px-4 py-6">
          <span className="text-[12px] text-tertiary">Could not load minidump metadata.</span>
          <Button size="sm" onClick={onRetry}>
            <RefreshCw size={13} /> Retry
          </Button>
        </div>
      ) : minidumps.length === 0 ? (
        <div className="px-5 py-10 text-center text-[12px] text-tertiary">
          No minidump is attached to this native crash yet.
        </div>
      ) : (
        <div className="divide-y divide-hairline">
          {minidumps.map((minidump) => (
            <div className="flex items-start gap-3 px-4 py-3.5" key={minidump.id}>
              <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg border border-hairline bg-surface-1 text-tertiary">
                <FileArchive size={15} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[12px] font-[600] text-ink">{minidump.fileName}</div>
                <div className="mt-1 text-[10px] text-tertiary">
                  {formatBytes(minidump.sizeBytes)} ·{" "}
                  {new Date(minidump.createdAt).toLocaleString()}
                </div>
                <div
                  className="mt-1 truncate font-mono text-[10px] text-tertiary"
                  title={minidump.eventId ?? undefined}
                >
                  Event {minidump.eventId ?? "unlinked"}
                </div>
                <div
                  className="mt-0.5 truncate font-mono text-[10px] text-tertiary"
                  title={minidump.sha256}
                >
                  SHA-256 {minidump.sha256}
                </div>
              </div>
              <Button
                size="sm"
                disabled={downloadingId === minidump.id}
                onClick={() => void download(minidump)}
                aria-label={`Download ${minidump.fileName}`}
              >
                {downloadingId === minidump.id ? (
                  <LoaderCircle className="animate-spin" size={13} />
                ) : (
                  <Download size={13} />
                )}
                Download
              </Button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
