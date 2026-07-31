import { readFile } from "node:fs/promises";
import { basename } from "node:path";

import { getSession, refreshOrLogin, type AuthSession } from "./auth.js";
import { getConfig } from "./config.js";

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

async function postOnce(
  server: string,
  session: AuthSession,
  input: UploadSourcemapInput,
): Promise<Response> {
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

  return fetch(`${server.replace(/\/$/, "")}/api/sourcemaps/upload`, {
    method: "POST",
    body: form,
    headers: { Authorization: `Bearer ${session.accessToken}` },
  });
}

/**
 * POST a single `.map` file to the server's multipart upload endpoint. Uses
 * `undici` FormData (available on Node 22 as globalThis.FormData / File) — the
 * tRPC client can't handle multipart so we build the request by hand.
 *
 * On HTTP 401 it rotates the refresh token through the shared public auth
 * client and retries exactly once. Failed authentication clears the session;
 * non-interactive callers receive AuthRequiredError.
 */
export async function uploadSourcemap(
  input: UploadSourcemapInput,
): Promise<UploadSourcemapResponse> {
  const server = getConfig().server;
  let session = getSession(getConfig());
  let response = await postOnce(server, session, input);

  if (response.status === 401) {
    session = await refreshOrLogin(session);
    response = await postOnce(server, session, input);
  }

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`upload failed: HTTP ${response.status} ${text.slice(0, 500)}`);
  }
  return (await response.json()) as UploadSourcemapResponse;
}
