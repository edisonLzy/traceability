import issuesExtension from "@extensions/builtins/issues/renderer";
import projectsExtension from "@extensions/builtins/projects/renderer";
import subagentsExtension from "@extensions/builtins/subagents/renderer";
import {
  ExtensionProvider,
  ExtensionsContextAPIProvider,
  SharedPromptEditor,
  type ExtensionsContextAPI,
  type RendererExtensionDefinition,
} from "@extensions/core/renderer";
import { AuthProvider } from "@renderer/auth/AuthProvider";
import { CommandProvider } from "@renderer/commands";
import { TrpcErrorToaster } from "@renderer/components/TrpcErrorToaster";
import { Toaster } from "@renderer/components/ui/sonner";
import { CurrentProjectProvider } from "@renderer/context/current-project";
import { ElectronIPCProvider } from "@renderer/context/ElectronIPCProvider";
import { rendererTrpcClient, trpc } from "@renderer/lib/trpc";
import { router } from "@renderer/router";
import { agentStore } from "@renderer/store/agent";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useMemo } from "react";
import { RouterProvider } from "react-router-dom";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: true,
      retry: 1,
      staleTime: 15_000,
    },
  },
});

const installedRendererExtensions: RendererExtensionDefinition[] = [
  subagentsExtension,
  projectsExtension,
  issuesExtension,
];

export function App() {
  const extensionsContextAPI: ExtensionsContextAPI = useMemo(() => {
    return {
      getActiveSessionId: () => agentStore.getState().activeSessionId ?? null,
      sharedPromptEditor: SharedPromptEditor.create(),
    };
  }, []);

  return (
    <trpc.Provider client={rendererTrpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>
        <ElectronIPCProvider>
          <AuthProvider>
            <CurrentProjectProvider>
              <CommandProvider>
                <ExtensionProvider extensions={installedRendererExtensions}>
                  <ExtensionsContextAPIProvider api={extensionsContextAPI}>
                    <RouterProvider router={router} />
                    <TrpcErrorToaster />
                    <Toaster />
                  </ExtensionsContextAPIProvider>
                </ExtensionProvider>
              </CommandProvider>
            </CurrentProjectProvider>
          </AuthProvider>
        </ElectronIPCProvider>
      </QueryClientProvider>
    </trpc.Provider>
  );
}
