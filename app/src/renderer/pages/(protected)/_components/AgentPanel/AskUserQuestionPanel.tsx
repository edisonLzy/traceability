import { Button } from "@renderer/components/ui/button";
import { Textarea } from "@renderer/components/ui/textarea";
import { useElectronIPC } from "@renderer/context/ElectronIPCProvider";
import { cn } from "@renderer/lib/utils";
import { agentStore } from "@renderer/store/agent";
import type {
  AskUserQuestionRequest,
  AskUserQuestionResolution,
} from "@shared/ask-user-question-ipc";
import { Check, ChevronLeft, CornerDownLeft, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

interface AskUserQuestionPanelProps {
  request: AskUserQuestionRequest;
  sessionId: string;
}

interface DraftAnswer {
  customAnswer: string;
  customSelected: boolean;
  selectedOptions: string[];
}

function createEmptyAnswer(): DraftAnswer {
  return { customAnswer: "", customSelected: false, selectedOptions: [] };
}

export function AskUserQuestionPanel({ request, sessionId }: AskUserQuestionPanelProps) {
  return <AskUserQuestionContent key={request.requestId} request={request} sessionId={sessionId} />;
}

function AskUserQuestionContent({ request, sessionId }: AskUserQuestionPanelProps) {
  const { invoke } = useElectronIPC();
  const [answers, setAnswers] = useState<Record<number, DraftAnswer>>({});
  const [additionalNote, setAdditionalNote] = useState("");
  const [questionIndex, setQuestionIndex] = useState(0);
  const [isReviewing, setIsReviewing] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const totalQuestions = request.questions.length;
  const currentQuestion = request.questions[questionIndex];
  const currentAnswer = answers[questionIndex] ?? createEmptyAnswer();

  const isCurrentAnswerValid =
    currentAnswer.selectedOptions.length > 0 ||
    (currentAnswer.customSelected && Boolean(currentAnswer.customAnswer.trim()));

  const allAnswersValid = request.questions.every((_, index) => {
    const candidate = answers[index] ?? createEmptyAnswer();
    return (
      candidate.selectedOptions.length > 0 ||
      (candidate.customSelected && Boolean(candidate.customAnswer.trim()))
    );
  });

  const updateCurrentAnswer = (next: DraftAnswer) => {
    setAnswers((current) => ({ ...current, [questionIndex]: next }));
  };

  const toggleOption = (label: string) => {
    if (!currentQuestion) return;
    if (currentQuestion.multiSelect) {
      updateCurrentAnswer({
        ...currentAnswer,
        selectedOptions: currentAnswer.selectedOptions.includes(label)
          ? currentAnswer.selectedOptions.filter((opt) => opt !== label)
          : [...currentAnswer.selectedOptions, label],
      });
      return;
    }
    updateCurrentAnswer({
      ...currentAnswer,
      customSelected: false,
      selectedOptions: [label],
    });
  };

  const toggleCustom = () => {
    updateCurrentAnswer({
      ...currentAnswer,
      customSelected: !currentAnswer.customSelected,
      selectedOptions: currentQuestion?.multiSelect ? currentAnswer.selectedOptions : [],
    });
  };

  const continueToNext = () => {
    if (!isCurrentAnswerValid) return;
    if (questionIndex < totalQuestions - 1) {
      setQuestionIndex((current) => current + 1);
      return;
    }
    setIsReviewing(true);
  };

  const submitAnswers = async () => {
    if (!allAnswersValid || submitting) return;
    setSubmitting(true);
    const resolution: AskUserQuestionResolution = {
      answers: request.questions.map((item, index) => {
        const draft = answers[index] ?? createEmptyAnswer();
        return {
          question: item.question,
          selectedOptions: draft.selectedOptions,
          customAnswer: draft.customSelected ? draft.customAnswer.trim() : undefined,
        };
      }),
      additionalNote: additionalNote.trim() || undefined,
    };

    try {
      await invoke("resolveAskUserQuestion", sessionId, request.requestId, resolution);
      agentStore.getState().resolveHumanInTheLoopRequest(sessionId, request.requestId, resolution);
    } catch (error) {
      console.error("Failed to answer agent question", error);
      toast.error(error instanceof Error ? error.message : "提交回答失败");
    } finally {
      setSubmitting(false);
    }
  };

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        submitting ||
        event.target instanceof HTMLTextAreaElement ||
        event.target instanceof HTMLInputElement
      ) {
        return;
      }

      if (event.key === "Enter") {
        event.preventDefault();
        if (isReviewing) {
          void submitAnswers();
        } else {
          continueToNext();
        }
      }

      if (event.key === "ArrowLeft" && !isReviewing && questionIndex > 0) {
        event.preventDefault();
        setQuestionIndex((current) => current - 1);
      }

      const optionIndex = Number(event.key) - 1;
      if (
        !isReviewing &&
        currentQuestion &&
        optionIndex >= 0 &&
        optionIndex < currentQuestion.options.length
      ) {
        const option = currentQuestion.options[optionIndex];
        if (option) {
          toggleOption(option.label);
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  });

  // ── Review / Summary Mode ──────────────────────────────────────────────────
  if (isReviewing) {
    return (
      <section
        aria-label="Agent question review"
        className="overflow-hidden rounded-[12px] border border-warning/40 bg-card/95 text-ink shadow-glass-sm backdrop-blur-2xl"
      >
        <div className="h-1.5 w-full bg-gradient-to-r from-warning via-signal-cyan to-primary" />
        <header className="flex items-start justify-between gap-4 px-4 py-3 border-b border-hairline/60">
          <div>
            <div className="font-mono text-[10px] font-bold tracking-[0.1em] text-warning uppercase flex items-center gap-1.5">
              <Sparkles className="size-3" />
              <span>Ask User Question · 回答汇总</span>
            </div>
            <h2 className="mt-1 text-[13.5px] font-[650] text-ink">请确认你的回答</h2>
            <p className="mt-0.5 text-[11px] text-tertiary">确认前可点击任意条目返回修改。</p>
          </div>
          <span className="rounded-[6px] border border-border/70 bg-muted/40 px-2 py-0.5 font-mono text-[10px] font-bold text-ink">
            {totalQuestions} / {totalQuestions}
          </span>
        </header>

        <div className="flex flex-col gap-3 p-4">
          <div className="overflow-hidden rounded-[8px] border border-hairline bg-surface/40">
            {request.questions.map((item, index) => {
              const draft = answers[index] ?? createEmptyAnswer();
              const values = [
                ...draft.selectedOptions,
                ...(draft.customSelected && draft.customAnswer.trim()
                  ? [draft.customAnswer.trim()]
                  : []),
              ];
              return (
                <button
                  key={item.question}
                  type="button"
                  className="grid w-full grid-cols-[110px_minmax(0,1fr)] border-b border-hairline/60 text-left text-[11.5px] transition-colors hover:bg-overlay last:border-b-0 cursor-pointer"
                  onClick={() => {
                    setQuestionIndex(index);
                    setIsReviewing(false);
                  }}
                >
                  <span className="border-r border-hairline/60 bg-muted/20 px-3 py-2 font-mono font-semibold text-muted text-[10.5px]">
                    {String(index + 1).padStart(2, "0")} · {item.header}
                  </span>
                  <span className="px-3 py-2 text-ink font-medium">
                    {values.length > 0 ? (
                      values.join("、")
                    ) : (
                      <span className="text-muted-foreground italic">未作答</span>
                    )}
                  </span>
                </button>
              );
            })}
          </div>

          <div>
            <label
              htmlFor="ask-additional-note"
              className="mb-1.5 block text-[11.5px] font-semibold text-ink"
            >
              还有什么想补充给 Agent？（可选）
            </label>
            <Textarea
              id="ask-additional-note"
              value={additionalNote}
              maxLength={500}
              className="min-h-16 text-xs"
              placeholder="补充跨问题的约束、背景或期望结果…"
              onChange={(event) => setAdditionalNote(event.target.value)}
            />
          </div>
        </div>

        <footer className="flex items-center justify-between gap-3 border-t border-hairline bg-muted/15 px-4 py-2.5">
          <span className="font-mono text-[10px] text-tertiary">Enter 确认提交</span>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="default"
              className="h-7 text-xs px-2.5 cursor-pointer"
              onClick={() => setIsReviewing(false)}
              disabled={submitting}
            >
              <ChevronLeft className="size-3.5 mr-0.5" />
              返回修改
            </Button>
            <Button
              size="sm"
              variant="primary"
              className="h-7 text-xs px-3 cursor-pointer"
              onClick={() => void submitAnswers()}
              disabled={!allAnswersValid || submitting}
            >
              <span>{submitting ? "提交中…" : "确认并继续"}</span>
              <CornerDownLeft className="size-3.5 ml-1" />
            </Button>
          </div>
        </footer>
      </section>
    );
  }

  if (!currentQuestion) {
    return null;
  }

  // ── Step-by-Step Single Question Mode ──────────────────────────────────────
  return (
    <section
      aria-label="Agent question"
      className="overflow-hidden rounded-[12px] border border-warning/40 bg-card/95 text-ink shadow-glass-sm backdrop-blur-2xl"
    >
      <div className="h-1.5 w-full bg-gradient-to-r from-warning via-signal-cyan to-primary" />
      <header className="flex items-start justify-between gap-4 px-4 py-3 border-b border-hairline/60">
        <div>
          <div className="font-mono text-[10px] font-bold tracking-[0.1em] text-warning uppercase flex items-center gap-1.5">
            <Sparkles className="size-3" />
            <span>Ask User Question · {currentQuestion.header}</span>
          </div>
          <h2 className="mt-1 text-[13.5px] font-[650] text-ink">{currentQuestion.question}</h2>
          <p className="mt-0.5 text-[11px] text-tertiary">
            {currentQuestion.multiSelect
              ? "可选择多项，也可以补充自己的答案。"
              : "选择一项，或输入自己的答案。"}
          </p>
        </div>
        <span className="rounded-[6px] border border-border/70 bg-muted/40 px-2 py-0.5 font-mono text-[10px] font-bold text-ink">
          {questionIndex + 1} / {totalQuestions}
        </span>
      </header>

      <div className="flex flex-col gap-1.5 p-4">
        {currentQuestion.options.map((option, index) => {
          const selected = currentAnswer.selectedOptions.includes(option.label);
          return (
            <button
              key={option.label}
              type="button"
              aria-pressed={selected}
              className={cn(
                "grid grid-cols-[24px_minmax(0,1fr)] items-start gap-2.5 rounded-[8px] border p-2 text-left transition-[background-color,border-color,box-shadow] cursor-pointer",
                selected
                  ? "border-primary/80 bg-primary/10 text-ink shadow-[0_0_0_1px_var(--primary)]"
                  : "border-hairline bg-surface/50 hover:border-hairline-strong hover:bg-overlay text-muted",
              )}
              onClick={() => toggleOption(option.label)}
            >
              <span
                className={cn(
                  "flex size-5.5 shrink-0 items-center justify-center rounded-[5px] border font-mono text-[10.5px] font-bold transition-colors mt-0.5",
                  selected
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-hairline bg-card text-muted",
                )}
              >
                {currentQuestion.multiSelect && selected ? (
                  <Check className="size-3.5 stroke-[3]" />
                ) : (
                  index + 1
                )}
              </span>
              <div className="min-w-0">
                <span className="block text-[12px] font-semibold text-ink leading-snug">
                  {option.label}
                </span>
                {option.description && (
                  <span className="mt-0.5 block text-[10.5px] text-tertiary leading-normal">
                    {option.description}
                  </span>
                )}
              </div>
            </button>
          );
        })}

        {/* Custom "Other" Answer */}
        <button
          type="button"
          aria-pressed={currentAnswer.customSelected}
          className={cn(
            "grid grid-cols-[24px_minmax(0,1fr)] items-start gap-2.5 rounded-[8px] border p-2 text-left transition-[background-color,border-color,box-shadow] cursor-pointer",
            currentAnswer.customSelected
              ? "border-primary/80 bg-primary/10 text-ink shadow-[0_0_0_1px_var(--primary)]"
              : "border-hairline bg-surface/50 hover:border-hairline-strong hover:bg-overlay text-muted",
          )}
          onClick={toggleCustom}
        >
          <span
            className={cn(
              "flex size-5.5 shrink-0 items-center justify-center rounded-[5px] border font-mono text-[10.5px] font-bold transition-colors mt-0.5",
              currentAnswer.customSelected
                ? "border-primary bg-primary text-primary-foreground"
                : "border-hairline bg-card text-muted",
            )}
          >
            {currentQuestion.options.length + 1}
          </span>
          <div className="min-w-0">
            <span className="block text-[12px] font-semibold text-ink leading-snug">
              其他，请说明
            </span>
            <span className="mt-0.5 block text-[10.5px] text-tertiary leading-normal">
              输入未被以上选项覆盖的自定义答案。
            </span>
          </div>
        </button>

        {currentAnswer.customSelected && (
          <Textarea
            autoFocus
            value={currentAnswer.customAnswer}
            maxLength={300}
            className="mt-1 min-h-14 text-xs"
            placeholder="请输入你的自定义答案…"
            onChange={(event) =>
              updateCurrentAnswer({
                ...currentAnswer,
                customAnswer: event.target.value,
              })
            }
          />
        )}
      </div>

      <footer className="flex items-center justify-between gap-3 border-t border-hairline bg-muted/15 px-4 py-2.5">
        <span className="font-mono text-[10px] text-tertiary">数字键选择 · Enter 继续</span>
        <div className="flex items-center gap-2">
          {questionIndex > 0 && (
            <Button
              size="sm"
              variant="default"
              className="h-7 text-xs px-2.5 cursor-pointer"
              onClick={() => setQuestionIndex((current) => current - 1)}
            >
              <ChevronLeft className="size-3.5 mr-0.5" />
              上一步
            </Button>
          )}
          <Button
            size="sm"
            variant="primary"
            className="h-7 text-xs px-3 cursor-pointer"
            onClick={continueToNext}
            disabled={!isCurrentAnswerValid}
          >
            <span>{questionIndex === totalQuestions - 1 ? "查看汇总" : "继续"}</span>
            <CornerDownLeft className="size-3.5 ml-1" />
          </Button>
        </div>
      </footer>
    </section>
  );
}
