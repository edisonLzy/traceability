import { fileURLToPath } from "node:url";

export function isMainModule(importMetaUrl: string): boolean {
  return process.argv[1] === fileURLToPath(importMetaUrl);
}
