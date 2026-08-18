import { usePluginPromptInputExtensions, usePluginSlashCommands } from "@extensions/core/renderer";
import {
  type HashCommandSelection,
  useHashCommandsExtension,
} from "@renderer/components/richtext/extensions/hash-commands";
import { promptGhostSuggestionExtension } from "@renderer/components/richtext/extensions/prompt-ghost-suggestion";
import {
  type SlashCommandSelection,
  useSlashCommandsExtension,
} from "@renderer/components/richtext/extensions/slash-commands";
import { insertIssueNode, issueNode } from "@renderer/components/richtext/inline/issue-node";
import { insertSkillNode, skillNode } from "@renderer/components/richtext/inline/skill-node";
import type { CommandItem } from "@renderer/components/richtext/types";
import { useIssues } from "@renderer/hooks/use-issues";
import { projectStore } from "@renderer/store/project";
import type { EditorOptions, JSONContent } from "@tiptap/core";
import Placeholder from "@tiptap/extension-placeholder";
import { useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { useEffect, useMemo, useState } from "react";
import { useStore } from "zustand";

import { useAgentSkills } from "./useAgentSkills";

interface VirtualElement {
  getBoundingClientRect: () => DOMRect;
}

export interface UseChatEditorOptions {
  content?: JSONContent;
  disabled: boolean;
  onCreate?: EditorOptions["onCreate"];
  onDestroy?: EditorOptions["onDestroy"];
  getFloatingReference?: () => Element | VirtualElement | null;
}

export function useChatEditor({
  content,
  disabled,
  onCreate: onCreateFromUser,
  onDestroy: onDestroyFromUser,
  getFloatingReference,
}: UseChatEditorOptions) {
  const [hasContent, setHasContent] = useState(false);

  const skillItems = useSkillsCommandItems();
  const issueItems = useIssueCommandItems();
  const pluginCommands = usePluginSlashCommands();
  const pluginPromptInputExtensions = usePluginPromptInputExtensions();
  const pluginItems = useMemo(
    () =>
      pluginCommands.map(
        (cmd): CommandItem => ({
          id: cmd.id,
          group: cmd.group,
          name: cmd.name,
          description: cmd.description,
          extra: cmd.extra,
        }),
      ),
    [pluginCommands],
  );
  const slashCommands = [...skillItems, ...pluginItems];

  const handleSelectCommand = ({ command, editor, range }: SlashCommandSelection) => {
    if (command.group === "Skills") {
      insertSkillNode({
        editor,
        range,
        skill: { id: command.id, label: command.name },
      });
      return;
    }

    const pluginCommand = pluginCommands.find((item) => item.id === command.id);
    if (!pluginCommand) return;

    void pluginCommand.run({ editor, range });
  };

  const handleSelectIssue = ({ command, editor, range }: HashCommandSelection) => {
    insertIssueNode({
      editor,
      range,
      issue: { id: command.id, label: command.name },
    });
  };

  const slashCommandsExtension = useSlashCommandsExtension({
    commands: slashCommands,
    getFloatingReference,
    onSelectCommand: handleSelectCommand,
  });
  const hashCommandsExtension = useHashCommandsExtension({
    issues: issueItems,
    getFloatingReference,
    onSelectIssue: handleSelectIssue,
  });
  const extensions = useMemo(
    () => [slashCommandsExtension, hashCommandsExtension, promptGhostSuggestionExtension],
    [slashCommandsExtension, hashCommandsExtension],
  );

  const editor = useEditor(
    {
      extensions: [
        StarterKit.configure({
          heading: false,
          blockquote: false,
          codeBlock: false,
          horizontalRule: false,
          orderedList: false,
          bulletList: false,
        }),
        Placeholder.configure({ placeholder: "Ask about this project…" }),
        ...extensions,
        ...pluginPromptInputExtensions,
        skillNode,
        issueNode,
      ],
      content,
      editorProps: {
        attributes: {
          class:
            "ProseMirror min-h-[46px] max-h-[132px] overflow-y-auto text-[12px] leading-5 text-ink outline-none [&_.is-editor-empty:first-child::before]:pointer-events-none [&_.is-editor-empty:first-child::before]:float-left [&_.is-editor-empty:first-child::before]:h-0 [&_.is-editor-empty:first-child::before]:text-tertiary [&_.is-editor-empty:first-child::before]:content-[attr(data-placeholder)]",
        },
      },
      editable: !disabled,
      onCreate: ({ editor: nextEditor }) => {
        onCreateFromUser?.({ editor: nextEditor });
        const nextText = nextEditor.getText({ blockSeparator: "\n" });
        setHasContent(nextText.trim().length > 0);
      },
      onDestroy: () => {
        onDestroyFromUser?.();
      },
      onUpdate: ({ editor: nextEditor }) => {
        const nextText = nextEditor.getText({ blockSeparator: "\n" });
        setHasContent(nextText.trim().length > 0);
      },
    },
    [content],
  );

  useEffect(() => {
    editor?.setEditable(!disabled);
  }, [disabled, editor]);

  return { editor, hasContent };
}

function useSkillsCommandItems() {
  const { skills } = useAgentSkills();

  return useMemo<CommandItem[]>(
    () =>
      skills
        .filter((skill) => skill.enabled)
        .map((skill) => ({
          id: skill.id,
          group: "Skills",
          name: skill.name,
          description: skill.description,
          extra: skill.scope === "user" ? "个人" : skill.scope === "project" ? "项目" : "系统",
        })),
    [skills],
  );
}

function useIssueCommandItems() {
  const projectId = useStore(projectStore, (s) => s.currentProject?.id ?? "");
  const { data } = useIssues({ projectId, limit: 50 });

  return useMemo<CommandItem[]>(
    () =>
      (data?.data ?? []).map((issue) => ({
        id: issue.id,
        group: "Issues",
        name: issue.title,
        description: issue.fingerprint,
        extra: issue.status,
      })),
    [data],
  );
}
