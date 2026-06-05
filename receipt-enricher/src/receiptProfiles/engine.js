'use strict';

// Runs a transformer's `transform` entrypoint against a copy of a parsed
// receipt, then AUTO-DERIVES the change/audit trail by diffing input vs output
// and recomputes totals. Transformer authors write only the logic; the result
// shape ({ store, items, totals, changes }) is identical to the old engine's.

function deepCopy(v) {
  return v === undefined || v === null ? v : JSON.parse(JSON.stringify(v));
}

// Fields we report diffs on (everything a transformer is expected to touch).
const STORE_FIELDS = ['name', 'date'];
const ITEM_FIELDS = ['description', 'sku', 'qty', 'unitPrice', 'price'];

// Mirrors parser.finalize so a profile result reports totals like a parse does.
const SUBTOTAL_TOLERANCE = 0.02;

function recomputeTotals(items, base) {
  const b = base || {};
  const sumOfItems =
    Math.round(items.reduce((acc, it) => acc + (Number(it && it.price) || 0), 0) * 100) / 100;
  const subtotal = b.subtotal ?? null;
  const subtotalMatch =
    subtotal == null ? null : Math.abs(sumOfItems - subtotal) <= SUBTOTAL_TOLERANCE;
  return {
    subtotal,
    tax: b.tax ?? null,
    total: b.total ?? null,
    itemCount: items.length,
    sumOfItems,
    subtotalMatch,
  };
}

function norm(v) {
  return v === undefined ? null : v;
}

function diff(before, after) {
  const changes = [];

  const bs = before.store || {};
  const as = after.store || {};
  for (const k of STORE_FIELDS) {
    if (norm(bs[k]) !== norm(as[k])) {
      changes.push({ field: `store.${k}`, from: norm(bs[k]), to: norm(as[k]) });
    }
  }

  const bi = before.items || [];
  const ai = after.items || [];
  const n = Math.min(bi.length, ai.length);
  for (let i = 0; i < n; i++) {
    for (const k of ITEM_FIELDS) {
      if (norm(bi[i][k]) !== norm(ai[i][k])) {
        changes.push({ field: `item.${k}`, from: norm(bi[i][k]), to: norm(ai[i][k]), itemIndex: i });
      }
    }
  }
  // Item added/removed by the transformer (uncommon, but recorded).
  for (let i = n; i < ai.length; i++) {
    changes.push({ field: 'item', from: null, to: norm(ai[i].description), itemIndex: i, added: true });
  }
  for (let i = n; i < bi.length; i++) {
    changes.push({ field: 'item', from: norm(bi[i].description), to: null, itemIndex: i, removed: true });
  }

  return changes;
}

/**
 * Apply a transformer to a receipt record.
 * @param {object} record   the durable receipt record (read-only here)
 * @param {Function} transformFn  a transformer's `transform` entrypoint
 * @param {object} ctx       { receiptId, config, log }
 * @returns {{store:object, items:object[], totals:object, changes:object[]}}
 */
function applyProfile(record, transformFn, ctx) {
  const before = {
    store: deepCopy((record && record.store)) || { name: null, date: null },
    items: deepCopy((record && record.items)) || [],
    totals: deepCopy((record && record.totals)) || {},
  };
  // The transformer mutates this copy (or returns a new draft).
  const draft = {
    store: deepCopy(before.store),
    items: deepCopy(before.items),
    totals: deepCopy(before.totals),
  };

  const returned = transformFn(draft, ctx);
  const out = returned && typeof returned === 'object' ? returned : draft;
  const store = out.store || { name: null, date: null };
  const items = Array.isArray(out.items) ? out.items : [];

  return {
    store,
    items,
    totals: recomputeTotals(items, before.totals),
    changes: diff(before, { store, items }),
  };
}

module.exports = { applyProfile, recomputeTotals };
