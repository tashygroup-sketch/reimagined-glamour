// Alphabetical order for product names, shared by the shop and the control panel.
//
// Names mix Arabic and English ("ماسكارا", "Maybelline mascara"), so:
//   • Arabic names come first, then English ones (the site is Arabic).
//   • أ / إ / آ / ا count as the same letter, and capitals don't matter.
//   • Numbers inside a name sort by value: "كريم 2" before "كريم 10".

export type NameOrder = "az" | "za";

const collator = new Intl.Collator(["ar", "en"], {
  numeric: true,
  sensitivity: "base",
  ignorePunctuation: true,
});

const FIRST_LETTER = /\p{L}/u;
const ARABIC_LETTER = /[؀-ۿ]/;

// 0 = starts with an Arabic letter, 1 = any other alphabet. Decided here rather than left
// to the browser, so every phone puts the two groups in the same order.
function scriptRank(name: string) {
  const first = FIRST_LETTER.exec(name)?.[0];
  return first && ARABIC_LETTER.test(first) ? 0 : 1;
}

export function compareNames(a: string, b: string): number {
  return scriptRank(a) - scriptRank(b) || collator.compare(a.trim(), b.trim());
}

export function sortByName<T extends { name: string }>(items: T[], order: NameOrder = "az"): T[] {
  const sorted = [...items].sort((a, b) => compareNames(a.name, b.name));
  return order === "za" ? sorted.reverse() : sorted;
}
