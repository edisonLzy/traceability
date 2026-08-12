import { Toaster as SonnerToaster } from "sonner";

import { useTheme } from "../Themes";

export function Toaster() {
  const { resolvedTheme } = useTheme();

  return (
    <SonnerToaster
      theme={resolvedTheme}
      position="bottom-center"
      offset="28px"
      toastOptions={{
        classNames: {
          toast:
            "rounded-[12px] border border-hairline-strong bg-surface-glass-elevated px-3.5 py-2.5 text-muted text-sm shadow-glass backdrop-blur-2xl",
        },
      }}
    />
  );
}
