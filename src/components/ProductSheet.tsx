import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { checkDiscountCode, coverImage, effectivePrice, type MenuItem } from "@/lib/shop.functions";
import { useCart, type CartOption } from "@/lib/cart";
import { Carousel } from "@/components/Carousel";
import { Photo } from "@/components/Photo";
import { useLockScroll } from "@/lib/back-layer";
import { cartQtyOfProduct, remainingForChoice, valueRemaining, valueStock } from "@/lib/stock";

export function formatPrice(price: number) {
  const n = Number(price);
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
}

export type AppliedDiscount = { code: string; price: number; ends_at: string | null };

function useNow(active: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [active]);
  return now;
}

// Time left as { days, clock }; days stay Arabic text and the clock is kept apart as a
// left-to-right run, so the two never get reordered into each other.
function countdown(endsAt: string, now: number) {
  const ms = new Date(endsAt).getTime() - now;
  if (ms <= 0) return null;
  const total = Math.floor(ms / 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    days: Math.floor(total / 86400),
    clock: `${pad(Math.floor((total % 86400) / 3600))}:${pad(Math.floor((total % 3600) / 60))}:${pad(total % 60)}`,
  };
}

// Bottom sheet for one product: photos, one tappable choice per variable (required), the
// product's minimum quantity, and — when the product has one — a discount-code field.
// Values with no pieces left are greyed out and can't be chosen until restocked.
export function ProductSheet({
  item,
  onClose,
  onAdd,
}: {
  item: MenuItem | null;
  onClose: () => void;
  onAdd: (
    item: MenuItem,
    options: CartOption[],
    qty: number,
    discount: AppliedDiscount | null,
  ) => void;
}) {
  const check = useServerFn(checkDiscountCode);
  const { lines } = useCart();
  const [picked, setPicked] = useState<Record<string, string>>({});
  const [preview, setPreview] = useState<string | null>(null);
  const [qty, setQty] = useState(1);
  const [showMissing, setShowMissing] = useState(false);
  const [codeInput, setCodeInput] = useState("");
  const [codeState, setCodeState] = useState<"idle" | "checking" | "invalid" | "expired">("idle");
  const [applied, setApplied] = useState<AppliedDiscount | null>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const now = useNow(!!item?.discount);

  // The minimum counts everything of this product already in the cart, so a second colour
  // doesn't have to meet the minimum again on its own.
  const inCart = item ? cartQtyOfProduct(lines, item.id) : 0;
  const minNeeded = item ? Math.max(1, item.min_qty - inCart) : 1;
  // pieces of the product still available after the cart; null = unlimited
  const remaining = item && item.stock !== null ? Math.max(0, item.stock - inCart) : null;
  const chosen: CartOption[] = item
    ? item.variables
        .filter((v) => picked[v.name])
        .map((v) => ({ name: v.name, value: picked[v.name]! }))
    : [];
  // ...and of the exact choice so far (each picked value has its own quantity)
  const choiceLeft = item ? remainingForChoice(item, lines, chosen) : null;

  useEffect(() => {
    setPicked({});
    setPreview(null);
    setQty(minNeeded);
    setShowMissing(false);
    setCodeInput("");
    setCodeState("idle");
    setApplied(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item?.id]);

  useLockScroll(!!item);
  useEffect(() => {
    if (!item) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [item, onClose]);

  // A chosen value that has run out meanwhile (another tab, a refreshed menu) is un-chosen.
  useEffect(() => {
    if (!item) return;
    setPicked((p) => {
      const next = { ...p };
      let changed = false;
      for (const [name, label] of Object.entries(p)) {
        if (valueRemaining(item, lines, name, label) === 0) {
          delete next[name];
          changed = true;
        }
      }
      return changed ? next : p;
    });
  }, [item, lines]);

  // Keep the quantity inside what this choice allows (and at least its minimum).
  const choiceMin =
    choiceLeft !== null && choiceLeft > 0 && choiceLeft < minNeeded ? choiceLeft : minNeeded;
  useEffect(() => {
    setQty((q) => {
      const up = Math.max(q, choiceMin);
      return choiceLeft !== null && choiceLeft > 0 ? Math.min(up, choiceLeft) : up;
    });
  }, [choiceLeft, choiceMin]);

  if (!item) return null;

  const discountOpen =
    !!item.discount &&
    (item.discount.ends_at === null || new Date(item.discount.ends_at).getTime() > now);
  const appliedLive =
    applied && (applied.ends_at === null || new Date(applied.ends_at).getTime() > now)
      ? applied
      : null;
  const unitPrice = appliedLive ? appliedLive.price : effectivePrice(item);

  const soldOut = item.stock === 0 || remaining === 0;
  // The product as a whole can't reach its minimum any more.
  const notEnoughForMin = remaining !== null && remaining > 0 && remaining < minNeeded;
  const maxQty = choiceLeft ?? 999;
  // This one choice has fewer pieces than the minimum: allow adding what there is — the
  // minimum can be completed with another value (the cart checks the minimum overall).
  const choiceShort = !notEnoughForMin && choiceLeft !== null && choiceLeft < minNeeded;
  const minQty = choiceShort ? Math.max(1, choiceLeft ?? 1) : minNeeded;
  const missing = item.variables.filter((v) => !picked[v.name]);

  const gallery = [
    item.image_url ? { url: item.image_url, ratio: item.image_ratio } : null,
    ...item.extra_images.map((url, i) => ({ url, ratio: item.extra_image_ratios[i] ?? null })),
  ].filter((x): x is { url: string; ratio: number | null } => x !== null);
  // No main or extra photos, but a value (colour) has one: show that instead of nothing.
  const fallbackCover = gallery.length === 0 ? coverImage(item) : null;
  if (fallbackCover) gallery.push({ url: fallbackCover, ratio: null });

  async function applyCode() {
    if (!item || !codeInput.trim()) return;
    setCodeState("checking");
    try {
      const res = await check({ data: { id: item.id, code: codeInput } });
      if (res.ok) {
        setApplied({
          code: codeInput.trim().replace(/\s+/g, "").toUpperCase(),
          price: res.price,
          ends_at: res.ends_at,
        });
        setCodeState("idle");
      } else {
        setApplied(null);
        setCodeState(res.reason);
      }
    } catch {
      setApplied(null);
      setCodeState("invalid");
    }
  }

  function submit() {
    if (!item || soldOut || notEnoughForMin) return;
    if (missing.length > 0) {
      setShowMissing(true);
      sheetRef.current
        ?.querySelector(`[data-variable="${CSS.escape(missing[0]!.name)}"]`)
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    if (maxQty <= 0) return;
    onAdd(
      item,
      item.variables.map((v) => ({ name: v.name, value: picked[v.name]! })),
      Math.max(1, Math.min(Math.max(minQty, qty), maxQty)),
      appliedLive,
    );
  }

  const endsIn = appliedLive?.ends_at ? countdown(appliedLive.ends_at, now) : null;

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
        // A value photo is a temporary preview: any tap in the sheet that isn't on a value
        // chip brings the product photos back. The tap still does its normal job too.
        onClickCapture={(e) => {
          if (preview && !(e.target as Element).closest("[data-value-chip]")) setPreview(null);
        }}
        className="animate-scale-in max-h-[92dvh] w-full max-w-md overflow-y-auto overscroll-contain rounded-t-[28px] bg-card pb-[env(safe-area-inset-bottom)] sm:rounded-[28px]"
      >
        <div className={`relative ${!preview && gallery.length === 0 ? "h-14" : ""}`}>
          {preview ? (
            <>
              <img src={preview} alt="" className="aspect-[3/4] w-full object-cover" />
              <p className="pointer-events-none absolute inset-x-0 bottom-3 mx-auto w-fit rounded-full bg-ink/70 px-4 py-1.5 text-xs text-white">
                اضغطي في أي مكان للعودة لصور المنتج
              </p>
            </>
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
            <div className="shrink-0 text-end">
              {unitPrice < Number(item.price) && (
                <p className="text-sm text-muted-foreground line-through">
                  {formatPrice(item.price)} د.ل
                </p>
              )}
              <p className="text-lg font-extrabold text-primary">
                {formatPrice(unitPrice)} <span className="text-xs font-bold">د.ل</span>
              </p>
            </div>
          </div>
          {item.description && (
            <p className="mt-2 text-sm leading-6 text-muted-foreground">{item.description}</p>
          )}
          {item.min_qty > 1 && (
            <p className="mt-3 w-fit rounded-full bg-accent px-3 py-1 text-xs font-bold text-accent-foreground">
              أقل كمية يمكن طلبها: {item.min_qty}
            </p>
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
                    const left = valueRemaining(item, lines, v.name, val.label);
                    const unavailable = left === 0;
                    // 0 in the shop = sold out; otherwise the rest is already in her cart
                    const tag = unavailable
                      ? valueStock(item.variables, v.name, val.label) === 0
                        ? "نفذ"
                        : "في السلة"
                      : null;
                    return (
                      <button
                        key={val.label}
                        type="button"
                        data-value-chip
                        aria-pressed={selected}
                        aria-disabled={unavailable}
                        disabled={unavailable}
                        onClick={() => {
                          if (unavailable) return;
                          setPicked((p) => ({ ...p, [v.name]: val.label }));
                          setPreview(val.image_url);
                          if (val.image_url)
                            sheetRef.current?.scrollTo({ top: 0, behavior: "smooth" });
                        }}
                        className={`flex min-h-11 items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition-colors ${
                          unavailable
                            ? "cursor-not-allowed border-border bg-muted text-muted-foreground opacity-60"
                            : selected
                              ? "border-primary bg-primary text-primary-foreground"
                              : "border-border bg-card text-ink hover:border-primary"
                        } ${val.image_url ? "ps-1.5" : "px-4"}`}
                      >
                        {val.image_url && (
                          <Photo
                            thumb
                            src={val.image_url}
                            className={`h-8 w-8 rounded-full object-cover ${unavailable ? "grayscale" : ""}`}
                          />
                        )}
                        <span className={unavailable ? "line-through" : ""}>{val.label}</span>
                        {tag && (
                          <span className="rounded-full bg-card px-1.5 text-[11px] font-bold">
                            {tag}
                          </span>
                        )}
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

          {discountOpen && !soldOut && (
            <div className="mt-5">
              <label htmlFor="discount-code" className="text-sm font-bold text-ink">
                كود خصم
              </label>
              {appliedLive ? (
                <div className="mt-2 rounded-2xl border border-primary/40 bg-accent p-3 text-sm">
                  <p className="font-bold text-accent-foreground">
                    تم تطبيق الكود «{appliedLive.code}» — السعر بعد الخصم{" "}
                    {formatPrice(appliedLive.price)} د.ل
                  </p>
                  {endsIn && (
                    <p className="mt-1 text-accent-foreground">
                      ينتهي الخصم خلال {endsIn.days > 0 ? `${endsIn.days} يوم و ` : ""}
                      <span dir="ltr" className="inline-block font-bold tabular-nums">
                        {endsIn.clock}
                      </span>
                    </p>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setApplied(null);
                      setCodeInput("");
                    }}
                    className="mt-1 text-xs text-muted-foreground underline"
                  >
                    إزالة الكود
                  </button>
                </div>
              ) : (
                <>
                  <div className="mt-2 flex gap-2">
                    <input
                      id="discount-code"
                      dir="auto"
                      value={codeInput}
                      onChange={(e) => {
                        setCodeInput(e.target.value);
                        if (codeState !== "checking") setCodeState("idle");
                      }}
                      onKeyDown={(e) => e.key === "Enter" && applyCode()}
                      placeholder="اكتبي الكود"
                      autoCapitalize="characters"
                      className={`h-11 w-full min-w-0 rounded-full border bg-background px-4 text-[16px] outline-none focus:border-primary ${
                        codeState === "invalid" || codeState === "expired"
                          ? "border-destructive"
                          : "border-border"
                      }`}
                    />
                    <button
                      type="button"
                      onClick={applyCode}
                      disabled={!codeInput.trim() || codeState === "checking"}
                      className="h-11 shrink-0 rounded-full border border-primary px-5 text-sm font-bold text-primary disabled:opacity-50"
                    >
                      {codeState === "checking" ? "..." : "تطبيق"}
                    </button>
                  </div>
                  {codeState === "invalid" && (
                    <p className="mt-1.5 text-sm text-destructive">الكود غير صحيح</p>
                  )}
                  {codeState === "expired" && (
                    <p className="mt-1.5 text-sm text-destructive">انتهت صلاحية هذا الكود</p>
                  )}
                </>
              )}
            </div>
          )}

          {!soldOut && !notEnoughForMin && (
            <div className="mt-6 flex items-center gap-3">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setQty((q) => Math.max(minQty, q - 1))}
                  disabled={qty <= minQty}
                  aria-label="إنقاص الكمية"
                  className="h-11 w-11 rounded-full bg-muted text-lg text-ink disabled:opacity-40"
                >
                  −
                </button>
                <span className="w-7 text-center font-bold text-ink">{qty}</span>
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
                  {formatPrice(unitPrice * qty)} <span className="text-xs">د.ل</span>
                </span>
              </button>
            </div>
          )}
          {(soldOut || notEnoughForMin) && (
            <p className="mt-6 rounded-full bg-muted px-4 py-3 text-center text-sm text-muted-foreground">
              {item.stock === 0
                ? "نفذت الكمية"
                : notEnoughForMin
                  ? `المتوفر (${remaining}) أقل من الحد الأدنى للطلب`
                  : `كل الكمية المتوفرة (${item.stock}) في سلتك`}
            </p>
          )}
          {!soldOut && choiceShort && (
            <p className="mt-3 text-center text-xs leading-5 text-accent-foreground">
              المتوفر من هذا الاختيار {choiceLeft} فقط — أكملي الحد الأدنى ({item.min_qty}) باختيار
              آخر
            </p>
          )}
          {!soldOut &&
            !choiceShort &&
            choiceLeft !== null &&
            choiceLeft > 0 &&
            choiceLeft <= 5 &&
            !notEnoughForMin && (
              <p className="mt-3 text-center text-xs text-muted-foreground">
                المتوفر {choiceLeft} فقط
              </p>
            )}
        </div>
      </div>
    </div>
  );
}
