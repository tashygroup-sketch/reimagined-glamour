import { useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { optionsLabel, useCart } from "@/lib/cart";
import { buildWhatsAppDraft } from "@/lib/whatsapp";
import { createOrder } from "@/lib/shop.functions";
import { useLockScroll } from "@/lib/back-layer";
import { LIBYAN_MOBILE, normalizeLibyanPhone, westernDigits } from "@/lib/phone";

const EMPTY_FORM = { name: "", phone: "", address: "", notes: "" };

export function BookingDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { lines, total, clear } = useCart();
  const submit = useServerFn(createOrder);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [form, setForm] = useState(EMPTY_FORM);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draftUrl, setDraftUrl] = useState<string | null>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);

  const [locating, setLocating] = useState(false);
  const [locationUrl, setLocationUrl] = useState<string | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);

  // Reset to a clean form every time the dialog opens, so placing one order doesn't leave
  // the confirmation screen (or stale field values) showing the next time it's opened.
  useEffect(() => {
    if (!open) return;
    setForm(EMPTY_FORM);
    setError(null);
    setDraftUrl(null);
    setLocationUrl(null);
    setLocationError(null);
    setLocating(false);
  }, [open]);

  useLockScroll(open);

  // An error appears just above the send button; on a phone the keyboard or the scroll
  // position can hide it, which looked like "the button does nothing". Bring it into view.
  useEffect(() => {
    if (error) errorRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [error]);

  if (!open) return null;

  const field = (k: keyof typeof form) => ({
    value: form[k],
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm((f) => ({ ...f, [k]: e.target.value })),
  });

  function shareLocation() {
    if (!("geolocation" in navigator)) {
      setLocationError("المتصفح لا يدعم تحديد الموقع");
      return;
    }
    setLocating(true);
    setLocationError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        setLocationUrl(`https://www.google.com/maps?q=${latitude},${longitude}`);
        setLocating(false);
      },
      () => {
        setLocationError("تعذّر الحصول على الموقع، تأكدي من السماح بالوصول للموقع من المتصفح");
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    // However it was typed (Arabic keypad digits, +218…, spaces, iPhone AutoFill), the number
    // is checked and sent as 09xxxxxxxx.
    const phone = normalizeLibyanPhone(form.phone);
    setBusy(true);
    try {
      const res = await submit({
        data: {
          customer_name: form.name,
          phone,
          address: form.address,
          notes: form.notes,
          ...(locationUrl ? { location_url: locationUrl } : {}),
          items: lines.map((l) => ({
            id: l.id,
            name: l.name,
            qty: l.qty,
            price: l.price,
            ...(l.options?.length ? { options: l.options } : {}),
            ...(l.discount_code ? { discount_code: l.discount_code } : {}),
          })),
          total,
        },
      });

      if (res.isAdmin) {
        localStorage.setItem("glamour-admin-phone", phone);
        // replace: back from the control panel returns to the shop, not to this form
        navigate({ to: "/admin", replace: true });
        return;
      }

      const url = buildWhatsAppDraft(
        {
          name: form.name,
          phone,
          address: form.address,
          notes: form.notes,
          ...(locationUrl ? { locationUrl } : {}),
        },
        lines,
        total,
      );
      setDraftUrl(url);
      clear();
      // stock just went down on the server; refresh so sold-out items grey out right away
      queryClient.invalidateQueries({ queryKey: ["menu"] });
      openWhatsApp(url);
    } catch (err) {
      // TypeError = the request never reached the server (no signal, "Load failed")
      setError(
        err instanceof TypeError
          ? "تعذّر الاتصال، تأكدي من الإنترنت وحاولي مرة أخرى"
          : err instanceof Error
            ? err.message
            : "تعذّر إرسال الطلب، حاولي مرة أخرى",
      );
    } finally {
      setBusy(false);
    }
  }

  // The order only reaches the shop once the WhatsApp message is sent, so WhatsApp has to
  // open. A new tab is tried first, but iPhone Safari (and others, after a slow answer from
  // the server) silently blocks a tab that isn't opened directly by a tap — that's what made
  // the button "sometimes not work". When the tab is blocked, this page itself goes to
  // WhatsApp instead, which is never blocked. The confirmation screen also has a WhatsApp
  // button, for the rare browser that opens nothing at all.
  function openWhatsApp(url: string) {
    let tab: Window | null = null;
    try {
      tab = window.open(url, "_blank");
    } catch {
      tab = null;
    }
    if (!tab) window.location.assign(url);
  }

  // Shown under the field while typing, so a wrong number is noticed before sending.
  const phoneDigits = normalizeLibyanPhone(form.phone);
  const phoneLooksWrong = phoneDigits.length >= 10 && !LIBYAN_MOBILE.test(phoneDigits);

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center overflow-hidden bg-ink/40 backdrop-blur-sm sm:items-center">
      <div className="animate-scale-in max-h-[92dvh] w-full max-w-lg overflow-y-auto overscroll-contain rounded-t-3xl bg-card p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] shadow-[var(--shadow-card)] sm:rounded-3xl">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-2xl text-ink">أكملي طلبك</h2>
          </div>
          <button
            onClick={onClose}
            className="rounded-full px-3 py-1 text-muted-foreground hover:bg-muted"
          >
            ✕
          </button>
        </div>

        {draftUrl ? (
          <div className="mt-6 text-center">
            <p className="text-lg text-ink">تم تسجيل طلبك 💄</p>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              يصل الطلب للمتجر عند إرسال رسالة الواتساب. إذا لم يُفتح واتساب، اضغطي الزر:
            </p>
            {/* a real link: a direct tap on it opens WhatsApp in every browser */}
            <a
              href={draftUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-full bg-[#25D366] px-6 py-3 font-bold text-white"
            >
              إرسال الطلب على واتساب
            </a>
            <button
              onClick={onClose}
              className="mt-3 w-full rounded-full border border-border px-6 py-3 text-sm text-ink"
            >
              إغلاق
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-6 space-y-3">
            <Input label="الاسم الكامل" required autoComplete="name" {...field("name")} />
            {/* No length limit: iPhone AutoFill puts "+218…" (13 characters) here, which a
                10-character limit used to cut into an invalid number. */}
            <Input
              label="رقم الهاتف"
              required
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              dir="ltr"
              placeholder="0912345678"
              value={form.phone}
              onChange={(e) => setForm((f) => ({ ...f, phone: westernDigits(e.target.value) }))}
            />
            {phoneLooksWrong && (
              <p className="-mt-1 text-xs text-destructive">
                الرقم يجب أن يكون 10 أرقام ويبدأ بـ 091 أو 092 أو 093 أو 094
              </p>
            )}
            <Input label="العنوان" required autoComplete="street-address" {...field("address")} />

            <div>
              <button
                type="button"
                onClick={shareLocation}
                disabled={locating}
                className="w-full rounded-2xl border border-dashed border-primary/50 px-4 py-3 text-sm text-primary transition-colors hover:bg-accent disabled:opacity-60"
              >
                {locating
                  ? "جارِ تحديد موقعك..."
                  : locationUrl
                    ? "✓ تم تحديد موقعك — اضغطي لإعادة التحديد"
                    : "📍 مشاركة موقعي على الخريطة (اختياري)"}
              </button>
              {locationError && <p className="mt-1 text-sm text-destructive">{locationError}</p>}
              {locationUrl && (
                <button
                  type="button"
                  onClick={() => setLocationUrl(null)}
                  className="mt-1 text-xs text-muted-foreground underline"
                >
                  إزالة الموقع
                </button>
              )}
            </div>

            <label className="block">
              <span className="mb-1 block text-sm text-muted-foreground">ملاحظات (اختياري)</span>
              <textarea
                rows={3}
                {...field("notes")}
                className="w-full rounded-2xl border border-border bg-background px-4 py-3 outline-none focus:border-primary"
              />
            </label>

            {lines.length > 0 && (
              <div className="rounded-2xl bg-secondary/70 p-4 text-sm">
                {lines.map((l) => (
                  <div key={l.key} className="flex justify-between gap-3 py-0.5">
                    <span>
                      {l.name}
                      {l.options?.length ? (
                        <span className="text-muted-foreground"> ({optionsLabel(l.options)})</span>
                      ) : null}{" "}
                      × {l.qty}
                    </span>
                    <span>{(l.price * l.qty).toFixed(2)} د.ل</span>
                  </div>
                ))}
                <div className="mt-2 flex justify-between border-t border-border pt-2 font-bold text-ink">
                  <span>الإجمالي</span>
                  <span>{total.toFixed(2)} د.ل</span>
                </div>
              </div>
            )}

            {error && (
              <p ref={errorRef} role="alert" className="text-sm font-medium text-destructive">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-full px-6 py-3 font-medium text-primary-foreground disabled:opacity-60"
              style={{ backgroundImage: "var(--gradient-pink)" }}
            >
              {busy ? "جاري الإرسال..." : "إرسال الطلب"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

function Input({
  label,
  ...props
}: { label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm text-muted-foreground">{label}</span>
      <input
        {...props}
        className="w-full rounded-2xl border border-border bg-background px-4 py-3 outline-none focus:border-primary"
      />
    </label>
  );
}
