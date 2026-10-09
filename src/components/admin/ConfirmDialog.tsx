import { useBackClose } from "@/lib/back-layer";

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "حذف",
  cancelLabel = "إلغاء",
  tone = "danger",
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  // a line of detail under the title
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  // "danger" (red) for deleting, "primary" for anything else
  tone?: "danger" | "primary";
  onConfirm: () => void;
  onCancel: () => void;
}) {
  useBackClose(open, onCancel); // phone's back button = إلغاء
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4 backdrop-blur-sm">
      <div className="animate-scale-in w-full max-w-sm rounded-3xl bg-card p-6 text-center shadow-[var(--shadow-card)]">
        <p className="text-lg text-ink">{title}</p>
        {message && <p className="mt-2 text-sm leading-6 text-muted-foreground">{message}</p>}
        <div className="mt-6 flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 rounded-full border border-border px-4 py-2.5 text-sm text-ink"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={
              tone === "danger"
                ? "flex-1 rounded-full bg-destructive px-4 py-2.5 text-sm font-medium text-destructive-foreground"
                : "flex-1 rounded-full bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground"
            }
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
