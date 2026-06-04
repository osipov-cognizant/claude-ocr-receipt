'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const view = require('../src/web/view');
const { structured } = require('./fixtures/costco-sample');
const parser = require('../src/parse/receiptParser');

function sampleRecord(overrides = {}) {
  const parsed = parser.normalizeStructured(structured, null);
  return {
    id: 'abc123def4567890',
    status: 'done',
    source: 'cli',
    createdAt: new Date('2026-05-26T10:00:00Z').toISOString(),
    image: { file: 'abc.jpg', originalName: 'costco.jpg', mimeType: 'image/jpeg' },
    extraction: { provider: 'vision' },
    store: parsed.store,
    items: parsed.items,
    totals: parsed.totals,
    summary: 'Costco: 12 item(s), total $116.37. 0 item(s) matched with images/metadata.',
    error: null,
    ...overrides,
  };
}

test('renderReceipt produces a full HTML document', () => {
  const html = view.renderReceipt(sampleRecord());
  assert.match(html, /^<!doctype html>/i);
  assert.match(html, /<\/html>\s*$/);
  assert.ok(html.includes('Costco'), 'store name is rendered');
});

test('renderReceipt lists items, prices and the grand total', () => {
  const html = view.renderReceipt(sampleRecord());
  assert.ok(html.includes('US WAGYUBEEF'), 'item description shown');
  assert.ok(html.includes('$19.99'), 'item price shown');
  assert.ok(html.includes('$116.37'), 'grand total shown');
  assert.ok(html.includes('SKU 1455728'), 'SKU shown in the item sub-line');
});

test('renderReceipt renders an enrichment image when present', () => {
  const record = sampleRecord();
  record.items[0].enrichment = {
    imageUrl: 'https://img.example/water.jpg',
    snippet: 'Kirkland Signature water',
    url: 'https://example.com/water',
  };
  const html = view.renderReceipt(record);
  assert.ok(html.includes('https://img.example/water.jpg'), 'image url rendered');
  assert.ok(html.includes('Kirkland Signature water'), 'snippet rendered');
});

test('renderReceipt escapes HTML to prevent injection from receipt text', () => {
  const record = sampleRecord({
    store: { name: '<script>alert(1)</script>', date: null },
    items: [{ description: '<img src=x onerror=alert(2)>', price: 1.0, enrichment: null }],
    summary: null,
  });
  const html = view.renderReceipt(record);
  assert.ok(!html.includes('<script>alert(1)</script>'), 'raw script tag must be escaped');
  assert.ok(html.includes('&lt;script&gt;'), 'store name is HTML-escaped');
  assert.ok(html.includes('&lt;img src=x'), 'item description is HTML-escaped');
});

test('renderReceipt flags a subtotal shortfall as a possible missing line', () => {
  const record = sampleRecord({
    items: [{ description: 'A', price: 10, enrichment: null }],
    totals: { subtotal: 30, tax: 0, total: 30, itemCount: 1, sumOfItems: 10, subtotalMatch: false },
    summary: null,
  });
  const html = view.renderReceipt(record);
  assert.match(html, /under subtotal/i, 'shortfall warning shown');
  assert.ok(html.includes('a line may be missing'), 'explains the likely cause');
});

test('renderReceipt notes an overage as excluded discounts, not a warning', () => {
  const record = sampleRecord({
    items: [{ description: 'A', price: 30, enrichment: null }],
    totals: { subtotal: 25, tax: 0, total: 25, itemCount: 1, sumOfItems: 30, subtotalMatch: false },
    summary: null,
  });
  const html = view.renderReceipt(record);
  assert.match(html, /excludes discounts/i, 'overage explained as discounts');
  assert.ok(!/a line may be missing/.test(html), 'an overage is not flagged as missing');
});

test('renderReceipt confirms reconciliation when items match the subtotal', () => {
  const record = sampleRecord({
    items: [{ description: 'A', price: 25, enrichment: null }],
    totals: { subtotal: 25, tax: 0, total: 25, itemCount: 1, sumOfItems: 25, subtotalMatch: true },
    summary: null,
  });
  assert.match(view.renderReceipt(record), /items reconcile/i);
});

test('renderReceipt shows an error banner and status for a failed receipt', () => {
  const html = view.renderReceipt(
    sampleRecord({ status: 'failed', error: 'Anthropic API 401', summary: null, items: [] })
  );
  assert.ok(html.includes('Anthropic API 401'), 'error message surfaced');
  assert.ok(html.includes('failed'), 'status reflected');
  assert.ok(html.includes('No line items yet'), 'empty-state shown when no items');
});

test('renderList renders rows for each receipt and an empty state', () => {
  const rows = view.renderList([
    sampleRecord(),
    sampleRecord({ id: 'second0000000000', store: { name: 'Sprouts', date: null } }),
  ]);
  assert.ok(rows.includes('Costco'));
  assert.ok(rows.includes('Sprouts'));
  assert.ok(rows.includes('/receipts/abc123def4567890/view'), 'links to the detail view');

  const empty = view.renderList([]);
  assert.ok(empty.includes('No receipts yet'), 'empty list state');
});

test('esc handles null/undefined without throwing', () => {
  assert.equal(view.esc(null), '');
  assert.equal(view.esc(undefined), '');
  assert.equal(view.esc('a & b "c"'), 'a &amp; b &quot;c&quot;');
});
