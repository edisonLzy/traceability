import { Layout } from "@renderer/pages/_layout";
import { ExplorerPage } from "@renderer/pages/explorer";
import { InboxPage } from "@renderer/pages/inbox";
import { IssuesPage } from "@renderer/pages/issues";
import { IssueDetailPage } from "@renderer/pages/issues/detail";
import { createMemoryRouter, Navigate } from "react-router-dom";

export const router = createMemoryRouter([
  {
    element: <Layout />,
    children: [
      { index: true, element: <Navigate to="/inbox" replace /> },
      { path: "inbox", element: <InboxPage /> },
      {
        path: "monitor",
        children: [
          { index: true, element: <Navigate to="/monitor/issues" replace /> },
          { path: "issues", element: <IssuesPage /> },
          { path: "issues/:id", element: <IssueDetailPage /> },
        ],
      },
      { path: "explorer", element: <ExplorerPage /> },
      { path: "*", element: <Navigate to="/inbox" replace /> },
    ],
  },
]);
