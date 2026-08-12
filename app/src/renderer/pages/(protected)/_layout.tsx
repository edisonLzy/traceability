import { DotLottieReact } from "@lottiefiles/dotlottie-react";
import loadingAnimation from "@renderer/assets/loading-animation.lottie";
import { useCommandPalette, useRegisterCommands } from "@renderer/commands";
import { useTheme } from "@renderer/components/Themes";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@renderer/components/ui/breadcrumb";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@renderer/components/ui/resizable";
import { useElectronIPC } from "@renderer/context/ElectronIPCProvider";
import { useMinimumLoading } from "@renderer/hooks/use-minimum-loading";
import { authStore } from "@renderer/store/auth";
import {
  Bug,
  Columns2,
  Command,
  Compass,
  FileCode2,
  Inbox,
  LogOut,
  Maximize2,
  Monitor,
  Moon,
  PanelRightOpen,
  Radio,
  Sun,
} from "lucide-react";
import { Fragment, useMemo } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";

import { AgentPanel } from "./_components/AgentPanel";
import { FloatingAgentLauncher } from "./_components/AgentPanel/FloatingAgentLauncher";
import { CommandPalette } from "./_components/CommandPalette";
import { HeaderProjectSwitcher } from "./_components/HeaderProjectSwitcher";
import { ProjectOnboardingGuide } from "./_components/ProjectOnboardingGuide";
import { RefreshButton } from "./_components/RefreshButton";
import { Sidebar } from "./_components/Sidebar";
import { useAppLayout } from "./_hooks/useAppLayout";
import { useSetupProjects } from "./_hooks/useSetupProjects";

export function Layout() {
  const { projects, loading } = useSetupProjects();
  const showLoading = useMinimumLoading(loading);

  if (showLoading) return <LoadingState />;

  if (projects.length === 0) return <ProjectOnboardingGuide />;

  return <AppLayout />;
}

/** Hooks below only apply once a project has been selected. */
function AppLayout() {
  const { invoke } = useElectronIPC();
  const navigate = useNavigate();
  const { setTheme } = useTheme();
  const {
    getAgentPanelContainerProps,
    getAgentPanelProps,
    getFloatingAgentLauncherProps,
    getMainPanelProps,
    getMainRegionProps,
    getResizablePanelGroupProps,
    getResizeHandleProps,
    handleFocusAgent,
    handleFocusContent,
    handleSplitView,
    isFloatingAgentMode,
    layoutMode,
  } = useAppLayout();

  useRegisterCommands(
    () => [
      {
        id: "navigation.inbox",
        group: { id: "navigation", label: "Navigation", order: 10 },
        title: "Go to Inbox",
        description: "Open the inbox",
        icon: Inbox,
        keywords: ["home"],
        shortcut: "G B",
        action: () => navigate("/inbox"),
      },
      {
        id: "navigation.issues",
        group: { id: "navigation", label: "Navigation", order: 10 },
        title: "Go to Issues",
        description: "Open issue monitoring",
        icon: Bug,
        keywords: ["monitor", "errors"],
        shortcut: "G I",
        action: () => navigate("/monitor/issues"),
      },
      {
        id: "navigation.sourcemaps",
        group: { id: "navigation", label: "Navigation", order: 10 },
        title: "Go to Sourcemaps",
        description: "Manage uploaded source maps",
        icon: FileCode2,
        keywords: ["symbolicate", "debug"],
        shortcut: "G M",
        action: () => navigate("/monitor/sourcemaps"),
      },
      {
        id: "navigation.explorer",
        group: { id: "navigation", label: "Navigation", order: 10 },
        title: "Go to Explorer",
        description: "Open the explorer",
        icon: Compass,
        keywords: ["browse"],
        shortcut: "G X",
        action: () => navigate("/explorer"),
      },
      {
        id: "window.toggle-fullscreen",
        group: { id: "layout", label: "Layout", order: 30 },
        title: "Toggle full screen",
        description: "Enter or leave native window full screen",
        icon: Maximize2,
        keywords: ["window", "fullscreen", "maximize", "zoom"],
        action: async () => {
          const state = await invoke("toggleFullScreenWindow");
          document.documentElement.dataset.windowFullscreen = String(state.isFullScreen);
        },
      },
      {
        id: "layout.focus-content",
        group: { id: "layout", label: "Layout", order: 30 },
        title: "Focus content",
        description: "Give the workspace the full main region",
        icon: Maximize2,
        keywords: ["layout", "content", "maximize", "hide agent"],
        disabled: layoutMode === "content",
        action: handleFocusContent,
      },
      {
        id: "layout.focus-agent",
        group: { id: "layout", label: "Layout", order: 30 },
        title: "Focus agent",
        description: "Give the Agent the full main region",
        icon: PanelRightOpen,
        keywords: ["layout", "agent", "maximize", "chat"],
        disabled: layoutMode === "agent",
        action: handleFocusAgent,
      },
      {
        id: "layout.restore-split",
        group: { id: "layout", label: "Layout", order: 30 },
        title: "Restore split view",
        description: "Restore the previous workspace and Agent ratio",
        icon: Columns2,
        keywords: ["layout", "split", "panels", "restore"],
        disabled: layoutMode === "split",
        action: handleSplitView,
      },
      {
        id: "theme.light",
        group: { id: "theme", label: "主题", order: 60 },
        title: "Light mode",
        description: "Switch to the light theme",
        icon: Sun,
        keywords: ["appearance", "theme"],
        action: () => setTheme("light"),
      },
      {
        id: "theme.dark",
        group: { id: "theme", label: "主题", order: 60 },
        title: "Dark mode",
        description: "Switch to the dark theme",
        icon: Moon,
        keywords: ["appearance", "theme"],
        action: () => setTheme("dark"),
      },
      {
        id: "theme.system",
        group: { id: "theme", label: "主题", order: 60 },
        title: "System theme",
        description: "Follow the operating system theme",
        icon: Monitor,
        keywords: ["appearance", "theme", "auto"],
        action: () => setTheme("system"),
      },
      {
        id: "account.logout",
        group: { id: "account", label: "Account", order: 70 },
        title: "Logout",
        description: "Sign out and clear your session",
        icon: LogOut,
        keywords: ["sign out", "auth", "exit"],
        action: () => {
          void authStore.getState().logout();
        },
      },
    ],
    [handleFocusAgent, handleFocusContent, handleSplitView, invoke, layoutMode, navigate, setTheme],
  );

  return (
    <div className="h-screen overflow-hidden bg-transparent">
      <div className="flex h-full gap-2 px-2 pt-[calc(var(--titlebar-height)+0.5rem)] pb-2">
        <Sidebar />
        <div {...getMainRegionProps()}>
          <ResizablePanelGroup {...getResizablePanelGroupProps()}>
            <ResizablePanel {...getMainPanelProps()}>
              <main className="glass-panel flex h-full min-w-0 flex-col overflow-hidden rounded-[18px]">
                <header className="flex h-12 shrink-0 items-center gap-2 border-b border-hairline bg-surface-glass/75 px-[18px] backdrop-blur-2xl">
                  <HeaderBreadcrumb />
                  <div className="ml-auto flex items-center gap-2">
                    <CommandKButton />
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-success/15 bg-success/[0.07] px-2 py-1 text-[10px] text-success">
                      <Radio size={10} /> Live updates
                    </span>
                    <RefreshButton />
                  </div>
                </header>
                <div className="workspace-scroll-viewport mx-0.5 mb-0.5 min-h-0 flex-1 rounded-b-[15px] bg-surface-1/20">
                  <Outlet />
                </div>
              </main>
            </ResizablePanel>

            <ResizableHandle {...getResizeHandleProps()} />

            <ResizablePanel {...getAgentPanelProps()}>
              <div {...getAgentPanelContainerProps()}>
                <AgentPanel />
              </div>
            </ResizablePanel>
          </ResizablePanelGroup>

          {isFloatingAgentMode ? (
            <FloatingAgentLauncher {...getFloatingAgentLauncherProps()} />
          ) : null}
        </div>
      </div>
      <CommandPalette />
    </div>
  );
}

