import { Input } from "@renderer/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@renderer/components/ui/table";
import type { ExplorerGraphSummary } from "@renderer/lib/explorer-types";
import { trpc } from "@renderer/lib/trpc";
import { cn } from "@renderer/lib/utils";
import { projectStore } from "@renderer/store/project";
import { Compass, Search, Sparkles } from "lucide-react";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useStore } from "zustand";

import { GraphActionsMenu } from "./_components/GraphActionsMenu";
import { GraphCreateButton } from "./_components/GraphCreateButton";

export function ExplorerPage() {
  const project = useStore(projectStore, (state) => state.currentProject);

  if (!project) {
    return (
      <div className="p-6 text-[12px] text-tertiary">Select a project to view Explorer Graphs.</div>
    );
  }

  return <ExplorerPageContent projectId={project.id} />;
}

function ExplorerPageContent({ projectId }: { projectId: string }) {
  const navigate = useNavigate();
  const { error, graphs, isLoading } = useGraphList(projectId);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"all" | "active" | "archived">("all");

  const filteredGraphs = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return graphs.filter((graph) => {
      const matchesQuery = !normalized || graph.title.toLowerCase().includes(normalized);
      const matchesStatus = status === "all" || graph.status === status;
      return matchesQuery && matchesStatus;
    });
  }, [graphs, query, status]);

  return (
    <div className="mx-auto flex min-h-full max-w-[1260px] flex-col gap-4 px-[22px] pt-[22px] pb-12">
      <section className="glass-control rounded-[16px] p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="mb-2 flex items-center gap-2 text-[10px] font-[700] uppercase tracking-[0.11em] text-tertiary">
              <Compass className="size-3.5 text-primary" /> Explorer / Evidence Graph
            </div>
            <h1 className="m-0 text-[22px] font-[680] tracking-[-0.03em] text-ink">
              Investigations that stay connected.
            </h1>
            <p className="mt-2 max-w-[590px] text-[12px] leading-5 text-tertiary">
              Turn an issue, a question, and the evidence around it into a graph you can return to.
              Start from the Agent Panel with{" "}
              <span className="font-mono text-primary-hover">/explorer-graph-create</span> when you
              are ready.
            </p>
          </div>
          <GraphCreateButton
            className="min-h-8 rounded-[8px] border-primary/25 bg-primary/10 px-3 text-[11px] font-[620] text-primary-hover transition-colors hover:bg-primary/15"
            projectId={projectId}
            variant="ghost"
          />
        </div>
      </section>

      <section className="flex min-h-0 flex-1 flex-col rounded-[16px] border border-hairline bg-surface-1/40 p-3 shadow-glass">
        <div className="flex flex-wrap items-center gap-2 border-b border-hairline px-1 pb-3">
          <div className="relative min-w-[220px] flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-tertiary" />
            <Input
              aria-label="Search graphs"
              className="h-8 rounded-[8px] bg-surface-1/50 pl-8 pr-2 text-[11px]"
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search graphs"
              value={query}
            />
          </div>
          <div className="flex items-center gap-1 rounded-[8px] border border-hairline bg-surface-1/50 p-0.5">
            {["all", "active", "archived"].map((item) => (
              <button
                className={
                  item === status
                    ? "rounded-[6px] bg-overlay-strong px-2.5 py-1.5 text-[10px] font-[620] text-ink"
                    : "rounded-[6px] px-2.5 py-1.5 text-[10px] text-tertiary hover:bg-overlay"
                }
                key={item}
                onClick={() => setStatus(item as typeof status)}
                type="button"
              >
                {item[0]!.toUpperCase() + item.slice(1)}
              </button>
            ))}
          </div>
          <span className="ml-auto text-[10px] text-tertiary">
            {filteredGraphs.length} graph{filteredGraphs.length === 1 ? "" : "s"}
          </span>
        </div>

        {isLoading ? (
          <div className="flex flex-1 items-center justify-center py-16 text-[11px] text-tertiary">
            Loading graphs…
          </div>
        ) : null}
        {error ? (
          <div className="m-4 rounded-[10px] border border-danger/20 bg-danger/5 px-3 py-2 text-[11px] text-danger">
            Unable to load graphs: {error.message}
          </div>
        ) : null}
        {!isLoading && !error && filteredGraphs.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center px-5 py-16 text-center">
            <span className="mb-3 grid size-10 place-items-center rounded-[12px] border border-primary/20 bg-primary/10 text-primary-hover">
              <Sparkles className="size-4" />
            </span>
            <h2 className="m-0 text-[14px] font-[650] text-ink">
              {graphs.length === 0 ? "No Explorer Graphs yet" : "No matching graphs"}
            </h2>
            <p className="mt-1.5 max-w-[360px] text-[11px] leading-5 text-tertiary">
              {graphs.length === 0
                ? "Use the registered slash command in Agent Panel or create an empty graph to start building evidence."
                : "Try a different search term or status filter."}
            </p>
            {graphs.length === 0 ? (
              <GraphCreateButton
                className="mt-4 min-h-8 rounded-[8px] border-primary/25 bg-primary/10 px-3 text-[11px] font-[620] text-primary-hover"
                projectId={projectId}
                registerCommand={false}
                variant="ghost"
              >
                <span className="inline-flex items-center gap-1.5">
                  <Sparkles className="size-3.5" /> Create graph
                </span>
              </GraphCreateButton>
            ) : null}
          </div>
        ) : null}

        {!isLoading && !error && filteredGraphs.length > 0 ? (
          <div className="min-h-0 overflow-auto pt-3">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Graph</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Version</TableHead>
                  <TableHead>Updated</TableHead>
                  <TableHead>Graph ID</TableHead>
                  <TableHead className="w-12 text-right" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredGraphs.map((graph) => (
                  <TableRow
                    aria-label={`Open ${graph.title}`}
                    className="group cursor-pointer"
                    key={graph.id}
                    onClick={() => navigate(`/explorer/${graph.id}`)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        navigate(`/explorer/${graph.id}`);
                      }
                    }}
                    tabIndex={0}
                  >
                    <TableCell>
                      <div className="flex min-w-0 items-center gap-2.5">
                        <span className="grid size-8 shrink-0 place-items-center rounded-[9px] border border-primary/20 bg-primary/10 text-primary-hover">
                          <Compass className="size-4" />
                        </span>
                        <div className="min-w-0">
                          <p className="truncate text-[12px] font-[660] text-ink">{graph.title}</p>
                          <p className="mt-0.5 truncate text-[10px] text-tertiary">
                            Evidence graph
                          </p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <span
                        className={cn(
                          "inline-flex items-center gap-1.5 text-[10px]",
                          graph.status === "active" ? "text-success" : "text-tertiary",
                        )}
                      >
                        <span className="size-1.5 rounded-full bg-current" />
                        {graph.status === "active" ? "Active" : "Archived"}
                      </span>
                    </TableCell>
                    <TableCell className="text-[11px] text-tertiary">v{graph.version}</TableCell>
                    <TableCell className="text-[11px] text-tertiary">
                      {formatDate(graph.updatedAt)}
                    </TableCell>
                    <TableCell className="font-mono text-[10px] text-tertiary">
                      {graph.id.slice(0, 8)}
                    </TableCell>
                    <TableCell className="text-right">
                      <GraphActionsMenu graph={graph} projectId={projectId} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : null}
      </section>
    </div>
  );
}

function useGraphList(projectId: string) {
  const query = trpc.graphs.list.useQuery({ projectId }, { staleTime: 10_000 });

  return {
    error: query.error as Error | null,
    graphs: query.data ?? [],
    isLoading: query.isLoading,
  };
}

function formatDate(value: ExplorerGraphSummary["updatedAt"]) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "recently";
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(date);
}
