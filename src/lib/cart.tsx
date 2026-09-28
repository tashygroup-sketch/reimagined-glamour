import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export type CartOption = { name: string; value: string };

// One line per product + chosen options: "روج / اللون: أحمر" and "روج / اللون: نود" are two
// separate lines with their own quantities. `key` identifies the line; `id` is the product.
export type CartLine = {
  key: string;
  id: string;
  name: string;
  price: number;
  qty: number;
  image_url?: string | null;
  options?: CartOption[];
  // set when the line was added with a valid discount code; `price` is then the discounted
  // price and `regular_price` the original one (shown struck through)
  discount_code?: string;
  regular_price?: number;
};

export function lineKey(id: string, options?: CartOption[], discountCode?: string) {
  let key = id;
  if (options && options.length > 0)
    key += `|${options.map((o) => `${o.name}=${o.value}`).join("|")}`;
  if (discountCode) key += `|code=${discountCode}`;
  return key;
}

export function optionsLabel(options?: CartOption[]) {
  return (options ?? []).map((o) => `${o.name}: ${o.value}`).join("، ");
}

type CartCtx = {
  lines: CartLine[];
  add: (line: Omit<CartLine, "qty" | "key">, qty?: number) => void;
  remove: (key: string) => void;
  setQty: (key: string, qty: number) => void;
  clear: () => void;
  /** total pieces of one product across all its option lines (for stock limits) */
  qtyOfProduct: (id: string) => number;
  count: number;
  total: number;
};

const Ctx = createContext<CartCtx | null>(null);
const KEY = "glamour-cart";

export function CartProvider({ children }: { children: ReactNode }) {
  const [lines, setLines] = useState<CartLine[]>([]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Partial<CartLine>[];
      // Carts saved before options existed have no `key`; rebuild it.
      setLines(
        parsed
          .filter((l) => typeof l.id === "string" && typeof l.qty === "number")
          .map((l) => ({
            ...(l as CartLine),
            key: l.key ?? lineKey(l.id!, l.options, l.discount_code),
          })),
      );
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(lines));
    } catch {
      /* ignore */
    }
  }, [lines]);

  const value = useMemo<CartCtx>(() => {
    const count = lines.reduce((s, l) => s + l.qty, 0);
    const total = lines.reduce((s, l) => s + l.qty * l.price, 0);
    return {
      lines,
      count,
      total,
      qtyOfProduct: (id) => lines.filter((l) => l.id === id).reduce((s, l) => s + l.qty, 0),
      add: (line, qty = 1) =>
        setLines((prev) => {
          const key = lineKey(line.id, line.options, line.discount_code);
          const found = prev.find((l) => l.key === key);
          if (found) return prev.map((l) => (l.key === key ? { ...l, qty: l.qty + qty } : l));
          return [...prev, { ...line, key, qty }];
        }),
      remove: (key) => setLines((prev) => prev.filter((l) => l.key !== key)),
      setQty: (key, qty) =>
        setLines((prev) =>
          qty <= 0
            ? prev.filter((l) => l.key !== key)
            : prev.map((l) => (l.key === key ? { ...l, qty } : l)),
        ),
      clear: () => setLines([]),
    };
  }, [lines]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useCart() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useCart must be used inside CartProvider");
  return ctx;
}
