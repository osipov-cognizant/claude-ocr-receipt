'use strict';

const fsp = require('fs/promises');
const path = require('path');
const identity = require('./identity');

// Records and images are stored per tenant/user:
//   <dataDir>/<tenant>/<user>/receipts/<cacheId>.json
//   <dataDir>/<tenant>/<user>/uploads/<cacheId>.<ext>
// A receipt's public `id` is the COMPOSITE id `<tenant>:<user>:<cacheId>`, so it
// self-describes its location; the store parses it (src/identity.js) to find the
// scoped paths. Directories are created lazily per scope on first write.

function newId() {
  return identity.newCacheId();
}

function receiptsDir(scope) {
  return identity.userDataDir(scope, 'receipts');
}
function uploadsDir(scope) {
  return identity.userDataDir(scope, 'uploads');
}

// Resolve a composite (or bare) id to its on-disk record path, or null if the id
// is malformed (so callers surface a clean 404 rather than throwing).
function recordPathOf(id) {
  try {
    const r = identity.resolveId(id);
    return path.join(receiptsDir({ tenantId: r.tenantId, userId: r.userId }), `${r.cacheId}.json`);
  } catch {
    return null;
  }
}

const EXT_BY_MIME = {
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/heic': '.heic',
  'image/heif': '.heif',
};

function extForMime(mime, fallbackName) {
  if (EXT_BY_MIME[mime]) return EXT_BY_MIME[mime];
  const ext = fallbackName ? path.extname(fallbackName) : '';
  return ext || '.img';
}

/**
 * Persist an uploaded image buffer and create the initial receipt record under
 * the given identity. `tenantId`/`userId` default to the configured identity.
 * @returns {Promise<object>} the created record (its `id` is the composite id)
 */
async function createReceipt({ buffer, mimeType, originalName, source, tenantId, userId }) {
  const def = identity.defaultScope();
  const scope = { tenantId: tenantId || def.tenantId, userId: userId || def.userId };
  const cacheId = newId();
  const id = identity.buildId(scope.tenantId, scope.userId, cacheId); // validates scope
  const ext = extForMime(mimeType, originalName);
  const imageFile = `${cacheId}${ext}`;

  await fsp.mkdir(uploadsDir(scope), { recursive: true });
  await fsp.writeFile(path.join(uploadsDir(scope), imageFile), buffer);

  const now = new Date().toISOString();
  const record = {
    id,
    tenantId: scope.tenantId,
    userId: scope.userId,
    status: 'queued', // queued | processing | done | failed
    source: source || 'api',
    createdAt: now,
    updatedAt: now,
    image: {
      file: imageFile,
      mimeType: mimeType || 'application/octet-stream',
      originalName: originalName || null,
      size: buffer.length,
    },
    extraction: { provider: null, rawText: null },
    store: null, // { name, date }
    items: [], // [{ description, sku, qty, unitPrice, price, enrichment }]
    totals: null, // { subtotal, tax, total, itemCount, sumOfItems }
    summary: null,
    error: null,
    timings: {},
  };
  await save(record);
  return record;
}

async function save(record) {
  const target = recordPathOf(record.id);
  if (!target) throw new identity.IdentityError(400, `cannot save record with invalid id "${record.id}"`);
  await fsp.mkdir(path.dirname(target), { recursive: true });
  record.updatedAt = new Date().toISOString();
  const tmp = target + '.tmp';
  await fsp.writeFile(tmp, JSON.stringify(record, null, 2));
  await fsp.rename(tmp, target); // atomic-ish write
  return record;
}

async function get(id) {
  const target = recordPathOf(id);
  if (!target) return null; // malformed id -> treat as not found
  try {
    const raw = await fsp.readFile(target, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw err;
  }
}

/**
 * Read-modify-write merge. Single-worker concurrency keeps this safe for the
 * scaffold; for multi-worker setups switch to a Redis-backed record store.
 */
async function update(id, patch) {
  const current = await get(id);
  if (!current) throw new Error(`receipt ${id} not found`);
  const next = { ...current, ...patch };
  return save(next);
}

/**
 * List a single identity's receipts, newest first. Scope defaults to the
 * configured identity (so single-tenant callers pass only `{ limit }`).
 */
async function list({ tenantId, userId, limit = 50 } = {}) {
  const def = identity.defaultScope();
  const scope = { tenantId: tenantId || def.tenantId, userId: userId || def.userId };
  let dir;
  try {
    dir = receiptsDir(scope);
  } catch {
    return []; // invalid scope -> nothing to list
  }
  let files;
  try {
    files = await fsp.readdir(dir);
  } catch {
    return [];
  }
  const records = [];
  for (const f of files) {
    if (!f.endsWith('.json')) continue;
    try {
      const raw = await fsp.readFile(path.join(dir, f), 'utf8');
      records.push(JSON.parse(raw));
    } catch {
      /* skip unreadable */
    }
  }
  records.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  return records.slice(0, limit);
}

function imagePathFor(record) {
  const { tenantId, userId } = identity.resolveId(record.id);
  return path.join(uploadsDir({ tenantId, userId }), record.image.file);
}

module.exports = { createReceipt, save, get, update, list, imagePathFor, newId };
