import { readFile } from "node:fs/promises";
import { basename } from "node:path";

import {
  NonInteractiveAuthError,
  ensureConfig,
  reconfigureAfter401,
} from "./config-interactive.js";
import type { CliConfig } from "./config.js";

export interface UploadSourcemapInput {
  filePath: string;
  projectSlug: string;
  debugId: string;
}

export interface UploadSourcemapResponse {
  id: string;
  debugId: string;
  sizeBytes: number;
  sha256: string;
  reused: boolean;
}

async function postOnce(cfg: CliConfig, input: UploadSourcemapInput): Promise<Response> {
  const body = await readFile(input.filePath);
  const form = new FormData();
  form.set("projectSlug", input.projectSlug);
  form.set("debugId", input.debugId);
  form.set("fileName", basename(input.filePath));
  form.set(
    "map",
    new Blob([new Uint8Array(body)], { type: "application/json" }),
    basename(input.filePath),
  );

  return fetch(`${cfg.server.replace(/\/$/, "")}/api/sourcemaps/upload`, {
    method: "POST",
    body: form,
    headers: { Authorization: `Bearer ${cfg.token}` },
  });
}

/**
 * POST a single `.map` file to the server's multipart upload endpoint. Uses
 * `undici` FormData (available on Node 22 as globalThis.FormData / File) — the
 * tRPC client can't handle multipart so we build the request by hand.
 *
 * On HTTP 401 we prompt the user to re-enter credentials (TTY only) and retry
 * exactly once. Non-TTY environments propagate the failure as a normal
 * `upload failed: HTTP 401` error.
 */
export async function uploadSourcemap(
  input: UploadSourcemapInput,
): Promise<UploadSourcemapResponse> {
  let cfg = await ensureConfig();
  let response = await postOnce(cfg, input);

  if (response.status === 401) {
    try {
      cfg = await reconfigureAfter401(cfg);
      response = await postOnce(cfg, input);
    } catch (err) {
      if (!(err instanceof NonInteractiveAuthError)) throw err;
      // Fall through: `response` still carries the original 401, which the
      // not-ok branch below will surface with the server's error body.
    }
  }

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`upload failed: HTTP ${response.status} ${text.slice(0, 500)}`);
  }
  return (await response.json()) as UploadSourcemapResponse;
}
