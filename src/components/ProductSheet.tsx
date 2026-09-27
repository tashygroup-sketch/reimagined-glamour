import { useEffect, useRef, useState } from "react";
import type { MenuItem } from "@/lib/shop.functions";
import type { CartOption } from "@/lib/cart";
import { Carousel } from "@/components/Carousel";

export function formatPrice(price: number) {
  const n = Number(price);
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
}

// Bottom sheet for one product: photos, description, and one tappable choice per variable.
// Adding to the cart stays blocked until every variable has a value — the missing ones are
// highlighted when the customer tries.
export function ProductSheet({
  item,
  remaining,
  onClose,
  onAdd,
}: {
  item: MenuItem | null;
  /** pieces still available after what's already in the cart; null = unlimited */
  remaining: number | null;
  onClose: () => void;
  onAdd: (item: MenuItem, options: CartOption[], qty: number) => void;
}) {
  const [picked, setPicked] = useState<Record<string, string>>({});
  const [qty, setQty] = useState(1);
  const [showMissing, setShowMissing] = useState(false);
  const sheetRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setPicked({});
    setQty(1);
    setShowMissing(false);
  }, [item?.id]);

  useEffect(() => {
    if (!item) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      document.removeEventListener("keydown", onKey);
    };
  }, [item, onClose]);

  if (!item) return null;

  const soldOut = item.stock === 0 || remaining === 0;
  const maxQty = remaining ?? 99;
  const missing = item.variables.filter((v) => !picked[v.name]);

  // The most recently relevant value photo replaces the gallery, so picking "أحمر" shows red.
  const pickedImage = [...item.variables]
    .reverse()
    .map((v) => v.values.find((x) => x.label === picked[v.name])?.image_url)
    .find(Boolean);

  const gallery = [
    item.image_url ? { url: item.image_url, ratio: item.image_ratio } : null,
    ...item.extra_images.map((url, i) => ({ url, ratio: item.extra_image_ratios[i] ?? null })),
  ].filter((x): x is { url: string; ratio: number | null } => x !== null);

  function submit() {
    if (!item || soldOut) return;
    if (missing.length > 0) {
      setShowMissing(true);
      sheetRef.current
        ?.querySelector(`[data-variable="${CSS.escape(missing[0]!.name)}"]`)
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    onAdd(
      item,
      item.variables.map((v) => ({ name: v.name, value: picked[v.name]! })),
      Math.min(qty, maxQty),
    );
  }

  return (
    <div
      className="fixed inset-0 z-40 flex items-end justify-center bg-ink/45 backdrop-blur-sm sm:items-center"
      onClick={onClose}
    >
      <div
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        aria-label={item.name}
        onClick={(e) => e.stopPropagation()}
        className="animate-scale-in max-h-[92dvh] w-full max-w-md overflow-y-auto overscroll-contain rounded-t-[28px] bg-card sm:rounded-[28px]"
      >
        <div className={`relative ${!pickedImage && gallery.length === 0 ? "h-14" : ""}`}>
          {pickedImage ? (
            <img src={pickedImage} alt="" className="aspect-[3/4] w-full object-cover" />
          ) : gallery.length > 0 ? (
            <Carousel images={gallery} />
          ) : null}
          <button
            onClick={onClose}
            aria-label="إغلاق"
            className="absolute top-3 left-3 flex h-10 w-10 items-center justify-center rounded-full bg-card/90 text-ink shadow"
          >
            ✕
          </button>
        </div>

        <div className="p-5">
          <div className="flex items-start justify-between gap-3">
            <h2 className="text-xl leading-snug font-bold text-ink">{item.name}</h2>
            <p className="shrink-0 text-lg font-extrabold text-primary">
              {formatPrice(item.price)} <span className="text-xs font-bold">د.ل</span>
            </p>
          </div>
          {item.description && (
            <p className="mt-2 text-sm leading-6 text-muted-foreground">{item.description}</p>
          )}

          {item.variables.map((v) => {
            const isMissing = showMissing && !picked[v.name];
            return (
              <fieldset key={v.name} data-variable={v.name} className="mt-5">
                <legend className="text-sm font-bold text-ink">
                  {v.name}
                  {picked[v.name] && (
                    <span className="font-normal text-muted-foreground">: {picked[v.name]}</span>
                  )}
                </legend>
                <div
                  className={`mt-2 flex flex-wrap gap-2 rounded-2xl ${
                    isMissing ? "ring-2 ring-destructive ring-offset-4 ring-offset-card" : ""
                  }`}
                >
                  {v.values.map((val) => {
                    const selected = picked[v.name] === val.label;
                    return (
                      <button
                        key={val.label}
                        type="button"
                        aria-pressed={selected}
                        onClick={() => setPicked((p) => ({ ...p, [v.name]: val.label }))}
                        className={`flex min-h-11 items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition-colors ${
                          selected
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-border bg-card text-ink hover:border-primary"
                        } ${val.image_url ? "ps-1.5" : "px-4"}`}
                      >
                        {val.image_url && (
                          <img
                            src={val.image_url}
                            alt=""
                            className="h-8 w-8 rounded-full object-cover"
                          />
                        )}
                        {val.label}
                      </button>
                    );
                  })}
                </div>
                {isMissing && (
                  <p className="mt-2 text-sm text-destructive">اختاري {v.name} أولاً</p>
                )}
              </fieldset>
            );
          })}

          {!soldOut && (
            <div className="mt-6 flex items-center gap-3">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setQty((q) => Math.max(1, q - 1))}
                  disabled={qty <= 1}
                  aria-label="إنقاص الكمية"
                  className="h-11 w-11 rounded-full bg-muted text-lg text-ink disabled:opacity-40"
                >
                  −
                </button>
                <span className="w-6 text-center font-bold text-ink">{qty}</span>
                <button
                  type="button"
                  onClick={() => setQty((q) => Math.min(maxQty, q + 1))}
                  disabled={qty >= maxQty}
                  aria-label="زيادة الكمية"
                  className="h-11 w-11 rounded-full bg-muted text-lg text-ink disabled:opacity-40"
                >
                  +
                </button>
              </div>
              <button
                type="button"
                onClick={submit}
                className={`flex h-12 flex-1 items-center justify-between rounded-full px-5 font-bold text-primary-foreground transition-opacity ${
                  missing.length > 0 ? "opacity-60" : ""
                }`}
                style={{ backgroundImage: "var(--gradient-pink)" }}
              >
                <span>أضيفي للسلة</span>
                <span>
                  {formatPrice(item.price * qty)} <span className="text-xs">د.ل</span>
                </span>
              </button>
            </div>
          )}
          {soldOut && (
            <p className="mt-6 rounded-full bg-muted py-3 text-center text-sm text-muted-foreground">
              {item.stock === 0 ? "نفذت الكمية" : `كل الكمية المتوفرة (${item.stock}) في سلتك`}
            </p>
          )}
          {remaining !== null && remaining > 0 && remaining <= 5 && (
            <p className="mt-3 text-center text-xs text-muted-foreground">
              المتوفر {remaining} فقط
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
