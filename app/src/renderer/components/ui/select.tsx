import { Select as SelectPrimitive } from "@base-ui/react/select";
import { cn } from "@renderer/lib/utils";
import { ChevronDownIcon, CheckIcon } from "lucide-react";
import * as React from "react";

const Select = SelectPrimitive.Root;

function SelectValue({ className, ...props }: SelectPrimitive.Value.Props) {
  return (
    <SelectPrimitive.Value
      data-slot="select-value"
      className={cn("flex flex-1 text-left", className)}
      {...props}
    />
  );
}

function SelectTrigger({
  className,
  size = "default",
  children,
  ...props
}: SelectPrimitive.Trigger.Props & { size?: "default" | "sm" }) {
  return (
    <SelectPrimitive.Trigger
      data-slot="select-trigger"
      data-size={size}
      className={cn(
        "glass-control relative flex w-full items-center justify-between gap-1.5 rounded-[10px] py-0 pr-7 pl-3 text-muted outline-none transition-[background-color,border-color,box-shadow] hover:bg-surface-2 focus:border-primary/55 focus:shadow-[0_0_0_3px_var(--glow)] disabled:opacity-50 data-[size=default]:h-9 data-[size=sm]:h-7.5 data-[size=sm]:text-xs data-placeholder:text-tertiary [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
        className,
      )}
      {...props}
    >
      {children}
      <SelectPrimitive.Icon
        render={<ChevronDownIcon className="absolute right-2.5 text-tertiary" />}
      />
    </SelectPrimitive.Trigger>
  );
}

function SelectContent({
  className,
  children,
  side = "bottom",
  sideOffset = 4,
  align = "start",
  ...props
}: SelectPrimitive.Popup.Props &
  Pick<SelectPrimitive.Positioner.Props, "align" | "side" | "sideOffset">) {
  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Positioner
        side={side}
        sideOffset={sideOffset}
        align={align}
        className="z-50"
      >
        <SelectPrimitive.Popup
          data-slot="select-content"
          className={cn(
            "glass-panel-raised max-h-(--available-height) min-w-(--anchor-width) overflow-x-hidden overflow-y-auto rounded-[12px] p-1 text-muted",
            className,
          )}
          {...props}
        >
          <SelectPrimitive.List>{children}</SelectPrimitive.List>
        </SelectPrimitive.Popup>
      </SelectPrimitive.Positioner>
    </SelectPrimitive.Portal>
  );
}

function SelectItem({ className, children, ...props }: SelectPrimitive.Item.Props) {
  return (
    <SelectPrimitive.Item
      data-slot="select-item"
      className={cn(
        "relative flex w-full cursor-default items-center gap-1.5 rounded-[8px] py-1.5 pr-8 pl-2.5 text-sm outline-none transition-colors select-none data-highlighted:bg-overlay-strong data-highlighted:text-ink data-highlighted:data-[variant=destructive]:**:*:text-ink",
        className,
      )}
      {...props}
    >
      <SelectPrimitive.ItemText className="flex flex-1 shrink-0">
        {children}
      </SelectPrimitive.ItemText>
      <SelectPrimitive.ItemIndicator
        render={
          <span className="pointer-events-none absolute right-2 flex size-4 items-center justify-center" />
        }
      >
        <CheckIcon className="size-3.5" />
      </SelectPrimitive.ItemIndicator>
    </SelectPrimitive.Item>
  );
}

export { Select, SelectContent, SelectItem, SelectTrigger, SelectValue };
