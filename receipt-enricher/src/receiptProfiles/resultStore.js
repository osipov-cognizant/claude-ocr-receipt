'use strict';

const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const config = require('../config');

// Profile results live OUTSIDE the receipt record, one file per applied profile:
//   DATA_DIR/profileResults/<receiptId>/<profileId>.json
// Keyed on the profile id (stable across renames). One subdir per receipt makes
// "list every result for this receipt" a plain readdir.

const baseDir = config.receiptProfiles.resultsDir;

function ensureBase() {
  fs.mkdirSync(baseDir, { recursive: true });
}
ensureBase();

function receiptDir(receiptId) {
  return path.join(baseDir, receiptId);
}
function resultPath(receiptId, profileId) {
  return path.join(receiptDir(receiptId), `${profileId}.json`);
}

async function save(result) {
  const { receiptId, profileId } = result;
  await fsp.mkdir(receiptDir(receiptId), { recursive: true });
  const tmp = resultPath(receiptId, profileId) + '.tmp';
  await fsp.writeFile(tmp, JSON.stringify(result, null, 2));
  await fsp.rename(tmp, resultPath(receiptId, profileId));
  return result;
}

async function get(receiptId, profileId) {
  try {
    return JSON.parse(await fsp.readFile(resultPath(receiptId, profileId), 'utf8'));
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
  const out = await readDir(receiptDir(receiptId));
  out.sort((a, b) => (a.appliedAt < b.appliedAt ? 1 : -1));
  return out;
}

// Every result across every receipt, newest first. Walks each receipt subdir
// (one per receipt) under baseDir and flattens.
async function listAll() {
  let dirents;
  try {
    dirents = await fsp.readdir(baseDir, { withFileTypes: true });
  } catch {
    return [];
  }
  const out = [];
  for (const d of dirents) {
    if (!d.isDirectory()) continue;
    out.push(...(await readDir(path.join(baseDir, d.name))));
  }
  out.sort((a, b) => (a.appliedAt < b.appliedAt ? 1 : -1));
  return out;
}

// Every result for one profile (across all receipts), newest first. Results are
// keyed by profile id, so callers pass an id (resolve a name upstream).
async function listByProfile(profileId) {
  const all = await listAll();
  return all.filter((r) => r.profileId === profileId);
}

module.exports = { save, get, list, listAll, listByProfile };
