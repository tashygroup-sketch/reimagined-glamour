// Product search that works for how customers actually type in Libya:
//   • English            "mascara", "lip gloss"
//   • Arabic             "ماسكارا", "كريم أساس"
//   • Arabizi / Franco   "maskara", "krem asas", "3tr" (عطر), "rouj" (روج)
//   • Misspelled Arabic  "مسكرا", "كريم اسس", "عطور" vs "عطر"
//   • Description ("bio") and variable-value search ("أحمر", "XL")
//
// How: every text is reduced to (1) a normalized form and (2) a consonant "skeleton" that
// Arabic and Latin spellings share (سيروم → srm, "serum" → srm). A query token matches a
// product when it hits either form exactly, as a substring, or within a small typo distance.
// A short bilingual dictionary covers words whose spelling differs completely between the
// two languages (red ↔ أحمر, perfume ↔ عطر).

import { compareNames } from "@/lib/sort";

export type SearchableProduct = {
  id: string;
  name: string;
  description: string | null;
  category: string;
  sort_order: number;
  variables: { name: string; values: { label: string }[] }[];
};

// ---------------------------------------------------------------- normalization

const ARABIC_MARKS = /[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED\u0640]/g; // tashkeel + tatweel

export function normalizeText(raw: string): string {
  return (raw ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "") // Latin accents: é → e
    .replace(ARABIC_MARKS, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[\u06f0-\u06f9]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

const HAS_ARABIC = /[\u0600-\u06FF]/;

// Arabic letter → shared consonant class. "" = treated as a vowel and dropped.
const AR_SKELETON: Record<string, string> = {
  ب: "b",
  ت: "t",
  ث: "t",
  ج: "g",
  ح: "h",
  خ: "k",
  د: "d",
  ذ: "d",
  ر: "r",
  ز: "z",
  س: "s",
  ش: "s",
  ص: "s",
  ض: "d",
  ط: "t",
  ظ: "z",
  ع: "",
  غ: "g",
  ف: "f",
  ق: "k",
  ك: "k",
  ل: "l",
  م: "m",
  ن: "n",
  ه: "h",
  و: "",
  ي: "",
  ا: "",
  ء: "",
  پ: "b",
  گ: "g",
  ڤ: "f",
  چ: "s",
};

function arabicSkeleton(token: string): string {
  // No collapsing here: Arabic writes doubled sounds with a shadda mark (already stripped),
  // so two identical letters in a row are real ("اسس" is a typo of "أساس", not "اس").
  const t = stripArticle(token);
  let out = "";
  for (const ch of t) out += AR_SKELETON[ch] ?? (/[a-z0-9]/.test(ch) ? ch : "");
  if (token.endsWith("ه")) out = out.replace(/h$/, ""); // final ة/ه usually sounds like "a"
  return out;
}

function latinSkeleton(token: string): string {
  let t = collapse(token); // "mascarra" → "mascara", before vowels go so "asas" keeps both s
  // Arabizi digits only when mixed with letters ("3tr"), so sizes like "50" stay numbers.
  if (/[a-z]/.test(t) && /\d/.test(t)) {
    t = t
      .replace(/2/g, "")
      .replace(/3/g, "")
      .replace(/5/g, "k")
      .replace(/6/g, "t")
      .replace(/7/g, "h")
      .replace(/8/g, "k")
      .replace(/9/g, "s");
  }
  t = t
    .replace(/tion/g, "sn")
    .replace(/sion/g, "sn")
    .replace(/igh/g, "i")
    .replace(/ph/g, "f")
    .replace(/sh|ch/g, "s")
    .replace(/kh/g, "k")
    .replace(/gh/g, "g")
    .replace(/th|dh/g, "t")
    .replace(/ck|qu/g, "k")
    .replace(/c(?=[eiy])/g, "s")
    .replace(/c/g, "k")
    .replace(/x/g, "ks")
    .replace(/q/g, "k")
    .replace(/v/g, "f")
    .replace(/p/g, "b")
    .replace(/j/g, "g")
    .replace(/[aeiouyw]/g, "");
  return t;
}

function collapse(s: string) {
  return s.replace(/(.)\1+/g, "$1");
}

export function skeleton(token: string): string {
  if (/^\d+$/.test(token)) return token;
  return HAS_ARABIC.test(token) ? arabicSkeleton(token) : latinSkeleton(token);
}

// "العطر", "بالعطر", "والعطر", "للبشرة" → the bare word, so prefixes don't count as typos.
const ARABIC_PREFIXES = ["وال", "بال", "فال", "كال", "لل", "ال"];

function stripArticle(token: string) {
  for (const p of ARABIC_PREFIXES) {
    if (token.startsWith(p) && token.length >= p.length + 3) return token.slice(p.length);
  }
  return token;
}

// Optimal-string-alignment distance (Damerau-Levenshtein with adjacent swaps), with an early
// exit once every cell in a row exceeds `max`.
export function editDistance(a: string, b: string, max = 3): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const prev2 = new Array<number>(b.length + 1).fill(0);
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = new Array<number>(b.length + 1);
    cur[0] = i;
    let rowMin = cur[0];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(prev[j]! + 1, cur[j - 1]! + 1, prev[j - 1]! + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        v = Math.min(v, prev2[j - 2]! + 1);
      }
      cur[j] = v;
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > max) return max + 1;
    for (let j = 0; j <= b.length; j++) prev2[j] = prev[j]!;
    prev = cur;
  }
  return prev[b.length]!;
}

