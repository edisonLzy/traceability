import { Menu as MenuPrimitive } from "@base-ui/react/menu";
import { cn } from "@renderer/lib/utils";

const DropdownMenu = MenuPrimitive.Root;

function DropdownMenuTrigger({ ...props }: MenuPrimitive.Trigger.Props) {
  return <MenuPrimitive.Trigger data-slot="dropdown-menu-trigger" {...props} />;
}

function DropdownMenuContent({
  className,
  children,
  side = "bottom",
  sideOffset = 4,
  align = "start",
  ...props
}: MenuPrimitive.Popup.Props &
  Pick<MenuPrimitive.Positioner.Props, "align" | "side" | "sideOffset">) {
  return (
    <MenuPrimitive.Portal>
      <MenuPrimitive.Positioner side={side} sideOffset={sideOffset} align={align} className="z-50">
        <MenuPrimitive.Popup
          data-slot="dropdown-menu-content"
          className={cn(
            "min-w-48 overflow-hidden rounded-[12px] border border-hairline-strong bg-surface-glass-elevated p-1.5 text-muted shadow-[0_16px_50px_rgba(0,0,0,0.34),0_2px_12px_rgba(0,0,0,0.22)] backdrop-blur-2xl outline-none",
            className,
          )}
          {...props}
        >
          {children}
        </MenuPrimitive.Popup>
      </MenuPrimitive.Positioner>
    </MenuPrimitive.Portal>
  );
}

function DropdownMenuGroup({ className, ...props }: MenuPrimitive.Group.Props) {
  return <MenuPrimitive.Group data-slot="dropdown-menu-group" className={className} {...props} />;
}

function DropdownMenuLabel({ className, ...props }: MenuPrimitive.GroupLabel.Props) {
  return (
    <MenuPrimitive.GroupLabel
      data-slot="dropdown-menu-label"
      className={cn(
        "px-1.5 py-1.5 text-[10px] font-[660] uppercase tracking-[0.08em] text-tertiary",
        className,
      )}
      {...props}
    />
  );
}

function DropdownMenuItem({ className, ...props }: MenuPrimitive.Item.Props) {
  return (
    <MenuPrimitive.Item
      data-slot="dropdown-menu-item"
      className={cn(
        "flex h-8.5 w-full cursor-default items-center gap-2 rounded-lg px-2 text-[12px] text-tertiary outline-none transition-colors data-highlighted:bg-overlay data-highlighted:text-muted",
        className,
      )}
      {...props}
    />
  );
}

export {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
};
