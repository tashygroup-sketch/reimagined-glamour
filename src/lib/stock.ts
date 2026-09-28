// ---------- quantity per value (e.g. أحمر: 2، أزرق: 0) ----------
//
// Shared by the server (saving, ordering) and the shop (greying out, limits), so both
// always agree. A value's `stock` is a whole number, or null = not counted (unlimited).

export type StockValue = { label: string; stock?: number | null };
export type StockVariable = { name: string; values: StockValue[] };
export type StockOption = { name: string; value: string };
export type StockLine = { id: string; qty: number; options?: StockOption[] };
export type StockItem = { id: string; stock: number | null; variables: StockVariable[] };

// Text typed by the admin → a stored quantity. Empty = unlimited.
export function parseStock(raw: unknown): number | null {
  if (raw === null || raw === undefined) return null;
  const text = String(raw).trim();
  if (!text) return null;
  const n = Number(text);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.min(99999, Math.floor(n));
}

// True when at least one value has a quantity typed in. The product's total quantity is then
// calculated from the values instead of being typed by hand.
export function hasValueStock(variables: StockVariable[]): boolean {
  return variables.some((v) => v.values.some((x) => typeof x.stock === "number"));
}

// Sum of one variable's values, or null if any of its values is unlimited.
export function variableTotal(v: StockVariable): number | null {
  if (v.values.length === 0) return null;
  let sum = 0;
  for (const x of v.values) {
    if (typeof x.stock !== "number") return null;
    sum += x.stock;
  }
  return sum;
}

// Every piece ordered takes one value from EVERY variable (a colour AND a size), so each
// variable caps the total on its own: colours 2 + sizes 3 → at most 2 pieces. The product's
// total is the smallest of those caps; null (unlimited) if no variable is fully counted.
export function totalFromValues(variables: StockVariable[]): number | null {
  let min: number | null = null;
  for (const v of variables) {
    const t = variableTotal(v);
    if (t !== null && (min === null || t < min)) min = t;
  }
  return min;
}

export function valueStock(variables: StockVariable[], name: string, label: string) {
  const s = variables.find((v) => v.name === name)?.values.find((x) => x.label === label)?.stock;
  return typeof s === "number" ? s : null;
}

// Pieces of this product with this value already in the cart (all lines).
export function cartQtyWithValue(lines: StockLine[], id: string, name: string, label: string) {
  return lines
    .filter((l) => l.id === id && l.options?.some((o) => o.name === name && o.value === label))
    .reduce((s, l) => s + l.qty, 0);
}

export function cartQtyOfProduct(lines: StockLine[], id: string) {
  return lines.filter((l) => l.id === id).reduce((s, l) => s + l.qty, 0);
}

// How many more pieces of one value can still go in the cart. null = unlimited.
export function valueRemaining(item: StockItem, lines: StockLine[], name: string, label: string) {
  const s = valueStock(item.variables, name, label);
  if (s === null) return null;
  return Math.max(0, s - cartQtyWithValue(lines, item.id, name, label));
}

// How many more pieces of this exact choice (e.g. أزرق + L) can go in the cart: the
// product's remaining total and every chosen value's remaining quantity. null = unlimited.
export function remainingForChoice(
  item: StockItem,
  lines: StockLine[],
  options: StockOption[],
): number | null {
  let left: number | null =
    item.stock === null ? null : Math.max(0, item.stock - cartQtyOfProduct(lines, item.id));
  for (const o of options) {
    const r = valueRemaining(item, lines, o.name, o.value);
    if (r !== null) left = left === null ? r : Math.min(left, r);
  }
  return left;
}

// A value the cart asks for more of than there is (stock went down after it was added).
export function overStockValue(
  item: StockItem,
  lines: StockLine[],
  options: StockOption[] | undefined,
): { value: string; stock: number } | null {
  for (const o of options ?? []) {
    const s = valueStock(item.variables, o.name, o.value);
    if (s !== null && cartQtyWithValue(lines, item.id, o.name, o.value) > s) {
      return { value: o.value, stock: s };
    }
  }
  return null;
}
