import { hashCommandSuggestionPluginKey } from "@renderer/components/richtext/extensions/hash-commands";
import {
  getSelectedCommandIds,
  slashCommandSuggestionPluginKey,
} from "@renderer/components/richtext/extensions/slash-commands";
import { Button } from "@renderer/components/ui/button";
import { cn } from "@renderer/lib/utils";
import type { AvailableModel } from "@shared/models-ipc";
import { EditorContent } from "@tiptap/react";
import { Send, Square } from "lucide-react";
import { useCallback, useEffect, useRef } from "react";

import type { PromptSubmission } from "../promptTypes";
import { useChatEditor, type UseChatEditorOptions } from "../useChatEditor";
import { ModalSelector, useModalSelector } from "./ModalSelector";

export interface PromptInputProps extends Pick<UseChatEditorOptions, "onCreate" | "onDestroy"> {
  disabled?: boolean;
  isRunning?: boolean;
  initialModel?: AvailableModel | null;
  onSubmit: (submission: PromptSubmission) => Promise<void> | void;
  onSteer?: (submission: PromptSubmission) => Promise<void> | void;
  onFollowUp?: (submission: PromptSubmission) => Promise<void> | void;
  onStop?: () => Promise<void> | void;
}

export function PromptInput({
  disabled = false,
  initialModel = null,
  isRunning = false,
  onSubmit,
  onSteer,
  onFollowUp,
  onStop,
  onCreate,
  onDestroy,
}: PromptInputProps) {
  const modelSelectorProps = useModalSelector(initialModel);

  const editorContainerRef = useRef<HTMLDivElement | null>(null);

  const { editor, hasContent } = useChatEditor({
    disabled,
    getFloatingReference: () => editorContainerRef.current,
    onCreate,
    onDestroy,
  });

  useEffect(() => {
    editor?.setEditable(!disabled);
  }, [disabled, editor]);

  const hasModel = modelSelectorProps.value !== null;
  const isStopEnabled = isRunning && typeof onStop === "function";

  const handleSubmit = useCallback(
    async (kind: "prompt" | "steering" | "follow-up" = "prompt") => {
      if (disabled || !hasContent || !hasModel || !editor) {
        return;
      }

      const jsonContent = editor.getJSON();
      const submissionText = editor.getText({ blockSeparator: "\n" }).trim();
      if (!submissionText) {
        return;
      }

      const submission: PromptSubmission = {
        content: submissionText,
        jsonContent,
        model: modelSelectorProps.value!,
        skillIds: getSelectedCommandIds(editor),
      };

      if (kind === "steering") {
        onSteer?.(submission);
      } else if (kind === "follow-up" && onFollowUp) {
        onFollowUp(submission);
      } else {
        onSubmit(submission);
      }

      editor.commands.clearContent();
    },
    [
      disabled,
      editor,
      hasContent,
      hasModel,
      modelSelectorProps.value,
      onFollowUp,
      onSteer,
      onSubmit,
    ],
  );

  // Listen for Enter / Mod+Enter on the editor container with `capture: true`
  useEffect(() => {
    const container = editorContainerRef.current;
    if (!editor || !container) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing || event.key !== "Enter") {
        return;
      }

      const suggestionState = slashCommandSuggestionPluginKey.getState(editor.state) as
        | { active?: boolean }
        | undefined;
      if (suggestionState?.active) {
        return;
      }

      const hashSuggestionState = hashCommandSuggestionPluginKey.getState(editor.state) as
        | { active?: boolean }
        | undefined;
      if (hashSuggestionState?.active) {
        return;
      }

      if (isRunning) {
        if (event.metaKey || event.ctrlKey) {
          event.preventDefault();
          void handleSubmit("follow-up");
          return;
        }

        if (!event.shiftKey) {
          event.preventDefault();
          void handleSubmit("steering");
        }
        return;
      }

      if (!event.shiftKey) {
        event.preventDefault();
        void handleSubmit("prompt");
      }
    };

    container.addEventListener("keydown", handleKeyDown, { capture: true });
    return () => {
      container.removeEventListener("keydown", handleKeyDown, { capture: true });
    };
  }, [editor, handleSubmit, isRunning, onFollowUp]);

  const canSubmit = !disabled && !isRunning && hasContent && hasModel;

  return (
    <div>
      <div
        className={cn(
          "rounded-[15px] border-0 bg-transparent [box-shadow:var(--ui-shadow-input)] backdrop-blur-[24px] transition-[background-color,box-shadow] focus-within:bg-surface-glass/20 focus-within:[box-shadow:0_0_0_3px_var(--glow),var(--ui-shadow-input)]",
          disabled && !isRunning && "opacity-80",
        )}
      >
        <div ref={editorContainerRef} className="relative min-h-14 px-3 pt-2.5 pb-1.5">
          <EditorContent editor={editor} className="prompt-editor max-w-none" />
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-hairline px-1.5 py-1.5">
          <ModalSelector {...modelSelectorProps} />
          <Button
            aria-label={isRunning ? "Stop response" : "Send prompt"}
            className={cn(
              "size-7 rounded-[9px] disabled:!border-primary/20 disabled:!bg-primary/10 disabled:!text-primary-hover disabled:opacity-100 disabled:shadow-none",
              isRunning && "border-danger/30 bg-danger/15 text-danger",
            )}
            disabled={isRunning ? !isStopEnabled : !canSubmit}
            onClick={() => {
              if (isRunning) {
                if (isStopEnabled) void onStop?.();
                return;
              }

              void handleSubmit();
            }}
            size="icon-sm"
            type="button"
            variant={isRunning ? "danger" : "primary"}
          >
            {isRunning ? (
              <Square className="size-3" fill="currentColor" />
            ) : (
              <Send className="size-3.5" strokeWidth={2.2} />
            )}
          </Button>
        </div>
      </div>
      <p className="px-1 pt-1.5 text-[9px] text-tertiary">
        {isRunning
          ? "Enter to steer · ⌘/Ctrl+Enter to follow up"
          : "Enter to send · Shift+Enter for a newline"}
      </p>
    </div>
  );
}
