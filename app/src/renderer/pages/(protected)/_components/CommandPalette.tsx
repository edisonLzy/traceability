import { useCommandPalette, useRegisteredCommands } from "@renderer/commands";
import type { CommandDefinition } from "@renderer/commands";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from "@renderer/components/ui/command";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@renderer/components/ui/dialog";
import { useCurrentProject } from "@renderer/context/current-project";
import { useElectronIPC } from "@renderer/context/ElectronIPCProvider";
import type { Session } from "@renderer/store/agent";
import { ArrowLeft, MessageCircle } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

export function CommandPalette() {
  const { invoke } = useElectronIPC();
  const { currentProject, projectId } = useCurrentProject();
  const palette = useCommandPalette();
  const commands = useRegisteredCommands();
  const [query, setQuery] = useState("");
  const [sessions, setSessions] = useState<Session[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  const commandGroups = useMemo(() => groupCommands(commands), [commands]);

  useEffect(() => {
    const onEvent = (event: Event) => {
      const detail = (event as CustomEvent<{ mode?: "sessions" }>).detail;
      if (detail?.mode === "sessions") palette.openSessions();
      else palette.open();
    };
    const onKey = (event: KeyboardEvent) => {
      const mod = event.metaKey || event.ctrlKey;
      if (!mod) return;

      if (event.key.toLowerCase() === "k") {
        event.preventDefault();
        palette.open();
      }
      if (event.key.toLowerCase() === "g") {
        event.preventDefault();
        palette.openSessions();
      }
    };

    window.addEventListener("traceability:command-palette", onEvent);
    document.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("traceability:command-palette", onEvent);
      document.removeEventListener("keydown", onKey);
    };
  }, [palette]);

  useEffect(() => {
    if (!palette.isOpen) return;
    setQuery("");
    const focusTimer = window.setTimeout(() => inputRef.current?.focus(), 0);
    return () => window.clearTimeout(focusTimer);
  }, [palette.isOpen, palette.view]);

  useEffect(() => {
    if (!palette.isOpen || palette.view !== "sessions" || !projectId) return;

    let cancelled = false;
    void invoke("listSessions", projectId)
      .then((nextSessions) => {
        if (!cancelled) setSessions(nextSessions);
      })
      .catch(() => {
        if (!cancelled) setSessions([]);
      });
    return () => {
      cancelled = true;
    };
  }, [invoke, palette.isOpen, palette.view, projectId]);

  const runCommand = useCallback(
    (command: CommandDefinition) => {
      if (command.disabled) return;
      if (command.closeOnSelect !== false) palette.close();

      try {
        void Promise.resolve(command.action()).catch((error: unknown) => {
          console.error(`Failed to run command ${command.id}`, error);
          toast.error(`Failed to run ${command.title}`);
        });
      } catch (error) {
        console.error(`Failed to run command ${command.id}`, error);
        toast.error(`Failed to run ${command.title}`);
      }
    },
    [palette],
  );

  const selectSession = useCallback(
    (sessionId: string) => {
      palette.close();
      window.dispatchEvent(
        new CustomEvent("traceability:agent-select-session", { detail: { sessionId } }),
      );
      toast("Conversation switched");
    },
    [palette],
  );

  const isSessionsView = palette.view === "sessions";
  const title = isSessionsView ? "Switch conversation" : "Commands";
  const description = isSessionsView
    ? `Search conversations in ${currentProject?.name ?? "project"}`
    : "Search registered commands";

  return (
    <Dialog
      open={palette.isOpen}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          palette.close();
          return;
        }
        if (palette.view === "sessions") palette.openSessions();
        else palette.open();
      }}
    >
      <DialogContent
        showCloseButton={false}
        backdropClassName="z-[89] bg-black/40"
        className="z-[90] w-[min(570px,calc(100vw-48px))] max-w-none overflow-hidden border-hairline-strong bg-[rgba(31,32,38,0.9)] p-0 shadow-[0_16px_50px_rgba(0,0,0,0.34),0_2px_12px_rgba(0,0,0,0.22)] backdrop-blur-2xl"
      >
        <DialogTitle className="sr-only">{title}</DialogTitle>
        <DialogDescription className="sr-only">{description}</DialogDescription>
        <Command key={palette.view} className="rounded-none bg-transparent">
          {isSessionsView ? (
            <button
              type="button"
              onClick={() => palette.open()}
              className="flex h-9 items-center gap-1.5 border-b border-hairline px-3 text-[11px] text-tertiary transition-colors hover:text-ink"
            >
              <ArrowLeft size={13} /> Commands
            </button>
          ) : null}
          <CommandInput
            ref={inputRef}
            value={query}
            onValueChange={setQuery}
            placeholder={description}
          />
          <CommandList>
            <CommandEmpty>
              {isSessionsView ? "No matching conversations." : "No matching registered commands."}
            </CommandEmpty>
            {isSessionsView ? (
              <CommandGroup heading="Conversations">
                {sessions.map((session) => (
                  <CommandItem
                    key={session.id}
                    value={session.id}
                    keywords={[
                      session.name ?? "New conversation",
                      relativeUpdated(session.updatedAt),
                    ]}
                    onSelect={() => selectSession(session.id)}
                  >
                    <CommandIcon icon={MessageCircle} />
                    <CommandCopy
                      title={session.name || "New conversation"}
                      description={relativeUpdated(session.updatedAt)}
                    />
                  </CommandItem>
                ))}
              </CommandGroup>
            ) : (
              commandGroups.map((group) => (
                <CommandGroup key={group.id} heading={group.label}>
                  {group.commands.map((command) => (
                    <CommandItem
                      key={command.id}
                      value={command.id}
                      keywords={commandKeywords(command)}
                      disabled={command.disabled}
                      onSelect={() => runCommand(command)}
                    >
                      <CommandIcon icon={command.icon} />
                      <CommandCopy title={command.title} description={command.description} />
                      {command.shortcut ? (
                        <CommandShortcut>{command.shortcut}</CommandShortcut>
                      ) : null}
                    </CommandItem>
                  ))}
                </CommandGroup>
              ))
            )}
          </CommandList>
          <div className="flex items-center justify-between gap-4 border-t border-hairline px-3 py-2 text-[10px] text-tertiary">
            <span>↑↓ to navigate</span>
            <span>↵ to run</span>
            <kbd className="font-mono">{isSessionsView ? "⌘G" : "⌘K"}</kbd>
          </div>
        </Command>
      </DialogContent>
    </Dialog>
  );
}

