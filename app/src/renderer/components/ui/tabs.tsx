import { Tabs as TabsPrimitive } from "@base-ui/react/tabs";
import { cn } from "@renderer/lib/utils";

function Tabs({ className, ...props }: TabsPrimitive.Root.Props) {
  return (
    <TabsPrimitive.Root data-slot="tabs" className={cn("flex flex-col", className)} {...props} />
  );
}

function TabsList({ className, ...props }: TabsPrimitive.List.Props) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      className={cn("flex gap-5 border-b border-hairline px-4.5", className)}
      {...props}
    />
  );
}

function TabsTrigger({ className, ...props }: TabsPrimitive.Tab.Props) {
  return (
    <TabsPrimitive.Tab
      data-slot="tabs-trigger"
      className={cn(
        "relative h-10.5 border-0 bg-transparent p-0 text-subtle transition-colors hover:text-ink data-active:text-primary-hover data-active:after:absolute data-active:after:inset-x-0 data-active:after:bottom-[-1px] data-active:after:h-0.5 data-active:after:rounded-full data-active:after:bg-primary data-active:after:shadow-glow",
        className,
      )}
      {...props}
    />
  );
}

function TabsContent({ className, ...props }: TabsPrimitive.Panel.Props) {
  return (
    <TabsPrimitive.Panel
      data-slot="tabs-content"
      className={cn("outline-none", className)}
      {...props}
    />
  );
}

export { Tabs, TabsContent, TabsList, TabsTrigger };
