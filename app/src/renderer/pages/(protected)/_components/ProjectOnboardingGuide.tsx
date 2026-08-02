import { cn } from "@renderer/lib/utils";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Check,
  Fingerprint,
  GitBranch,
  Loader2,
  Sparkles,
} from "lucide-react";
import { Fragment, useState } from "react";
import { toast } from "sonner";

import { useCreateProject } from "../_hooks/useCreateProject";
import { useCurrentProject } from "../_hooks/useCurrentProject";

const STEPS = ["Welcome", "Slug", "Name", "Review"] as const;

const AVATAR_GRADIENT = "linear-gradient(145deg,#9ba7ff,#626fd2)";

/**
 * Full-screen first-run guide shown when no projects exist yet. Walks the
 * user through creating their first project in four steps; on success the
 * new project is selected and the normal shell takes over (projects.length > 0).
 */
export function ProjectOnboardingGuide() {
  const { setProjectId } = useCurrentProject();
  const createProjectMutation = useCreateProject();
  const [step, setStep] = useState(0);
  const [slug, setSlug] = useState("");
  const [name, setName] = useState("");

  const creating = createProjectMutation.isPending;
  const canContinue =
    step === 1 ? slug.trim().length > 0 : step === 2 ? name.trim().length > 0 : true;

  const next = () => setStep((s) => Math.min(s + 1, STEPS.length - 1));
  const back = () => setStep((s) => Math.max(s - 1, 0));

  const create = async () => {
    if (!name.trim() || !slug.trim()) return;
    try {
      const project = await createProjectMutation.mutateAsync({
        name: name.trim(),
        slug: slug.trim(),
      });
      setProjectId(project.project.id);
      toast("Project created");
    } catch (cause) {
      toast(String(cause));
    }
  };

  return (
    <div className="app-drag-region relative h-screen overflow-hidden bg-canvas">
      <AmbientBackground />
      <div className="app-no-drag select-text relative flex h-full flex-col items-center justify-center px-6 py-8">
        <div className="w-full max-w-[560px]">
          <Stepper current={step} />

          <div key={step} className="animate-in fade-in slide-in-from-bottom-2 duration-300">
            {step === 0 && <WelcomeStep />}
            {step === 1 && (
              <SlugStep
                slug={slug}
                onChange={setSlug}
                onContinue={canContinue ? next : undefined}
              />
            )}
            {step === 2 && (
              <NameStep
                name={name}
                onChange={setName}
                onContinue={canContinue ? next : undefined}
              />
            )}
            {step === 3 && (
              <ReviewStep name={name.trim() || "Untitled"} slug={slug.trim() || "—"} />
            )}
          </div>

          <Footer
            step={step}
            canContinue={canContinue}
            creating={creating}
            onBack={back}
            onNext={next}
            onCreate={create}
          />
        </div>
      </div>
    </div>
  );
}

function AmbientBackground() {
  return (
    <>
      <div
        className="pointer-events-none absolute -top-40 left-1/2 h-[460px] w-[680px] -translate-x-1/2 rounded-full opacity-70 blur-[130px]"
        style={{
          background: "radial-gradient(closest-side, rgba(143,156,255,0.30), transparent))",
        }}
      />
      <div
        className="pointer-events-none absolute inset-0 opacity-60"
        style={{
          backgroundImage: "radial-gradient(var(--overlay) 1px, transparent 1px)",
          backgroundSize: "24px 24px",
          maskImage: "radial-gradient(ellipse at 50% 42%, black, transparent 72%)",
          WebkitMaskImage: "radial-gradient(ellipse at 50% 42%, black, transparent 72%)",
        }}
      />
    </>
  );
}

function Stepper({ current }: { current: number }) {
  return (
    <div className="mb-10 flex flex-col items-center gap-2.5">
      <div className="flex items-center gap-1.5">
        {STEPS.map((label, i) => {
          const state = i < current ? "done" : i === current ? "active" : "upcoming";
          return (
            <Fragment key={label}>
              <div
                className={cn(
                  "grid size-6 place-items-center rounded-full border text-[10px] font-[620] transition-colors",
                  state === "done" && "border-primary bg-primary text-primary-foreground",
                  state === "active" && "border-primary bg-primary/15 text-primary",
                  state === "upcoming" && "border-hairline text-tertiary",
                )}
              >
                {state === "done" ? <Check size={12} /> : i + 1}
              </div>
              {i < STEPS.length - 1 ? (
                <div
                  className={cn(
                    "h-px w-8 transition-colors",
                    i < current ? "bg-primary/50" : "bg-hairline",
                  )}
                />
              ) : null}
            </Fragment>
          );
        })}
      </div>
      <span className="text-[11px] text-tertiary">
        Step {current + 1} of {STEPS.length} · {STEPS[current]}
      </span>
    </div>
  );
}

function WelcomeStep() {
  const pills: { icon: typeof AlertTriangle; label: string }[] = [
    { icon: AlertTriangle, label: "Issues" },
    { icon: Sparkles, label: "Agent" },
  ];
  return (
    <div className="flex flex-col items-center text-center">
      <div
        className="mb-6 grid size-[104px] place-items-center rounded-[28px] border border-hairline-strong shadow-[0_18px_50px_rgba(0,0,0,0.4)]"
        style={{ background: AVATAR_GRADIENT }}
      >
        <Fingerprint size={42} className="text-white" />
      </div>
      <h1 className="m-0 text-[28px] font-[670] tracking-[-0.025em] text-ink">
        Welcome to Traceability
      </h1>
      <p className="mt-3 max-w-[420px] text-[13px] leading-relaxed text-muted">
        Everything starts with a project. Create one to begin monitoring its runtime issues,
        performance, and traces.
      </p>
      <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
        {pills.map(({ icon: Icon, label }) => (
          <span
            key={label}
            className="inline-flex items-center gap-1.5 rounded-full border border-hairline bg-overlay px-3 py-1.5 text-[11px] text-muted"
          >
            <Icon size={12} className="text-primary-hover" /> {label}
          </span>
        ))}
      </div>
    </div>
  );
}