function CommandIcon({ icon: Icon }: { icon?: CommandDefinition["icon"] }) {
  return (
    <span className="grid size-[27px] place-items-center rounded-[7px] bg-white/[0.06] text-primary-hover">
      {Icon ? <Icon size={14} /> : null}
    </span>
  );
}

function CommandCopy({ title, description }: { title: string; description?: string }) {
  return (
    <span className="min-w-0">
      <strong className="block truncate text-[12px] font-[620]">{title}</strong>
      {description ? (
        <small className="mt-0.5 block truncate text-[10px] text-tertiary">{description}</small>
      ) : null}
    </span>
  );
}

function groupCommands(commands: readonly CommandDefinition[]) {
  const groups = new Map<string, { id: string; label: string; commands: CommandDefinition[] }>();
  for (const command of commands) {
    const group = groups.get(command.group.id) ?? {
      id: command.group.id,
      label: command.group.label,
      commands: [],
    };
    group.commands.push(command);
    groups.set(command.group.id, group);
  }
  return Array.from(groups.values());
}

function commandKeywords(command: CommandDefinition) {
  return [command.title, command.description, ...(command.keywords ?? [])].filter(
    (value): value is string => Boolean(value),
  );
}

function relativeUpdated(ts: number): string {
  const diff = Math.max(0, Date.now() - ts);
  const min = Math.round(diff / 60_000);
  if (min < 1) return "Now";
  if (min < 60) return `${min}m`;
  const hour = Math.round(min / 60);
  if (hour < 24) return `${hour}h`;
  return `${Math.round(hour / 24)}d`;
}
