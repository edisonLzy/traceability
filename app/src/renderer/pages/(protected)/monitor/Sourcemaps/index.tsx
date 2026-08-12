import { trpc } from "@renderer/lib/trpc";
import { cn, relativeTime } from "@renderer/lib/utils";
import { projectStore } from "@renderer/store/project";
import { Copy, Trash2 } from "lucide-react";
import { useCallback, useState } from "react";
import { toast } from "sonner";
import { useStore } from "zustand";

import { DropZone } from "./components/DropZone";
import { readMapDebugId, uploadSourcemap } from "./utils/upload";

export function SourcemapsPage() {
  const currentProject = useStore(projectStore, (s) => s.currentProject);
  const projectId = currentProject?.id ?? "";
  const projectSlug = currentProject?.slug;

  const artifactsQuery = trpc.sourcemaps.listByProject.useQuery(projectId ?? "", {
    enabled: Boolean(projectId),
    staleTime: 15_000,
  });
  const utils = trpc.useUtils();
  const removeMutation = trpc.sourcemaps.remove.useMutation({
    onSuccess: () => {
      if (projectId) void utils.sourcemaps.listByProject.invalidate(projectId);
    },
  });

  const [uploading, setUploading] = useState(false);

  const handleFiles = useCallback(
    async (files: File[]) => {
      if (!projectId || !projectSlug) {
        toast("Select a project first.");
        return;
      }
      setUploading(true);
      let uploaded = 0;
      let reused = 0;
      let failed = 0;
      for (const file of files) {
        const debugId = await readMapDebugId(file);
        if (!debugId) {
          toast(`Skipped ${file.name}: no debug_id in the map.`);
          failed += 1;
          continue;
        }
        try {
          const result = await uploadSourcemap({ file, projectSlug, debugId });
          if (result.reused) reused += 1;
          else uploaded += 1;
        } catch (error) {
          failed += 1;
          toast(`${file.name}: ${(error as Error).message}`);
        }
      }
      setUploading(false);
      toast(`Sourcemap upload: uploaded=${uploaded} reused=${reused} failed=${failed}`);
      if (uploaded > 0 || reused > 0) {
        await utils.sourcemaps.listByProject.invalidate(projectId);
      }
    },
    [projectId, projectSlug, utils],
  );

  return (
    <div className="mx-auto block min-h-full max-w-[1260px] px-[22px] pt-[22px] pb-12">
      <div className="mb-5">
        <h1 className="m-0 text-[24px] font-[680] leading-[1.12] tracking-[-0.04em]">Sourcemaps</h1>
        <p className="mt-1.5 max-w-2xl text-[12px] text-tertiary">
          Upload the `.js.map` files emitted by your build so the worker can rewrite minified stack
          frames back to their original source positions. Files need a top-level `debug_id` matching
          the one embedded in each JS bundle — Vite / webpack builds using `@sentry/vite-plugin` (or
          equivalent) produce these automatically.
        </p>
      </div>

      <div className="mb-5">
        <DropZone
          onFiles={handleFiles}
          disabled={!projectId || uploading}
          hint={
            projectId
              ? "Drag .js.map files in, or click to pick from disk. Files without a top-level `debug_id` are skipped."
              : "Select a project from the header to enable uploads."
          }
        />
      </div>

      <section className="glass-panel overflow-hidden rounded-[18px]">
        <div className="flex items-center justify-between border-b border-hairline px-4 py-3 text-[12px] font-[630] text-muted">
          <span>Artifacts {artifactsQuery.data ? `· ${artifactsQuery.data.length}` : ""}</span>
          {projectSlug && (
            <span className="font-mono text-[11px] text-tertiary">project: {projectSlug}</span>
          )}
        </div>

        {artifactsQuery.isLoading && (
          <div className="px-5 py-12 text-center text-[12px] text-tertiary">Loading…</div>
        )}

        {!artifactsQuery.isLoading && (artifactsQuery.data?.length ?? 0) === 0 && (
          <div className="px-5 py-12 text-center text-[12px] text-tertiary">
            No source maps uploaded yet. Drop maps above, or run{" "}
            <code className="rounded bg-overlay-strong px-1 py-0.5 font-mono text-[11px] text-ink">
              traceability sourcemap upload --project {projectSlug ?? "&lt;slug&gt;"} --dist ./dist
            </code>{" "}
            in your build.
          </div>
        )}

        {(artifactsQuery.data?.length ?? 0) > 0 && (
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-hairline text-[10px] uppercase tracking-[0.08em] text-tertiary">
                <th className="px-4 py-2 font-[600]">File</th>
                <th className="px-4 py-2 font-[600]">Debug ID</th>
                <th className="px-4 py-2 font-[600]">Size</th>
                <th className="px-4 py-2 font-[600]">Uploaded</th>
                <th className="px-4 py-2 font-[600]" />
              </tr>
            </thead>
            <tbody>
              {artifactsQuery.data!.map((row) => (
                <tr key={row.id} className="border-b border-hairline last:border-b-0">
                  <td className="px-4 py-2.5 font-mono text-[11px] text-muted">{row.fileName}</td>
                  <td className="px-4 py-2.5">
                    <DebugIdCell debugId={row.debugId} />
                  </td>
                  <td className="px-4 py-2.5 text-[11px] tabular-nums text-muted">
                    {humanBytes(row.sizeBytes)}
                  </td>
                  <td className="px-4 py-2.5 text-[11px] text-muted">
                    {relativeTime(row.uploadedAt.toString())}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <button
                      type="button"
                      title="Remove artifact"
                      onClick={() => {
                        if (!projectId) return;
                        if (!confirm(`Delete sourcemap for ${row.fileName}?`)) return;
                        removeMutation.mutate({ projectId, artifactId: row.id });
                      }}
                      className={cn(
                        "inline-flex items-center gap-1 rounded-md border border-hairline px-2 py-1 text-[11px] text-muted transition-colors hover:border-danger/50 hover:text-danger",
                        removeMutation.isPending && "cursor-wait opacity-60",
                      )}
                      disabled={removeMutation.isPending}
                    >
                      <Trash2 size={12} /> Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}

function DebugIdCell({ debugId }: { debugId: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 font-mono text-[11px] text-muted">
      {debugId.slice(0, 8)}
      <button
        type="button"
        title="Copy full debug_id"
        onClick={() => {
          void navigator.clipboard.writeText(debugId).then(
            () => toast("Debug ID copied to clipboard."),
            () => toast("Copy failed."),
          );
        }}
        className="rounded p-0.5 text-tertiary transition-colors hover:bg-overlay hover:text-ink"
      >
        <Copy size={11} />
      </button>
    </span>
  );
}

function humanBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}
