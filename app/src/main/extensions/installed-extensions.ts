import explorerExtension from "../../extensions/builtins/explorer/main/index.js";
import issuesExtension from "../../extensions/builtins/issues/main/index.js";
import projectsExtension from "../../extensions/builtins/projects/main/index.js";
import subagentsExtension from "../../extensions/builtins/subagents/main/index.js";
import type { AnyMainExtensionDefinition } from "../../extensions/core/main/index.js";

export const installedMainExtensions = [
  subagentsExtension,
  projectsExtension,
  issuesExtension,
  explorerExtension,
] satisfies AnyMainExtensionDefinition[];
