import { Pencil } from "lucide-react";

interface EditMessageButtonProps {
  isRunning: boolean;
  onEdit: () => void;
}

/**
 * Self-contained edit button for user messages.
 * Disabled while the session is running to avoid concurrent conflicts.
 * Fires the onEdit callback to let the parent switch into edit mode.
 */
export function EditMessageButton({ isRunning, onEdit }: EditMessageButtonProps) {
  return (
    <button
      type="button"
      disabled={isRunning}
      onClick={onEdit}
      title="编辑"
      aria-label="编辑"
      className="grid size-5 place-items-center rounded text-muted-foreground transition-colors hover:bg-muted-surface hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed"
    >
      <Pencil className="size-3.5" />
    </button>
  );
}
