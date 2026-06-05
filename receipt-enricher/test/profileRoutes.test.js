'use strict';

// HTTP-surface tests for the Receipt Profiles API (code-transformer model).
// Same hermetic setup as routes.test.js: temp DATA_DIR, fake Redis, stubbed
// queue, real Express over loopback. Profiles reference the shipped usGrocery
// transformer (loaded by the registry via the runtime TS loader).

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');

const { useTempDataDir, installFakeRedis } = require('./helpers/harness');

const tmp = useTempDataDir('profile-routes-test');
installFakeRedis();

const queuePath = require.resolve('../src/queue');
require.cache[queuePath] = {
  id: queuePath,
  filename: queuePath,
  loaded: true,
  exports: {
    enqueueReceipt: async (id) => ({ id: `receipt-${id}` }),
    receiptsQueue: {},
    connection: {},
  },
};

const store = require('../src/store');
const { createApp } = require('../src/app');

let server;
let base;

const validProfile = { name: 'routesTest1', description: 'd', transformer: 'usGrocery' };

async function seedDoneReceipt() {
  const rec = await store.createReceipt({
    buffer: Buffer.alloc(16, 1),
    mimeType: 'image/png',
    originalName: 'r.png',
    source: 'test',
  });
  await store.update(rec.id, {
    status: 'done',
    store: { name: 'COSTCO WHOLESALE', date: '2026-05-26' },
    items: [
      { description: 'KS WATER GAL', sku: '931484', qty: 1, unitPrice: 4.99, price: 4.99, enrichment: null },
      { description: 'US WAGYU BEEF', sku: '1455728', qty: 1, unitPrice: 19.99, price: 19.99, enrichment: null },
    ],
    totals: { subtotal: 24.98, tax: 0, total: 24.98, itemCount: 2, sumOfItems: 24.98, subtotalMatch: true },
  });
  return rec.id;
}

const post = (path, body) =>
  fetch(`${base}${path}`, {
    method: 'POST',
    headers: body ? { 'content-type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });

before(async () => {
  server = createApp().listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => {
  server.close();
  tmp.cleanup();
});

test('GET /api/transformers lists the shipped usGrocery transformer', async () => {
  const res = await fetch(`${base}/api/transformers`);
  assert.equal(res.status, 200);
  const list = await res.json();
  assert.ok(list.some((t) => t.id === 'usGrocery'));
});

test('POST /api/receiptProfiles creates a profile -> 201', async () => {
  const res = await post('/api/receiptProfiles', validProfile);
  assert.equal(res.status, 201);
  const body = await res.json();
  assert.match(body.id, /^rp_/);
  assert.equal(body.transformer, 'usGrocery');
  assert.equal(body.version, 1);
});

test('POST with an unknown transformer -> 400 with details', async () => {
  const res = await post('/api/receiptProfiles', { name: 'bad1', transformer: 'noSuch' });
  assert.equal(res.status, 400);
  const body = await res.json();
  assert.ok(Array.isArray(body.details) && body.details.some((d) => /unknown transformer/i.test(d)));
});

test('GET /api/receiptProfiles lists summaries with the transformer ref', async () => {
  const list = await (await fetch(`${base}/api/receiptProfiles`)).json();
  const row = list.find((p) => p.name === 'routesTest1');
  assert.ok(row);
  assert.equal(row.transformer, 'usGrocery');
});

test('GET /api/receiptProfiles/:id resolves by name and id; 404 otherwise', async () => {
  const byName = await (await fetch(`${base}/api/receiptProfiles/routesTest1`)).json();
  assert.equal(byName.name, 'routesTest1');
  const byId = await (await fetch(`${base}/api/receiptProfiles/${byName.id}`)).json();
  assert.equal(byId.id, byName.id);
  assert.equal((await fetch(`${base}/api/receiptProfiles/missing`)).status, 404);
});

test('POST applyProfile (by name) -> 200, runs transformer and persists', async () => {
  const id = await seedDoneReceipt();
  const res = await post(`/api/receipts/${id}/applyProfile/routesTest1`);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.store.name, 'Costco');
  assert.equal(body.store.date, '05-26-2026');
  assert.equal(body.items[0].description, 'Water 5 Liter');
  assert.equal(body.transformer, 'usGrocery');
  assert.ok(body.changes.length >= 3);

  const list = await (await fetch(`${base}/api/receipts/${id}/profileResults`)).json();
  assert.equal(list.length, 1);
  const one = await (await fetch(`${base}/api/receipts/${id}/profileResults/routesTest1`)).json();
  assert.equal(one.store.name, 'Costco');
});

test('POST applyProfile?dryRun=1 -> 200 but does NOT persist', async () => {
  const id = await seedDoneReceipt();
  const res = await post(`/api/receipts/${id}/applyProfile/routesTest1?dryRun=1`);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.dryRun, true);
  assert.equal(body.store.name, 'Costco');
  const list = await (await fetch(`${base}/api/receipts/${id}/profileResults`)).json();
  assert.equal(list.length, 0, 'dry run leaves nothing on disk');
});

test('applyProfile -> 404 for unknown receipt or unknown profile', async () => {
  const id = await seedDoneReceipt();
  assert.equal((await post(`/api/receipts/nope/applyProfile/routesTest1`)).status, 404);
  assert.equal((await post(`/api/receipts/${id}/applyProfile/noSuchProfile`)).status, 404);
});

test('DELETE /api/receiptProfiles/:id -> 204 then 404', async () => {
  await post('/api/receiptProfiles', { ...validProfile, name: 'toDelete1' });
  const del = await fetch(`${base}/api/receiptProfiles/toDelete1`, { method: 'DELETE' });
  assert.equal(del.status, 204);
  assert.equal((await fetch(`${base}/api/receiptProfiles/toDelete1`)).status, 404);
});

test('GET /health includes a receiptProfiles count', async () => {
  const body = await (await fetch(`${base}/health`)).json();
  assert.equal(typeof body.receiptProfiles, 'number');
  assert.ok(body.receiptProfiles >= 1);
});
