import type { AnyExtension, Editor, Range } from "@tiptap/core";
import type { ComponentType, JSX } from "react";
import type { Components as StreamdownComponents, StreamdownProps } from "streamdown";
import type { output, ZodType } from "zod";

import type { AssistantBlockDefinition } from "../../../shared/assistant-block";
import type { ExtensionMetadata } from "../common/ipc/index";

export interface RendererSlashCommandRunContext {
  editor: Editor;
  range: Range;
}

export interface RendererSlashCommand {
  id: string;
  group: string;
  name: string;
  description: string;
  extra?: string;
  run(ctx: RendererSlashCommandRunContext): void | Promise<void>;
}

/**
 * A fully-configured TipTap extension (Extension, Node, or Mark) supplied by a
 * renderer extension. The host merges it into the prompt editor's extensions
 * array. The author owns all configuration at registration time.
 */
export type TipTapExtensionRegistration = AnyExtension;

export interface AssistantBlockRenderProps<TProps = unknown> {
  props: TProps;
  raw: string;
}

export interface DefinedAssistantBlockRegistration<TSchema extends ZodType = ZodType> {
  definition: AssistantBlockDefinition<TSchema>;
  render: ComponentType<AssistantBlockRenderProps<output<TSchema>>>;
}

export interface LegacyAssistantBlockRegistration<TProps = Record<string, unknown>> {
  type: string;
  render: ComponentType<AssistantBlockRenderProps<TProps>>;
}

export type AssistantBlockRegistration<TSchema extends ZodType = ZodType> =
  | DefinedAssistantBlockRegistration<TSchema>
  | LegacyAssistantBlockRegistration;

export interface AssistantBlockRegistrar {
  register<TSchema extends ZodType>(block: DefinedAssistantBlockRegistration<TSchema>): void;
  register(block: LegacyAssistantBlockRegistration): void;
}

export type StreamdownComponent = ComponentType<any> | keyof JSX.IntrinsicElements;
export type StreamdownComponentComposer = (Base: StreamdownComponent) => StreamdownComponent;
export type StreamdownComponentComposerMap = Partial<
  Record<keyof StreamdownComponents | string, StreamdownComponentComposer>
>;
export type StreamdownRehypePlugins = NonNullable<StreamdownProps["rehypePlugins"]>;
export type StreamdownRehypePluginComposer = (
  plugins: StreamdownRehypePlugins,
) => StreamdownRehypePlugins;

export interface RendererExtensionContext {
  readonly extension: ExtensionMetadata;
  slashCommands: {
    register(command: RendererSlashCommand): void;
  };
  assistantBlocks: AssistantBlockRegistrar;
  streamdown: {
    registerComponents(components: StreamdownComponentComposerMap): void;
    registerRehypePlugins(composer: StreamdownRehypePluginComposer): void;
  };
  promptInput: {
    registerExtension(extension: TipTapExtensionRegistration): void;
  };
}

export type RendererExtensionSetup = (ctx: RendererExtensionContext) => void;

export interface RendererExtensionDefinition extends ExtensionMetadata {
  setup: RendererExtensionSetup;
}

export function defineRendererExtension(
  definition: RendererExtensionDefinition,
): RendererExtensionDefinition {
  return definition;
}
