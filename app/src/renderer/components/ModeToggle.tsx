import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@renderer/components/ui/dropdown-menu";
import { useTheme } from "@renderer/context/theme";
import { Check, Monitor, Moon, Sun } from "lucide-react";

const THEME_OPTIONS = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
] as const;

export function ModeToggle() {
  const { theme, setTheme } = useTheme();

  const CurrentIcon = THEME_OPTIONS.find((option) => option.value === theme)?.icon ?? Monitor;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button
            type="button"
            title="Switch theme"
            aria-label="Switch theme"
            className="grid size-8 place-items-center rounded-lg text-tertiary transition-colors hover:bg-surface-3 hover:text-ink"
          >
            <CurrentIcon size={15} />
          </button>
        }
      />
      <DropdownMenuContent side="right" sideOffset={8} align="start" className="w-[168px]">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Theme</DropdownMenuLabel>
          {THEME_OPTIONS.map((option) => {
            const Icon = option.icon;
            const active = theme === option.value;
            return (
              <DropdownMenuItem
                key={option.value}
                onClick={() => setTheme(option.value)}
                className={active ? "bg-primary/15 font-[610] text-ink" : undefined}
              >
                <Icon size={14} />
                <span>{option.label}</span>
                {active ? <Check size={13} className="ml-auto text-primary-hover" /> : null}
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
