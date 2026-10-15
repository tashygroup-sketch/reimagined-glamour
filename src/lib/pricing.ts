// Prices when a product's values have their own price (e.g. مقاس كبير = 150 د.ل).
//
//   • A chosen value's price REPLACES the product's price. Values left without a price use
//     the product's price. If two chosen values both have one (a size AND a material), the
//     higher price applies.
//   • The product's sale price (السعر بعد الخصم) and a discount code take the SAME PERCENTAGE
//     off a value's price: product 100 → 80 is 20% off, so a value priced 150 becomes 120.
//
// Shared by the shop, the control panel and the server, so all three always agree on a price
// (the server refuses an order whose prices don't match).

export type PriceValue = { label: string; price?: number | null };
export type PriceVariable = { name: string; values: PriceValue[] };
export type PriceItem = { price: number; sale_price: number | null; variables: PriceVariable[] };
export type PriceOption = { name: string; value: string };

const round2 = (n: number) => Math.round(n * 100) / 100;

// Text typed by the admin → a stored value price. Empty = no own price (the product's price).
// Returns undefined for something that isn't a valid price.
export function parseValuePrice(raw: unknown): number | null | undefined {
  if (raw === null || raw === undefined) return null;
  const text = String(raw)
    .trim()
    .replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[\u06f0-\u06f9]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/[\u066b,]/g, ".");
  if (!text) return null;
  const n = Number(text);
  if (!Number.isFinite(n) || n <= 0 || n > 10_000_000) return undefined;
  return round2(n);
}

export function hasValuePrices(variables: PriceVariable[]): boolean {
  return variables.some((v) => v.values.some((x) => typeof x.price === "number"));
}

// The chosen values' own price — the highest when several have one — or null.
export function chosenValuePrice(
  variables: PriceVariable[],
  options: PriceOption[] | undefined,
): number | null {
  let best: number | null = null;
  for (const o of options ?? []) {
    const p = variables
      .find((v) => v.name === o.name)
      ?.values.find((x) => x.label === o.value)?.price;
    if (typeof p === "number" && (best === null || p > best)) best = p;
  }
  return best;
}

// Before any discount.
export function regularPriceFor(item: PriceItem, options: PriceOption[] | undefined): number {
  return chosenValuePrice(item.variables, options) ?? Number(item.price);
}

// A regular price after a discount that brings the product's own price to `discounted`:
// the product's price becomes exactly `discounted`, any other price loses the same share.
export function discountedFrom(item: PriceItem, regular: number, discounted: number): number {
  const base = Number(item.price);
  if (Math.abs(regular - base) < 0.005) return discounted;
  if (!(base > 0)) return regular;
  return round2(regular * (discounted / base));
}

function hasSale(item: PriceItem): boolean {
  return item.sale_price !== null && Number(item.sale_price) < Number(item.price);
}

// A regular price → what's paid without a code (the sale's percentage off, if any).
export function payPrice(item: PriceItem, regular: number): number {
  return hasSale(item) ? discountedFrom(item, regular, Number(item.sale_price)) : regular;
}

// What the customer pays for this choice without a code.
export function salePriceFor(item: PriceItem, options: PriceOption[] | undefined): number {
  return payPrice(item, regularPriceFor(item, options));
}

// What the customer pays for this choice with a discount code, whose price for the product
// itself is `codePrice`.
export function codePriceFor(
  item: PriceItem,
  options: PriceOption[] | undefined,
  codePrice: number,
): number {
  return discountedFrom(item, regularPriceFor(item, options), codePrice);
}

// Lowest and highest regular price over every choice still possible, given what's picked so
// far (nothing picked = the whole product). Used for "من 80 د.ل" on cards and in the sheet.
export function regularPriceRange(
  item: PriceItem,
  picked: PriceOption[] = [],
): { min: number; max: number } {
  const base = Number(item.price);
  // each variable's possible prices (null = no own price); a picked variable keeps its pick
  const vars = item.variables
    .map((v) => {
      const pick = picked.find((o) => o.name === v.name);
      const values = pick ? v.values.filter((x) => x.label === pick.value) : v.values;
      return values.map((x) => (typeof x.price === "number" ? x.price : null));
    })
    .filter((prices) => prices.length > 0);
  const priced = vars.flat().filter((p): p is number => p !== null);
  if (priced.length === 0) return { min: base, max: base };
  // every variable can be left on a value without a price → the product's own price
  const plainPossible = vars.every((prices) => prices.includes(null));
  const max = Math.max(...priced, ...(plainPossible ? [base] : []));
  // a value's price t is reachable as the price when every other variable has a value
  // without a price or not above t
  let min = plainPossible ? base : Infinity;
  for (const t of priced) {
    if (t < min && vars.every((prices) => prices.some((p) => p === null || p <= t))) min = t;
  }
  return { min: Number.isFinite(min) ? min : base, max };
}
