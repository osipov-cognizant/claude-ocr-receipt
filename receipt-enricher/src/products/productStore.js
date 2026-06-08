'use strict';

const fsp = require('fs/promises');
const path = require('path');
const identity = require('../identity');

// Product results live OUTSIDE the receipt record, one file per source receipt
// profile, scoped to the receipt's tenant/user (private, like the receipt):
//   <dataDir>/<tenant>/<user>/products/<receiptCacheId>/<receiptProfileId>.json
// Keyed on the source profile id (resolution always follows an applied profile).
// The result's `receiptId` is the COMPOSITE receipt id, parsed (src/identity.js)
// to find the scoped directory. Mirrors receiptProfiles/resultStore.js.

function receiptDir(receiptId) {
  try {
    const { tenantId, userId, cacheId } = identity.resolveId(receiptId);
    return path.join(identity.userDataDir({ tenantId, userId }, 'products'), cacheId);
  } catch {
    return null;
  }
}
function resultPath(receiptId, profileId) {
  const dir = receiptDir(receiptId);
  return dir ? path.join(dir, `${profileId}.json`) : null;
}

function scopedRoot({ tenantId, userId } = {}) {
  const def = identity.defaultScope();
  return identity.userDataDir(
    { tenantId: tenantId || def.tenantId, userId: userId || def.userId },
    'products'
  );
}

async function save(result) {
  const { receiptId, receiptProfileId } = result;
  const target = resultPath(receiptId, receiptProfileId);
  if (!target) throw new identity.IdentityError(400, `cannot save products for invalid receipt id "${receiptId}"`);
  await fsp.mkdir(path.dirname(target), { recursive: true });
  const tmp = target + '.tmp';
  await fsp.writeFile(tmp, JSON.stringify(result, null, 2));
  await fsp.rename(tmp, target);
  return result;
}

async function get(receiptId, profileId) {
  const target = resultPath(receiptId, profileId);
  if (!target) return null;
  try {
    return JSON.parse(await fsp.readFile(target, 'utf8'));
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw err;
  }
}

// Read every result file in one receipt's subdir. Tolerant: missing dir → [],
// unreadable file → skipped.
async function readDir(dir) {
  let files;
  try {
    files = await fsp.readdir(dir);
  } catch {
    return [];
  }
  const out = [];
  for (const f of files) {
    if (!f.endsWith('.json')) continue;
    try {
      out.push(JSON.parse(await fsp.readFile(path.join(dir, f), 'utf8')));
    } catch {
      /* skip unreadable */
    }
  }
  return out;
}

async function list(receiptId) {
  const dir = receiptDir(receiptId);
  if (!dir) return [];
  const out = await readDir(dir);
  out.sort((a, b) => (a.resolvedAt < b.resolvedAt ? 1 : -1));
  return out;
}

// Every product result for one identity (default scope), newest first.
async function listAll(scope) {
  let dirents;
  try {
    dirents = await fsp.readdir(scopedRoot(scope), { withFileTypes: true });
  } catch {
    return [];
  }
  const out = [];
  for (const d of dirents) {
    if (!d.isDirectory()) continue;
    out.push(...(await readDir(path.join(scopedRoot(scope), d.name))));
  }
  out.sort((a, b) => (a.resolvedAt < b.resolvedAt ? 1 : -1));
  return out;
}

module.exports = { save, get, list, listAll };
