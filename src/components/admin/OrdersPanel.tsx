import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { listOrders, updateOrderStatus, type OrderRow } from "@/lib/shop.functions";
import { waLink } from "@/lib/image";

const STATUSES = ["جديد", "قيد التحضير", "جاهز للاستلام", "تم التسليم", "ملغي"];

export function OrdersPanel({ phone }: { phone: string }) {
  const fetchOrders = useServerFn(listOrders);
  const setStatus = useServerFn(updateOrderStatus);

  const [orders, setOrders] = useState<OrderRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function load() {
    try {
      const rows = await fetchOrders({ data: { phone } });
      setOrders(rows);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذّر تحميل الطلبات");
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phone]);

  async function changeStatus(id: string, status: string) {
    setBusyId(id);
    try {
      await setStatus({ data: { phone, id, status } });
      setOrders((prev) => prev?.map((o) => (o.id === id ? { ...o, status } : o)) ?? prev);
    } catch (err) {
      alert(err instanceof Error ? err.message : "تعذّر تحديث الحالة");
    } finally {
      setBusyId(null);
    }
  }

  if (error) return <p className="py-10 text-center text-destructive">{error}</p>;
  if (!orders) return <p className="py-10 text-center text-muted-foreground">جارِ التحميل...</p>;
  if (orders.length === 0)
    return <p className="py-10 text-center text-muted-foreground">لا توجد طلبات بعد</p>;

  return (
    <div className="space-y-4">
      {orders.map((o) => (
        <article key={o.id} className="rounded-3xl bg-card p-5 shadow-[var(--shadow-card)]">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="text-lg text-ink">{o.customer_name}</h3>
              <p dir="ltr" className="text-right text-sm text-muted-foreground">
                {o.phone}
              </p>
              {o.address && <p className="mt-1 text-sm text-muted-foreground">{o.address}</p>}
              {o.location_url && (
                <a
                  href={o.location_url}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-1 inline-block text-sm text-primary hover:underline"
                >
                  📍 عرض الموقع على الخريطة
                </a>
              )}
              {o.delivery_date && (
                <p className="text-sm text-muted-foreground">تاريخ الاستلام: {o.delivery_date}</p>
              )}
            </div>
            <div className="text-left">
              <p className="text-xs text-muted-foreground">
                {new Date(o.created_at).toLocaleString("ar-LY", {
                  dateStyle: "medium",
                  timeStyle: "short",
                })}
              </p>
              <select
                value={o.status}
                disabled={busyId === o.id}
                onChange={(e) => changeStatus(o.id, e.target.value)}
                className="mt-2 rounded-full border border-border bg-background px-3 py-1.5 text-sm text-ink outline-none focus:border-primary"
              >
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {o.items.length > 0 && (
            <div className="mt-4 rounded-2xl bg-secondary/60 p-3 text-sm">
              {o.items.map((it, i) => (
                <div key={i} className="flex justify-between py-0.5">
                  <span>
                    {it.name}
                    {/* the chosen colour / size, needed to prepare the order */}
                    {it.options?.length ? (
                      <span className="text-muted-foreground">
                        {" "}
                        ({it.options.map((x) => `${x.name}: ${x.value}`).join("، ")})
                      </span>
                    ) : null}{" "}
                    × {it.qty}
                    {it.discount_code ? (
                      <span className="text-xs text-accent-foreground">
                        {" "}
                        — كود {it.discount_code}
                      </span>
                    ) : null}
                  </span>
                  <span>{(it.price * it.qty).toFixed(2)} د.ل</span>
                </div>
              ))}
              <div className="mt-1 flex justify-between border-t border-border pt-1 font-bold text-ink">
                <span>الإجمالي</span>
                <span>{Number(o.total).toFixed(2)} د.ل</span>
              </div>
            </div>
          )}

          {o.notes && <p className="mt-3 text-sm text-muted-foreground">ملاحظات: {o.notes}</p>}

          <a
            href={`/o/${o.id}`}
            target="_blank"
            rel="noreferrer"
            className="me-2 mt-4 inline-flex items-center justify-center rounded-full border border-border px-4 py-2 text-sm text-ink transition-colors hover:border-primary hover:text-primary"
          >
            صور الطلب
          </a>

          <a
            href={waLink(
              o.phone,
              `مرحباً ${o.customer_name}، بخصوص طلبك من Glamour with Jannat 💄`,
            )}
            target="_blank"
            rel="noreferrer"
            className="mt-4 inline-flex items-center justify-center rounded-full border border-primary px-4 py-2 text-sm text-primary transition-colors hover:bg-primary hover:text-primary-foreground"
          >
            تواصل عبر واتساب
          </a>
        </article>
      ))}
    </div>
  );
}
