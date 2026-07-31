import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@renderer/components/ui/dialog";
import { Field } from "@renderer/components/ui/field";
import { useCurrentProject } from "@renderer/context/current-project";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { useCreateProject } from "../_hooks/useCreateProject";

export function CreateProjectModal({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { setProjectId } = useCurrentProject();
  const createProjectMutation = useCreateProject();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");

  useEffect(() => {
    if (!open) {
      setName("");
      setSlug("");
    }
  }, [open]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!name.trim() || !slug.trim()) {
      toast("Enter a project name and slug");
      return;
    }
    try {
      const project = await createProjectMutation.mutateAsync({
        name: name.trim(),
        slug: slug.trim(),
      });
      setProjectId(project.project.id);
      onOpenChange(false);
      toast("Project added");
    } catch (cause) {
      toast(String(cause));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>Add project</DialogTitle>
            <DialogDescription>Create a monitored project and switch to it.</DialogDescription>
          </DialogHeader>
          <DialogBody>
            <Field
              label="Project name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. checkout-web"
              autoFocus
            />
            <Field
              label="Slug"
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              placeholder="checkout-web"
            />
          </DialogBody>
          <DialogFooter>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="inline-flex h-9 items-center rounded-lg px-3 text-sm text-subtle transition-colors hover:bg-surface-2 hover:text-ink"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="inline-flex h-9 items-center gap-2 rounded-lg border border-primary bg-primary px-3 text-sm font-medium text-[#111329] transition-colors hover:bg-primary-hover"
            >
              Add project
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
