'use strict';

const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const config = require('./config');

function ensureDirs() {
  for (const dir of [config.dataDir, config.uploadsDir, config.receiptsDir]) {
    fs.mkdirSync(dir, { recursive: true });
  }
}
ensureDirs();

function newId() {
  // Short, URL-safe, time-sortable-ish id.
  return crypto.randomUUID().replace(/-/g, '').slice(0, 16);
}

function recordPath(id) {
  return path.join(config.receiptsDir, `${id}.json`);
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
 * Persist an uploaded image buffer and create the initial receipt record.
 * @returns {Promise<object>} the created record
 */
async function createReceipt({ buffer, mimeType, originalName, source }) {
  const id = newId();
  const ext = extForMime(mimeType, originalName);
  const imageFile = `${id}${ext}`;
  const imagePath = path.join(config.uploadsDir, imageFile);
  await fsp.writeFile(imagePath, buffer);

  const now = new Date().toISOString();
  const record = {
    id,
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
  record.updatedAt = new Date().toISOString();
  const tmp = recordPath(record.id) + '.tmp';
  await fsp.writeFile(tmp, JSON.stringify(record, null, 2));
  await fsp.rename(tmp, recordPath(record.id)); // atomic-ish write
  return record;
}

async function get(id) {
  try {
    const raw = await fsp.readFile(recordPath(id), 'utf8');
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

async function list({ limit = 50 } = {}) {
  let files;
  try {
    files = await fsp.readdir(config.receiptsDir);
  } catch {
    return [];
  }
  const records = [];
  for (const f of files) {
    if (!f.endsWith('.json')) continue;
    try {
      const raw = await fsp.readFile(path.join(config.receiptsDir, f), 'utf8');
      records.push(JSON.parse(raw));
    } catch {
      /* skip unreadable */
    }
  }
  records.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  return records.slice(0, limit);
}

function imagePathFor(record) {
  return path.join(config.uploadsDir, record.image.file);
}

module.exports = { createReceipt, save, get, update, list, imagePathFor, newId };
