import { createFileRoute, Link } from "@tanstack/react-router";
import { getOrderPhotos } from "@/lib/shop.functions";
import { Photo } from "@/components/Photo";
import { formatPrice } from "@/components/ProductSheet";
import { arCount } from "@/lib/utils";

// The photos of one order: what the shop owner opens from the link in the WhatsApp message.
// A WhatsApp link can only carry text, so the photos live here — each line shows the photo of
// exactly what was ordered (the chosen colour's photo when it has one). Only the products are
// shown, never the customer's name, phone or address.
export const Route = createFileRoute("/o/$id")({
  loader: ({ params }) => getOrderPhotos({ data: { id: params.id } }).catch(() => null),
  head: ({ loaderData }) => {
    const pieces = loaderData?.items.reduce((n, i) => n + i.qty, 0) ?? 0;
    const title = pieces
      ? `صور الطلب — ${arCount(pieces, ["قطعة واحدة", "قطعتان", "قطع", "قطعة"])}`
      : "صور الطلب";
    return {
      meta: [
        { title },
        { name: "robots", content: "noindex" },
        // what WhatsApp shows in the chat under the link
        { property: "og:title", content: title },
        ...(loaderData?.items.length
          ? [
              {
                property: "og:description",
                content: loaderData.items.map((i) => i.name).join("، "),
              },
            ]
          : []),
        ...(loaderData?.preview_image
          ? [{ property: "og:image", content: loaderData.preview_image }]
          : []),
      ],
    };
  },
  component: OrderPhotosPage,
});

function OrderPhotosPage() {
  const order = Route.useLoaderData();

  if (!order) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="text-lg text-ink">لم يتم العثور على هذا الطلب</p>
        <Link
          to="/"
          className="rounded-full px-6 py-2.5 text-sm font-bold text-primary-foreground"
          style={{ backgroundImage: "var(--gradient-pink)" }}
        >
          الذهاب إلى المتجر
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-lg px-4 pt-8 pb-16">
      <h1 className="text-2xl text-ink">صور الطلب</h1>
      {/* the time is shown in the viewer's own time zone, which can differ from the server's */}
      <p className="mt-1 text-sm text-muted-foreground" suppressHydrationWarning>
        {new Date(order.created_at).toLocaleString("ar-LY", {
          dateStyle: "medium",
          timeStyle: "short",
        })}
      </p>

      <ul className="mt-6 space-y-5">
        {order.items.map((item, i) => (
          <li key={i} className="overflow-hidden rounded-3xl bg-card shadow-[var(--shadow-card)]">
            {item.image_url ? (
              <div className="photo-slot aspect-[3/4] w-full bg-muted">
                <Photo
                  src={item.image_url}
                  alt={item.name}
                  className="h-full w-full object-cover"
                />
              </div>
            ) : (
              <div className="flex h-24 items-center justify-center bg-muted text-sm text-muted-foreground">
                بدون صورة
              </div>
            )}
            <div className="p-4">
              <p className="text-lg font-bold text-ink">{item.name}</p>
              {item.options.length > 0 && (
                <p className="mt-0.5 text-sm font-medium text-primary">
                  {item.options.map((o) => `${o.name}: ${o.value}`).join("، ")}
                </p>
              )}
              <p className="mt-2 flex justify-between text-sm text-muted-foreground">
                <span>الكمية: {item.qty}</span>
                <span>
                  {formatPrice(item.price * item.qty)} <span className="text-xs">د.ل</span>
                </span>
              </p>
            </div>
          </li>
        ))}
      </ul>

      <p className="mt-6 flex justify-between border-t border-border pt-4 text-lg font-bold text-ink">
        <span>الإجمالي</span>
        <span>{formatPrice(order.total)} د.ل</span>
      </p>
    </main>
  );
}
