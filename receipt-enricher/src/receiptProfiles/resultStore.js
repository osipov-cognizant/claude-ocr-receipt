'use strict';

const fsp = require('fs/promises');
const path = require('path');
const identity = require('../identity');

// Profile results live OUTSIDE the receipt record, one file per applied profile,
// scoped to the receipt's tenant/user (private, like the receipt itself):
//   <dataDir>/<tenant>/<user>/profileResults/<receiptCacheId>/<profileId>.json
// The result's `receiptId` is the COMPOSITE receipt id, which the store parses
// (src/identity.js) to find the scoped directory. Keyed on the profile id
// (stable across renames). listAll/listByProfile take an explicit scope (default
// identity) since they have no receipt id to derive it from.

// Per-receipt directory from a composite (or bare) receipt id; null if malformed.
function receiptDir(receiptId) {
  try {
    const { tenantId, userId, cacheId } = identity.resolveId(receiptId);
    return path.join(identity.userDataDir({ tenantId, userId }, 'profileResults'), cacheId);
  } catch {
    return null;
  }
}
function resultPath(receiptId, profileId) {
  const dir = receiptDir(receiptId);
  return dir ? path.join(dir, `${profileId}.json`) : null;
}

// The profileResults dir for one identity (default scope), for listAll/byProfile.
function scopedRoot({ tenantId, userId } = {}) {
  const def = identity.defaultScope();
  return identity.userDataDir(
    { tenantId: tenantId || def.tenantId, userId: userId || def.userId },
    'profileResults'
  );
}

async function save(result) {
  const { receiptId, profileId } = result;
  const target = resultPath(receiptId, profileId);
  if (!target) throw new identity.IdentityError(400, `cannot save result for invalid receipt id "${receiptId}"`);
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

// Read every result file in a directory. Tolerant: missing dir → [],
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
  out.sort((a, b) => (a.appliedAt < b.appliedAt ? 1 : -1));
  return out;
}

// Every result for one identity, newest first. Walks each receipt subdir under
// the identity's profileResults root and flattens.
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
  out.sort((a, b) => (a.appliedAt < b.appliedAt ? 1 : -1));
  return out;
}

// Every result for one profile (within one identity), newest first. Results are
// keyed by profile id, so callers pass an id (resolve a name upstream).
async function listByProfile(profileId, scope) {
  const all = await listAll(scope);
  return all.filter((r) => r.profileId === profileId);
}

module.exports = { save, get, list, listAll, listByProfile };
