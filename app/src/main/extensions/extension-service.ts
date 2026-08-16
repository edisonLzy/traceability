import type { BrowserWindow } from "electron";

import type {
  AskUserQuestionInput,
  AskUserQuestionResult,
} from "../../extensions/core/common/index.js";
import { MainExtensionBridge } from "../../extensions/core/main/index.js";
import type {
  ExtensionAgentModel,
  ExtensionAgentToolOptions,
} from "../../extensions/core/main/index.js";
import type { SystemPromptBuilder } from "../prompt/index.js";
import type { AppTool } from "../tools/index.js";
import {
  buildGenerativeUiSystemPrompt,
  createRenderUiTool,
  shouldAddRenderUiTool,
} from "./generative-ui.js";
import { installedMainExtensions } from "./installed-extensions.js";
import { ExtensionRuntimeService } from "./runtime-service.js";

export interface ExtensionToolRuntimeContext {
  getModel(): ExtensionAgentModel | undefined;
  getSessionId(): string | undefined;
  askUserQuestion(input: AskUserQuestionInput): Promise<AskUserQuestionResult>;
}

/**
 * Main-process extension host. Wires installed main extensions into the
 * {@link MainExtensionBridge}, feeds their system prompts into the
 * {@link SystemPromptService}, and binds their tools to the calling runtime's
 * context via {@link ExtensionRuntimeService.runWithContext}.
 */
export class ExtensionService extends MainExtensionBridge implements SystemPromptBuilder {
  private readonly runtimeService: ExtensionRuntimeService;

  constructor(
    runtimeService: ExtensionRuntimeService,
    getBrowserWindow: () => BrowserWindow | null,
  ) {
    super(installedMainExtensions, {
      extensionRuntime: runtimeService,
      getBrowserWindow,
    });
    this.runtimeService = runtimeService;
    runtimeService.setExtensionService(this);
    this.initialize();
  }

  buildSystemPrompt(raw: string): string {
    const prompts = [
      ...this.getSystemPrompts(),
      buildGenerativeUiSystemPrompt(this.getAssistantBlockDefinitions()),
    ]
      .filter(Boolean)
      .join("\n\n");
    if (!prompts) return raw;
    return prompts + "\n\n" + raw;
  }

  getToolsForRuntime(
    context: ExtensionToolRuntimeContext,
    options: ExtensionAgentToolOptions = {},
  ) {
    if (options.includeExtensions === false) {
      return [];
    }

    const excluded = new Set(options.excludeToolNames ?? []);

    const tools = this.getTools().filter((tool) => !excluded.has(tool.name));
    if (
      shouldAddRenderUiTool(
        tools.map((tool) => tool.name),
        this.getAssistantBlockDefinitions(),
        excluded,
      )
    ) {
      tools.push(createRenderUiTool());
    }

    return tools.map((tool) => this.bindToolToRuntimeContext(tool as AppTool, context));
  }

  private bindToolToRuntimeContext(tool: AppTool, context: ExtensionToolRuntimeContext): AppTool {
    return {
      ...tool,
      execute: async (...args: Parameters<AppTool["execute"]>) => {
        return this.runtimeService.runWithContext(context, () => tool.execute(...args));
      },
    };
  }
}
