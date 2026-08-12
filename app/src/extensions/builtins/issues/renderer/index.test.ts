import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  currentProjectId: "current-project",
  navigate: vi.fn(),
  useIssues: vi.fn(),
}));

vi.mock("@renderer/hooks/use-issues", () => ({ useIssues: mocks.useIssues }));
vi.mock("@renderer/store/project", () => ({ projectStore: {} }));
vi.mock("react-router-dom", () => ({ useNavigate: () => mocks.navigate }));
vi.mock("zustand", () => ({ useStore: () => mocks.currentProjectId }));

import type { IssuesListBlockProps } from "../common/types";
import { IssuesListBlock } from "./index";

function render(props: IssuesListBlockProps = { status: "all", limit: 20 }) {
  return renderToStaticMarkup(
    createElement(IssuesListBlock, {
      props,
      raw: JSON.stringify(props),
    }),
  );
}

function issue(id: string, status: string, title: string) {
  return {
    id,
    type: "error",
    title,
    status,
    eventCount: 2,
    lastSeen: "2026-08-12T00:00:00.000Z",
  };
}

describe("IssuesListBlock", () => {
  beforeEach(() => {
    mocks.currentProjectId = "current-project";
    mocks.navigate.mockReset();
    mocks.useIssues.mockReset();
  });

  it("falls back to the current project and passes the requested limit", () => {
    mocks.useIssues.mockReturnValue({ data: { data: [] }, error: null, isLoading: false });

    render({ status: "all", limit: 7 });

    expect(mocks.useIssues).toHaveBeenCalledWith({ projectId: "current-project", limit: 7 });
  });

  it("uses an explicit project and filters issues by normalized status", () => {
    mocks.useIssues.mockReturnValue({
      data: {
        data: [
          issue("issue-1", "unresolved", "Open issue"),
          issue("issue-2", "resolved", "Resolved issue"),
        ],
      },
      error: null,
      isLoading: false,
    });

    const markup = render({
      projectId: "11111111-1111-4111-8111-111111111111",
      status: "resolved",
      limit: 20,
    });

    expect(mocks.useIssues).toHaveBeenCalledWith({
      projectId: "11111111-1111-4111-8111-111111111111",
      limit: 20,
    });
    expect(markup).toContain("Resolved issue");
    expect(markup).not.toContain("Open issue");
  });

  it.each([
    [{ data: undefined, error: null, isLoading: true }, "Loading issues"],
    [{ data: { data: [] }, error: null, isLoading: false }, "No issues match these filters"],
    [
      { data: undefined, error: new Error("offline"), isLoading: false },
      "Could not load issues: offline",
    ],
  ])("renders query state %#", (query, expected) => {
    mocks.useIssues.mockReturnValue(query);
    expect(render()).toContain(expected);
  });

  it("shows a local error when no project can be resolved", () => {
    mocks.currentProjectId = "";
    mocks.useIssues.mockReturnValue({ data: undefined, error: null, isLoading: false });
    expect(render()).toContain("No current project is available");
  });
});
