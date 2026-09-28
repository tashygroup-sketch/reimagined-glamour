import { useBackClose } from "@/lib/back-layer";

export function ConfirmDialog({
  open,
  title,
  confirmLabel = "حذف",
  cancelLabel = "إلغاء",
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  useBackClose(open, onCancel); // phone's back button = إلغاء
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4 backdrop-blur-sm">
      <div className="animate-scale-in w-full max-w-sm rounded-3xl bg-card p-6 text-center shadow-[var(--shadow-card)]">
        <p className="text-lg text-ink">{title}</p>
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
            className="flex-1 rounded-full bg-destructive px-4 py-2.5 text-sm font-medium text-destructive-foreground"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
