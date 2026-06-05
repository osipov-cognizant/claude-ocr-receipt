'use strict';

const { test, after } = require('node:test');
const assert = require('node:assert/strict');

const { useTempDataDir } = require('./helpers/harness');

const tmp = useTempDataDir('profile-result-store-test');
const resultStore = require('../src/receiptProfiles/resultStore');

after(() => tmp.cleanup());

function result(receiptId, profileId, appliedAt) {
  return {
    receiptId,
    profileId,
    profileName: 'p',
    profileVersion: 1,
    appliedAt,
    store: { name: 'Costco', date: '05-26-2026' },
    items: [],
    totals: { itemCount: 0, sumOfItems: 0 },
    changes: [],
  };
}

test('save then get round-trips a result', async () => {
  await resultStore.save(result('r1', 'rp_a', '2026-06-04T10:00:00.000Z'));
  const got = await resultStore.get('r1', 'rp_a');
  assert.equal(got.receiptId, 'r1');
  assert.equal(got.store.name, 'Costco');
});

test('get returns null for a missing result; list returns [] for a missing receipt', async () => {
  assert.equal(await resultStore.get('r1', 'rp_missing'), null);
  assert.deepEqual(await resultStore.list('nobody'), []);
});

test('list returns all results for a receipt, newest first', async () => {
  await resultStore.save(result('r2', 'rp_old', '2026-06-04T09:00:00.000Z'));
  await resultStore.save(result('r2', 'rp_new', '2026-06-04T11:00:00.000Z'));
  const list = await resultStore.list('r2');
  assert.equal(list.length, 2);
  assert.equal(list[0].profileId, 'rp_new', 'sorted by appliedAt desc');
});

test('saving the same receipt+profile overwrites (one result per pair)', async () => {
  await resultStore.save(result('r3', 'rp_x', '2026-06-04T09:00:00.000Z'));
  await resultStore.save(result('r3', 'rp_x', '2026-06-04T12:00:00.000Z'));
  const list = await resultStore.list('r3');
  assert.equal(list.length, 1);
  assert.equal(list[0].appliedAt, '2026-06-04T12:00:00.000Z');
});
