import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { ARABIC_LETTERS, LATIN_LETTERS, OTHER_LETTER } from "@/lib/sort";

// "أ – ي" button above a product list. Pressing it opens the alphabet; pressing a letter
// closes it and tells the list to scroll to the first product that starts with that letter.
// Both alphabets are always listed, Arabic first and English under it; letters no product
// starts with are greyed out. "0–9" (names that start with a number) is added when some
// product needs it.
export function LetterPicker({
  letters,
  onPick,
  className = "",
}: {
  // the letters that have at least one product
  letters: string[];
  onPick: (letter: string) => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const has = new Set(letters);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function letterButton(letter: string, label = letter) {
    const available = has.has(letter);
    return (
      <button
        key={letter}
        type="button"
        disabled={!available}
        onClick={() => {
          setOpen(false);
          onPick(letter);
        }}
        aria-label={`الانتقال إلى حرف ${label}`}
        className={`flex h-10 items-center justify-center rounded-xl text-base font-bold transition-colors ${
          available
            ? "bg-muted text-ink hover:bg-primary hover:text-primary-foreground"
            : "text-muted-foreground/35"
        }`}
      >
        {/* numbers always read left to right, also on this right-to-left page */}
        <span dir="ltr">{label}</span>
      </button>
    );
  }

  return (
    <div ref={rootRef} className={`relative shrink-0 ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="true"
        aria-expanded={open}
        aria-label="الانتقال إلى حرف"
        className={`flex h-12 items-center gap-1.5 rounded-full border px-4 text-sm font-bold whitespace-nowrap transition-colors ${
          open
            ? "border-primary bg-primary text-primary-foreground"
            : "border-border bg-card text-ink"
        }`}
      >
        أ – ي
        <ChevronDown className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div
          role="group"
          aria-label="الحروف"
          className="absolute top-full left-0 z-10 mt-2 max-h-[60vh] w-[min(19rem,calc(100vw-2rem))] overflow-y-auto overscroll-contain rounded-2xl border border-border bg-card p-3 shadow-[var(--shadow-card)]"
        >
          <p className="mb-2 text-xs text-muted-foreground">اختاري حرفًا للانتقال إليه</p>
          <div className="grid grid-cols-7 gap-1">{ARABIC_LETTERS.map((l) => letterButton(l))}</div>
          <div dir="ltr" className="mt-3 grid grid-cols-7 gap-1">
            {LATIN_LETTERS.map((l) => letterButton(l))}
          </div>
          {has.has(OTHER_LETTER) && (
            <div className="mt-3 grid grid-cols-7 gap-1">
              <div className="col-span-2">{letterButton(OTHER_LETTER, "0–9")}</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
