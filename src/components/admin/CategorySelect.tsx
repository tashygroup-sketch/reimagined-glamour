import { useEffect, useRef, useState } from "react";

export function CategorySelect({
  value,
  options,
  onChange,
  onAddNew,
  invalid,
}: {
  value: string;
  options: string[];
  onChange: (value: string) => void;
  onAddNew: () => void;
  invalid?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  // Close when tapping anywhere outside, or pressing Escape.
  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={`flex w-full items-center justify-between gap-2 rounded-2xl border bg-background px-4 py-3 text-right outline-none transition-colors ${
          open ? "border-primary" : invalid ? "border-destructive" : "border-border"
        }`}
      >
        <span className={value ? "text-ink" : "text-muted-foreground"}>
          {value || "اختر تصنيفًا"}
        </span>
        <svg
          viewBox="0 0 20 20"
          aria-hidden
          className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${
            open ? "rotate-180" : ""
          }`}
        >
          <path
            d="M5 7.5 10 12.5 15 7.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      {open && (
        <div
          role="listbox"
          className="animate-scale-in absolute inset-x-0 top-full z-30 mt-2 max-h-64 overflow-y-auto rounded-2xl border border-border bg-card p-1.5 shadow-[var(--shadow-card)]"
        >
          {options.map((opt) => (
            <button
              key={opt}
              type="button"
              role="option"
              aria-selected={opt === value}
              onClick={() => {
                onChange(opt);
                setOpen(false);
              }}
              className={`flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-right text-sm transition-colors ${
                opt === value ? "bg-accent text-ink" : "text-ink hover:bg-muted"
              }`}
            >
              {opt}
              {opt === value && <span className="text-primary">✓</span>}
            </button>
          ))}
          {options.length > 0 && <div className="my-1 h-px bg-border" />}
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              onAddNew();
            }}
            className="w-full rounded-xl px-3 py-2.5 text-right text-sm font-medium text-primary transition-colors hover:bg-primary/10"
          >
            + إضافة تصنيف جديد
          </button>
        </div>
      )}
    </div>
  );
}
