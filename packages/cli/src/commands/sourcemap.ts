import type { Dirent } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";

import { isCancel, multiselect } from "@clack/prompts";
import type { CAC } from "cac";

import { AuthRequiredError } from "../lib/auth.js";
import { uploadSourcemap } from "../lib/upload.js";

interface Candidate {
  path: string;
  debugId: string;
}

interface SourcemapOptions {
  project?: string;
  dist?: string;
  concurrency?: string;
  select?: boolean;
  yes?: boolean;
}

export function sourcemapCommand(cli: CAC): void {
  cli
    .command("sourcemap <action>", "manage source maps")
    .option("--project <slug>", "project slug")
    .option("--dist <dir>", "directory to scan for *.js.map")
    .option("--concurrency <n>", "parallel uploads", { default: "4" })
    .option("-s, --select", "interactively pick source maps")
    .option("--yes", "skip the interactive picker even when --select is set")
    .action(async (action: string, opts: SourcemapOptions) => {
      if (action !== "upload") throw new Error(`Unknown sourcemap action: ${action}`);
      if (!opts.project || !opts.dist) {
        throw new Error("sourcemap upload requires --project <slug> and --dist <dir>");
      }
      const discovered = await findSourcemaps(opts.dist);
      if (discovered.length === 0) {
        throw new Error(`No .js.map files with a debug_id found in ${opts.dist}.`);
      }

      const maps = await maybePickMaps(discovered, opts.dist, Boolean(opts.select && !opts.yes));
      if (maps.length === 0) {
        console.log("No sourcemaps selected. Nothing to upload.");
        return;
      }

      let uploaded = 0;
      let reused = 0;
      let failed = 0;
      let cursor = 0;
      const concurrency = Math.max(
        1,
        Math.min(Number.parseInt(opts.concurrency ?? "4", 10) || 4, 16),
      );

      const workers = Array.from({ length: concurrency }, async () => {
        while (cursor < maps.length) {
          const index = cursor++;
          const candidate = maps[index];
          if (!candidate) continue;
          const label = relative(opts.dist as string, candidate.path);
          try {
            const result = await uploadSourcemap({
              filePath: candidate.path,
              projectSlug: opts.project as string,
              debugId: candidate.debugId,
            });
            if (result.reused) reused += 1;
            else uploaded += 1;
            console.log(
              `  ${result.reused ? "reused" : "uploaded"}  ${label}  (${candidate.debugId})`,
            );
          } catch (error) {
            if (error instanceof AuthRequiredError) throw error;
            failed += 1;
            console.error(`  failed    ${label}: ${(error as Error).message}`);
          }
        }
      });
      await Promise.all(workers);

      console.log(`\nDone. uploaded=${uploaded} reused=${reused} failed=${failed}`);
      if (failed > 0) process.exitCode = 1;
    });
}

async function maybePickMaps(
  candidates: Candidate[],
  root: string,
  interactive: boolean,
): Promise<Candidate[]> {
  if (!interactive) return candidates;
  if (!process.stdin.isTTY) {
    throw new Error("--select requires an interactive terminal; omit --select to upload all maps.");
  }
  const selected = await multiselect({
    message: `Select sourcemaps to upload (${candidates.length} found):`,
    options: candidates.map((candidate) => ({
      value: candidate.path,
      label: `${relative(root, candidate.path)}  (${candidate.debugId})`,
    })),
    initialValues: candidates.map((candidate) => candidate.path),
  });
  if (isCancel(selected)) throw new Error("Operation cancelled");
  const paths = new Set(selected);
  return candidates.filter((candidate) => paths.has(candidate.path));
}

async function findSourcemaps(root: string): Promise<Candidate[]> {
  const results: Candidate[] = [];
  const stack: string[] = [root];
  while (stack.length > 0) {
    const dir = stack.pop() as string;
    let entries: Dirent[];
    try {
      entries = (await readdir(dir, { withFileTypes: true })) as Dirent[];
    } catch {
      continue;
    }
    for (const entry of entries) {
      const name = typeof entry.name === "string" ? entry.name : String(entry.name);
      const full = join(dir, name);
      if (entry.isDirectory()) {
        stack.push(full);
        continue;
      }
      if (!entry.isFile() || !name.endsWith(".map")) continue;
      const debugId = await readDebugId(full);
      if (debugId) results.push({ path: full, debugId });
      else console.warn(`  skipped   ${relative(root, full)}  (no debug_id)`);
    }
  }
  results.sort((a, b) => a.path.localeCompare(b.path));
  return results;
}

async function readDebugId(path: string): Promise<string | null> {
  try {
    const contents = await readFile(path, "utf8");
    const parsed = JSON.parse(contents) as { debug_id?: unknown; debugId?: unknown };
    const value = typeof parsed.debug_id === "string" ? parsed.debug_id : parsed.debugId;
    return typeof value === "string" && value.length > 0 ? value : null;
  } catch {
    return null;
  }
}
