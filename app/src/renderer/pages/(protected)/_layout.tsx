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
import { useMinimumLoading } from "@renderer/hooks/use-minimum-loading";
import { authStore } from "@renderer/store/auth";
import {
  Bug,
  Command,
  Compass,
  FileCode2,
  Inbox,
  LogOut,
  Monitor,
  Moon,
  Radio,
  Sun,
} from "lucide-react";
import { Fragment, useMemo } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";

import { AgentPanel } from "./_components/AgentPanel";
import { CommandPalette } from "./_components/CommandPalette";
import { HeaderProjectSwitcher } from "./_components/HeaderProjectSwitcher";
import { ProjectOnboardingGuide } from "./_components/ProjectOnboardingGuide";
import { RefreshButton } from "./_components/RefreshButton";
import { Sidebar } from "./_components/Sidebar";
import { Titlebar } from "./_components/Titlebar";
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
  const navigate = useNavigate();
  const { setTheme } = useTheme();

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
    [navigate, setTheme],
  );

  return (
    <div className="h-screen overflow-hidden">
      <Titlebar />
      <div className="flex h-full pt-[30px]">
        <Sidebar />
        <ResizablePanelGroup orientation="horizontal" className="min-w-0 flex-1">
          <ResizablePanel defaultSize="60%" minSize="45%">
            <main className="flex h-full min-w-0 flex-col">
              <header className="flex h-12 shrink-0 items-center gap-2 border-b border-hairline bg-surface-glass px-[22px] backdrop-blur-xl">
                <HeaderBreadcrumb />
                <div className="ml-auto flex items-center gap-2">
                  <CommandKButton />
                  <span className="inline-flex items-center gap-1.5 text-[11px] text-tertiary">
                    <Radio size={11} className="text-success" /> Live updates
                  </span>
                  <RefreshButton />
                </div>
              </header>
              <div className="min-h-0 flex-1 overflow-auto">
                <Outlet />
              </div>
            </main>
          </ResizablePanel>
          <ResizableHandle className="w-px bg-hairline transition-colors hover:bg-primary/70 focus-visible:bg-primary" />
          <ResizablePanel defaultSize="40%" minSize="30%" maxSize="55%">
            <AgentPanel />
          </ResizablePanel>
        </ResizablePanelGroup>
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
      className="inline-flex h-7 items-center gap-1.5 rounded-[7px] border border-hairline bg-overlay px-2 text-[10px] text-tertiary transition-colors hover:border-hairline-strong hover:bg-overlay-strong hover:text-muted"
    >
      <Command size={13} /> Command <kbd className="font-mono">⌘K</kbd>
    </button>
  );
}
