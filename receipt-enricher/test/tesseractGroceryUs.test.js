'use strict';

// Verifies the tesseractGroceryUs transformer: it loads via the registry and
// cleans up noisy Tesseract OCR output deterministically — stripping leading
// junk + the embedded SKU code, Title-Casing, expanding abbreviations, and
// inferring "Costco" from the Kirkland (KS) items (since Tesseract usually loses
// the store name). The descriptions below are the real shapes Tesseract produces
// on the Costco sample (see the acceptance suite).

const { test } = require('node:test');
const assert = require('node:assert/strict');

const registry = require('../src/receiptProfiles/registry');
const { applyProfile } = require('../src/receiptProfiles/engine');

// A receipt as the Tesseract pipeline parses it: store lost, ALL-CAPS items with
// OCR junk prefixes and the SKU code embedded in the description.
function tesseractRecord() {
  const mk = (description, sku) => ({ description, sku, qty: null, unitPrice: null, price: 1, enrichment: null });
  return {
    id: 'r1',
    store: { name: null, date: null },
    items: [
      mk('E 931484 KS WATER GAL', '931484'),
      mk('BN LC 1462714 KS ORG R2 PR', '1462714'),
      mk('EC 1199652 BUTER CROISS', '1199652'),
      mk('| oC 975416 SAN PELL MIN', '975416'),
      mk('BS [1948524 TRIMO YOGURT', '1948524'),
      mk('EE: 7017 3LB ORG ENVY', null),
      mk('© Is 99006 SWISS', '99006'),
    ],
    totals: {},
  };
}

test('registry discovers the tesseractGroceryUs transformer', () => {
  assert.equal(registry.has('tesseractGroceryUs'), true);
  const meta = registry.list().find((t) => t.id === 'tesseractGroceryUs');
  assert.ok(meta);
  assert.equal(meta.name, 'tesseractGroceryUs');
});

test('strips leading junk + SKU codes and Title-Cases item names', () => {
  const t = registry.get('tesseractGroceryUs');
  const out = applyProfile(tesseractRecord(), t.transform, { receiptId: 'r1', config: {}, log() {} });
  const names = out.items.map((it) => it.description);
  // "EC 1199652 BUTER CROISS" -> junk + sku gone, CROISS expanded, Title-Cased.
  assert.equal(names[2], 'Buter Croissant');
  // "| oC 975416 SAN PELL MIN" -> "San Pellegrino Mineral".
  assert.equal(names[3], 'San Pellegrino Mineral');
  // "BS [1948524 TRIMO YOGURT" -> "Trimona Yogurt".
  assert.equal(names[4], 'Trimona Yogurt');
  // sku-less line: leading junk + the misread numeric code stripped too.
  assert.equal(names[5], '3lb Organic Envy');
});

test('infers Costco from Kirkland items and rewrites water', () => {
  const t = registry.get('tesseractGroceryUs');
  const out = applyProfile(tesseractRecord(), t.transform, { receiptId: 'r1', config: {}, log() {} });
  assert.equal(out.store.name, 'Costco', 'store recovered from KS items');
  assert.equal(out.items[0].description, 'Water 5 Liter');
});

test('output descriptions satisfy the cleanup invariants', () => {
  const t = registry.get('tesseractGroceryUs');
  const out = applyProfile(tesseractRecord(), t.transform, { receiptId: 'r1', config: {}, log() {} });
  for (const it of out.items) {
    const d = it.description;
    assert.ok(d.length > 0, 'non-empty');
    assert.equal(d, d.trim(), 'no leading/trailing whitespace');
    assert.ok(!/ {2,}/.test(d), `no double spaces: ${JSON.stringify(d)}`);
    assert.ok(!/[A-Z]{2,}/.test(d), `no ALL-CAPS run remains: ${JSON.stringify(d)}`);
  }
});

test('already-clean descriptions are left essentially intact', () => {
  // A no-leading-code description shouldn't be mangled (only Title-Cased).
  const t = registry.get('tesseractGroceryUs');
  const record = {
    id: 'r2',
    store: { name: 'Costco', date: null },
    items: [{ description: 'Butter Croissants', sku: '2', qty: 1, unitPrice: 5.99, price: 5.99, enrichment: null }],
    totals: {},
  };
  const out = applyProfile(record, t.transform, { receiptId: 'r2', config: {}, log() {} });
  assert.equal(out.items[0].description, 'Butter Croissants');
});
