import issuesExtension from "../../extensions/builtins/issues/main/index.js";
import projectsExtension from "../../extensions/builtins/projects/main/index.js";
import subagentsExtension from "../../extensions/builtins/subagents/main/index.js";
import type { AnyMainExtensionDefinition } from "../../extensions/core/main/index.js";

export const installedMainExtensions = [
  subagentsExtension,
  projectsExtension,
  issuesExtension,
] satisfies AnyMainExtensionDefinition[];