function allowedTypos(length: number) {
  if (length <= 3) return 0;
  if (length <= 5) return 1;
  return 2;
}

// ---------------------------------------------------------------- bilingual dictionary

// Each group = words meaning the same thing. Only needed where spellings don't resemble each
// other; "serum"/"سيروم" already match through the skeleton.
const SYNONYM_GROUPS: string[][] = [
  ["red", "احمر"],
  ["pink", "وردي", "زهري", "بمبي"],
  ["nude", "نود"],
  ["black", "اسود"],
  ["white", "ابيض"],
  ["brown", "بني"],
  ["blue", "ازرق"],
  ["green", "اخضر"],
  ["purple", "بنفسجي", "موف"],
  ["gold", "ذهبي"],
  ["silver", "فضي"],
  ["beige", "بيج"],
  ["orange", "برتقالي"],
  ["peach", "خوخي"],
  ["clear", "transparent", "شفاف"],
  ["lipstick", "روج", "احمر شفاه"],
  ["gloss", "lipgloss", "غلوس", "ملمع"],
  ["lip", "lips", "شفاه", "شفايف"],
  ["foundation", "كريم اساس", "فاونديشن"],
  ["concealer", "كونسيلر", "خافي عيوب"],
  ["powder", "بودره"],
  ["blush", "blusher", "بلاشر", "احمر خدود"],
  ["highlighter", "هايلايتر"],
  ["contour", "كونتور"],
  ["primer", "برايمر"],
  ["mascara", "ماسكارا", "مسكره"],
  ["eyeliner", "liner", "ايلاينر"],
  ["kohl", "كحل"],
  ["eyeshadow", "ظلال", "ايشادو"],
  ["brow", "eyebrow", "حواجب", "حاجب"],
  ["lashes", "رموش"],
  ["nail", "nails", "اظافر", "مناكير"],
  ["perfume", "parfum", "fragrance", "عطر", "عطور", "بارفان", "برفان"],
  ["mist", "body mist", "سبلاش", "معطر"],
  ["skincare", "skin", "بشره", "عنايه بالبشره"],
  ["serum", "سيروم"],
  ["cream", "كريم"],
  ["moisturizer", "مرطب", "ترطيب"],
  ["cleanser", "wash", "غسول"],
  ["toner", "تونر"],
  ["sunscreen", "sunblock", "spf", "واقي شمس", "صن بلوك"],
  ["mask", "ماسك", "قناع"],
  ["scrub", "مقشر", "سكراب"],
  ["lotion", "لوشن"],
  ["oil", "زيت"],
  ["hair", "haircare", "شعر"],
  ["shampoo", "شامبو"],
  ["conditioner", "بلسم"],
  ["makeup", "make up", "مكياج", "ميكب", "ميك اب"],
  ["brush", "brushes", "فرشاه", "فرش"],
  ["sponge", "blender", "اسفنجه"],
  ["remover", "مزيل"],
  ["eye", "eyes", "عين", "عيون"],
  ["face", "وجه"],
  ["vitamin c", "vit c", "فيتامين سي"],
  ["body", "جسم"],
  ["matte", "مطفي", "مات"],
  ["waterproof", "ضد الماء"],
  ["set", "طقم", "مجموعه", "بكج"],
  ["size", "مقاس", "حجم"],
  ["color", "colour", "shade", "لون", "درجه"],
  ["small", "صغير"],
  ["large", "big", "كبير"],
].map((g) => g.map(normalizeText));

// Alternative phrasings of the query: the original plus one per dictionary term found in it
// (exactly, or within a typo for longer words). Capped so long queries stay fast.
function expandQuery(query: string): { tokens: string[]; weight: number }[] {
  const variants: { tokens: string[]; weight: number }[] = [
    { tokens: query.split(" ").filter(Boolean), weight: 1 },
  ];
  const padded = ` ${query} `;
  const queryTokens = query.split(" ").filter(Boolean);
  for (const group of SYNONYM_GROUPS) {
    for (const term of group) {
      let replacedFrom: string | null = null;
      if (padded.includes(` ${term} `)) {
        replacedFrom = term;
      } else if (!term.includes(" ")) {
        const hit = queryTokens.find(
          (t) =>
            stripArticle(t) === term ||
            (t.length >= 5 && editDistance(t, term, 1) <= allowedTypos(term.length) - 1),
        );
        if (hit) replacedFrom = hit;
      }
      if (!replacedFrom) continue;
      for (const other of group) {
        if (other === term) continue;
        const replaced = ` ${query} `.replace(` ${replacedFrom} `, ` ${other} `).trim();
        variants.push({ tokens: replaced.split(" ").filter(Boolean), weight: 0.9 });
        if (variants.length >= 16) return variants;
      }
    }
  }
  return variants;
}

