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
const ARABIC_LETTER = /[\u0600-\u06FF]/;

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

// ---------- the letter a name is filed under (for the "jump to a letter" list) ----------

export const ARABIC_LETTERS = [..."ابتثجحخدذرزسشصضطظعغفقكلمنهوي"];
export const LATIN_LETTERS = [..."ABCDEFGHIJKLMNOPQRSTUVWXYZ"];
// names that start with a number or a symbol
export const OTHER_LETTER = "#";

// Look-alike letters some phone keyboards type (Persian/Urdu layouts) and letters outside
// the 28: each is filed under the Arabic letter a reader would look for.
const LETTER_ALIASES: Record<string, string> = {
  ء: "ا",
  ٱ: "ا",
  ى: "ي",
  ی: "ي",
  ے: "ي",
  ة: "ه",
  ہ: "ه",
  ھ: "ه",
  ک: "ك",
  گ: "ك",
  پ: "ب",
  چ: "ج",
  ژ: "ز",
  ڤ: "ف",
};

// "أحمر شفاه" → "ا", "إيلاينر" → "ا", "maybelline" → "M", "3D lashes" → "#".
// أ / إ / آ count as ا, the same way the alphabetical order treats them.
export function letterOf(name: string): string {
  const plain = (name ?? "")
    .normalize("NFKD") // splits أ into ا + a hamza mark, é into e + an accent
    .replace(/[\u0300-\u036f\u0610-\u061A\u064B-\u065F\u0670\u0640]/g, "");
  const first = /[\p{L}\p{N}]/u.exec(plain)?.[0] ?? "";
  const arabic = LETTER_ALIASES[first] ?? first;
  if (ARABIC_LETTERS.includes(arabic)) return arabic;
  const upper = first.toUpperCase();
  return LATIN_LETTERS.includes(upper) ? upper : OTHER_LETTER;
}
