// Example transformer: normalize common US grocery receipts. This replaces the
// former two-stage JSON rules with plain TypeScript — context-sensitive logic is
// just ordinary control flow.

import type { Transform, TransformerMeta } from './types';

export const meta: TransformerMeta = {
  name: 'usGrocery',
  description:
    'Normalize common US grocery receipts (store name + date) and a context-sensitive item rewrite.',
  version: 1,
};

// Canonical store name -> known variants (lowercase). Longest variant wins.
const STORE_ALIASES: Record<string, string[]> = {
  Costco: ['costco wholesale', 'costco'],
  Sprouts: ['sprouts farmers market', 'sprouts'],
  Walmart: ['walmart', 'wal-mart'],
  'Whole Foods': ['whole foods market', 'whole foods'],
};

export const transform: Transform = (receipt) => {
  const { store, items } = receipt;

  // 1. Canonicalize the store name (case-insensitive, longest alias first).
  if (store.name) {
    const hay = store.name.toLowerCase();
    const match = Object.entries(STORE_ALIASES)
      .flatMap(([canonical, variants]) => variants.map((v) => ({ canonical, v })))
      .sort((a, b) => b.v.length - a.v.length)
      .find(({ v }) => hay.includes(v));
    if (match) store.name = match.canonical;
  }

  // 2. Reformat the date YYYY-MM-DD -> MM-DD-YYYY.
  if (store.date) {
    store.date = store.date.replace(/^(\d{4})-(\d{2})-(\d{2})$/, '$2-$3-$1');
  }

  // 3. Context-sensitive item rewrite: at Costco, "water" -> "Water 5 Liter".
  if (store.name === 'Costco') {
    for (const item of items) {
      if (/water/i.test(item.description)) item.description = 'Water 5 Liter';
    }
  }

  return receipt;
};
