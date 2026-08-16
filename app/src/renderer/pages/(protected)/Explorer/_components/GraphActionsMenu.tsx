import { Button } from "@renderer/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogDescription,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@renderer/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@renderer/components/ui/dropdown-menu";
import { Input } from "@renderer/components/ui/input";
import type { ExplorerGraphSummary } from "@renderer/lib/explorer-types";
import { trpc } from "@renderer/lib/trpc";
import { Archive, LoaderCircle, MoreHorizontal, Pencil } from "lucide-react";
import { useCallback, useState } from "react";
import { toast } from "sonner";

/** Owns graph row actions, including the rename dialog and archive mutation. */
export function GraphActionsMenu({
  graph,
  projectId,
}: {
  graph: ExplorerGraphSummary;
  projectId: string;
}) {
  const { archive, isArchiving } = useArchiveGraph(projectId);

  const handleArchive = async () => {
    if (isArchiving) return;
    try {
      await archive(graph.id);
      toast.success("Graph archived");
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Unable to archive graph");
    }
  };

  return (
    <>
      <div onClick={(event) => event.stopPropagation()}>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                aria-label={`Graph actions for ${graph.title}`}
                size="icon-sm"
                variant="ghost"
              />
            }
          >
            <MoreHorizontal className="size-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" sideOffset={6}>
            <DropdownMenuItem
              disabled
              className="pointer-events-none text-[10px] uppercase tracking-[0.08em]"
            >
              Graph actions
            </DropdownMenuItem>
            <RenameButton graph={graph} projectId={projectId} />
            {graph.status === "active" ? (
              <DropdownMenuItem
                className="text-danger data-highlighted:text-danger"
                onClick={() => void handleArchive()}
              >
                {isArchiving ? (
                  <LoaderCircle className="size-3.5 animate-spin" />
                ) : (
                  <Archive className="size-3.5" />
                )}
                {isArchiving ? "Archiving…" : "Archive"}
              </DropdownMenuItem>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </>
  );
}

function RenameButton({ graph, projectId }: { graph: ExplorerGraphSummary; projectId: string }) {
  const { isRenaming, rename } = useRenameGraph(projectId);
  const [isOpen, setIsOpen] = useState(false);
  const [title, setTitle] = useState(graph.title);

  const openDialog = () => {
    setTitle(graph.title);
    setIsOpen(true);
  };

  const closeDialog = () => {
    if (!isRenaming) setIsOpen(false);
  };

  const handleRename = async () => {
    const nextTitle = title.trim();
    if (!nextTitle || nextTitle === graph.title || isRenaming) return;

    try {
      await rename(graph.id, nextTitle);
      setIsOpen(false);
      toast.success("Graph renamed");
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Unable to rename graph");
    }
  };

  return (
    <>
      <DropdownMenuItem closeOnClick={false} onClick={openDialog}>
        <Pencil className="size-3.5" /> Rename
      </DropdownMenuItem>
      <Dialog onOpenChange={(open) => (open ? setIsOpen(true) : closeDialog())} open={isOpen}>
        <DialogContent backdropClassName="z-[55]" className="z-[60]">
          <DialogBody>
            <DialogHeader className="-mx-5 -mt-5">
              <DialogTitle>Rename Explorer Graph</DialogTitle>
              <DialogDescription>Choose a clear title for this investigation.</DialogDescription>
            </DialogHeader>
            <div className="pt-5">
              <label
                className="mb-1.5 block text-[11px] font-medium text-tertiary"
                htmlFor={`rename-${graph.id}`}
              >
                Graph title
              </label>
              <Input
                autoFocus
                id={`rename-${graph.id}`}
                onChange={(event) => setTitle(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") void handleRename();
                }}
                value={title}
              />
            </div>
          </DialogBody>
          <DialogFooter>
            <Button disabled={isRenaming} onClick={closeDialog} type="button" variant="ghost">
              Cancel
            </Button>
            <Button
              disabled={!title.trim() || title.trim() === graph.title || isRenaming}
              onClick={() => void handleRename()}
              type="button"
              variant="primary"
            >
              {isRenaming ? "Saving…" : "Save changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function useRenameGraph(projectId: string) {
  const mutation = trpc.graphs.rename.useMutation();
  const utils = trpc.useUtils();

  const rename = useCallback(
    async (graphId: string, title: string) => {
      const graph = await mutation.mutateAsync({ graphId, projectId, title });
      await utils.graphs.list.invalidate({ projectId });
      return graph;
    },
    [mutation, projectId, utils.graphs.list],
  );

  return { isRenaming: mutation.isPending, rename };
}

function useArchiveGraph(projectId: string) {
  const mutation = trpc.graphs.archive.useMutation();
  const utils = trpc.useUtils();

  const archive = useCallback(
    async (graphId: string) => {
      const graph = await mutation.mutateAsync({ graphId, projectId });
      await utils.graphs.list.invalidate({ projectId });
      return graph;
    },
    [mutation, projectId, utils.graphs.list],
  );

  return { archive, isArchiving: mutation.isPending };
}
