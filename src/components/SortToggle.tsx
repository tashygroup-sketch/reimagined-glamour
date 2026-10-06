import type { NameOrder } from "@/lib/sort";

// Alphabetical order switch (أ–ي / ي–أ), used above the product lists in the shop and in the
// control panel.
export function SortToggle({
  value,
  onChange,
  className = "",
}: {
  value: NameOrder;
  onChange: (order: NameOrder) => void;
  className?: string;
}) {
  const options: { id: NameOrder; label: string; hint: string }[] = [
    { id: "az", label: "أ – ي", hint: "ترتيب أبجدي من الألف إلى الياء" },
    { id: "za", label: "ي – أ", hint: "ترتيب أبجدي من الياء إلى الألف" },
  ];
  return (
    <div
      role="group"
      aria-label="ترتيب المنتجات أبجديًا"
      className={`inline-flex shrink-0 items-center rounded-full bg-muted p-1 ${className}`}
    >
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          onClick={() => onChange(o.id)}
          aria-pressed={value === o.id}
          aria-label={o.hint}
          title={o.hint}
          className={`h-8 rounded-full px-3 text-sm font-bold whitespace-nowrap transition-colors ${
            value === o.id ? "bg-card text-ink shadow" : "text-muted-foreground"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
