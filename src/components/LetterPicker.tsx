import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { ARABIC_LETTERS, LATIN_LETTERS, OTHER_LETTER } from "@/lib/sort";

// "أ – ي" button above a product list. Pressing it opens the alphabet; pressing a letter
// closes it and tells the list to scroll to the first product that starts with that letter.
// Both alphabets are always listed side by side — Arabic on the right, English on the left —
// so both are visible at once without scrolling, even on a small phone. Letters no product
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
  const panelRef = useRef<HTMLDivElement>(null);
  const has = new Set(letters);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    // Opened while the button is low on the screen: scroll so the whole list shows.
    const frame = requestAnimationFrame(() => {
      const r = panelRef.current?.getBoundingClientRect();
      if (r && r.bottom > window.innerHeight) {
        window.scrollBy({ top: r.bottom - window.innerHeight + 12, behavior: "smooth" });
      }
    });
    return () => {
      cancelAnimationFrame(frame);
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
        className={`flex h-9 items-center justify-center rounded-lg text-base font-bold transition-colors ${
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
          ref={panelRef}
          role="group"
          aria-label="الحروف"
          className="absolute top-full left-0 z-10 mt-2 max-h-[calc(100dvh-11.5rem)] w-[min(22rem,calc(100vw-2rem))] overflow-y-auto overscroll-contain rounded-2xl border border-border bg-card p-3 shadow-[var(--shadow-card)]"
        >
          <p className="mb-2 text-xs text-muted-foreground">اختاري حرفًا للانتقال إليه</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="mb-1 text-center text-xs font-bold text-primary">عربي</p>
              <div className="grid grid-cols-4 gap-1">
                {ARABIC_LETTERS.map((l) => letterButton(l))}
              </div>
            </div>
            <div dir="ltr">
              <p className="mb-1 text-center text-xs font-bold text-primary">English</p>
              <div className="grid grid-cols-4 gap-1">
                {LATIN_LETTERS.map((l) => letterButton(l))}
                {/* fills the two free places after Y Z, so it takes no extra row */}
                {has.has(OTHER_LETTER) && (
                  <div className="col-span-2">{letterButton(OTHER_LETTER, "0–9")}</div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
