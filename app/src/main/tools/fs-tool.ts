import { readFile } from "node:fs/promises";

import { Type } from "@earendil-works/pi-ai";
import type { Static } from "@earendil-works/pi-ai";

import type { AppTool } from "./types.js";

const PathParams = Type.Object({
  path: Type.String({ description: "Absolute path to the file to read" }),
});

export const fsReadTextFileTool: AppTool<typeof PathParams> = {
  name: "fs_read_text_file",
  label: "Read File",
  description: "Read the contents of a text file from the local filesystem",
  riskLevel: "medium",
  parameters: PathParams,
  async execute(toolCallId, params) {
    const { path } = params as Static<typeof PathParams>;

    try {
      const content = await readFile(path, "utf-8");
      return {
        content: [{ type: "text", text: content }],
        details: { toolCallId, bytesRead: content.length },
      };
    } catch (err) {
      return {
        content: [{ type: "text", text: `Error: ${String(err)}` }],
        details: { toolCallId },
      };
    }
  },
};
