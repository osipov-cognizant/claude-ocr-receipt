// Transformer: clean up noisy *Tesseract* OCR output for US grocery receipts.
//
// A copy/derivative of `usGrocery` tuned for the offline Tesseract pipeline,
// whose output is far messier than a vision model's. On the Costco sample
// Tesseract typically yields:
//   - store: null            (the warehouse name is garbled beyond the alias map)
//   - items like "E 931484 KS WATER GAL", "| oC 975416 SAN PELL MIN",
//     "BS [1948524 TRIMO YOGURT" — leading OCR junk, the SKU code embedded in the
//     description, and ALL-CAPS register text.
//
// This transformer repairs that deterministically: it strips the leading junk +
// SKU code (already captured separately in `item.sku`), collapses whitespace,
// Title-Cases the text, expands a few common grocery abbreviations, and — since
// the store name is usually lost — *infers* "Costco" from the Kirkland ("KS")
// items, then applies the same context-sensitive water rewrite as `usGrocery`.

import type { Transform, TransformerMeta, Item } from './types';

export const meta: TransformerMeta = {
  name: 'tesseractGroceryUs',
  description:
    'Clean up noisy Tesseract OCR output for US grocery receipts (strip junk + SKU codes, Title-Case, expand abbreviations) and infer the store from Kirkland items.',
  version: 1,
};

// Canonical store name -> known variants (lowercase). Longest variant wins.
const STORE_ALIASES: Record<string, string[]> = {
  Costco: ['costco wholesale', 'costco'],
  Sprouts: ['sprouts farmers market', 'sprouts'],
  Walmart: ['walmart', 'wal-mart'],
  'Whole Foods': ['whole foods market', 'whole foods'],
};

// Common Costco/grocery register abbreviations -> readable words (whole-word,
// case-insensitive). Applied after Title-Casing, so keys are lowercase.
const EXPANSIONS: Record<string, string> = {
  ks: 'Kirkland Signature',
  org: 'Organic',
  min: 'Mineral',
  pell: 'Pellegrino',
  croiss: 'Croissant',
  trimo: 'Trimona',
};

function canonicalStore(name: string): string | null {
  const hay = name.toLowerCase();
  const match = Object.entries(STORE_ALIASES)
    .flatMap(([canonical, variants]) => variants.map((v) => ({ canonical, v })))
    .sort((a, b) => b.v.length - a.v.length)
    .find(({ v }) => hay.includes(v));
  return match ? match.canonical : null;
}

function titleCase(s: string): string {
  return s.toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase());
}

// Repair one register-line description. The SKU code (and any OCR junk before
// it) is stripped because `item.sku` already holds it; what remains is the name.
function cleanDescription(desc: string): string {
  const original = desc.replace(/\s+/g, ' ').trim();
  // Strip a leading non-digit run followed by a 3+ digit code (the SKU plus any
  // junk before it: "E 931484 KS WATER GAL" -> "KS WATER GAL"). A no-op when the
  // description has no such leading code (already-clean input).
  let d = original.replace(/^\D*\d{3,}[\s:/|\[\].]*/, '');
  // Strip any remaining leading punctuation the OCR left behind.
  d = d.replace(/^[^A-Za-z0-9]+/, '').replace(/\s+/g, ' ').trim();
  // If stripping emptied it (description was only a code), keep the original.
  if (!d) d = original;
  d = titleCase(d);
  // Expand known whole-word abbreviations.
  d = d.replace(/\b[A-Za-z]+\b/g, (w) => EXPANSIONS[w.toLowerCase()] ?? w);
  return d.replace(/\s+/g, ' ').trim();
}

// Does the (raw) item set look like a Costco run? Kirkland ("KS") is Costco's
// house brand and Tesseract reads it reliably, so >= 2 KS lines => Costco.
function looksLikeCostco(items: Item[]): boolean {
  const ksCount = items.filter((it) => /\bks\b/i.test(it.description || '')).length;
  return ksCount >= 2;
}

export const transform: Transform = (receipt) => {
  const { store, items } = receipt;

  // 1. Recover the store name. Try the alias map on whatever (if anything)
  //    parsed; otherwise infer Costco from the Kirkland items before we rewrite
  //    the descriptions.
  const inferredCostco = looksLikeCostco(items);
  if (store.name) {
    store.name = canonicalStore(store.name) || store.name;
  }
  if (!store.name && inferredCostco) store.name = 'Costco';

  // 2. Reformat the date YYYY-MM-DD -> MM-DD-YYYY (when one was parsed).
  if (store.date) {
    store.date = store.date.replace(/^(\d{4})-(\d{2})-(\d{2})$/, '$2-$3-$1');
  }

  // 3. Clean every item description.
  for (const item of items) {
    if (typeof item.description === 'string') item.description = cleanDescription(item.description);
  }

  // 4. Context-sensitive item rewrite: at Costco, water -> "Water 5 Liter".
  if (store.name === 'Costco') {
    for (const item of items) {
      if (/water/i.test(item.description)) item.description = 'Water 5 Liter';
    }
  }

  return receipt;
};