function LoadingState() {
  return (
    <div className="app-drag-region relative flex h-screen items-center justify-center overflow-hidden bg-canvas">
      <DotLottieReact
        src={loadingAnimation}
        autoplay
        loop
        aria-label="Loading Traceability"
        className="h-52 w-52"
      />
    </div>
  );
}

/** Header breadcrumb: app switcher followed by the resolved route segments. */
function HeaderBreadcrumb() {
  const location = useLocation();

  const navigate = useNavigate();

  const pathname = location.pathname;
  const segments = useMemo(() => {
    const { pathname } = location;
    if (pathname === "/inbox") return [{ label: "Inbox" }];
    if (pathname === "/explorer") return [{ label: "Explorer" }];
    if (pathname === "/monitor/sourcemaps") return [{ label: "Monitor" }, { label: "Sourcemaps" }];
    const issueMatch = pathname.match(/^\/monitor\/issues\/(.+)$/);
    if (issueMatch)
      return [
        { label: "Monitor" },
        { label: "Issues", to: "/monitor/issues" },
        { label: issueMatch[1] ?? "", mono: true },
      ];
    return [{ label: "Monitor" }, { label: "Issues" }];
  }, [pathname]);

  return (
    <Breadcrumb>
      <BreadcrumbList>
        <BreadcrumbItem>
          <HeaderProjectSwitcher />
        </BreadcrumbItem>
        {segments.map((segment, index) => {
          const isLast = index === segments.length - 1;
          const to = segment.to;
          return (
            <Fragment key={index}>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                {isLast ? (
                  <BreadcrumbPage className={segment.mono ? "font-mono" : undefined}>
                    {segment.label}
                  </BreadcrumbPage>
                ) : to ? (
                  <BreadcrumbLink
                    href={to}
                    onClick={(event) => {
                      event.preventDefault();
                      navigate(to);
                    }}
                  >
                    {segment.label}
                  </BreadcrumbLink>
                ) : (
                  <span className="truncate text-tertiary">{segment.label}</span>
                )}
              </BreadcrumbItem>
            </Fragment>
          );
        })}
      </BreadcrumbList>
    </Breadcrumb>
  );
}

function CommandKButton() {
  const { open: openCommands } = useCommandPalette();
  return (
    <button
      type="button"
      onClick={openCommands}
      title="Open command palette"
      className="glass-control inline-flex h-7 items-center gap-1.5 rounded-lg px-2 text-[10px] text-tertiary transition-colors hover:bg-overlay-strong hover:text-ink"
    >
      <Command size={13} /> Command <kbd className="font-mono">⌘K</kbd>
    </button>
  );
}