// ---------------------------------------------------------------- index + scoring

type Field = {
  weight: number;
  text: string;
  tokens: string[];
  skeletons: string[];
  skeletonText: string;
};

function makeField(raw: string, weight: number): Field {
  const text = normalizeText(raw);
  const tokens = text.split(" ").filter(Boolean);
  const skeletons = tokens.map(skeleton);
  return { weight, text, tokens, skeletons, skeletonText: skeletons.join(" ") };
}

export type SearchIndexEntry<T> = { item: T; fields: Field[] };

export function buildSearchIndex<T extends SearchableProduct>(items: T[]): SearchIndexEntry<T>[] {
  return items.map((item) => ({
    item,
    fields: [
      makeField(item.name, 1),
      makeField(item.variables.flatMap((v) => v.values.map((x) => x.label)).join(" "), 0.85),
      makeField(item.category, 0.7),
      makeField(item.description ?? "", 0.55),
      makeField(item.variables.map((v) => v.name).join(" "), 0.4),
    ],
  }));
}

function scoreToken(token: string, fields: Field[]): number {
  const tokSkel = skeleton(token);
  const tokBare = stripArticle(token);
  let best = 0;
  for (const f of fields) {
    if (!f.text) continue;
    let s = 0;
    const startsWord = f.tokens.some(
      (t) => t.startsWith(token) || stripArticle(t).startsWith(tokBare),
    );
    if (startsWord) s = 100;
    else if (token.length >= 2 && f.text.includes(token)) s = 85;
    // Skeletons of 1-2 consonants are ambiguous ("rg" = روج but also the start of أرجان), so
    // short ones must match a whole word; longer ones may match the start of a word.
    else if (tokSkel.length === 2 && f.skeletons.includes(tokSkel)) s = 72;
    else if (tokSkel.length >= 3 && f.skeletons.some((sk) => sk.startsWith(tokSkel))) s = 72;
    else if (tokSkel.length >= 4 && f.skeletonText.includes(tokSkel)) s = 62;
    else {
      const maxText = allowedTypos(tokBare.length);
      const maxSkel = tokSkel.length <= 3 ? 0 : tokSkel.length <= 5 ? 1 : 2;
      for (let i = 0; i < f.tokens.length; i++) {
        const ft = stripArticle(f.tokens[i]!);
        if (maxText > 0) {
          // compare against the start of longer words too, so half-typed words still match
          const target = ft.length > tokBare.length + 2 ? ft.slice(0, tokBare.length + 1) : ft;
          const d = editDistance(tokBare, target, maxText);
          if (d <= maxText) s = Math.max(s, 55 - d * 10);
        }
        const fs = f.skeletons[i]!;
        if (maxSkel > 0 && fs.length >= 3) {
          const d = editDistance(tokSkel, fs, maxSkel);
          if (d <= maxSkel) s = Math.max(s, 48 - d * 10);
        }
      }
    }
    best = Math.max(best, s * f.weight);
  }
  return best;
}

export function searchProducts<T extends SearchableProduct>(
  index: SearchIndexEntry<T>[],
  rawQuery: string,
): T[] {
  const query = normalizeText(rawQuery);
  if (!query) return [];
  const variants = expandQuery(query);

  const scored: { item: T; score: number }[] = [];
  for (const entry of index) {
    let best = 0;
    for (const v of variants) {
      let total = 0;
      let counted = 0;
      let allMatched = true;
      for (const token of v.tokens) {
        const s = scoreToken(token, entry.fields);
        // A lone letter ("vitamin c", "size s") can't be matched reliably across scripts,
        // so it only adds to the score; it never excludes a product on its own.
        if (token.length === 1 && v.tokens.length > 1) {
          total += s;
          continue;
        }
        if (s < 20) {
          allMatched = false;
          break;
        }
        total += s;
        counted++;
      }
      if (allMatched && counted > 0) best = Math.max(best, (total / v.tokens.length) * v.weight);
    }
    if (best > 0) scored.push({ item: entry.item, score: best });
  }

  // Drop weak tail matches once there are strong ones, so a clear hit isn't buried under
  // loosely related products.
  const top = scored.reduce((m, s) => Math.max(m, s.score), 0);
  return (
    scored
      .filter((s) => s.score >= top * 0.55)
      // best match first; equally good matches in alphabetical order
      .sort((a, b) => b.score - a.score || compareNames(a.item.name, b.item.name))
      .map((s) => s.item)
  );
}
