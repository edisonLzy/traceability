import { useRegisterCommands } from "@renderer/commands";
import { Button, type ButtonProps } from "@renderer/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogDescription,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@renderer/components/ui/dialog";
import { Input } from "@renderer/components/ui/input";
import { trpc } from "@renderer/lib/trpc";
import { Plus } from "lucide-react";
import { useCallback, useId, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

interface GraphCreateButtonProps extends Omit<ButtonProps, "onClick"> {
  projectId: string;
  registerCommand?: boolean;
}

/** Owns the create action, dialog form, and Agent Panel command registration. */
export function GraphCreateButton({
  children,
  projectId,
  registerCommand = true,
  ...buttonProps
}: GraphCreateButtonProps) {
  const navigate = useNavigate();
  const { create, isCreating } = useCreateGraph(projectId);
  const titleInputId = useId();
  const [isOpen, setIsOpen] = useState(false);
  const [title, setTitle] = useState("");

  const openDialog = useCallback(() => setIsOpen(true), []);

  useRegisterCommands(
    () =>
      registerCommand
        ? [
            {
              id: "explorer.graph.create",
              group: { id: "explorer", label: "Explorer", order: 30 },
              title: "Create Explorer Graph",
              description: "Create a new Explorer evidence graph",
              icon: Plus,
              keywords: ["graph", "explorer", "evidence"],
              action: openDialog,
            },
          ]
        : [],
    [openDialog, registerCommand],
  );

  const closeDialog = () => {
    if (isCreating) return;
    setIsOpen(false);
    setTitle("");
  };

  const handleCreate = async () => {
    const nextTitle = title.trim();
    if (!nextTitle || isCreating) return;

    try {
      const graph = await create(nextTitle);
      setIsOpen(false);
      setTitle("");
      toast.success("Graph created");
      navigate(`/explorer/${graph.id}`);
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Unable to create graph");
    }
  };

  return (
    <>
      <Button {...buttonProps} onClick={openDialog} type="button">
        {children ?? (
          <>
            <Plus className="size-3.5" /> New graph
          </>
        )}
      </Button>
      <Dialog onOpenChange={(open) => (open ? setIsOpen(true) : closeDialog())} open={isOpen}>
        <DialogContent>
          <DialogBody>
            <DialogHeader className="-mx-5 -mt-5">
              <DialogTitle>Create Explorer Graph</DialogTitle>
              <DialogDescription>
                Create an empty graph. Nodes can be added by Agent operations as your investigation
                progresses.
              </DialogDescription>
            </DialogHeader>
            <div className="pt-5">
              <label
                className="mb-1.5 block text-[11px] font-medium text-tertiary"
                htmlFor={titleInputId}
              >
                Graph title
              </label>
              <Input
                autoFocus
                id={titleInputId}
                onChange={(event) => setTitle(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") void handleCreate();
                }}
                placeholder="e.g. Checkout profile failure"
                value={title}
              />
            </div>
          </DialogBody>
          <DialogFooter>
            <Button disabled={isCreating} onClick={closeDialog} type="button" variant="ghost">
              Cancel
            </Button>
            <Button
              disabled={!title.trim() || isCreating}
              onClick={() => void handleCreate()}
              type="button"
              variant="primary"
            >
              <Plus className="size-3.5" /> {isCreating ? "Creating…" : "Create graph"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function useCreateGraph(projectId: string) {
  const mutation = trpc.graphs.create.useMutation();
  const utils = trpc.useUtils();

  const create = useCallback(
    async (title: string) => {
      const graph = await mutation.mutateAsync({ projectId, title });
      await utils.graphs.list.invalidate({ projectId });
      return graph;
    },
    [mutation, projectId, utils.graphs.list],
  );

  return { create, isCreating: mutation.isPending };
}
