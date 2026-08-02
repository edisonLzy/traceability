import { Layout } from "@renderer/pages/(protected)/_layout";
import { ExplorerPage } from "@renderer/pages/(protected)/Explorer";
import { InboxPage } from "@renderer/pages/(protected)/Inbox";
import { IssuesPage } from "@renderer/pages/(protected)/monitor/Issues";
import { IssueDetailPage } from "@renderer/pages/(protected)/monitor/Issues/detail";
import { SourcemapsPage } from "@renderer/pages/(protected)/monitor/Sourcemaps";
import { AuthGuard, GuestGuard } from "@renderer/pages/_auth";
import { LoginPage } from "@renderer/pages/Login";
import { MonitorErrorBoundary } from "@traceability/monitor/react";
import { createMemoryRouter, Navigate, type RouteObject } from "react-router-dom";

export const appRoutes: RouteObject[] = [
  {
    element: <GuestGuard />,
    children: [
      {
        path: "/login",
        element: (
          <MonitorErrorBoundary
            appName="login"
            fallback={
              <div className="flex h-screen items-center justify-center bg-canvas">
                <p className="text-[12px] text-tertiary">登录页面遇到错误，请刷新重试。</p>
              </div>
            }
          >
            <LoginPage />
          </MonitorErrorBoundary>
        ),
      },
    ],
  },
  {
    element: <AuthGuard />,
    children: [
      {
        element: <Layout />,
        children: [
          { index: true, element: <Navigate to="/monitor" replace /> },
          { path: "inbox", element: <InboxPage /> },
          {
            path: "monitor",
            children: [
              { index: true, element: <Navigate to="/monitor/issues" replace /> },
              { path: "issues", element: <IssuesPage /> },
              { path: "issues/:id", element: <IssueDetailPage /> },
              { path: "sourcemaps", element: <SourcemapsPage /> },
            ],
          },
          { path: "explorer", element: <ExplorerPage /> },
        ],
      },
    ],
  },
  { path: "*", element: <Navigate to="/inbox" replace /> },
];

export const router = createMemoryRouter(appRoutes);