function SlugStep({
  slug,
  onChange,
  onContinue,
}: {
  slug: string;
  onChange: (value: string) => void;
  onContinue?: () => void;
}) {
  return (
    <div className="flex flex-col items-center text-center">
      <div
        className="mb-6 grid size-20 place-items-center rounded-[22px] text-[22px] font-[680] text-white shadow-[0_14px_36px_rgba(0,0,0,0.36)] transition-transform"
        style={{ background: AVATAR_GRADIENT }}
      >
        {slug.trim() ? initials(slug) : "··"}
      </div>
      <h2 className="m-0 text-[20px] font-[660] tracking-[-0.02em] text-ink">
        Choose a project slug
      </h2>
      <p className="mt-2 max-w-[380px] text-[12px] text-muted">
        Give it something recognizable. This is how it appears across Traceability.
      </p>
      <input
        autoFocus
        value={slug}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && onContinue) onContinue();
        }}
        placeholder="e.g. checkout-web"
        className="mt-6 h-11 w-full max-w-[360px] rounded-[10px] border border-hairline bg-surface-2 px-3.5 text-[14px] text-ink outline-none transition-colors placeholder:text-tertiary focus:border-primary"
      />
    </div>
  );
}

function NameStep({
  name,
  onChange,
  onContinue,
}: {
  name: string;
  onChange: (value: string) => void;
  onContinue?: () => void;
}) {
  return (
    <div className="flex flex-col items-center text-center">
      <div className="mb-6 grid size-20 place-items-center rounded-[22px] border border-hairline bg-overlay text-primary-hover shadow-[0_14px_36px_rgba(0,0,0,0.36)]">
        <GitBranch size={34} />
      </div>
      <h2 className="m-0 text-[20px] font-[660] tracking-[-0.02em] text-ink">
        Where does it live?
      </h2>
      <p className="mt-2 max-w-[380px] text-[12px] text-muted">
        Give the project a recognizable name for the dashboard and agent.
      </p>
      <div className="relative mt-6 w-full max-w-[360px]">
        <GitBranch
          size={15}
          className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-tertiary"
        />
        <input
          autoFocus
          value={name}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && onContinue) onContinue();
          }}
          placeholder="Checkout web"
          className="h-11 w-full rounded-[10px] border border-hairline bg-surface-2 py-0 pl-10 pr-3.5 text-[14px] text-ink outline-none transition-colors placeholder:text-tertiary focus:border-primary"
        />
      </div>
      <p className="mt-2.5 text-[11px] text-tertiary">This name can be changed later.</p>
    </div>
  );
}

function ReviewStep({ name, slug }: { name: string; slug: string }) {
  return (
    <div className="flex flex-col items-center text-center">
      <h2 className="m-0 text-[20px] font-[660] tracking-[-0.02em] text-ink">Looks good?</h2>
      <p className="mt-2 max-w-[380px] text-[12px] text-muted">
        Confirm the details and create your project.
      </p>
      <div className="mt-6 flex w-full max-w-[360px] items-center gap-3 rounded-[14px] border border-hairline bg-surface-2 p-4 text-left">
        <div
          className="grid size-11 shrink-0 place-items-center rounded-[12px] text-[13px] font-[680] text-white"
          style={{ background: AVATAR_GRADIENT }}
        >
          {initials(name)}
        </div>
        <div className="min-w-0">
          <div className="truncate text-[14px] font-[600] text-ink">{name}</div>
          <div className="truncate text-[12px] text-tertiary">{slug}</div>
        </div>
      </div>
    </div>
  );
}

function Footer({
  step,
  canContinue,
  creating,
  onBack,
  onNext,
  onCreate,
}: {
  step: number;
  canContinue: boolean;
  creating: boolean;
  onBack: () => void;
  onNext: () => void;
  onCreate: () => void;
}) {
  const isLast = step === STEPS.length - 1;
  return (
    <div className="mt-10 flex items-center justify-center gap-2">
      {step > 0 ? (
        <button
          type="button"
          onClick={onBack}
          className="inline-flex h-10 items-center gap-1.5 rounded-[10px] border border-hairline bg-overlay px-4 text-[12px] text-muted transition-colors hover:bg-overlay-strong hover:text-ink"
        >
          <ArrowLeft size={14} /> Back
        </button>
      ) : null}
      {isLast ? (
        <button
          type="button"
          onClick={onCreate}
          disabled={creating}
          className="inline-flex h-10 items-center gap-2 rounded-[10px] border border-primary bg-primary px-5 text-[12px] font-[600] text-primary-foreground transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-60"
        >
          {creating ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
          {creating ? "Creating…" : "Create project"}
        </button>
      ) : (
        <button
          type="button"
          onClick={onNext}
          disabled={!canContinue}
          className="inline-flex h-10 items-center gap-1.5 rounded-[10px] border border-primary bg-primary px-5 text-[12px] font-[600] text-primary-foreground transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
        >
          {step === 0 ? "Get started" : "Continue"}
          <ArrowRight size={14} />
        </button>
      )}
    </div>
  );
}

function initials(name: string): string {
  return (
    name
      .split(/[-\s]/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0])
      .join("")
      .toUpperCase()
      .padEnd(2, "A") || "AA"
  );
}
