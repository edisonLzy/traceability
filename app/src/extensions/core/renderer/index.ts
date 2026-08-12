export { RendererExtensionBridge } from "./bridge";
export { ExtensionsContextAPIProvider, useExtensionsContextAPI } from "./contextAPI";
export { defineRendererExtension } from "./define";
export {
  createExtensionIPC,
  useAssistantBlock,
  useExtensions,
  usePluginPromptInputExtensions,
  usePluginSlashCommands,
  useSharedPromptEditor,
} from "./hooks";
export { parseExtensionParts } from "./parser";
export { ExtensionProvider, useExtensionRegistry } from "./provider";
export { RendererExtensionRegistry } from "./registry";

export type { ExtensionsContextAPI, ExtensionsContextAPIProviderProps } from "./contextAPI";
export type {
  AssistantBlockRegistration,
  AssistantBlockRegistrar,
  AssistantBlockRenderProps,
  DefinedAssistantBlockRegistration,
  LegacyAssistantBlockRegistration,
  RendererExtensionContext,
  RendererExtensionDefinition,
  RendererSlashCommand,
  RendererSlashCommandRunContext,
  StreamdownRehypePluginComposer,
  StreamdownRehypePlugins,
  TipTapExtensionRegistration,
} from "./define";
export type { RendererExtensionIPC } from "./ipc";
export type { ParsedExtensionPart } from "./parser";
export { SharedPromptEditor } from "./sharedPromptEditor";
