'use strict';

// Verifies the registry loads the shipped on-disk transformers via the runtime
// TS loader and that the usGrocery transformer behaves as intended.

const { test } = require('node:test');
const assert = require('node:assert/strict');

const registry = require('../src/receiptProfiles/registry');
const { applyProfile } = require('../src/receiptProfiles/engine');

test('discovers the shipped usGrocery transformer', () => {
  assert.equal(registry.has('usGrocery'), true);
  const ids = registry.list().map((t) => t.id);
  assert.ok(ids.includes('usGrocery'));
  const meta = registry.list().find((t) => t.id === 'usGrocery');
  assert.equal(meta.name, 'usGrocery');
});

test('the types-only module is not registered as a transformer', () => {
  assert.equal(registry.has('types'), false);
});

test('unknown transformer id resolves to null', () => {
  assert.equal(registry.get('doesNotExist'), null);
});

test('usGrocery normalizes store, date, and Costco water items', () => {
  const t = registry.get('usGrocery');
  assert.ok(t && typeof t.transform === 'function');
  const record = {
    id: 'r1',
    store: { name: 'costco wholesale', date: '2026-05-26' },
    items: [
      { description: 'KS Water Gal', sku: '1', qty: 1, unitPrice: 4.99, price: 4.99, enrichment: null },
      { description: 'Butter Croissants', sku: '2', qty: 1, unitPrice: 5.99, price: 5.99, enrichment: null },
    ],
    totals: { subtotal: 10.98, tax: 0, total: 10.98 },
  };
  const out = applyProfile(record, t.transform, { receiptId: 'r1', config: {}, log() {} });
  assert.equal(out.store.name, 'Costco');
  assert.equal(out.store.date, '05-26-2026');
  assert.equal(out.items[0].description, 'Water 5 Liter');
  assert.equal(out.items[1].description, 'Butter Croissants');
});
