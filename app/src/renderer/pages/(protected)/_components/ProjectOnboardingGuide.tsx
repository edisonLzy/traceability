import { cn } from "@renderer/lib/utils";
import { projectStore } from "@renderer/store/project";
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

const STEPS = ["Welcome", "Slug", "Name", "Review"] as const;

/**
 * Full-screen first-run guide shown when no projects exist yet. Walks the
 * user through creating their first project in four steps; on success the
 * new project is selected and the normal shell takes over (projects.length > 0).
 */
export function ProjectOnboardingGuide() {
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
      projectStore.getState().setCurrentProject(project.project);
      toast("Project created");
    } catch (cause) {
      toast(String(cause));
    }
  };

  return (
    <div className="app-drag-region relative h-screen overflow-hidden bg-transparent">
      <AmbientBackground />
      <div className="app-no-drag select-text relative flex h-full flex-col items-center justify-center px-6 py-8">
        <div className="w-full max-w-[560px]">
          <Stepper current={step} />

          <div key={step} className="onboarding-step">
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
      <div className="pointer-events-none absolute -top-52 left-1/2 h-[520px] w-[760px] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,var(--glow-strong),transparent)] opacity-80 blur-[120px]" />
      <div className="pointer-events-none absolute -right-52 -bottom-72 size-[640px] rounded-full bg-[radial-gradient(closest-side,var(--glow),transparent)] blur-[120px]" />
    </>
  );
}

function Stepper({ current }: { current: number }) {
  return (
    <div className="mb-9 flex flex-col items-center gap-2.5">
      <div className="flex items-center gap-1.5">
        {STEPS.map((label, i) => {
          const state = i < current ? "done" : i === current ? "active" : "upcoming";
          return (
            <Fragment key={label}>
              <div
                className={cn(
                  "grid size-6 place-items-center rounded-full border text-[10px] font-[620] transition-colors",
                  state === "done" && "border-primary bg-primary text-primary-foreground",
                  state === "active" &&
                    "border-primary/60 bg-primary/15 text-primary shadow-[0_0_0_4px_var(--glow)]",
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
    <div className="glass-panel flex flex-col items-center rounded-[24px] px-12 py-11 text-center">
      <div className="mb-6 grid size-[104px] place-items-center rounded-[28px] border border-white/30 bg-[linear-gradient(145deg,#9db2ff,#5d75ee)] shadow-[0_24px_55px_rgba(68,91,196,0.3),inset_0_1px_rgba(255,255,255,0.5)]">
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
            className="glass-control inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] text-muted"
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
    <div className="glass-panel flex flex-col items-center rounded-[24px] px-12 py-11 text-center">
      <div className="mb-6 grid size-20 place-items-center rounded-[22px] bg-[linear-gradient(145deg,#9db2ff,#5d75ee)] text-[22px] font-[680] text-white shadow-glow transition-transform">
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
        className="glass-control mt-6 h-11 w-full max-w-[360px] rounded-[12px] px-3.5 text-[14px] text-ink outline-none transition-[border-color,box-shadow,background-color] placeholder:text-tertiary focus:border-primary/60 focus:bg-surface-2 focus:shadow-[0_0_0_4px_var(--glow)]"
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
    <div className="glass-panel flex flex-col items-center rounded-[24px] px-12 py-11 text-center">
      <div className="glass-control mb-6 grid size-20 place-items-center rounded-[22px] bg-primary/10 text-primary-hover shadow-glow">
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
          className="glass-control h-11 w-full rounded-[12px] py-0 pr-3.5 pl-10 text-[14px] text-ink outline-none transition-[border-color,box-shadow,background-color] placeholder:text-tertiary focus:border-primary/60 focus:bg-surface-2 focus:shadow-[0_0_0_4px_var(--glow)]"
        />
      </div>
      <p className="mt-2.5 text-[11px] text-tertiary">This name can be changed later.</p>
    </div>
  );
}

function ReviewStep({ name, slug }: { name: string; slug: string }) {
  return (
    <div className="glass-panel flex flex-col items-center rounded-[24px] px-12 py-11 text-center">
      <h2 className="m-0 text-[20px] font-[660] tracking-[-0.02em] text-ink">Looks good?</h2>
      <p className="mt-2 max-w-[380px] text-[12px] text-muted">
        Confirm the details and create your project.
      </p>
      <div className="glass-control mt-6 flex w-full max-w-[360px] items-center gap-3 rounded-[16px] p-4 text-left">
        <div className="grid size-11 shrink-0 place-items-center rounded-[12px] bg-[linear-gradient(145deg,#9db2ff,#5d75ee)] text-[13px] font-[680] text-white shadow-glow">
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
          className="glass-control inline-flex h-10 items-center gap-1.5 rounded-[11px] px-4 text-[12px] text-muted transition-colors duration-150 [transition-timing-function:var(--ease-out)] hover:bg-overlay-strong hover:text-ink active:bg-overlay-strong"
        >
          <ArrowLeft size={14} /> Back
        </button>
      ) : null}
      {isLast ? (
        <button
          type="button"
          onClick={onCreate}
          disabled={creating}
          className="inline-flex h-10 items-center gap-2 rounded-[11px] border border-primary/70 bg-primary px-5 text-[12px] font-[620] text-primary-foreground shadow-glow transition-[background-color,box-shadow] duration-150 [transition-timing-function:var(--ease-out)] hover:bg-primary-hover active:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-60"
        >
          {creating ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
          {creating ? "Creating…" : "Create project"}
        </button>
      ) : (
        <button
          type="button"
          onClick={onNext}
          disabled={!canContinue}
          className="inline-flex h-10 items-center gap-1.5 rounded-[11px] border border-primary/70 bg-primary px-5 text-[12px] font-[620] text-primary-foreground shadow-glow transition-[background-color,box-shadow] duration-150 [transition-timing-function:var(--ease-out)] hover:bg-primary-hover active:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
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
