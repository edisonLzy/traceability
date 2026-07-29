import type { Dirent } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";

import { checkbox } from "@inquirer/prompts";
import { Command } from "commander";

import { uploadSourcemap } from "../lib/upload.js";

interface Candidate {
  path: string;
  debugId: string;
}

export function sourcemapCommand(program: Command): void {
  const cmd = program.command("sourcemap").description("manage source maps");

  cmd
    .command("upload")
    .description("scan a build output directory and upload .js.map files that carry a debug_id")
    .requiredOption("--project <slug>", "project slug")
    .requiredOption("--dist <dir>", "directory to scan for *.js.map")
    .option("--concurrency <n>", "parallel uploads", (v) => Number.parseInt(v, 10), 4)
    .option(
      "-s, --select",
      "interactively pick which .js.map files to upload (default: upload all)",
      false,
    )
    .option("--yes", "skip the interactive picker even when --select is set", false)
    .action(
      async (opts: {
        project: string;
        dist: string;
        concurrency: number;
        select: boolean;
        yes: boolean;
      }) => {
        const discovered = await findSourcemaps(opts.dist);
        if (discovered.length === 0) {
          console.error(`No .js.map files with a debug_id found in ${opts.dist}.`);
          process.exitCode = 1;
          return;
        }

        const maps = await maybePickMaps(discovered, opts.dist, opts.select && !opts.yes);
        if (maps.length === 0) {
          console.log("No sourcemaps selected. Nothing to upload.");
          return;
        }

        let uploaded = 0;
        let reused = 0;
        let failed = 0;
        let cursor = 0;
        const concurrency = Math.max(1, Math.min(opts.concurrency, 16));

        const workers = Array.from({ length: concurrency }, async () => {
          while (cursor < maps.length) {
            const index = cursor++;
            const candidate = maps[index];
            if (!candidate) continue;
            const label = relative(opts.dist, candidate.path);
            try {
              const result = await uploadSourcemap({
                filePath: candidate.path,
                projectSlug: opts.project,
                debugId: candidate.debugId,
              });
              if (result.reused) reused += 1;
              else uploaded += 1;
              console.log(
                `  ${result.reused ? "reused" : "uploaded"}  ${label}  (${candidate.debugId})`,
              );
            } catch (error) {
              failed += 1;
              console.error(`  failed    ${label}: ${(error as Error).message}`);
            }
          }
        });
        await Promise.all(workers);

        console.log(`\nDone. uploaded=${uploaded} reused=${reused} failed=${failed}`);
        if (failed > 0) process.exitCode = 1;
      },
    );
}

/**
 * When `interactive` is true and stdin is a TTY, prompt the user with a
 * checkbox picker so they can pick which maps to upload. Falls back to the
 * full list when stdin is not a TTY (e.g. CI) so `--select` in a pipeline
 * does not hang; a warning explains the fallback.
 */
async function maybePickMaps(
  candidates: Candidate[],
  root: string,
  interactive: boolean,
): Promise<Candidate[]> {
  if (!interactive) return candidates;
  if (!process.stdin.isTTY) {
    console.warn(
      "--select requires an interactive terminal; uploading all discovered maps instead.",
    );
    return candidates;
  }

  const answer = await checkbox<string>({
    message: `Select sourcemaps to upload (${candidates.length} found):`,
    pageSize: Math.min(20, Math.max(candidates.length, 5)),
    loop: false,
    choices: candidates.map((c) => ({
      value: c.path,
      name: `${relative(root, c.path)}  (${c.debugId})`,
      checked: true,
    })),
  });

  const selected = new Set(answer);
  return candidates.filter((c) => selected.has(c.path));
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
  // Stable, human-friendly order so the picker's shown order matches disk order.
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
