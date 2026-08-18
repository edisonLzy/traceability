import { Switch as SwitchPrimitive } from "@base-ui/react/switch";
import { cn } from "@renderer/lib/utils";

function Switch({ className, ...props }: SwitchPrimitive.Root.Props) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      className={cn(
        "peer relative inline-flex shrink-0 cursor-pointer items-center rounded-full border border-hairline-strong transition-[background-color,border-color,box-shadow] outline-none h-5 w-9 focus-visible:shadow-[0_0_0_3px_var(--glow)] focus-visible:border-primary/55 data-checked:bg-primary/60 data-checked:border-primary/50 data-unchecked:bg-surface-3 disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className="pointer-events-none block rounded-full bg-ink/80 shadow-sm ring-0 transition-transform size-3.5 data-checked:translate-x-4.5 data-unchecked:translate-x-0.5"
      />
    </SwitchPrimitive.Root>
  );
}

export { Switch };
