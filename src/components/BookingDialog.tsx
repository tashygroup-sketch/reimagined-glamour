import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { useCart } from "@/lib/cart";
import { buildWhatsAppDraft } from "@/lib/whatsapp";
import { createOrder } from "@/lib/shop.functions";

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

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

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
    setBusy(true);
    try {
      const res = await submit({
        data: {
          customer_name: form.name,
          phone: form.phone,
          address: form.address,
          notes: form.notes,
          ...(locationUrl ? { location_url: locationUrl } : {}),
          items: lines.map((l) => ({ id: l.id, name: l.name, qty: l.qty, price: l.price })),
          total,
        },
      });

      if (res.isAdmin) {
        localStorage.setItem("glamour-admin-phone", form.phone);
        navigate({ to: "/admin" });
        return;
      }

      const url = buildWhatsAppDraft(
        {
          name: form.name,
          phone: form.phone,
          address: form.address,
          notes: form.notes,
          ...(locationUrl ? { locationUrl } : {}),
        },
        lines,
        total,
      );
      setDraftUrl(url);
      window.open(url, "_blank");
      clear();
      // stock just went down on the server; refresh so sold-out items grey out right away
      queryClient.invalidateQueries({ queryKey: ["menu"] });
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذّر إرسال الحجز");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center overflow-hidden bg-ink/40 backdrop-blur-sm sm:items-center">
      <div className="animate-scale-in max-h-[92dvh] w-full max-w-lg overflow-y-auto overscroll-contain rounded-t-3xl bg-card p-6 shadow-[var(--shadow-card)] sm:rounded-3xl">
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
            <p className="text-lg text-ink">تم إرسال طلبك 💄</p>
            <button
              onClick={onClose}
              className="mt-5 w-full rounded-full px-6 py-3 font-medium text-primary-foreground"
              style={{ backgroundImage: "var(--gradient-pink)" }}
            >
              إغلاق
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-6 space-y-3">
            <Input label="الاسم الكامل" {...field("name")} />
            <Input
              label="رقم الهاتف"
              required
              inputMode="tel"
              dir="ltr"
              placeholder="0912345678"
              maxLength={10}
              {...field("phone")}
            />
            <Input label="العنوان" {...field("address")} />

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
                  <div key={l.id} className="flex justify-between py-0.5">
                    <span>
                      {l.name} × {l.qty}
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

            {error && <p className="text-sm text-destructive">{error}</p>}

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
