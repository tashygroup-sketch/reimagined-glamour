import { optionsLabel, type CartLine } from "./cart";

export const WHATSAPP_NUMBER = "218918640785";

export type BookingInfo = {
  name: string;
  phone: string;
  address: string;
  notes: string;
  locationUrl?: string;
};

export function buildWhatsAppDraft(info: BookingInfo, lines: CartLine[], total: number) {
  const items = lines.length
    ? lines
        .map((l) => {
          const opts = optionsLabel(l.options);
          const code = l.discount_code ? ` [كود خصم: ${l.discount_code}]` : "";
          return `• ${l.name}${opts ? ` (${opts})` : ""}${code} × ${l.qty} — ${(l.price * l.qty).toFixed(2)} د.ل`;
        })
        .join("\n")
    : "• لا توجد أصناف محددة (طلب خاص)";

  const text = [
    "طلب جديد من موقع Glamour with Jannat 💄",
    "",
    `الاسم: ${info.name}`,
    `الهاتف: ${info.phone}`,
    `العنوان: ${info.address}`,
    info.locationUrl ? `الموقع على الخريطة: ${info.locationUrl}` : null,
    info.notes ? `ملاحظات: ${info.notes}` : null,
    "",
    "الطلبات:",
    items,
    "",
    `الإجمالي: ${total.toFixed(2)} د.ل`,
  ]
    .filter(Boolean)
    .join("\n");

  return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(text)}`;
}
