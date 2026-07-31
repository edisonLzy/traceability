import { Button } from "@renderer/components/ui/button";
import { useElectronIPC } from "@renderer/context/ElectronIPCProvider";
import { agentStore } from "@renderer/store/agent";
import type {
  AskUserQuestionRequest,
  AskUserQuestionResolution,
} from "@shared/ask-user-question-ipc";
import { useState } from "react";

interface AskUserQuestionPanelProps {
  request: AskUserQuestionRequest;
  sessionId: string;
}

export function AskUserQuestionPanel({ request, sessionId }: AskUserQuestionPanelProps) {
  const { invoke } = useElectronIPC();
  const [answers, setAnswers] = useState<Record<string, string[]>>({});
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    const resolution: AskUserQuestionResolution = {
      answers: request.questions.map((question) => ({
        question: question.question,
        selectedOptions: answers[question.question] ?? [],
      })),
      additionalNote: note.trim() || undefined,
    };

    setSubmitting(true);
    try {
      await invoke("resolveAskUserQuestion", sessionId, request.requestId, resolution);
      agentStore.getState().resolveHumanInTheLoopRequest(sessionId, request.requestId, resolution);
    } catch (error) {
      console.error("Failed to answer agent question", error);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section
      aria-label="Agent question"
      className="rounded-[11px] border border-warning/30 bg-warning/[0.055] p-3 shadow-[0_10px_28px_rgba(0,0,0,0.16)]"
    >
      <div className="mb-2 flex items-center justify-between gap-2 text-[10px] font-[660] uppercase tracking-[0.08em] text-warning">
        Agent needs your input
        <span className="font-normal tracking-normal text-tertiary">Prompt paused</span>
      </div>
      <div className="flex flex-col gap-3">
        {request.questions.map((question) => {
          const selected = answers[question.question] ?? [];
          return (
            <fieldset key={question.question} className="min-w-0">
              <legend className="mb-1 text-[12px] font-[610] text-ink">{question.question}</legend>
              <div className="flex flex-col gap-1">
                {question.options.map((option) => {
                  const checked = selected.includes(option.label);
                  return (
                    <label
                      key={option.label}
                      className="flex cursor-pointer items-start gap-2 rounded-[7px] border border-transparent px-2 py-1.5 text-[11px] text-muted transition-colors hover:border-hairline hover:bg-white/[0.035]"
                    >
                      <input
                        checked={checked}
                        className="mt-0.5 accent-primary"
                        name={question.question}
                        type={question.multiSelect ? "checkbox" : "radio"}
                        onChange={() =>
                          setAnswers((current) => ({
                            ...current,
                            [question.question]: question.multiSelect
                              ? checked
                                ? selected.filter((value) => value !== option.label)
                                : [...selected, option.label]
                              : [option.label],
                          }))
                        }
                      />
                      <span>
                        <strong className="block font-[610] text-ink">{option.label}</strong>
                        <span className="block text-[10px] text-tertiary">
                          {option.description}
                        </span>
                      </span>
                    </label>
                  );
                })}
              </div>
            </fieldset>
          );
        })}
      </div>
      <textarea
        className="mt-2 min-h-14 w-full resize-y rounded-[7px] border border-hairline bg-black/15 p-2 text-[11px] text-ink outline-none placeholder:text-tertiary focus:border-primary/55"
        onChange={(event) => setNote(event.target.value)}
        placeholder="Add context for the agent (optional)"
        value={note}
      />
      <div className="mt-2 flex justify-end">
        <Button
          disabled={submitting}
          onClick={() => void submit()}
          size="sm"
          type="button"
          variant="primary"
        >
          {submitting ? "Sending…" : "Continue"}
        </Button>
      </div>
    </section>
  );
}
