import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  DELIVERED,
  listOrders,
  ORDER_STATUSES,
  setOrderDelivered,
  updateOrderStatus,
  type OrderRow,
} from "@/lib/shop.functions";
import { waLink } from "@/lib/image";
import { ConfirmDialog } from "@/components/admin/ConfirmDialog";
import { arCount } from "@/lib/utils";

const pieces = (n: number) => arCount(n, ["قطعة واحدة", "قطعتان", "قطع", "قطعة"]);

// Pieces of this order still to be taken from the stock when it's marked delivered.
// (Older orders took their stock when they were placed, so they have none.)
function piecesToTake(o: OrderRow) {
  return o.items.filter((i) => i.stock === "pending").reduce((n, i) => n + i.qty, 0);
}
function piecesTaken(o: OrderRow) {
  return o.items.filter((i) => i.stock === "taken").reduce((n, i) => n + i.qty, 0);
}

export function OrdersPanel({ phone }: { phone: string }) {
  const fetchOrders = useServerFn(listOrders);
  const setStatus = useServerFn(updateOrderStatus);
  const setDelivered = useServerFn(setOrderDelivered);

  const [orders, setOrders] = useState<OrderRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  // the order waiting for "are you sure?" before being marked delivered / not delivered
  const [confirm, setConfirm] = useState<{ order: OrderRow; delivered: boolean } | null>(null);

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

  async function changeDelivered(order: OrderRow, delivered: boolean) {
    setConfirm(null);
    setBusyId(order.id);
    try {
      const res = await setDelivered({ data: { phone, id: order.id, delivered } });
      setOrders(
        (prev) =>
          prev?.map((o) =>
            o.id === order.id ? { ...o, status: res.status, items: res.items } : o,
          ) ?? prev,
      );
    } catch (err) {
      alert(err instanceof Error ? err.message : "تعذّر تحديث الطلب");
      load(); // show the order as it really is now
    } finally {
      setBusyId(null);
    }
  }

  if (error) return <p className="py-10 text-center text-destructive">{error}</p>;
  if (!orders) return <p className="py-10 text-center text-muted-foreground">جارِ التحميل...</p>;
  if (orders.length === 0)
    return <p className="py-10 text-center text-muted-foreground">لا توجد طلبات بعد</p>;

  const confirmOrder = confirm?.order;
  const confirmPieces = confirmOrder
    ? confirm.delivered
      ? piecesToTake(confirmOrder)
      : piecesTaken(confirmOrder)
    : 0;

  return (
    <div className="space-y-4">
      {orders.map((o) => {
        const delivered = o.status === DELIVERED;
        const busy = busyId === o.id;
        // an older status no longer in the list still shows as it is
        const statuses: string[] = (ORDER_STATUSES as readonly string[]).includes(o.status)
          ? [...ORDER_STATUSES]
          : [o.status, ...ORDER_STATUSES];
        return (
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
                {!delivered && (
                  <select
                    value={o.status}
                    disabled={busy}
                    onChange={(e) => changeStatus(o.id, e.target.value)}
                    className="mt-2 rounded-full border border-border bg-background px-3 py-1.5 text-sm text-ink outline-none focus:border-primary"
                  >
                    {statuses.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                )}
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

            {/* Delivered or not: marking it delivered is what takes the pieces from the stock */}
            <div className="mt-4 flex flex-wrap items-center gap-2">
              {delivered ? (
                <>
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-600 px-4 py-2 text-sm font-bold text-white">
                    ✓ تم التسليم
                  </span>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => setConfirm({ order: o, delivered: false })}
                    className="rounded-full px-3 py-2 text-xs text-muted-foreground underline disabled:opacity-60"
                  >
                    {busy ? "جارِ الحفظ..." : "تراجع عن التسليم"}
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setConfirm({ order: o, delivered: true })}
                  className="inline-flex items-center gap-1 rounded-full border-2 border-emerald-600 px-4 py-2 text-sm font-bold text-emerald-700 transition-colors hover:bg-emerald-600 hover:text-white disabled:opacity-60"
                >
                  {busy ? "جارِ الحفظ..." : "✓ تأكيد التسليم"}
                </button>
              )}
            </div>

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
        );
      })}

      <ConfirmDialog
        open={!!confirm}
        tone="primary"
        title={
          confirm?.delivered
            ? `تم تسليم طلب ${confirmOrder?.customer_name ?? ""}؟`
            : `إلغاء تسليم طلب ${confirmOrder?.customer_name ?? ""}؟`
        }
        message={
          confirm?.delivered
            ? confirmPieces > 0
              ? `ستُخصم ${pieces(confirmPieces)} من كميات المنتجات${
                  confirmOrder?.items.some((i) => i.stock === "pending" && i.options?.length)
                    ? " (ومن كمية الخيار المطلوب، مثل اللون أو المقاس)"
                    : ""
                }.`
              : "كميات هذا الطلب خُصمت من قبل، فلن يُخصم شيء."
            : confirmPieces > 0
              ? `ستُرجَع ${pieces(confirmPieces)} إلى كميات المنتجات.`
              : "لن تتغير أي كمية."
        }
        confirmLabel={confirm?.delivered ? "نعم، تم التسليم" : "نعم، تراجع"}
        onConfirm={() => confirm && changeDelivered(confirm.order, confirm.delivered)}
        onCancel={() => setConfirm(null)}
      />
    </div>
  );
}
