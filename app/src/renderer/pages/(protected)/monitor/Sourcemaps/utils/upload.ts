import { getRendererAccessToken, resolveRendererServerUrl } from "@renderer/lib/trpc";

export interface UploadSourcemapResult {
  id: string;
  debugId: string;
  fileName: string;
  sizeBytes: number;
  sha256: string;
  reused: boolean;
}

export interface UploadSourcemapInput {
  file: File;
  projectSlug: string;
  debugId: string;
  /**
   * File name to record on the artifact. Defaults to `file.name`. Set when the
   * `.map` was named `chunk.js.map` on disk but you want it recorded under a
   * friendlier label.
   */
  displayFileName?: string;
}

/**
 * POST a single `.map` file to the server's multipart upload endpoint. The
 * server-side route lives in `server/src/modules/sourcemaps/route.ts` and
 * expects the same shape the CLI produces (see packages/cli/src/lib/upload.ts).
 */
export async function uploadSourcemap(input: UploadSourcemapInput): Promise<UploadSourcemapResult> {
  const form = new FormData();
  form.set("projectSlug", input.projectSlug);
  form.set("debugId", input.debugId);
  form.set("fileName", input.displayFileName ?? input.file.name);
  form.set("map", input.file, input.file.name);

  const response = await fetch(`${resolveRendererServerUrl()}/api/sourcemaps/upload`, {
    method: "POST",
    body: form,
    headers: getRendererAccessToken()
      ? { Authorization: `Bearer ${getRendererAccessToken()}` }
      : {},
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`upload failed: HTTP ${response.status} ${text.slice(0, 400)}`);
  }
  return (await response.json()) as UploadSourcemapResult;
}

/**
 * Read the top-level `debug_id` field out of a browser File containing a
 * source map. Returns `null` when the file isn't valid JSON or has no
 * debug_id — the caller surfaces that to the user with a toast.
 */
export async function readMapDebugId(file: File): Promise<string | null> {
  try {
    const text = await file.text();
    const parsed = JSON.parse(text) as { debug_id?: unknown; debugId?: unknown };
    const value = typeof parsed.debug_id === "string" ? parsed.debug_id : parsed.debugId;
    return typeof value === "string" && value.length > 0 ? value : null;
  } catch {
    return null;
  }
}
