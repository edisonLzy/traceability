import { Layout } from "@renderer/pages/(protected)/_layout";
import { ExplorerPage } from "@renderer/pages/(protected)/Explorer";
import { ExplorerGraphDetailPage } from "@renderer/pages/(protected)/Explorer/detail";
import { InboxPage } from "@renderer/pages/(protected)/Inbox";
import { IssuesPage } from "@renderer/pages/(protected)/monitor/Issues";
import { IssueDetailPage } from "@renderer/pages/(protected)/monitor/Issues/detail";
import { SourcemapsPage } from "@renderer/pages/(protected)/monitor/Sourcemaps";
import { AuthGuard, GuestGuard } from "@renderer/pages/_auth";
import { LoginPage } from "@renderer/pages/Login";
import { SettingsPage } from "@renderer/pages/settings";
import { SettingsModelsPage } from "@renderer/pages/settings/models";
import { createMemoryRouter, Navigate, type RouteObject } from "react-router-dom";

export const appRoutes: RouteObject[] = [
  {
    element: <GuestGuard />,
    children: [{ path: "/login", element: <LoginPage /> }],
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
          { path: "explorer/:graphId", element: <ExplorerGraphDetailPage /> },
        ],
      },
      {
        path: "settings",
        element: <SettingsPage />,
        children: [
          { index: true, element: <Navigate to="models" replace /> },
          { path: "models", element: <SettingsModelsPage /> },
        ],
      },
    ],
  },
  { path: "*", element: <Navigate to="/inbox" replace /> },
];

export const router = createMemoryRouter(appRoutes);
