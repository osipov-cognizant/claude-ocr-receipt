'use strict';

const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const config = require('../config');
const { validateProfile } = require('./validate');

const dir = config.receiptProfiles.profilesDir;

function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function ensureDir() {
  fs.mkdirSync(dir, { recursive: true });
}
ensureDir();

function newId() {
  return 'rp_' + crypto.randomUUID().replace(/-/g, '').slice(0, 16);
}

function profilePath(id) {
  return path.join(dir, `${id}.json`);
}

class ValidationError extends Error {
  constructor(errors) {
    super('profile validation failed');
    this.name = 'ValidationError';
    this.errors = errors;
  }
}

async function readAll() {
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

async function list() {
  const all = await readAll();
  all.sort((a, b) => (a.name < b.name ? -1 : 1));
  return all;
}

/** Resolve a profile by its id (rp_…) or its unique name. */
async function get(idOrName) {
  if (idOrName && idOrName.startsWith('rp_')) {
    try {
      return JSON.parse(await fsp.readFile(profilePath(idOrName), 'utf8'));
    } catch (err) {
      if (err.code === 'ENOENT') return null;
      throw err;
    }
  }
  const all = await readAll();
  return all.find((p) => p.name === idOrName) || null;
}

async function writeAtomic(profile) {
  const tmp = profilePath(profile.id) + '.tmp';
  await fsp.writeFile(tmp, JSON.stringify(profile, null, 2));
  await fsp.rename(tmp, profilePath(profile.id));
  return profile;
}

/** Create a new profile from a user-supplied definition. */
async function create(input) {
  const { valid, errors } = validateProfile(input);
  if (!valid) throw new ValidationError(errors);
  if (await get(input.name)) {
    throw new ValidationError([`a profile named "${input.name}" already exists`]);
  }
  const now = new Date().toISOString();
  const profile = {
    id: newId(),
    name: input.name,
    description: input.description || null,
    version: 1,
    transformer: input.transformer,
    config: isPlainObject(input.config) ? input.config : {},
    createdAt: now,
    updatedAt: now,
  };
  return writeAtomic(profile);
}

/** Replace a profile's definition (keeps id/createdAt, bumps version). */
async function update(idOrName, input) {
  const existing = await get(idOrName);
  if (!existing) return null;
  const { valid, errors } = validateProfile(input);
  if (!valid) throw new ValidationError(errors);
  // A rename must not collide with a different profile.
  if (input.name !== existing.name) {
    const other = await get(input.name);
    if (other && other.id !== existing.id) {
      throw new ValidationError([`a profile named "${input.name}" already exists`]);
    }
  }
  const next = {
    ...existing,
    name: input.name,
    description: input.description || null,
    version: existing.version + 1,
    transformer: input.transformer,
    config: isPlainObject(input.config) ? input.config : {},
    updatedAt: new Date().toISOString(),
  };
  return writeAtomic(next);
}

async function remove(idOrName) {
  const existing = await get(idOrName);
  if (!existing) return false;
  await fsp.unlink(profilePath(existing.id)).catch(() => {});
  return true;
}

async function count() {
  return (await readAll()).length;
}

/**
 * Seed the shipped example profiles when the store is empty (first boot), the
 * same idea as the bundled store-aliases.json. Invalid or duplicate seeds are
 * skipped so a bad seed file can't crash startup.
 */
async function seedIfEmpty() {
  if ((await readAll()).length > 0) return 0;
  const seedDir = path.join(__dirname, 'seedProfiles');
  let files;
  try {
    files = await fsp.readdir(seedDir);
  } catch {
    return 0;
  }
  let seeded = 0;
  for (const f of files) {
    if (!f.endsWith('.json')) continue;
    try {
      const def = JSON.parse(await fsp.readFile(path.join(seedDir, f), 'utf8'));
      await create(def);
      seeded += 1;
    } catch {
      /* skip a bad/duplicate seed */
    }
  }
  return seeded;
}

module.exports = { create, get, list, update, remove, count, seedIfEmpty, newId, ValidationError };
